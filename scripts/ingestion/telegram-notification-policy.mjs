import fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const REPEAT_INTERVAL_MS = 24 * 60 * 60 * 1000;

export function parseRunResult(text = '') {
  const blocks = [...String(text).matchAll(/INGESTION_RESULT_JSON_START\s*(\{[\s\S]*?\})\s*INGESTION_RESULT_JSON_END/g)];
  if (!blocks.length) return null;
  try { return JSON.parse(blocks.at(-1)[1]); } catch { return null; }
}

function problemType(reason = '') {
  if (/login wall|login required|로그인/i.test(reason)) return 'login';
  if (/at capacity|rate.?limit|HTTP 429|too many requests/i.test(reason)) return 'capacity';
  if (/timeout|timed out|강제종료/i.test(reason)) return 'timeout';
  if (/HTTP 5\d\d|fetch failed|network|extraction error/i.test(reason)) return 'service';
  return 'review';
}

// Use stage/source/problem type, not changing AI prose, dates, URLs or candidate IDs.
export function collectNotificationProblems({ kind = 'result', result, message = '', exitCode = 0, engine = 'native', errorKey = 'runtime' }) {
  if (kind === 'start') return [];
  if (kind === 'failure') return [{ key: `runtime:${errorKey}`, label: message.split('\n').slice(0, 3).join(' ').slice(0, 200) }];
  const problems = new Map();
  const add = (key, label) => problems.set(key, { key, label });
  if (!result && engine === 'native') add('runtime:missing-result', '수집 결과 기록을 확인하지 못했습니다.');
  if (/summary block missing/i.test(message)) add('runtime:missing-summary', '수집 요약이 누락됐습니다.');
  if (exitCode !== 0 && exitCode !== 75) add(`runtime:exit-${exitCode}`, `수집 프로세스 종료 코드 ${exitCode}`);
  for (const blocker of result?.pipeline?.blockers || []) {
    const stage = String(blocker.stage || 'collector');
    const source = String(blocker.sourceId || 'unknown');
    const type = problemType(blocker.reason);
    const category = type === 'login' ? '로그인/접근 제한' : type === 'capacity' ? '서비스 사용량/가용성 제한'
      : type === 'timeout' ? '응답 시간 초과' : type === 'service' ? '서비스 오류' : '확인/검토 필요';
    add(`${stage}:${source}:${type}`, `${source}: ${category} (${stage})`);
  }
  for (const failure of result?.accessFailures || []) {
    const source = String(failure).split('(')[0].trim();
    const type = problemType(String(failure));
    add(`discovery:${source}:${type}`, `${source}: ${type === 'login' ? '로그인/접근 제한' : '접근 실패'}`);
  }
  for (const failure of result?.pipeline?.reconciliation?.failures || []) {
    const source = String(failure.sourceId || 'unknown');
    add(`registration-reconciliation:${source}:${problemType(failure.reason)}`, `${source}: 공식 일정의 자동등록 미완료`);
  }
  if (result?.instagramCircuitSkips?.count > 0) add('discovery:global:circuit', '인스타그램 접근 안전장치가 후속 요청을 중단했습니다.');
  if (result?.pipeline?.persistence?.failures > 0) add('persistence:failed', '수집한 후보의 저장에 실패했습니다.');
  // Exit 0 can still contain a failed source. Retain legacy summaries, too.
  const issues = result?.issues || (engine !== 'native' ? [message.match(/^이슈:\s*(.*)$/m)?.[1] || ''] : []);
  for (const raw of issues) {
    const issue = String(raw);
    if (!issue || /^(none|없음|-|smoke test ok)$/i.test(issue.trim())) continue;
    if (problems.size && !/at capacity|HTTP 5\d\d|HTTP 429|extraction error|verification failed/i.test(issue)) continue;
    if (/run budget reached; remaining sources/i.test(issue)) continue;
    const source = issue.match(/^(?:post\s+)?([\w-]+):/)?.[1] || 'collector';
    const type = problemType(issue);
    add(`issue:${source}:${type}`, `${source}: ${type === 'capacity' ? 'AI 서비스 가용성 제한' : '수집 결과 확인 필요'}`);
  }
  if (result?.deadlineReached) add('runtime:budget', '이번 회차의 수집 예산에 도달해 남은 소스를 다음 회차에 이어갑니다.');
  if ((result?.remainingSourceCount > 0 || exitCode === 75) && !problems.size) add('runtime:incomplete', '일부 소스가 미완료 상태입니다.');
  return [...problems.values()];
}

