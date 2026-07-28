import { execFile, spawn } from 'node:child_process';
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
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '../..');
const artifactRoot = path.join(repositoryRoot, 'artifacts/social-reels');
const instagramPackage = 'com.instagram.android';
const expectedAccount = process.env.INSTAGRAM_ACCOUNT || 'korea_swing_social';
const adbPath = process.env.ADB_PATH || '/opt/homebrew/bin/adb';
const emulatorPath = process.env.ANDROID_EMULATOR_PATH
  || path.join(process.env.USERPROFILE || process.env.HOME || '', 'Library/Android/sdk/emulator/emulator');
const avdName = process.env.ANDROID_AVD_NAME || 'Medium_Phone';
const pollIntervalMs = 700;
const normalTimeoutMs = 30_000;
const lockMaxAgeMs = 30 * 60 * 1000;
let activeAdbSerial = process.env.ANDROID_SERIAL || '';

export const JAZZ_TRACKS = Object.freeze([
  { title: 'Take Five', artist: 'Dave Brubeck' },
  { title: 'Like It Is', artist: 'Erroll Garner' },
  { title: 'Teo', artist: 'Miles Davis' },
  { title: 'Sunday', artist: 'Ben Webster, Oscar Peterson' },
  { title: 'Do What You Wanna', artist: 'Ramsey Lewis' },
  { title: 'So What', artist: 'Miles Davis' },
]);

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

function decodeXml(value) {
  return String(value)
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');
}

export function parseUiNodes(xml) {
  const nodes = [];
  for (const match of xml.matchAll(/<node\b([^>]*)>/g)) {
    const attributes = {};
    for (const attribute of match[1].matchAll(/([\w-]+)="([^"]*)"/g)) {
      attributes[attribute[1]] = decodeXml(attribute[2]);
    }
    const boundsMatch = attributes.bounds?.match(
      /^\[(\d+),(\d+)]\[(\d+),(\d+)]$/,
    );
    nodes.push({
      ...attributes,
      text: attributes.text || '',
      description: attributes['content-desc'] || '',
      resourceId: attributes['resource-id'] || '',
      clickable: attributes.clickable === 'true',
      selected: attributes.selected === 'true',
      bounds: boundsMatch
        ? {
          left: Number(boundsMatch[1]),
          top: Number(boundsMatch[2]),
          right: Number(boundsMatch[3]),
          bottom: Number(boundsMatch[4]),
        }
        : null,
    });
  }
  return nodes;
}

export function chooseNextTrack(history, tracks = JAZZ_TRACKS) {
  const last = history.at(-1);
  const lastIndex = tracks.findIndex(
    (track) => track.title === last?.title && track.artist === last?.artist,
  );
  const startIndex = lastIndex >= 0 ? (lastIndex + 1) % tracks.length : 0;
  return tracks.map((_, offset) => tracks[(startIndex + offset) % tracks.length]);
}

async function run(command, args, options = {}) {
  const {
    timeout = 60_000,
    encoding = 'utf8',
    maxBuffer = 20 * 1024 * 1024,
  } = options;
  try {
    return await execFileAsync(command, args, { timeout, encoding, maxBuffer });
  } catch (error) {
    const detail = error.stderr?.toString().trim() || error.stdout?.toString().trim();
    throw new Error(
      `${command} ${args.join(' ')} failed${detail ? `: ${detail}` : ''}`,
      { cause: error },
    );
  }
}

async function adb(args, options = {}) {
  const scopedArgs = activeAdbSerial && args[0] !== 'devices'
    ? ['-s', activeAdbSerial, ...args]
    : args;
  return run(adbPath, scopedArgs, options);
}

async function adbShell(...args) {
  return adb(['shell', ...args]);
}

