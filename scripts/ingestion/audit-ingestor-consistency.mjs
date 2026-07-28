#!/usr/bin/env node
import { getMysqlPool } from '../../server/cafe24/mysql-pool.js';
import { findGeneratedRegularSocialReplacements } from '../../server/cafe24/regular-social-reconciler.js';
import {
  evaluateAutoRegistrationReadiness,
  prepareCandidate,
  validateCandidate,
} from './candidate-utils.mjs';
import { findSourceByUrl } from './collection-registry.mjs';

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

function djsFromLiveEvent(row = {}) {
  const explicit = Array.isArray(row.djs) ? row.djs : [row.dj_name || row.dj || ''];
  const values = explicit.filter(Boolean);
  if (values.length) return values;
  const titlePrefix = String(row.title || '').match(/^\s*DJ\s+(.+?)\s*\|/i)?.[1] || '';
  const titleOnly = String(row.title || '').match(/^\s*DJ\s+([^|]{1,40})\s*$/i)?.[1] || '';
  return (titlePrefix || titleOnly) ? (titlePrefix || titleOnly).split(/\s*,\s*/).filter(Boolean) : [];
}

function normalizeDjForAudit(value = '') {
  return normalizeText(value)
    .replace(/^(?:인기멤버)?(?:\d{1,3}f)?(?:스칼라)?(?:부매니저\d+)?/i, '')
    .replace(/20\d{2}\d{1,2}\d{1,2}.*/i, '')
    .replace(/(?:applicationlink|신청링크|등록링크|계좌).*/i, '');
}

