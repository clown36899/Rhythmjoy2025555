import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import dotenv from 'dotenv';

import {
  publicationNeedsReconciliation,
  publishInstagramReel,
} from './instagram-reel-adb.mjs';

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

export function canPublishReelDate({
  date,
  today,
  dryRun = false,
  allowNoncurrentDate = false,
} = {}) {
  return Boolean(
    date
    && today
    && (date === today || dryRun || allowNoncurrentDate),
  );
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export function canRetryPublicationState(state = {}) {
  return state.status === 'failed-before-share';
}

export function buildPublicationProblemNotification({
  date,
  elapsedSeconds,
  errorMessage,
  state = {},
}) {
  if (publicationNeedsReconciliation(state)) {
    return {
      title: 'Rhythmjoy Instagram 확인 대기',
      message: [
        'Instagram 릴스 공유 완료 · 게시 확인 대기',
        `날짜: ${date}`,
        '공유 버튼 입력은 완료됐습니다.',
        '프로필 수치가 아직 갱신되지 않아 중복 방지를 위해 재게시하지 않습니다.',
        `확인: ${errorMessage}`,
        `소요: ${elapsedSeconds}초`,
      ].join('\n'),
    };
  }
  return {
    title: 'Rhythmjoy Instagram 오류',
    message: [
      'Instagram 릴스 자동화 실패',
      `날짜: ${date}`,
      `오류: ${errorMessage}`,
      `소요: ${elapsedSeconds}초`,
    ].join('\n'),
  };
}

async function publishWithSafeRetries(options, publicationStatePath) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await publishInstagramReel(options);
    } catch (error) {
      lastError = error;
      const state = JSON.parse(
        await readFile(publicationStatePath, 'utf8').catch(() => '{}'),
      );
      if (!canRetryPublicationState(state) || attempt === 3) throw error;
      console.warn(`Instagram pre-share attempt ${attempt} failed; retrying safely.`);
      await wait(attempt * 15_000);
    }
  }
  throw lastError;
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
  const today = todayInKorea();
  const date = typeof args.date === 'string' ? args.date : today;
  const dryRun = Boolean(args['dry-run']);
  const allowNoncurrentDate = Boolean(args['allow-noncurrent-date']);
  const environmentPath = process.env.RHYTHMJOY_SOCIAL_REEL_ENV
    || defaultEnvironmentPath;
  await loadShellCompatibleEnvironment(environmentPath);
  const startedAt = Date.now();
  const publicationStatePath = path.join(
    repositoryRoot,
    'artifacts/social-reels',
    date,
    'publication-state.json',
  );

  try {
    if (!canPublishReelDate({ date, today, dryRun, allowNoncurrentDate })) {
      throw new Error(
        `Refusing to publish non-current reel date ${date}; today in Korea is ${today}. `
        + 'Use --dry-run to inspect it or --allow-noncurrent-date for an intentional override.',
      );
    }
    await run(process.execPath, [generatorRunner, `--date=${date}`]);
    const result = await publishWithSafeRetries(
      {
        date,
        dryRun,
        cleanup: !args['leave-ready'],
        forceRecovery: Boolean(args['force-recovery']),
      },
      publicationStatePath,
    );
    const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);
    await notify([
      dryRun
        ? 'Instagram 릴스 드라이런 완료'
        : result.recoveredAt
          ? 'Instagram 릴스 게시 확인 완료'
          : 'Instagram 릴스 자동 게시 완료',
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
    const state = JSON.parse(
      await readFile(publicationStatePath, 'utf8').catch(() => '{}'),
    );
    const notification = buildPublicationProblemNotification({
      date,
      elapsedSeconds,
      errorMessage: error.message,
      state,
    });
    await notify(notification.message, notification.title);
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
