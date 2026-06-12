#!/usr/bin/env node
import { getMysqlPool } from '../../server/cafe24/mysql-pool.js';

const args = new Set(process.argv.slice(2));

if (args.has('--help') || args.has('-h')) {
  console.log(`Usage: node scripts/ingestion/audit-ingestor-consistency.mjs [--json] [--fail-on-risk]

Read-only audit for ingestor/live-event consistency.

This script only runs SELECT/SHOW statements. It never writes to live event data
or ingestor candidate data.

Required environment:
  MYSQL_USER
  MYSQL_PASSWORD

Optional environment:
  MYSQL_HOST
  MYSQL_PORT
  MYSQL_DATABASE
`);
  process.exit(0);
}

const outputJson = args.has('--json');
const failOnRisk = args.has('--fail-on-risk');

function kstToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function parseJson(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeUrl(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    parsed.hash = '';
    ['utm_source', 'utm_medium', 'utm_campaign', 'fbclid', 'igsh', 'igshid'].forEach((key) => {
      parsed.searchParams.delete(key);
    });
    if (parsed.pathname !== '/') parsed.pathname = parsed.pathname.replace(/\/+$/, '');
    return parsed.toString();
  } catch {
    return raw;
  }
}

function normalizeText(value = '') {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/seoul/g, '서울')
    .replace(/dj\s*/gi, '')
    .replace(/[^\p{L}\p{N}가-힣]/gu, '');
}

function textSimilarity(a = '', b = '') {
  const left = normalizeText(a);
  const right = normalizeText(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) return 0.86;

  const grams = (value) => {
    if (value.length <= 2) return new Set([value]);
    const result = new Set();
    for (let i = 0; i <= value.length - 2; i += 1) result.add(value.slice(i, i + 2));
    return result;
  };
  const leftGrams = grams(left);
  const rightGrams = grams(right);
  const intersection = [...leftGrams].filter((gram) => rightGrams.has(gram)).length;
  const union = new Set([...leftGrams, ...rightGrams]).size;
  return union ? intersection / union : 0;
}

function dateOfLiveEvent(row = {}) {
  return String(row.start_date || row.date || row.date_value || '').slice(0, 10);
}

function dateOfLegacyCandidate(row = {}) {
  return String(row.structured_data?.date || row.date || row.start_date || '').slice(0, 10);
}

function statusOfLegacyCandidate(row = {}) {
  if (row.is_collected === true && !row.status) return 'collected';
  return String(row.status || 'pending').toLowerCase();
}

function titleOfLegacyCandidate(row = {}) {
  return String(row.structured_data?.title || row.title || '').trim();
}

function venueOfLegacyCandidate(row = {}) {
  return String(row.structured_data?.venue_name || row.structured_data?.location || row.venue_name || row.location || '').trim();
}

function liveEventKey(row = {}) {
  return `${normalizeUrl(row.link1)}|${dateOfLiveEvent(row)}`;
}

function legacyCandidateKey(row = {}) {
  return `${normalizeUrl(row.source_url)}|${dateOfLegacyCandidate(row)}`;
}

function hasExactLiveMatch(candidate, liveByUrlDate) {
  const key = legacyCandidateKey(candidate);
  return Boolean(key !== '|' && liveByUrlDate.has(key));
}

function likelyLiveMatch(candidate, liveEvents) {
  const date = dateOfLegacyCandidate(candidate);
  if (!date) return null;
  const candidateTitle = titleOfLegacyCandidate(candidate);
  const candidateVenue = normalizeText(venueOfLegacyCandidate(candidate));
  const sourceUrl = normalizeUrl(candidate.source_url);

  for (const event of liveEvents) {
    if (dateOfLiveEvent(event) !== date) continue;
    if (sourceUrl && normalizeUrl(event.link1) === sourceUrl) {
      return { event, reason: 'same source_url and date', score: 1 };
    }

    const venue = normalizeText(event.venue_name || event.location || '');
    const sameVenue = candidateVenue && venue && (candidateVenue.includes(venue) || venue.includes(candidateVenue));
    const score = textSimilarity(candidateTitle, event.title || '');
    if (sameVenue && score >= 0.88) {
      return { event, reason: 'same date, similar title, same venue', score };
    }
    if (normalizeText(candidateTitle).length >= 12 && score >= 0.95) {
      return { event, reason: 'same date and near-identical title', score };
    }
  }

  return null;
}