function djsMatchForAudit(candidateDjs = [], liveDjs = []) {
  const candidate = normalizeDjForAudit(candidateDjs.join(' '));
  const live = normalizeDjForAudit(liveDjs.join(' '));
  if (!candidate && !live) return true;
  return Boolean(candidate && live && (candidate.includes(live) || live.includes(candidate)));
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

function activityOfLegacyCandidate(row = {}) {
  return String(row.activity_type || row.structured_data?.activity_type || row.structured_data?.event_type || '').toLowerCase();
}

function isSocialCandidate(row = {}) {
  return /social|소셜|정모/.test(`${activityOfLegacyCandidate(row)} ${titleOfLegacyCandidate(row)}`.toLowerCase())
    && !/class|강습|워크숍|워크샵/.test(`${activityOfLegacyCandidate(row)} ${titleOfLegacyCandidate(row)}`.toLowerCase());
}

function canonicalVenue(value = '') {
  return normalizeText(value)
    .replace(/(?:서울|신촌|합정|선릉|사당|강남|강북|홍대|상수|망원|연남|서교|마포|신림|봉천|건대|성수|이태원)$/g, '')
    .replace(/(?:bar|바)$/g, '');
}

function venueAuditRow(row = {}) {
  const structured = row.structured_data || {};
  return {
    id: row.id || null,
    title: titleOfLegacyCandidate(row) || null,
    date: dateOfLegacyCandidate(row) || null,
    keyword: row.keyword || null,
    location: structured.location || row.location || null,
    venue_name: structured.venue_name || row.venue_name || null,
    activity_type: activityOfLegacyCandidate(row) || null,
  };
}

function buildVenueConsistencyAudit({ today, liveEvents, legacyCandidates }) {
  const current = legacyCandidates
    .filter((row) => statusOfLegacyCandidate(row) === 'pending')
    .filter((row) => {
      const date = dateOfLegacyCandidate(row);
      return !date || date >= today;
    });
  const missing = current.filter((row) => !venueOfLegacyCandidate(row));
  const pairConflicts = current.filter((row) => {
    const structured = row.structured_data || {};
    const location = canonicalVenue(structured.location || row.location || '');
    const venueName = canonicalVenue(structured.venue_name || row.venue_name || '');
    return Boolean(location && venueName && location !== venueName);
  });
  const sourceFallbacks = current.filter((row) => {
    const venue = canonicalVenue(venueOfLegacyCandidate(row));
    const keyword = canonicalVenue(row.keyword || '');
    return Boolean(venue && keyword && venue === keyword);
  });
  const regionOnly = current.filter((row) => /^(서울|부산|대구|인천|대전|광주|수원|청주|세종|제주)$/i.test(venueOfLegacyCandidate(row)));
  const byKeyword = new Map();
  for (const row of current) {
    const keyword = String(row.keyword || '').trim();
    const venue = venueOfLegacyCandidate(row);
    if (!keyword || !venue) continue;
    if (!byKeyword.has(keyword)) byKeyword.set(keyword, new Map());
    const normalized = canonicalVenue(venue);
    if (!byKeyword.get(keyword).has(normalized)) byKeyword.get(keyword).set(normalized, new Set());
    byKeyword.get(keyword).get(normalized).add(venue);
  }
  const sourceVenueVariants = [...byKeyword.entries()]
    .filter(([, venues]) => venues.size > 1)
    .map(([keyword, venues]) => ({
      keyword,
      variants: [...venues.values()].map((values) => [...values]),
    }));
  const socials = current.filter(isSocialCandidate);
  const standardsRejected = current
    .map((row) => ({ row, validation: validateCandidate(row, { today }) }))
    .filter((item) => !item.validation.ok);
  const autoReadiness = current.map((row) => ({
    row,
    readiness: evaluateAutoRegistrationReadiness(row, { today }),
  }));
  const autoReady = autoReadiness.filter((item) => item.readiness.ready);
  const replacementMatches = socials.map((row) => {
    const structured = row.structured_data || {};
    const replacements = findGeneratedRegularSocialReplacements(liveEvents, {
      title: titleOfLegacyCandidate(row),
      date: dateOfLegacyCandidate(row),
      location: structured.location || row.location || '',
      venue_name: structured.venue_name || row.venue_name || '',
      category: 'social',
      activity_type: 'social',
      link_name1: row.keyword || '',
    }, row);
    return { row, replacements };
  });
  const matchedSocials = replacementMatches.filter((item) => item.replacements.length > 0);
  const ambiguousSocials = replacementMatches.filter((item) => item.replacements.length > 1);

  return {
    counts: {
      currentPendingFuture: current.length,
      withVenue: current.length - missing.length,
      missingVenue: missing.length,
      locationVenueConflict: pairConflicts.length,
      sourceNameFallback: sourceFallbacks.length,
      regionOnlyVenue: regionOnly.length,
      sourceVenueVariantGroups: sourceVenueVariants.length,
      currentSocials: socials.length,
      regularReplacementMatched: matchedSocials.length,
      regularReplacementAmbiguous: ambiguousSocials.length,
      rejectedByCurrentStandards: standardsRejected.length,
      autoRegistrationShadowReady: autoReady.length,
    },
    rates: {
      venuePresence: current.length ? (current.length - missing.length) / current.length : 1,
      locationVenueAgreement: current.length ? (current.length - pairConflicts.length) / current.length : 1,
      regularReplacementCoverage: socials.length ? matchedSocials.length / socials.length : 1,
    },
    samples: {
      missingVenue: missing.slice(0, 20).map(venueAuditRow),
      locationVenueConflict: pairConflicts.slice(0, 20).map(venueAuditRow),
      sourceNameFallback: sourceFallbacks.slice(0, 20).map(venueAuditRow),
      regionOnlyVenue: regionOnly.slice(0, 20).map(venueAuditRow),
      sourceVenueVariants: sourceVenueVariants.slice(0, 20),
      unmatchedSocials: replacementMatches
        .filter((item) => item.replacements.length === 0)
        .slice(0, 20)
        .map((item) => venueAuditRow(item.row)),
      matchedSocials: matchedSocials.slice(0, 20).map((item) => ({
        candidate: venueAuditRow(item.row),
        replacements: item.replacements.map(compactRow),
      })),
      rejectedByCurrentStandards: standardsRejected.slice(0, 20).map((item) => ({
        candidate: venueAuditRow(item.row),
        errors: item.validation.errors,
      })),
      autoRegistrationShadowReady: autoReady.slice(0, 20).map((item) => venueAuditRow(item.row)),
      autoRegistrationBlocked: autoReadiness
        .filter((item) => !item.readiness.ready)
        .slice(0, 20)
        .map((item) => ({
          candidate: venueAuditRow(item.row),
          reasons: item.readiness.reasons,
        })),
    },
  };
}

function liveEventKey(row = {}) {
  return `${normalizeUrl(row.link1)}|${dateOfLiveEvent(row)}`;
}

function legacyCandidateKey(row = {}) {
  return `${normalizeUrl(row.source_url)}|${dateOfLegacyCandidate(row)}`;
}

function hasExactLiveMatch(candidate, liveByUrlDate, liveById = new Map()) {
  const registeredEventId = String(candidate.registered_event_id || candidate.structured_data?.registered_event_id || '');
  if (registeredEventId && liveById.has(registeredEventId)) return true;
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
  const liveById = new Map();
  for (const event of liveEvents) {
    if (event.id !== undefined && event.id !== null) liveById.set(String(event.id), event);
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
    .filter((row) => hasExactLiveMatch(row, liveByUrlDate, liveById));

  const collectedWithoutExactLiveMatch = legacyCandidates
    .filter((row) => statusOfLegacyCandidate(row) === 'collected' || row.is_collected === true)
    .filter((row) => !hasExactLiveMatch(row, liveByUrlDate, liveById));

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

  const approvedBySource = new Map();
  const evidenceGate = {
    eligible: 0,
    fullyUnchanged: 0,
    bySource: new Map(),
    mismatchSamples: [],
  };
  const currentRulesReplay = {
    compared: 0,
    fullyUnchanged: 0,
    accepted: 0,
    acceptedFullyUnchanged: 0,
    mismatchSamples: [],
    acceptedMismatchSamples: [],
  };
  for (const candidate of legacyCandidates.filter((row) => statusOfLegacyCandidate(row) === 'collected' || row.is_collected === true)) {
    const source = findSourceByUrl(candidate.source_url);
    const sourceId = source?.id || candidate.source_id || candidate.keyword || 'unknown';
    const registeredEventId = String(candidate.registered_event_id || candidate.structured_data?.registered_event_id || '');
    const exactRows = registeredEventId && liveById.has(registeredEventId)
      ? [liveById.get(registeredEventId)]
      : (liveByUrlDate.get(legacyCandidateKey(candidate)) || []);
    const live = exactRows[0] || likelyLiveMatch(candidate, liveEvents)?.event || null;
    if (!approvedBySource.has(sourceId)) {
      approvedBySource.set(sourceId, {
        sourceId,
        approved: 0,
        linked: 0,
        titleMatch: 0,
        venueMatch: 0,
        activityMatch: 0,
        djMatch: 0,
        fullyUnchanged: 0,
        mismatchSamples: [],
      });
    }
    const stat = approvedBySource.get(sourceId);
    stat.approved += 1;
    if (!live) continue;
    stat.linked += 1;
    const candidateTitle = titleOfLegacyCandidate(candidate);
    const candidateVenue = normalizeText(venueOfLegacyCandidate(candidate));
    const liveVenue = normalizeText(live.venue_name || live.location || '');
    const candidateActivity = normalizeText(candidate.activity_type || candidate.structured_data?.activity_type || '');
    const liveActivity = normalizeText(live.activity_type || live.category || '');
    const candidateDjs = candidate.structured_data?.djs || [];
    const liveDjs = djsFromLiveEvent(live);
    const titleMatch = textSimilarity(candidateTitle, live.title || '') >= 0.85;
    const venueMatch = Boolean(candidateVenue && liveVenue && candidateVenue === liveVenue);
    const activityMatch = Boolean(candidateActivity && liveActivity && (
      candidateActivity === liveActivity
      || (candidateActivity === 'class' && /class|강습|lesson/.test(liveActivity))
      || (candidateActivity === 'social' && /social|소셜/.test(liveActivity))
    ));
    const djMatch = djsMatchForAudit(candidateDjs, liveDjs);
    if (titleMatch) stat.titleMatch += 1;
    if (venueMatch) stat.venueMatch += 1;
    if (activityMatch) stat.activityMatch += 1;
    if (djMatch) stat.djMatch += 1;
    if (titleMatch && venueMatch && activityMatch && djMatch) stat.fullyUnchanged += 1;
    if (!(titleMatch && venueMatch && activityMatch && djMatch) && stat.mismatchSamples.length < 100) {
      stat.mismatchSamples.push({
        candidate: {
          id: candidate.id,
          title: candidateTitle,
          venue: venueOfLegacyCandidate(candidate),
          activity: candidate.activity_type || candidate.structured_data?.activity_type || '',
          djs: candidate.structured_data?.djs || [],
        },
        live: {
          id: live.id,
          title: live.title || '',
          venue: live.venue_name || live.location || '',
          activity: live.activity_type || live.category || '',
          djs: liveDjs,
        },
        mismatches: [
          !titleMatch && 'title',
          !venueMatch && 'venue',
          !activityMatch && 'activity',
          !djMatch && 'dj',
        ].filter(Boolean),
      });
    }

    const projected = prepareCandidate(candidate, { today });
    const projectedSource = projected.validation.source;
    const projectedActivity = projected.validation.taxonomy.activity_type;
    const enrolledActivities = projectedSource?.autoRegistrationAllowedActivityTypes;
    const replayVenue = projectedSource?.venue || venueOfLegacyCandidate(projected.candidate);
    const replayTitleMatch = textSimilarity(titleOfLegacyCandidate(projected.candidate), live.title || '') >= 0.85;
    const replayVenueMatch = canonicalVenue(replayVenue)
      && canonicalVenue(replayVenue) === canonicalVenue(live.venue_name || live.location || '');
    const replayActivityMatch = normalizeText(projectedActivity) === normalizeText(live.activity_type || live.category || '');
    const replayDjMatch = djsMatchForAudit(projected.candidate.structured_data?.djs || [], liveDjs);
    const replayUnchanged = Boolean(replayTitleMatch && replayVenueMatch && replayActivityMatch && replayDjMatch);
    currentRulesReplay.compared += 1;
    if (replayUnchanged) currentRulesReplay.fullyUnchanged += 1;
    if (!replayUnchanged && currentRulesReplay.mismatchSamples.length < 100) {
      currentRulesReplay.mismatchSamples.push({
        sourceId,
        candidateId: candidate.id,
        title: titleOfLegacyCandidate(projected.candidate),
        projectedActivity,
        projectedVenue: replayVenue,
        mismatches: [
          !replayTitleMatch && 'title',
          !replayVenueMatch && 'venue',
          !replayActivityMatch && 'activity',
          !replayDjMatch && 'dj',
        ].filter(Boolean),
      });
    }
    const replayBlockingErrors = projected.validation.errors.filter((error) => (
      !/past event date|same-day event|weekday mismatch|poster_url or imageData required/i.test(error)
    ));
    if (replayBlockingErrors.length === 0) {
      currentRulesReplay.accepted += 1;
      if (replayUnchanged) currentRulesReplay.acceptedFullyUnchanged += 1;
      if (!replayUnchanged && currentRulesReplay.acceptedMismatchSamples.length < 100) {
        currentRulesReplay.acceptedMismatchSamples.push({
          sourceId,
          candidateId: candidate.id,
          mismatches: [
            !replayTitleMatch && 'title',
            !replayVenueMatch && 'venue',
            !replayActivityMatch && 'activity',
            !replayDjMatch && 'dj',
          ].filter(Boolean),
        });
      }
    }
    const blockedByCurrentSemanticRule = projected.validation.errors.some((error) => (
      /misclassified|malformed|generic|not the required event series|does not collect this activity/i.test(error)
    ));
    if (
      Array.isArray(enrolledActivities)
      && enrolledActivities.includes(projectedActivity)
      && !blockedByCurrentSemanticRule
    ) {
      const projectedVenue = projectedSource.venue || venueOfLegacyCandidate(projected.candidate);
      const projectedTitleMatch = textSimilarity(titleOfLegacyCandidate(projected.candidate), live.title || '') >= 0.85;
      const projectedVenueMatch = canonicalVenue(projectedVenue)
        && canonicalVenue(projectedVenue) === canonicalVenue(live.venue_name || live.location || '');
      const projectedActivityMatch = normalizeText(projectedActivity) === normalizeText(live.activity_type || live.category || '');
      const projectedDjMatch = djsMatchForAudit(projected.candidate.structured_data?.djs || [], liveDjs);
      const unchanged = Boolean(projectedTitleMatch && projectedVenueMatch && projectedActivityMatch && projectedDjMatch);
      evidenceGate.eligible += 1;
      if (unchanged) evidenceGate.fullyUnchanged += 1;
      if (!evidenceGate.bySource.has(sourceId)) {
        evidenceGate.bySource.set(sourceId, { sourceId, eligible: 0, fullyUnchanged: 0 });
      }
      const gateSource = evidenceGate.bySource.get(sourceId);
      gateSource.eligible += 1;
      if (unchanged) gateSource.fullyUnchanged += 1;
      if (!unchanged && evidenceGate.mismatchSamples.length < 20) {
        evidenceGate.mismatchSamples.push({
          sourceId,
          candidateId: candidate.id,
          mismatches: [
            !projectedTitleMatch && 'title',
            !projectedVenueMatch && 'venue',
            !projectedActivityMatch && 'activity',
            !projectedDjMatch && 'dj',
          ].filter(Boolean),
        });
      }
    }
  }
  const sourceApprovalReadiness = [...approvedBySource.values()]
    .map((stat) => ({
      ...stat,
      linkedRate: stat.approved ? stat.linked / stat.approved : 0,
      unchangedRate: stat.linked ? stat.fullyUnchanged / stat.linked : 0,
      titleMatchRate: stat.linked ? stat.titleMatch / stat.linked : 0,
      venueMatchRate: stat.linked ? stat.venueMatch / stat.linked : 0,
      activityMatchRate: stat.linked ? stat.activityMatch / stat.linked : 0,
      djMatchRate: stat.linked ? stat.djMatch / stat.linked : 0,
    }))
    .sort((a, b) => b.linked - a.linked || a.sourceId.localeCompare(b.sourceId));
  const linkedApprovedTotal = sourceApprovalReadiness
    .reduce((sum, stat) => sum + stat.linked, 0);
  const evidenceCoverageRate = linkedApprovedTotal
    ? evidenceGate.eligible / linkedApprovedTotal
    : 0;
  const evidenceMeasuredRate = evidenceGate.eligible
    ? evidenceGate.fullyUnchanged / evidenceGate.eligible
    : 0;

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
    sourceApprovalReadiness,
    autoRegistrationEvidenceGate: {
      targetRate: 0.95,
      targetCoverageRate: 0.95,
      linkedApprovedTotal,
      eligible: evidenceGate.eligible,
      fullyUnchanged: evidenceGate.fullyUnchanged,
      measuredRate: evidenceMeasuredRate,
      coverageRate: evidenceCoverageRate,
      targetReached: evidenceMeasuredRate >= 0.95 && evidenceCoverageRate >= 0.95,
      bySource: [...evidenceGate.bySource.values()].map((stat) => ({
        ...stat,
        measuredRate: stat.eligible ? stat.fullyUnchanged / stat.eligible : 0,
      })),
      mismatchSamples: evidenceGate.mismatchSamples,
    },
    currentRulesReplay: {
      ...currentRulesReplay,
      measuredRate: currentRulesReplay.compared
        ? currentRulesReplay.fullyUnchanged / currentRulesReplay.compared
        : 0,
      acceptedMeasuredRate: currentRulesReplay.accepted
        ? currentRulesReplay.acceptedFullyUnchanged / currentRulesReplay.accepted
        : 0,
      acceptedCoverageRate: currentRulesReplay.compared
        ? currentRulesReplay.accepted / currentRulesReplay.compared
        : 0,
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
  console.log('## Current candidate venue consistency');
  console.log(`- pending future candidates: ${report.venueConsistency.counts.currentPendingFuture}`);
  console.log(`- venue presence: ${(report.venueConsistency.rates.venuePresence * 100).toFixed(1)}%`);
  console.log(`- location/venue agreement: ${(report.venueConsistency.rates.locationVenueAgreement * 100).toFixed(1)}%`);
  console.log(`- source-name fallbacks: ${report.venueConsistency.counts.sourceNameFallback}`);
  console.log(`- region-only venues: ${report.venueConsistency.counts.regionOnlyVenue}`);
  console.log(`- regular-social replacement coverage: ${(report.venueConsistency.rates.regularReplacementCoverage * 100).toFixed(1)}%`);
  console.log(`- ambiguous regular-social replacements: ${report.venueConsistency.counts.regularReplacementAmbiguous}`);
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
  console.log(JSON.stringify({
    legacy: report.legacy.samples,
    venueConsistency: report.venueConsistency.samples,
  }, null, 2));
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
      venueConsistency: buildVenueConsistencyAudit({ today, liveEvents, legacyCandidates }),
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
