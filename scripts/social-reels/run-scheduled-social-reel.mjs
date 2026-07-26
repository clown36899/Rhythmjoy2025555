import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import dotenv from 'dotenv';

import { publishInstagramReel } from './instagram-reel-adb.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '../..');
const generatorRunner = path.join(scriptDirectory, 'run-social-reel.mjs');
const defaultEnvironmentPath = path.join(
  process.env.USERPROFILE || process.env.HOME || '',
  '.rhythmjoy-ingestion.env',
);

function stripMatchingQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"'))
    || (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

export function resolveShellDefaultExpression(key, rawValue, currentValue) {
  const value = stripMatchingQuotes(rawValue.trim());
  const match = value.match(/^\$\{([A-Za-z_][A-Za-z0-9_]*):-(.*)}$/);
  if (!match || match[1] !== key) return currentValue ?? stripMatchingQuotes(value);
  if (currentValue && currentValue !== value) return currentValue;
  return stripMatchingQuotes(match[2]);
}

export async function loadShellCompatibleEnvironment(environmentPath) {
  dotenv.config({ path: environmentPath, quiet: true });
  const contents = await readFile(environmentPath, 'utf8').catch(() => '');
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator <= 0) continue;
    const key = trimmed.slice(0, separator).trim();
    const rawValue = trimmed.slice(separator + 1).trim();
    process.env[key] = resolveShellDefaultExpression(
      key,
      rawValue,
      process.env[key],
    );
  }
}

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

async function run(command, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repositoryRoot,
      stdio: 'inherit',
    });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

async function sendTelegram(message) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) return false;
  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
      disable_web_page_preview: true,
    }),
  });
  if (!response.ok) {
    throw new Error(`Telegram notification failed with HTTP ${response.status}.`);
  }
  return true;
}

async function notify(message, title) {
  try {
    if (await sendTelegram(message)) return 'telegram';
  } catch (error) {
    console.warn(`Telegram notification skipped: ${error.message}`);
  }
  const safeTitle = JSON.stringify(title);
  const safeMessage = JSON.stringify(message.slice(0, 500));
  try {
    await run('/usr/bin/osascript', [
      '-e',
      `display notification ${safeMessage} with title ${safeTitle}`,
    ]);
    return 'macos';
  } catch (error) {
    console.warn(`macOS notification skipped: ${error.message}`);
    return 'log-only';
  }
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  const date = typeof args.date === 'string' ? args.date : todayInKorea();
  const dryRun = Boolean(args['dry-run']);
  const environmentPath = process.env.RHYTHMJOY_SOCIAL_REEL_ENV
    || defaultEnvironmentPath;
  await loadShellCompatibleEnvironment(environmentPath);
  const startedAt = Date.now();

  try {
    await run(process.execPath, [generatorRunner, `--date=${date}`]);
    const result = await publishInstagramReel({
      date,
      dryRun,
      cleanup: !args['leave-ready'],
    });
    const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);
    await notify([
      dryRun ? 'Instagram 릴스 드라이런 완료' : 'Instagram 릴스 자동 게시 완료',
      `날짜: ${date}`,
      `상태: ${result.status}`,
      result.selectedTrack
        ? `음악: ${result.selectedTrack.title} — ${result.selectedTrack.artist}`
        : null,
      `전체 소요: ${elapsedSeconds}초`,
    ].filter(Boolean).join('\n'), 'Rhythmjoy Instagram');
    console.log(JSON.stringify({ ...result, totalElapsedSeconds: Number(elapsedSeconds) }, null, 2));
  } catch (error) {
    const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);
    await notify([
      'Instagram 릴스 자동화 실패',
      `날짜: ${date}`,
      `공유 후 검증 불명확이면 중복 방지를 위해 자동 재시도하지 않습니다.`,
      `오류: ${error.message}`,
      `소요: ${elapsedSeconds}초`,
    ].join('\n'), 'Rhythmjoy Instagram 오류');
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(async (error) => {
    try {
      const statePath = path.join(
        repositoryRoot,
        'artifacts/social-reels',
        todayInKorea(),
        'publication-state.json',
      );
      const state = JSON.parse(await readFile(statePath, 'utf8'));
      console.error(JSON.stringify(state, null, 2));
    } catch {
      // The main error remains the useful output.
    }
    console.error(error);
    process.exitCode = 1;
  });
}