async function writeJsonAtomically(filePath, value) {
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, filePath);
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch {
    return fallback;
  }
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
      const existing = await readJson(lockPath, {});
      const lockStats = await stat(lockPath).catch(() => null);
      const ageMs = lockStats ? Date.now() - lockStats.mtimeMs : Number.POSITIVE_INFINITY;
      if (processIsRunning(existing.pid) && ageMs < lockMaxAgeMs) {
        throw new Error(`Instagram publisher is already running (PID ${existing.pid}).`);
      }
      await unlink(lockPath);
    }
  }
  throw new Error('Could not acquire the Instagram publisher lock.');
}

async function releaseLock(lockPath, handle) {
  await handle?.close().catch(() => {});
  await unlink(lockPath).catch((error) => {
    if (error.code !== 'ENOENT') throw error;
  });
}

export function parseAdbDevices(output = '') {
  return String(output)
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim().split(/\s+/))
    .filter(([serial, state]) => serial && state)
    .map(([serial, state]) => ({ serial, state }));
}

async function findTargetEmulatorSerial() {
  const { stdout } = await run(adbPath, ['devices']);
  const onlineEmulators = parseAdbDevices(stdout)
    .filter(({ serial, state }) => state === 'device' && serial.startsWith('emulator-'));

  for (const { serial } of onlineEmulators) {
    try {
      const { stdout: runningAvdName } = await run(
        adbPath,
        ['-s', serial, 'emu', 'avd', 'name'],
        { timeout: 5_000 },
      );
      if (runningAvdName.trim().split(/\r?\n/)[0] === avdName) return serial;
    } catch {
      // Continue checking other online emulators.
    }
  }

  return onlineEmulators.length === 1 ? onlineEmulators[0].serial : '';
}

async function ensureEmulator() {
  activeAdbSerial = await findTargetEmulatorSerial();
  if (!activeAdbSerial) {
    const child = spawn(emulatorPath, [
      '-avd', avdName,
      '-no-audio',
      '-no-snapshot-save',
    ], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();

    const deviceDeadline = Date.now() + 120_000;
    while (Date.now() < deviceDeadline && !activeAdbSerial) {
      await wait(1_000);
      activeAdbSerial = await findTargetEmulatorSerial();
    }
    if (!activeAdbSerial) {
      throw new Error(`Android emulator ${avdName} did not appear in adb devices.`);
    }
  }

  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const bootCompleted = (await adbShell('getprop', 'sys.boot_completed'))
      .stdout.trim();
    if (bootCompleted === '1') break;
    await wait(1_500);
  }
  const bootCompleted = (await adbShell('getprop', 'sys.boot_completed')).stdout.trim();
  if (bootCompleted !== '1') throw new Error('Android emulator did not finish booting.');

  const runningAvdName = (await adb(['emu', 'avd', 'name'], { timeout: 5_000 }))
    .stdout.trim().split(/\r?\n/)[0];
  if (runningAvdName !== avdName) {
    throw new Error(`Wrong Instagram AVD selected: ${runningAvdName || 'unknown'} (${activeAdbSerial}).`);
  }
  const instagramPackagePath = (await adbShell('pm', 'path', instagramPackage))
    .stdout.trim();
  if (!instagramPackagePath.startsWith('package:')) {
    throw new Error(`Instagram is missing from ${runningAvdName} (${activeAdbSerial}).`);
  }
  console.log(JSON.stringify({
    status: 'instagram-emulator-ready',
    avdName: runningAvdName,
    adbSerial: activeAdbSerial,
    instagramPackage: instagramPackage,
  }));

  await adbShell('svc', 'power', 'stayon', 'true');
  await adbShell('settings', 'put', 'system', 'screen_off_timeout', '2147483647');
  await adbShell('input', 'keyevent', 'KEYCODE_WAKEUP');
  await adbShell('wm', 'dismiss-keyguard').catch(() => {});
}