export function planNotification({ kind, result, message = '', exitCode = 0, engine = 'native', errorKey,
  scope = 'swing-daily:unknown', history = [], now = Date.now(), mode = 'problems' }) {
  const problems = collectNotificationProblems({ kind, result, message, exitCode, engine, errorKey });
  if (mode === 'all') return { send: true, keys: [], message: message.slice(0, 3500), reason: 'all' };
  const recentKeys = new Set(history.filter(row => now - row.at < REPEAT_INTERVAL_MS && now >= row.at).flatMap(row => row.keys));
  const due = problems.map(problem => ({ ...problem, scopedKey: `${scope}:${problem.key}` }))
    .filter(problem => !recentKeys.has(problem.scopedKey));
  if (!due.length) return { send: false, keys: [], message: '', reason: problems.length ? 'repeat-suppressed' : 'normal-suppressed' };
  const lines = ['댄스 이벤트 수집 확인 필요', '', ...due.slice(0, 8).map(problem => `• ${problem.label}`)];
  if (due.length > 8) lines.push(`외 ${due.length - 8}개 문제`);
  if (result) {
    lines.push('', `신규 후보 ${Number(result.insertCount) || 0}건 · 공개 등록/갱신 ${result.autoRegisteredEvents?.length || 0}건 · 미완료 출처 ${Number(result.remainingSourceCount) || 0}개`);
    const retry = result.pipeline?.reconciliation?.sameDayRetry;
    if (retry) lines.push(!retry.verified
      ? `${retry.date} 이번 범위의 당일 공개 일정 확인 실패: 완료 판정을 보류하고 오늘 남은 예약에서 재확인합니다.`
      : retry.pendingSources.length
        ? `${retry.date} 이번 범위의 당일 미확정 ${retry.pendingSources.length}곳: ${retry.pendingSources.join(', ')}. 오늘 남은 예약에서 재확인합니다.`
        : `${retry.date} 이번 범위의 당일 재시도 대상은 없습니다. 오늘 회차 재수집은 멈추며 다른 게시글 오류는 별도로 남습니다.`);
  }
  lines.push('', '같은 문제의 알림은 24시간 억제됩니다. 알림 억제는 수집 재시도에 영향을 주지 않습니다.', 'https://swingenjoy.com/admin/v2/ingestor');
  return { send: true, keys: due.map(problem => problem.scopedKey), message: lines.join('\n').slice(0, 3500), reason: 'problem' };
}

// The existing per-run metadata owns notification receipts as well. No new queue
// or collection checkpoint is created. A receipt is appended only after delivery.
export async function readNotificationHistory(directory) {
  const names = (await fs.readdir(directory)).filter(name => /^\d{8}_\d{6}_\d+\.meta$/.test(name)).sort().slice(-300);
  const rows = await Promise.all(names.map(async name => {
    try {
      const text = await fs.readFile(path.join(directory, name), 'utf8');
      const at = Number([...text.matchAll(/^telegram_notified_at_ms=(\d+)$/gm)].at(-1)?.[1]);
      const keys = JSON.parse([...text.matchAll(/^telegram_problem_keys=(.+)$/gm)].at(-1)?.[1] || '[]');
      return Number.isFinite(at) && Array.isArray(keys) ? { at, keys } : null;
    } catch { return null; }
  }));
  return rows.filter(Boolean);
}

export async function recordNotification(metaFile, plan, now = Date.now()) {
  if (!plan.send || !plan.keys.length) return;
  await fs.appendFile(metaFile, `\ntelegram_notified_at_ms=${now}\ntelegram_problem_keys=${JSON.stringify(plan.keys)}\n`, { mode: 0o600 });
}

async function main() {
  const [action, ...args] = process.argv.slice(2);
  if (action === 'plan') {
    const [kind, scope, exitCode, engine, outputFile, runDirectory, errorKey] = args;
    const message = readFileSync(0, 'utf8');
    const result = outputFile ? parseRunResult(await fs.readFile(outputFile, 'utf8').catch(() => '')) : null;
    const history = await readNotificationHistory(runDirectory);
    console.log(JSON.stringify(planNotification({ kind, scope, exitCode: Number(exitCode), engine, result, message, errorKey, history,
      mode: process.env.INGESTION_TELEGRAM_MODE || 'problems' })));
  } else if (action === 'message') {
    const plan = JSON.parse(await fs.readFile(args[0], 'utf8'));
    if (!plan.send) { process.exitCode = 10; return; }
    process.stdout.write(plan.message);
  } else if (action === 'record') {
    await recordNotification(args[1], JSON.parse(await fs.readFile(args[0], 'utf8')));
  } else throw new Error('Expected plan, message, or record');
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error(`Ingestion notification policy failed: ${error.message}`); process.exitCode = 1; });
}
