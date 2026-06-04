#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { collectionSources } from './collection-registry.mjs';
import { currentSwingSocialMap, swingSocialSourceRoutes } from './swing-social-map.mjs';

const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const arg = process.argv[index];
  if (!arg.startsWith('--')) continue;
  const key = arg.slice(2);
  const next = process.argv[index + 1];
  if (next && !next.startsWith('--')) {
    args.set(key, next);
    index += 1;
  } else {
    args.set(key, '1');
  }
}

const runLogPath = args.get('run') || findLatestRunLog();
const text = runLogPath && fs.existsSync(runLogPath)
  ? fs.readFileSync(runLogPath, 'utf8')
  : '';

const sourceById = new Map(collectionSources.map((source) => [source.id, source]));
const routeById = new Map([
  ...swingSocialSourceRoutes.map((route) => [route.id, route]),
  ...collectionSources.map((source) => [source.id, {
    id: source.id,
    label: source.name,
    channel: source.type,
    url: source.url,
    status: source.discoveryOnly ? 'discovery_only' : 'collectable_origin',
    automation: source.discoveryOnly ? 'discovery_only' : 'swing-daily',
  }]),
]);

const parsed = parseRunLog(text);
const rows = currentSwingSocialMap.map((item) => auditRow(item, parsed));
const totals = rows.reduce((acc, row) => {
  acc[row.status] = (acc[row.status] || 0) + 1;
  return acc;
}, {});

printReport({ runLogPath, rows, totals, parsed });

function findLatestRunLog() {
  const dir = '/Users/inteyeo/ingestion-runs';
  try {
    return fs.readdirSync(dir)
      .filter((name) => name.endsWith('.last.txt'))
      .map((name) => path.join(dir, name))
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0] || '';
  } catch {
    return '';
  }
}

function parseRunLog(value = '') {
  const checkedSources = new Set();
  const noContent = new Map();
  const accessFailures = new Map();
  const instagramCircuitSkips = new Set();
  const skipped = [];
  const candidates = [];

  for (const match of value.matchAll(/\[native-ingestion\]\s+source\s+([a-z0-9_-]+)\b/g)) {
    checkedSources.add(match[1]);
  }

  for (const match of value.matchAll(/\[native-ingestion\]\s+no content\s+([a-z0-9_-]+):\s+([^\n]+)/g)) {
    checkedSources.add(match[1]);
    noContent.set(match[1], match[2].trim());
  }

  for (const match of value.matchAll(/\[native-ingestion\]\s+skip\s+([a-z0-9_-]+)[^\n]*/g)) {
    checkedSources.add(match[1]);
    skipped.push(match[0].replace(/^\[native-ingestion\]\s+/, ''));
  }

  for (const match of value.matchAll(/\[native-ingestion\]\s+instagram circuit skip\s+([a-z0-9_-]+)/g)) {
    checkedSources.add(match[1]);
    instagramCircuitSkips.add(match[1]);
  }

  const resultJson = extractLastResultJson(value);
  if (resultJson) {
    for (const item of resultJson.accessFailures || []) {
      const parsed = String(item).match(/^([a-z0-9_-]+)\((.*)\)$/);
      if (parsed) accessFailures.set(parsed[1], parsed[2]);
    }
    for (const item of resultJson.noContentSources || []) {
      const parsed = String(item).match(/^([a-z0-9_-]+)\((.*)\)$/);
      if (parsed) {
        checkedSources.add(parsed[1]);
        noContent.set(parsed[1], parsed[2]);
      }
    }
    for (const item of resultJson.instagramCircuitSkips?.sources || []) {
      checkedSources.add(String(item));
      instagramCircuitSkips.add(String(item));
    }
    for (const item of resultJson.candidates || []) candidates.push(String(item));
  }

  return { checkedSources, noContent, accessFailures, instagramCircuitSkips, skipped, candidates };
}

function extractLastResultJson(value = '') {
  const blocks = [...value.matchAll(/INGESTION_RESULT_JSON_START\s*(\{[\s\S]*?\})\s*INGESTION_RESULT_JSON_END/g)];
  const last = blocks.at(-1)?.[1];
  if (!last) return null;
  try {
    return JSON.parse(last);
  } catch {
    return null;
  }
}