async function dumpUi() {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await adbShell(
        'uiautomator',
        'dump',
        '--compressed',
        '/sdcard/rhythmjoy-ui.xml',
      );
      const { stdout } = await adb(
        ['exec-out', 'cat', '/sdcard/rhythmjoy-ui.xml'],
        { maxBuffer: 10 * 1024 * 1024 },
      );
      return parseUiNodes(stdout);
    } catch (error) {
      lastError = error;
      if (attempt < 3) await wait(500 * attempt);
    }
  }
  throw lastError;
}

function matches(node, selector) {
  if (selector.resourceId && node.resourceId !== selector.resourceId) return false;
  if (selector.resourceIdEndsWith && !node.resourceId.endsWith(selector.resourceIdEndsWith)) {
    return false;
  }
  if (selector.text && node.text !== selector.text) return false;
  if (selector.textIncludes && !node.text.includes(selector.textIncludes)) return false;
  if (selector.description && node.description !== selector.description) return false;
  if (
    selector.descriptionStartsWith
    && !node.description.startsWith(selector.descriptionStartsWith)
  ) return false;
  if (selector.descriptionIncludes && !node.description.includes(selector.descriptionIncludes)) {
    return false;
  }
  if (selector.clickable !== undefined && node.clickable !== selector.clickable) return false;
  return Boolean(node.bounds);
}

async function waitForNode(selector, options = {}) {
  const timeout = options.timeout || normalTimeoutMs;
  const deadline = Date.now() + timeout;
  let lastNodes = [];
  while (Date.now() < deadline) {
    lastNodes = await dumpUi();
    const node = lastNodes.find((candidate) => matches(candidate, selector));
    if (node) return { node, nodes: lastNodes };
    await wait(pollIntervalMs);
  }
  const visible = lastNodes
    .filter((node) => node.text || node.description)
    .slice(-25)
    .map((node) => node.text || node.description);
  throw new Error(
    `Timed out waiting for ${JSON.stringify(selector)}. Visible: ${visible.join(' | ')}`,
  );
}

async function waitForAny(selectors, options = {}) {
  const timeout = options.timeout || normalTimeoutMs;
  const deadline = Date.now() + timeout;
  let lastNodes = [];
  while (Date.now() < deadline) {
    lastNodes = await dumpUi();
    for (const selector of selectors) {
      const node = lastNodes.find((candidate) => matches(candidate, selector));
      if (node) return { node, nodes: lastNodes, selector };
    }
    await wait(pollIntervalMs);
  }
  const visible = lastNodes
    .filter((node) => node.text || node.description)
    .slice(-25)
    .map((node) => node.text || node.description);
  throw new Error(
    `Timed out waiting for any of ${JSON.stringify(selectors)}. Visible: ${visible.join(' | ')}`,
  );
}

async function tapNode(node) {
  if (!node?.bounds) throw new Error('Cannot tap a UI node without bounds.');
  const x = Math.round((node.bounds.left + node.bounds.right) / 2);
  const y = Math.round((node.bounds.top + node.bounds.bottom) / 2);
  await adbShell('input', 'tap', String(x), String(y));
}

async function tapAndWait(selector, nextSelector, options = {}) {
  const { node } = await waitForNode(selector, options);
  await tapNode(node);
  return waitForNode(nextSelector, options);
}

async function screenshot(filePath) {
  const { stdout } = await adb(
    ['exec-out', 'screencap', '-p'],
    { encoding: 'buffer', maxBuffer: 20 * 1024 * 1024 },
  );
  await writeFile(filePath, stdout);
}

async function pushMedia(localPath, remotePath) {
  await adbShell('mkdir', '-p', path.posix.dirname(remotePath));
  await adb(['push', localPath, remotePath], { timeout: 60_000 });
  await adbShell('touch', remotePath);
  await adbShell(
    'am',
    'broadcast',
    '-a',
    'android.intent.action.MEDIA_SCANNER_SCAN_FILE',
    '-d',
    `file://${remotePath}`,
  );
}

function parsePostCount(nodes) {
  for (const node of nodes) {
    const match = node.description.match(/^([\d,]+)posts$/);
    if (match) return Number(match[1].replaceAll(',', ''));
  }
  return null;
}