function compactRow(row = {}) {
  return {
    id: row.id || null,
    title: row.title || row.structured_data?.title || null,
    date: row.start_date || row.date || row.structured_data?.date || null,
    source_url: row.source_url || row.link1 || null,
    status: row.status || null,
    is_collected: row.is_collected === true,
  };
}

async function readOnlyQuery(pool, sql, params = []) {
  const normalized = String(sql || '').trim().toLowerCase();
  if (!/^(select|show)\b/.test(normalized)) {
    throw new Error(`Blocked non-read-only SQL: ${sql.slice(0, 80)}`);
  }
  const [rows] = await pool.execute(sql, params);
  return rows;
}

async function tableExists(pool, tableName) {
  const rows = await readOnlyQuery(
    pool,
    'SELECT COUNT(*) AS count FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?',
    [tableName],
  );
  return Number(rows[0]?.count || 0) > 0;
}

function buildLegacyAudit({ today, liveEvents, legacyCandidates }) {
  const liveByUrlDate = new Map();
  for (const event of liveEvents) {
    const key = liveEventKey(event);
    if (key === '|') continue;
    if (!liveByUrlDate.has(key)) liveByUrlDate.set(key, []);
    liveByUrlDate.get(key).push(event);
  }

  const statusCounts = {};
  for (const row of legacyCandidates) {
    const status = statusOfLegacyCandidate(row);
    statusCounts[status] = (statusCounts[status] || 0) + 1;
  }

  const futureLiveEvents = liveEvents.filter((row) => {
    const date = dateOfLiveEvent(row);
    return date && date >= today;
  });

  const pendingExactLiveMatches = legacyCandidates
    .filter((row) => statusOfLegacyCandidate(row) === 'pending')
    .filter((row) => hasExactLiveMatch(row, liveByUrlDate));

  const collectedWithoutExactLiveMatch = legacyCandidates
    .filter((row) => statusOfLegacyCandidate(row) === 'collected' || row.is_collected === true)
    .filter((row) => !hasExactLiveMatch(row, liveByUrlDate));

  const duplicateWithoutLikelyLiveMatch = legacyCandidates
    .filter((row) => statusOfLegacyCandidate(row) === 'duplicate' || row.structured_data?._duplicate)
    .filter((row) => !likelyLiveMatch(row, liveEvents));

  const liveDuplicateGroups = [...liveByUrlDate.entries()]
    .filter(([, rows]) => rows.length > 1)
    .map(([key, rows]) => ({
      key,
      count: rows.length,
      rows: rows.slice(0, 5).map(compactRow),
    }));

  return {
    counts: {
      liveEvents: liveEvents.length,
      futureLiveEvents: futureLiveEvents.length,
      legacyCandidates: legacyCandidates.length,
      legacyStatusCounts: statusCounts,
    },
    risks: {
      pendingExactLiveMatchCount: pendingExactLiveMatches.length,
      collectedWithoutExactLiveMatchCount: collectedWithoutExactLiveMatch.length,
      duplicateWithoutLikelyLiveMatchCount: duplicateWithoutLikelyLiveMatch.length,
      liveSameUrlDateGroupCount: liveDuplicateGroups.length,
    },
    samples: {
      pendingExactLiveMatches: pendingExactLiveMatches.slice(0, 10).map(compactRow),
      collectedWithoutExactLiveMatch: collectedWithoutExactLiveMatch.slice(0, 10).map(compactRow),
      duplicateWithoutLikelyLiveMatch: duplicateWithoutLikelyLiveMatch.slice(0, 10).map(compactRow),
      liveSameUrlDateGroups: liveDuplicateGroups.slice(0, 10),
    },
  };
}

