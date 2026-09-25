import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseRunResult, planNotification, REPEAT_INTERVAL_MS, readNotificationHistory } from './telegram-notification-policy.mjs';
import { connectTelegramPolicy } from './install-telegram-policy.mjs';

const now = Date.parse('2026-09-20T08:00:00Z');
const clean = { insertCount: 2, issues: [], accessFailures: [], remainingSourceCount: 0 };
const blocked = { ...clean, accessFailures: ['source-a(instagram login wall; public profile fallback unavailable)'], remainingSourceCount: 1 };
const plan = (overrides = {}) => planNotification({ kind: 'result', result: clean, now, scope: 'swing-daily:1', ...overrides });

test('suppresses startup and normal runs, including successful new registrations', () => {
  assert.equal(plan({ kind: 'start', result: null }).send, false);
  assert.equal(plan().send, false);
  assert.equal(plan({ result: { ...clean, insertCount: 0 } }).send, false);
  assert.equal(plan({ mode: 'all', message: 'legacy summary' }).message, 'legacy summary');
});

test('reports source errors even on exit 0 and never treats absent native results as success', () => {
  assert.equal(plan({ result: blocked }).send, true);
  assert.equal(plan({ result: null }).send, true);
  assert.equal(plan({ result: clean, message: 'Codex summary block missing' }).send, true);
  assert.equal(plan({ result: clean, exitCode: 124 }).send, true);
  assert.equal(plan({ result: clean, exitCode: 75 }).send, true);
});

test('same source problem is silent for 24 hours, while another source or error type is immediate', () => {
  const first = plan({ result: blocked });
  const history = [{ at: now, keys: first.keys }];
  assert.equal(plan({ result: blocked, history, now: now + 1000 }).send, false);
  assert.equal(plan({ result: blocked, history, now: now + REPEAT_INTERVAL_MS - 1 }).send, false);
  assert.equal(plan({ result: blocked, history, now: now + REPEAT_INTERVAL_MS }).send, true);
  const newSource = plan({ result: { ...blocked, accessFailures: [...blocked.accessFailures, 'source-b(login required)'] }, history, now: now + 1000 });
  assert.equal(newSource.keys.length, 1);
  assert.match(newSource.message, /source-b/);
  assert.doesNotMatch(newSource.message, /source-a/);
  assert.equal(plan({ result: { ...blocked, accessFailures: ['source-a(HTTP 429)'] }, history }).send, true);
  assert.equal(plan({ result: blocked, history, scope: 'expanded:1' }).send, true);
});

test('changing candidate IDs, dates and AI prose does not create repeat alerts', () => {
  const result = { ...clean, pipeline: { blockers: [{ stage: 'extraction', sourceId: 'source-a', reason: 'AI omitted 2026-09-21', candidateId: 'old' }] } };
  const first = plan({ result });
  result.pipeline.blockers[0] = { ...result.pipeline.blockers[0], reason: 'AI omitted 2026-09-22; confidence low', candidateId: 'new' };
  assert.equal(plan({ result, history: [{ at: now, keys: first.keys }] }).send, false);
  assert.equal(plan({ kind: 'failure', errorKey: 'startup' }).send, true);
});

test('distinguishes another document failure from today retry and preserves alert suppression', () => {
  const result = { ...clean, insertCount: 0, remainingSourceCount: 1, autoRegisteredEvents: [{ id: 'registered' }],
    pipeline: { blockers: [{ stage: 'extraction', sourceId: 'source-a', sourceUrl: 'https://example.com/monthly', reason: 'AI extraction review' }],
      reconciliation: { sameDayRetry: { date: '2026-09-23', verified: true, selectedSources: ['source-a'], pendingSources: [] } } } };
  const registered = plan({ result });
  assert.equal(registered.send, true); // Keep the other document's real problem visible.
  assert.match(registered.message, /공개 등록\/갱신 1건/);
  assert.match(registered.message, /당일 재시도 대상은 없습니다/);
  assert.match(registered.message, /다른 게시글 오류는 별도로/);
  assert.match(registered.message, /알림 억제는 수집 재시도에 영향을 주지 않습니다/);
  result.pipeline.reconciliation.sameDayRetry.pendingSources = ['source-a'];
  assert.match(plan({ result }).message, /당일 미확정 1곳.*오늘 남은 예약에서 재확인/);
  assert.equal(plan({ result, history: [{ at: now, keys: registered.keys }] }).send, false);
  result.pipeline.reconciliation.sameDayRetry.verified = false;
  const unknown = plan({ result });
  assert.match(unknown.message, /공개 일정 확인 실패: 완료 판정을 보류/);
  assert.doesNotMatch(unknown.message, /당일 재시도 대상은 없습니다/);
});