async function openInstagramProfile() {
  await adbShell('am', 'force-stop', instagramPackage);
  await adbShell(
    'monkey',
    '-p',
    instagramPackage,
    '-c',
    'android.intent.category.LAUNCHER',
    '1',
  );
  const { node: profileTab } = await waitForNode(
    { description: 'Profile' },
    { timeout: 60_000 },
  );
  await tapNode(profileTab);
  const { nodes } = await waitForNode(
    { resourceIdEndsWith: ':id/action_bar_title', text: expectedAccount },
    { timeout: 30_000 },
  );
  const postCount = parsePostCount(nodes);
  if (!Number.isInteger(postCount)) {
    throw new Error('Could not read the Instagram profile post count.');
  }
  return postCount;
}

async function openNewestVideo() {
  await tapAndWait(
    { description: 'Create New' },
    { description: 'Create new reel' },
  );
  const { node: createReel } = await waitForNode({ description: 'Create new reel' });
  await tapNode(createReel);
  const nextScreen = await waitForAny([
    { resourceIdEndsWith: ':id/gallery_title_text', text: 'New reel' },
    { text: 'Start new video' },
  ]);
  if (nextScreen.node.text === 'Start new video') {
    await tapAndWait(
      { text: 'Start new video' },
      { resourceIdEndsWith: ':id/gallery_title_text', text: 'New reel' },
    );
  }
  const { nodes } = await waitForNode({
    resourceIdEndsWith: ':id/gallery_grid_item_thumbnail',
    descriptionStartsWith: 'Unselected Video thumbnail created on',
  });
  const newestVideo = nodes.find(
    (node) => node.resourceId.endsWith(':id/gallery_grid_item_thumbnail')
      && node.description.startsWith('Unselected Video thumbnail created on'),
  );
  await tapNode(newestVideo);
  await waitForNode({ description: 'Next' }, { timeout: 60_000 });
}

async function searchAndSelectTrack(trackCandidates) {
  await tapAndWait(
    { description: 'Add audio' },
    { resourceIdEndsWith: ':id/row_search_edit_text' },
    { timeout: 60_000 },
  );

  for (let index = 0; index < trackCandidates.length; index += 1) {
    const track = trackCandidates[index];
    const { node: searchField } = await waitForNode({
      resourceIdEndsWith: ':id/row_search_edit_text',
    });
    await tapNode(searchField);
    const clearResult = await dumpUi();
    const clearButton = clearResult.find((node) => node.description === 'Clear text');
    if (clearButton) {
      await tapNode(clearButton);
      await wait(300);
    }
    const query = `${track.title} ${track.artist}`.replaceAll(' ', '%s');
    await adbShell('input', 'text', query);

    try {
      const { node: result } = await waitForNode(
        {
          resourceIdEndsWith: ':id/track_container',
          descriptionStartsWith: `Select track ${track.title} by ${track.artist},`,
        },
        { timeout: 12_000 },
      );
      await tapNode(result);
      await tapAndWait(
        { resourceIdEndsWith: ':id/select_button_tap_target' },
        { resourceIdEndsWith: ':id/music_editor_done_button', description: 'Done' },
        { timeout: 20_000 },
      );
      await tapAndWait(
        { resourceIdEndsWith: ':id/music_editor_done_button', description: 'Done' },
        { description: 'Next' },
        { timeout: 20_000 },
      );
      return track;
    } catch (error) {
      if (index === trackCandidates.length - 1) throw error;
    }
  }
  throw new Error('No configured jazz track was available.');
}