async function buildV3Audit(pool) {
  const candidatesExists = await tableExists(pool, 'ingestion_candidates');
  const linksExists = await tableExists(pool, 'ingestion_candidate_event_links');
  const sourceHealthExists = await tableExists(pool, 'ingestion_source_health');

  if (!candidatesExists) {
    return {
      installed: false,
      message: 'ingestion_candidates table not found',
    };
  }

  const statusRows = await readOnlyQuery(
    pool,
    'SELECT status, COUNT(*) AS count FROM ingestion_candidates GROUP BY status ORDER BY status',
  );
  const linkRows = linksExists
    ? await readOnlyQuery(pool, 'SELECT link_type, COUNT(*) AS count FROM ingestion_candidate_event_links GROUP BY link_type ORDER BY link_type')
    : [];
  const sourceHealthRows = sourceHealthExists
    ? await readOnlyQuery(pool, 'SELECT status, COUNT(*) AS count FROM ingestion_source_health GROUP BY status ORDER BY status')
    : [];
  const registeredWithoutLinkRows = linksExists
    ? await readOnlyQuery(
      pool,
      `SELECT c.id, c.title, c.event_date
       FROM ingestion_candidates c
       LEFT JOIN ingestion_candidate_event_links l
         ON l.candidate_id = c.id AND l.link_type = 'registered_as'
       WHERE c.status = 'registered' AND l.id IS NULL
       LIMIT 20`,
    )
    : [];

  return {
    installed: true,
    candidateStatusCounts: Object.fromEntries(statusRows.map((row) => [row.status, Number(row.count || 0)])),
    linkTypeCounts: Object.fromEntries(linkRows.map((row) => [row.link_type, Number(row.count || 0)])),
    sourceHealthCounts: Object.fromEntries(sourceHealthRows.map((row) => [row.status, Number(row.count || 0)])),
    risks: {
      registeredWithoutLinkCount: registeredWithoutLinkRows.length,
    },
    samples: {
      registeredWithoutLink: registeredWithoutLinkRows,
    },
  };
}

function printTextReport(report) {
  console.log(`# Ingestor Consistency Audit (${report.today})`);
  console.log('');
  console.log('Read-only: yes');
  console.log('Writes to events: no');
  console.log('');
  console.log('## Legacy scraped_events');
  console.log(`- live events: ${report.legacy.counts.liveEvents}`);
  console.log(`- future live events: ${report.legacy.counts.futureLiveEvents}`);
  console.log(`- legacy candidates: ${report.legacy.counts.legacyCandidates}`);
  console.log(`- legacy statuses: ${JSON.stringify(report.legacy.counts.legacyStatusCounts)}`);
  console.log('');
  console.log('## Risks');
  console.log(`- pending candidates that exactly match live events: ${report.legacy.risks.pendingExactLiveMatchCount}`);
  console.log(`- collected candidates without exact live URL/date match: ${report.legacy.risks.collectedWithoutExactLiveMatchCount}`);
  console.log(`- duplicate candidates without likely live match: ${report.legacy.risks.duplicateWithoutLikelyLiveMatchCount}`);
  console.log(`- live event same URL/date groups: ${report.legacy.risks.liveSameUrlDateGroupCount}`);
  console.log('');
  console.log('## Ingestor V3');
  if (!report.v3.installed) {
    console.log(`- installed: no (${report.v3.message})`);
  } else {
    console.log('- installed: yes');
    console.log(`- candidate statuses: ${JSON.stringify(report.v3.candidateStatusCounts)}`);
    console.log(`- link types: ${JSON.stringify(report.v3.linkTypeCounts)}`);
    console.log(`- source health: ${JSON.stringify(report.v3.sourceHealthCounts)}`);
    console.log(`- registered candidates without registered_as link: ${report.v3.risks.registeredWithoutLinkCount}`);
  }
  console.log('');
  console.log('## Samples');
  console.log(JSON.stringify(report.legacy.samples, null, 2));
}

async function main() {
  const pool = getMysqlPool();
  try {
    const today = kstToday();
    const liveRows = await readOnlyQuery(pool, 'SELECT raw_json FROM events');
    const legacyRows = await readOnlyQuery(
      pool,
      'SELECT data_json FROM generic_records WHERE table_name = ?',
      ['scraped_events'],
    );

    const liveEvents = liveRows.map((row) => parseJson(row.raw_json, {}));
    const legacyCandidates = legacyRows.map((row) => parseJson(row.data_json, {}));

    const report = {
      today,
      generatedAt: new Date().toISOString(),
      readOnly: true,
      writesToEvents: false,
      legacy: buildLegacyAudit({ today, liveEvents, legacyCandidates }),
      v3: await buildV3Audit(pool),
    };

    if (outputJson) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      printTextReport(report);
    }

    const hasRisk = report.legacy.risks.pendingExactLiveMatchCount > 0
      || report.legacy.risks.duplicateWithoutLikelyLiveMatchCount > 0
      || (report.v3.installed && report.v3.risks.registeredWithoutLinkCount > 0);
    if (failOnRisk && hasRisk) process.exitCode = 2;
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
