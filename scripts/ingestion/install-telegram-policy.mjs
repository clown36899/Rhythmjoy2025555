import fs from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

export function connectTelegramPolicy(source) {
  const hook = '. "$PROJECT_ROOT/scripts/ingestion/telegram-notify.sh"';
  if (source.includes(hook)) return source;
  const start = source.indexOf('telegram_notify() {');
  const end = source.indexOf('\ncleanup_lock() {', start);
  if (start < 0 || end < start) throw new Error('Unrecognized installed Telegram function; review the launcher first.');
  let count = 0;
  const next = (source.slice(0, start) + hook + '\n' + source.slice(end))
    .replace(/telegram_notify "([^"]*)"(?=\s*(?:\|\| true)?\s*\n)/g, (call, message) => {
      count += 1;
      if (message.startsWith('댄스 이벤트 수집 시작')) return `${call} start`;
      if (message.includes('SUCCESS_LINES') || message.includes('PARSED_ISSUE')) return `${call} result`;
      const key = message.includes('외부 종료 신호') ? 'termination'
        : message.includes('테스트 파일이 없습니다') ? 'missing-preflight'
          : message.includes('사전검사 실패') ? 'preflight'
            : message.includes('소스 가드 실패') ? 'source-guard'
              : message.includes('시작 검증 실패') ? 'startup'
                : message.includes('CLI를 찾을 수 없습니다') ? 'missing-cli' : null;
      if (!key) throw new Error('Unrecognized notification call; refusing to change collection behavior.');
      return `${call} failure ${key}`;
    });
  if (count !== 10) throw new Error(`Expected 10 existing notification calls, found ${count}.`);
  return next;
}

async function main() {
  const target = process.argv.find(arg => arg.startsWith('--launcher='))?.slice('--launcher='.length)
    || '/Users/inteyeo/scripts/run-ingestion.sh';
  const original = await fs.readFile(target, 'utf8');
  const updated = connectTelegramPolicy(original);
  if (updated === original) { console.log('Telegram policy is already connected.'); return; }
  if (!process.argv.includes('--apply')) { console.log('Ready: replace existing sender with tracked helper and classify 10 calls. No changes written.'); return; }
  const backup = `${target}.bak-telegram-policy-${Date.now()}`;
  const temporary = `${target}.${process.pid}.tmp`;
  await fs.writeFile(backup, original, { mode: 0o600 });
  await fs.writeFile(temporary, updated, { mode: (await fs.stat(target)).mode & 0o777 });
  if (spawnSync('/bin/bash', ['-n', temporary]).status !== 0) { await fs.unlink(temporary); throw new Error('Launcher syntax check failed.'); }
  // Running jobs retain their existing file descriptor; new jobs load the helper.
  await fs.rename(temporary, target);
  console.log(`Connected Telegram policy. Original launcher backed up at ${backup}`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