async function setCoverAndReachShareScreen() {
  await tapAndWait(
    { description: 'Next' },
    { resourceIdEndsWith: ':id/clip_thumbnail_text', text: 'Edit cover' },
    { timeout: 60_000 },
  );
  const { node: editCover } = await waitForNode({
    resourceIdEndsWith: ':id/clip_thumbnail_text',
    text: 'Edit cover',
  });
  await tapNode(editCover);
  await tapAndWait(
    { description: 'Add from camera roll' },
    { resourceIdEndsWith: ':id/gallery_image', descriptionStartsWith: 'Photo thumbnail, Added on' },
  );
  const { nodes } = await waitForNode({
    resourceIdEndsWith: ':id/gallery_image',
    descriptionStartsWith: 'Photo thumbnail, Added on',
  });
  const newestPhoto = nodes.find(
    (node) => node.resourceId.endsWith(':id/gallery_image')
      && /^Photo thumbnail, Added on \d+ seconds? ago$/.test(node.description),
  ) || nodes.find(
    (node) => node.resourceId.endsWith(':id/gallery_image')
      && node.description.startsWith('Photo thumbnail, Added on'),
  );
  await tapNode(newestPhoto);
  await tapAndWait(
    { resourceIdEndsWith: ':id/action_bar_button_text', description: 'Done' },
    { resourceIdEndsWith: ':id/share_button', description: 'Share' },
    { timeout: 30_000 },
  );
}

async function discardDryRun() {
  await adbShell('input', 'keyevent', 'KEYCODE_BACK');
  await waitForNode({ description: 'Cancel' });
  await tapAndWait(
    { description: 'Cancel' },
    { text: 'Start over' },
  );
  await tapAndWait(
    { text: 'Start over' },
    { resourceIdEndsWith: ':id/gallery_title_text', text: 'New reel' },
  );
  await tapAndWait(
    { resourceIdEndsWith: ':id/gallery_cancel_button', description: 'Back to Home' },
    { description: 'Profile' },
  );
}

async function verifyPostCountIncrement(previousCount, timeout = 10 * 60_000) {
  const deadline = Date.now() + timeout;
  await wait(8_000);
  while (Date.now() < deadline) {
    try {
      const nodes = await dumpUi();
      const profileTab = nodes.find((node) => node.description === 'Profile');
      if (profileTab) {
        await tapNode(profileTab);
        await wait(1_500);
      }
      const profile = await waitForNode(
        { resourceIdEndsWith: ':id/action_bar_title', text: expectedAccount },
        { timeout: 15_000 },
      );
      const currentCount = parsePostCount(profile.nodes);
      if (Number.isInteger(currentCount) && currentCount > previousCount) {
        return currentCount;
      }
    } catch {
      // Instagram may still be encoding or uploading; poll again.
    }
    await wait(8_000);
  }
  return null;
}