test('parses native output and keeps legacy success/issue reports compatible', () => {
  assert.deepEqual(parseRunResult('log\nINGESTION_RESULT_JSON_START\n{"insertCount":0}\nINGESTION_RESULT_JSON_END'), { insertCount: 0 });
  assert.equal(parseRunResult('INGESTION_RESULT_JSON_START\n{bad}\nINGESTION_RESULT_JSON_END'), null);
  assert.equal(plan({ result: null, engine: 'codex', message: '신규: 1건\n이슈: 없음' }).send, false);
  assert.equal(plan({ result: null, engine: 'codex', message: '이슈: 접근 실패' }).send, true);
});

test('actual shell gate records only delivered alerts; retry and dry-run never lose them', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'ingestion-telegram-test-'));
  const output = path.join(directory, 'output.jsonl');
  await writeFile(output, `INGESTION_RESULT_JSON_START\n${JSON.stringify(blocked)}\nINGESTION_RESULT_JSON_END`);
  const run = (id, deliveryExit, dryRun = '0') => spawnSync('/bin/bash', ['-c', `
    source scripts/ingestion/telegram-notify.sh
    log() { printf '%s\\n' "$*" >> "$LOG_FILE"; }
    if [ "$DELIVERY_EXIT" -ge 0 ]; then
      _telegram_deliver() { echo attempted >> "$RUN_DIR/deliveries"; return "$DELIVERY_EXIT"; }
    fi
    telegram_notify 'result summary' result
  `], { cwd: process.cwd(), encoding: 'utf8', timeout: 10000, env: { ...process.env,
    PROJECT_ROOT: process.cwd(), RUN_DIR: directory, RUN_ID: id, RUN_META: path.join(directory, `${id}.meta`), RUN_OUTPUT: output,
    LOG_FILE: path.join(directory, 'log'), DELIVERY_EXIT: String(deliveryExit), TELEGRAM_DRY_RUN: dryRun,
    TELEGRAM_BOT_TOKEN: '', TELEGRAM_CHAT_ID: '', TELEGRAM_SEND_TIMEOUT: '1',
    INGESTION_TELEGRAM_MODE: 'problems', INGESTION_ENGINE: 'native', INGESTION_PROFILE: 'swing-daily', INGESTION_NATIVE_SOURCE_PRIORITY: '1', EXIT_CODE: '75',
  } });
  try {
    assert.equal(run('20260920_075900_0', -1).status, 1);
    assert.deepEqual(await readNotificationHistory(directory), []);
    assert.equal(run('20260920_080000_1', 1).status, 1);
    assert.deepEqual(await readNotificationHistory(directory), []);
    assert.equal(run('20260920_080100_2', 0, '1').status, 0);
    assert.deepEqual(await readNotificationHistory(directory), []);
    assert.equal(run('20260920_080200_3', 0).status, 0);
    assert.equal((await readNotificationHistory(directory)).length, 1);
    assert.equal(run('20260920_080300_4', 0).status, 0);
    assert.equal((await readFile(path.join(directory, 'deliveries'), 'utf8')).trim().split('\n').length, 2);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('launcher installation changes notification hooks only and is idempotent', () => {
  const messages = ['외부 종료 신호', '테스트 파일이 없습니다', '사전검사 실패', '소스 가드 실패', '시작 검증 실패',
    '댄스 이벤트 수집 시작', 'CLI를 찾을 수 없습니다', 'SUCCESS_LINES', 'PARSED_ISSUE', 'PARSED_ISSUE'];
  const original = 'before_collection=true\ntelegram_notify() {\n old_transport\n}\n\ncleanup_lock() { :; }\n'
    + messages.map(message => `telegram_notify "${message}"\n`).join('') + 'run_collector\nexit $EXIT_CODE\n';
  const updated = connectTelegramPolicy(original);
  assert.ok(updated.startsWith('before_collection=true\n'));
  assert.ok(updated.endsWith('run_collector\nexit $EXIT_CODE\n'));
  assert.equal(connectTelegramPolicy(updated), updated);
  assert.equal((updated.match(/" result/g) || []).length, 3);
  assert.equal((updated.match(/" start/g) || []).length, 1);
  assert.equal((updated.match(/" failure/g) || []).length, 6);
  assert.throws(() => connectTelegramPolicy(original.replace('소스 가드 실패', 'unknown error')));
});