function auditRow(row, parsed) {
  const routeDetails = row.routeIds.map((id) => routeById.get(id) || { id, status: 'missing_route' });
  const collectableIds = row.routeIds.filter((id) => {
    const source = sourceById.get(id);
    return source && source.scope === 'swing' && !source.discoveryOnly;
  });
  const checkedIds = collectableIds.filter((id) => parsed.checkedSources.has(id));
  const accessIds = collectableIds.filter((id) => parsed.accessFailures.has(id));
  const circuitIds = collectableIds.filter((id) => parsed.instagramCircuitSkips.has(id));
  const noContentIds = checkedIds.filter((id) => parsed.noContent.has(id));
  const discoveryIds = routeDetails
    .filter((route) => ['discovery_only', 'scene_directory', 'weekly_schedule_hub', 'link_hub', 'event_hub', 'excluded_reference_only'].includes(route.status))
    .map((route) => route.id);
  const unresolvedIds = routeDetails.filter((route) => route.status === 'missing_route').map((route) => route.id);

  let status = 'missing_source_route';
  if (accessIds.length) {
    status = 'access_or_session_needed';
  } else if (circuitIds.length) {
    status = 'instagram_circuit_skipped';
  } else if (checkedIds.length && noContentIds.length === checkedIds.length) {
    status = 'checked_no_collectable_post';
  } else if (checkedIds.length) {
    status = 'checked_by_auto_run';
  } else if (collectableIds.length) {
    status = 'collectable_source_not_checked_in_run';
  } else if (discoveryIds.length) {
    status = 'discovery_route_only';
  }

  if (unresolvedIds.length && status === 'missing_source_route') {
    status = 'needs_source_research';
  }

  return {
    ...row,
    status,
    collectableIds,
    checkedIds,
    noContentIds,
    accessIds,
    circuitIds,
    discoveryIds,
    unresolvedIds,
  };
}

function printReport({ runLogPath, rows, totals, parsed }) {
  console.log('SWING_SOCIAL_MAP_AUDIT_START');
  console.log(JSON.stringify({
    runLogPath: runLogPath || null,
    totals,
    checkedSources: [...parsed.checkedSources].sort(),
    noContentSources: [...parsed.noContent.entries()].map(([id, reason]) => ({ id, reason })),
    accessFailures: [...parsed.accessFailures.entries()].map(([id, reason]) => ({ id, reason })),
    instagramCircuitSkips: [...parsed.instagramCircuitSkips].sort(),
    rows,
  }, null, 2));
  console.log('SWING_SOCIAL_MAP_AUDIT_END');

  const statusLabels = {
    checked_by_auto_run: '자동수집 확인됨',
    checked_no_collectable_post: '확인했지만 후보 포스트 없음',
    collectable_source_not_checked_in_run: '자동수집 소스 있으나 이번 실행 미확인',
    discovery_route_only: '지도/허브 경로만 있음',
    access_or_session_needed: '접근/세션 필요',
    instagram_circuit_skipped: '인스타 회로차단으로 미접근',
    needs_source_research: '출처 추가 조사 필요',
    missing_source_route: '출처 없음',
  };

  console.log('==SWING_SOCIAL_MAP_SUMMARY_START==');
  console.log(`run: ${runLogPath || '-'}`);
  for (const [status, count] of Object.entries(totals)) {
    console.log(`${statusLabels[status] || status}: ${count}건`);
  }
  const needsAttention = rows
    .filter((row) => !['checked_by_auto_run', 'checked_no_collectable_post'].includes(row.status))
    .slice(0, 18)
    .map((row) => `${row.date} ${row.venue}(${row.community}) -> ${statusLabels[row.status] || row.status}`);
  console.log(`주의필요: ${needsAttention.length ? needsAttention.join(' / ') : 'none'}`);
  console.log('==SWING_SOCIAL_MAP_SUMMARY_END==');
}