export async function publishInstagramReel(options = {}) {
  const date = options.date || todayInKorea();
  const dryRun = Boolean(options.dryRun);
  const cleanup = options.cleanup !== false;
  const artifactDirectory = path.resolve(
    options.artifactDirectory || path.join(artifactRoot, date),
  );
  const videoPath = path.resolve(
    options.videoPath || path.join(artifactDirectory, `${date}-social-reel-4k.mp4`),
  );
  const coverPath = path.resolve(
    options.coverPath || path.join(artifactDirectory, `${date}-social-reel-cover-4k.jpg`),
  );
  const publicationStatePath = path.join(artifactDirectory, 'publication-state.json');
  const historyPath = path.join(artifactRoot, 'music-history.json');
  const lockPath = path.join(artifactRoot, '.instagram-publisher.lock');

  await Promise.all([stat(videoPath), stat(coverPath)]);
  await mkdir(artifactDirectory, { recursive: true });
  const previousState = await readJson(publicationStatePath, {});
  if (previousState.status === 'published') {
    return { status: 'already-published', state: previousState };
  }
  if (previousState.status === 'sharing' && !options.forceRecovery) {
    throw new Error(
      'A previous Share action has an uncertain result. Automatic retry is blocked to prevent a duplicate.',
    );
  }

  const lockHandle = await acquireLock(lockPath);
  const startedAt = new Date();
  try {
    await writeJsonAtomically(publicationStatePath, {
      status: 'preparing',
      date,
      dryRun,
      startedAt: startedAt.toISOString(),
    });
    await ensureEmulator();
    const remoteVideo = `/sdcard/Movies/Rhythmjoy/RHYTHMJOY-${date}-AUTO.mp4`;
    const remoteCover = `/sdcard/Pictures/Rhythmjoy/RHYTHMJOY-${date}-COVER-AUTO.jpg`;
    await pushMedia(videoPath, remoteVideo);
    const postCountBefore = await openInstagramProfile();
    await openNewestVideo();

    const historyState = await readJson(historyPath, {
      history: [{
        title: 'Sunday',
        artist: 'Ben Webster, Oscar Peterson',
        source: 'existing-post-seed',
      }],
    });
    const trackCandidates = chooseNextTrack(historyState.history || []);
    const selectedTrack = await searchAndSelectTrack(trackCandidates);

    await pushMedia(coverPath, remoteCover);
    await setCoverAndReachShareScreen();
    const readyScreenshotPath = path.join(artifactDirectory, 'instagram-share-ready.png');
    await screenshot(readyScreenshotPath);

    if (dryRun) {
      const completedAt = new Date();
      const state = {
        status: 'dry-run-ready',
        date,
        selectedTrack,
        postCountBefore,
        readyScreenshotPath,
        completedAt: completedAt.toISOString(),
        elapsedSeconds: Number(((completedAt - startedAt) / 1000).toFixed(1)),
      };
      await writeJsonAtomically(publicationStatePath, state);
      if (cleanup) await discardDryRun();
      return state;
    }

    const sharingState = {
      status: 'sharing',
      date,
      selectedTrack,
      postCountBefore,
      readyScreenshotPath,
      shareCommittedAt: new Date().toISOString(),
      note: 'Do not automatically retry this date unless the profile is checked first.',
    };
    await writeJsonAtomically(publicationStatePath, sharingState);
    const { node: shareButton } = await waitForNode({
      resourceIdEndsWith: ':id/share_button',
      description: 'Share',
    });
    await tapNode(shareButton);

    const postCountAfter = await verifyPostCountIncrement(postCountBefore);
    if (!Number.isInteger(postCountAfter)) {
      const uncertainState = {
        ...sharingState,
        status: 'verification-required',
        verificationFailedAt: new Date().toISOString(),
      };
      await writeJsonAtomically(publicationStatePath, uncertainState);
      throw new Error(
        'Share was tapped, but the profile count did not confirm publication. Automatic retry is blocked.',
      );
    }

    const completedAt = new Date();
    const publishedState = {
      status: 'published',
      date,
      selectedTrack,
      postCountBefore,
      postCountAfter,
      readyScreenshotPath,
      completedAt: completedAt.toISOString(),
      elapsedSeconds: Number(((completedAt - startedAt) / 1000).toFixed(1)),
    };
    await writeJsonAtomically(publicationStatePath, publishedState);
    await writeJsonAtomically(historyPath, {
      history: [
        ...(historyState.history || []),
        {
          ...selectedTrack,
          date,
          publishedAt: completedAt.toISOString(),
        },
      ].slice(-50),
    });
    return publishedState;
  } catch (error) {
    const currentState = await readJson(publicationStatePath, {});
    if (!['sharing', 'verification-required'].includes(currentState.status)) {
      await writeJsonAtomically(publicationStatePath, {
        ...currentState,
        status: 'failed-before-share',
        failedAt: new Date().toISOString(),
        error: error.message,
      });
    }
    throw error;
  } finally {
    await releaseLock(lockPath, lockHandle);
  }
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  const result = await publishInstagramReel({
    date: typeof args.date === 'string' ? args.date : undefined,
    dryRun: Boolean(args['dry-run']),
    cleanup: !args['leave-ready'],
    forceRecovery: Boolean(args['force-recovery']),
  });
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
