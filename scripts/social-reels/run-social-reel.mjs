import { spawn } from 'node:child_process';
import {
  mkdir,
  open,
  readFile,
  rename,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '../..');
const generatorPath = path.join(scriptDirectory, 'generate-social-reel.mjs');
const artifactRoot = path.join(repositoryRoot, 'artifacts/social-reels');
const recipeVersion = 1;
const maxAttempts = 3;
const lockMaxAgeMs = 45 * 60 * 1000;

function parseArguments(argv) {
  const values = {};
  for (const argument of argv) {
    if (!argument.startsWith('--')) continue;
    const [key, ...parts] = argument.slice(2).split('=');
    values[key] = parts.length ? parts.join('=') : true;
  }
  return values;
}

function todayInKorea() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function run(command, args, { capture = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    });
    let stdout = '';
    let stderr = '';
    if (capture) {
      child.stdout.on('data', (chunk) => {
        stdout += chunk;
      });
      child.stderr.on('data', (chunk) => {
        stderr += chunk;
      });
    }
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(
          `${command} exited with code ${code}${stderr ? `\n${stderr}` : ''}`,
        ));
      }
    });
  });
}

async function writeJsonAtomically(filePath, value) {
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, filePath);
}

function processIsRunning(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function acquireLock(lockPath) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = await open(lockPath, 'wx');
      await handle.writeFile(`${JSON.stringify({
        pid: process.pid,
        createdAt: new Date().toISOString(),
      })}\n`);
      return handle;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;

      let existing = {};
      let ageMs = Number.POSITIVE_INFINITY;
      try {
        existing = JSON.parse(await readFile(lockPath, 'utf8'));
        const lockStats = await stat(lockPath);
        ageMs = Date.now() - lockStats.mtimeMs;
      } catch {
        // An unreadable lock is treated as stale.
      }

      if (processIsRunning(existing.pid) && ageMs < lockMaxAgeMs) {
        throw new Error(`Social Reel automation is already running (PID ${existing.pid}).`);
      }
      await unlink(lockPath);
    }
  }
  throw new Error('Could not acquire the Social Reel automation lock.');
}

async function releaseLock(lockPath, handle) {
  await handle?.close().catch(() => {});
  await unlink(lockPath).catch((error) => {
    if (error.code !== 'ENOENT') throw error;
  });
}

async function validateArtifacts(videoPath, coverPath) {
  const [videoStats, coverStats, coverMetadata] = await Promise.all([
    stat(videoPath),
    stat(coverPath),
    sharp(coverPath).metadata(),
  ]);

  if (videoStats.size < 500_000) throw new Error('Generated MP4 is unexpectedly small.');
  if (coverStats.size < 100_000) throw new Error('Generated cover is unexpectedly small.');
  if (coverMetadata.width !== 2160 || coverMetadata.height !== 3840) {
    throw new Error(
      `Cover must be 2160x3840, got ${coverMetadata.width}x${coverMetadata.height}.`,
    );
  }

  const ffprobePath = process.env.FFPROBE_PATH || 'ffprobe';
  const { stdout } = await run(ffprobePath, [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries',
    'stream=codec_name,width,height,pix_fmt,color_space,color_transfer,color_primaries,r_frame_rate:format=duration',
    '-of', 'json',
    videoPath,
  ], { capture: true });
  const probe = JSON.parse(stdout);
  const stream = probe.streams?.[0];
  const duration = Number(probe.format?.duration);

  if (!stream) throw new Error('Generated MP4 has no video stream.');
  if (stream.codec_name !== 'h264') throw new Error(`Expected H.264, got ${stream.codec_name}.`);
  if (stream.width !== 2160 || stream.height !== 3840) {
    throw new Error(`Video must be 2160x3840, got ${stream.width}x${stream.height}.`);
  }
  if (stream.pix_fmt !== 'yuv420p') throw new Error(`Expected yuv420p, got ${stream.pix_fmt}.`);
  if (stream.r_frame_rate !== '30/1') {
    throw new Error(`Expected 30fps, got ${stream.r_frame_rate}.`);
  }
  if (
    stream.color_space !== 'bt709'
    || stream.color_transfer !== 'bt709'
    || stream.color_primaries !== 'bt709'
  ) {
    throw new Error('Generated MP4 is not consistently tagged as BT.709.');
  }
  if (!Number.isFinite(duration) || Math.abs(duration - 15) > 0.1) {
    throw new Error(`Expected a 15-second video, got ${duration}.`);
  }

  return {
    videoBytes: videoStats.size,
    coverBytes: coverStats.size,
    codec: stream.codec_name,
    resolution: `${stream.width}x${stream.height}`,
    frameRate: stream.r_frame_rate,
    pixelFormat: stream.pix_fmt,
    color: stream.color_space,
    duration,
  };
}

async function main() {
  const forwardedArguments = process.argv.slice(2).filter((value) => value !== '--force');
  const args = parseArguments(process.argv.slice(2));
  const date = typeof args.date === 'string' ? args.date : todayInKorea();

  if (args['dry-layout']) {
    await run(process.execPath, [generatorPath, ...forwardedArguments]);
    return;
  }

  const artifactDirectory = path.resolve(
    typeof args['output-dir'] === 'string'
      ? args['output-dir']
      : path.join(artifactRoot, date),
  );
  const videoPath = path.resolve(
    typeof args.output === 'string'
      ? args.output
      : path.join(artifactDirectory, `${date}-social-reel-4k.mp4`),
  );
  const coverPath = path.join(artifactDirectory, `${date}-social-reel-cover-4k.jpg`);
  const statePath = path.join(artifactDirectory, 'run-state.json');
  const lockPath = path.join(artifactRoot, '.automation.lock');

  await mkdir(artifactDirectory, { recursive: true });
  await mkdir(artifactRoot, { recursive: true });
  const lockHandle = await acquireLock(lockPath);

  try {
    if (!args.force) {
      try {
        const previousState = JSON.parse(await readFile(statePath, 'utf8'));
        if (
          previousState.status === 'ready'
          && previousState.recipeVersion === recipeVersion
        ) {
          const validation = await validateArtifacts(videoPath, coverPath);
          console.log(JSON.stringify({
            status: 'reused',
            videoPath,
            coverPath,
            validation,
          }, null, 2));
          return;
        }
      } catch {
        // Missing or invalid state means a fresh generation is required.
      }
    }

    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      await writeJsonAtomically(statePath, {
        status: 'running',
        recipeVersion,
        date,
        attempt,
        maxAttempts,
        startedAt: new Date().toISOString(),
      });

      try {
        await run(process.execPath, [generatorPath, ...forwardedArguments]);
        const validation = await validateArtifacts(videoPath, coverPath);
        const completedState = {
          status: 'ready',
          recipeVersion,
          date,
          attempt,
          completedAt: new Date().toISOString(),
          videoPath,
          coverPath,
          validation,
          instagram: {
            status: 'ready-for-automated-ui',
            profileCrop: 'default-original',
            musicPolicy: 'different-jazz-track-each-post',
          },
        };
        await writeJsonAtomically(statePath, completedState);
        console.log(JSON.stringify(completedState, null, 2));
        return;
      } catch (error) {
        lastError = error;
        await writeJsonAtomically(statePath, {
          status: attempt === maxAttempts ? 'failed' : 'retrying',
          recipeVersion,
          date,
          attempt,
          maxAttempts,
          failedAt: new Date().toISOString(),
          error: error.message,
        });
        if (attempt < maxAttempts) await wait(1_500 * attempt);
      }
    }
    throw lastError;
  } finally {
    await releaseLock(lockPath, lockHandle);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
