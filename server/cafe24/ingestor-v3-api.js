import crypto from 'node:crypto';
import { requireAdmin } from './auth-api.js';
import { getMysqlPool } from './mysql-pool.js';
import {
  collapseDateExpansionRows,
  dateExpansionSkipReason,
  shouldSkipDateExpansionCandidate,
  sortDateExpansionInputs,
} from './ingestion-date-expansion.js';

const candidateStatuses = new Set(['new', 'needs_review', 'duplicate', 'excluded', 'registered', 'archived']);
const automationTerminalStatuses = new Set(['duplicate', 'excluded', 'registered', 'archived']);
const adminOnlyStatuses = new Set(['registered']);
const liveEventReadColumns = 'SELECT raw_json FROM events';

function safeEqualString(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function hasValidIngestionToken(req) {
  const expected = process.env.SCRAPED_EVENTS_INGEST_TOKEN || process.env.CAFE24_INGEST_TOKEN || '';
  if (!expected) return false;
  const headerToken = req.headers['x-ingestion-token'] || req.headers['x-cafe24-ingest-token'];
  const bearer = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i)?.[1];
  return safeEqualString(headerToken || bearer || '', expected);
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

function stringifyJson(value) {
  if (value === undefined) return null;
  return JSON.stringify(value);
}

function dateOnly(value) {
  return String(value || '').slice(0, 10);
}

function mysqlDateTime(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 19).replace('T', ' ');
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

function sha256(value = '') {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
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

function eventDate(row = {}) {
  return dateOnly(row.start_date || row.date || row.date_value);
}

function sameEventDate(row = {}, date = '') {
  if (!date) return false;
  const start = dateOnly(row.start_date || row.date);
  const end = dateOnly(row.end_date || row.start_date || row.date);
  return start === date || dateOnly(row.date) === date || (start && end && start <= date && date <= end);
}

function rowTitle(row = {}) {
  return String(row.title || row.structured_data?.title || '').trim();
}

function rowVenue(row = {}) {
  return String(row.venue_name || row.location || row.structured_data?.venue_name || row.structured_data?.location || '').trim();
}

function duplicateDescriptor(event, reason, confidenceScore) {
  return {
    target: 'events',
    existingId: event?.id || null,
    existingTitle: rowTitle(event) || null,
    existingDate: eventDate(event) || null,
    existingSourceUrl: event?.link1 || null,
    reason,
    confidenceScore,
  };
}

function findLiveDuplicate(candidate, liveEvents = []) {
  const candidateDate = dateOnly(candidate.event_date);
  if (!candidateDate) return null;
  const candidateSource = normalizeUrl(candidate.source_url);
  const candidateTitle = rowTitle(candidate);
  const candidateVenue = normalizeText(rowVenue(candidate));

  for (const event of liveEvents) {
    const eventSource = normalizeUrl(event.link1);
    if (candidateSource && eventSource && candidateSource === eventSource && sameEventDate(event, candidateDate)) {
      return duplicateDescriptor(event, 'same source URL and date', 1);
    }

    if (!sameEventDate(event, candidateDate)) continue;
    const titleScore = textSimilarity(rowTitle(event), candidateTitle);
    const eventVenue = normalizeText(rowVenue(event));
    const sameVenue = candidateVenue && eventVenue && (candidateVenue.includes(eventVenue) || eventVenue.includes(candidateVenue));
    if (sameVenue && titleScore >= 0.88) {
      return duplicateDescriptor(event, 'same date, similar title, same venue', Number(titleScore.toFixed(2)));
    }
    if (normalizeText(candidateTitle).length >= 12 && titleScore >= 0.95) {
      return duplicateDescriptor(event, 'same date and near-identical title', Number(titleScore.toFixed(2)));
    }
  }

  return null;
}

function buildCandidateId(sourceUrl, eventDateValue, suffix = '') {
  return crypto.createHash('md5')
    .update(`${normalizeUrl(sourceUrl)}|${dateOnly(eventDateValue)}${suffix ? `|${suffix}` : ''}`)
    .digest('hex')
    .slice(0, 16);
}

function normalizeCandidateInput(input = {}) {
  const sd = input.structured_data || {};
  const sourceUrl = String(input.source_url || '').trim();
  const normalizedSourceUrl = normalizeUrl(sourceUrl);
  const eventDateValue = dateOnly(sd.date || input.event_date || input.date);
  const title = String(sd.title || input.title || '').trim();
  const validationErrors = [];
  const validationWarnings = [];

  if (!sourceUrl) validationErrors.push('source_url required');
  if (!eventDateValue) validationErrors.push('event date required');
  if (!title) validationErrors.push('title required');
  if (!input.poster_url && !input.imageData) validationWarnings.push('poster_url missing');

  const rawStatus = String(input.status || '').toLowerCase();
  const status = candidateStatuses.has(rawStatus) ? rawStatus : (validationErrors.length ? 'needs_review' : 'new');
  const now = new Date().toISOString();
  const confidenceScore = Number(input.confidence_score ?? input.confidenceScore ?? (validationErrors.length ? 35 : validationWarnings.length ? 65 : 90));

  return {
    id: String(input.id || buildCandidateId(sourceUrl, eventDateValue, input.id_suffix || '')),
    run_id: input.run_id || input.runId || null,
    source_id: input.source_id || input.sourceId || input.keyword || null,
    legacy_scraped_event_id: input.legacy_scraped_event_id || input.legacyScrapedEventId || null,
    source_url: sourceUrl,
    normalized_source_url: normalizedSourceUrl,
    source_url_hash: sha256(normalizedSourceUrl || sourceUrl),
    event_date: eventDateValue,
    title,
    venue_name: sd.venue_name || input.venue_name || sd.location || input.location || null,
    location: sd.location || input.location || sd.venue_name || input.venue_name || null,
    address: sd.address || input.address || null,
    poster_url: input.poster_url || null,
    poster_storage_path: input.poster_storage_path || input.storage_path || null,
    extracted_text: input.extracted_text || '',
    activity_type: sd.activity_type || input.activity_type || null,
    dance_scope: sd.dance_scope || input.dance_scope || null,
    genre_family: sd.genre_family || input.genre_family || null,
    dance_genre: sd.dance_genre || input.dance_genre || null,
    tags_json: stringifyJson(sd.tags || input.tags || []),
    confidence_score: Number.isFinite(confidenceScore) ? Math.max(0, Math.min(100, confidenceScore)) : 0,
    classification_reason: input.classification_reason || sd.classification_reason || null,
    needs_review_reason: input.needs_review_reason || (validationErrors.length ? validationErrors.join('; ') : null),
    validation_errors_json: stringifyJson(input.validation_errors || validationErrors),
    validation_warnings_json: stringifyJson(input.validation_warnings || validationWarnings),
    evidence_json: stringifyJson(input.evidence || sd.evidence || {}),
    duplicate_json: null,
    status,
    terminal_at: ['excluded', 'registered', 'archived'].includes(status) ? mysqlDateTime(now) : null,
    terminal_reason: input.terminal_reason || null,
    reviewed_by: input.reviewed_by || null,
    reviewed_at: mysqlDateTime(input.reviewed_at),
    raw_json: stringifyJson(input),
    created_at: mysqlDateTime(input.created_at || now),
    updated_at: mysqlDateTime(now),
  };
}

function rowToCandidate(row = {}) {
  return {
    ...row,
    tags: parseJson(row.tags_json, []),
    validation_errors: parseJson(row.validation_errors_json, []),
    validation_warnings: parseJson(row.validation_warnings_json, []),
    evidence: parseJson(row.evidence_json, {}),
    duplicate: parseJson(row.duplicate_json, null),
    raw: parseJson(row.raw_json, {}),
  };
}

async function loadLiveEventsForDuplicateDetection(pool) {
  const [rows] = await pool.execute(liveEventReadColumns);
  return rows.map((row) => parseJson(row.raw_json, {}));
}

async function loadExistingCandidate(pool, id) {
  const [rows] = await pool.execute(
    'SELECT * FROM ingestion_candidates WHERE id = ? LIMIT 1',
    [id],
  );
  return rows[0] || null;
}

async function loadDateExpansionCandidateRows(pool, candidate) {
  const [rows] = await pool.execute(
    `SELECT * FROM ingestion_candidates
     WHERE source_url_hash = ?
       AND status <> 'archived'`,
    [candidate.source_url_hash],
  );
  return rows;
}

async function writeStateLog(pool, { candidateId, fromStatus, toStatus, actorType, actorId = null, reason = null, details = null }) {
  await pool.execute(
    `INSERT INTO ingestion_candidate_state_log
       (candidate_id, from_status, to_status, actor_type, actor_id, reason, details_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [candidateId, fromStatus || null, toStatus, actorType, actorId, reason, stringifyJson(details)],
  );
}

async function saveDuplicateLink(pool, candidate, duplicate) {
  if (!duplicate?.existingId) return;
  const id = crypto.createHash('sha1')
    .update(`${candidate.id}|${duplicate.existingId}|duplicate_of`)
    .digest('hex')
    .slice(0, 40);
  await pool.execute(
    `INSERT INTO ingestion_candidate_event_links
       (id, candidate_id, event_id, link_type, confidence_score, reason, created_by, details_json)
     VALUES (?, ?, ?, 'duplicate_of', ?, ?, 'automation', ?)
     ON DUPLICATE KEY UPDATE
       confidence_score = VALUES(confidence_score),
       reason = VALUES(reason),
       details_json = VALUES(details_json)`,
    [
      id,
      candidate.id,
      String(duplicate.existingId),
      Number(duplicate.confidenceScore || 0),
      duplicate.reason || null,
      stringifyJson(duplicate),
    ],
  );
}

async function upsertCandidate(pool, candidate, { actorType, duplicate = null }) {
  const existing = await loadExistingCandidate(pool, candidate.id);
  if (existing && actorType === 'automation' && automationTerminalStatuses.has(String(existing.status))) {
    return {
      skipped: true,
      reason: `existing terminal candidate status: ${existing.status}`,
      candidate: rowToCandidate(existing),
    };
  }

  const next = {
    ...candidate,
    ...(duplicate ? {
      status: 'duplicate',
      duplicate_json: stringifyJson(duplicate),
      needs_review_reason: candidate.needs_review_reason || duplicate.reason || null,
    } : {}),
  };

  if (actorType === 'automation' && adminOnlyStatuses.has(next.status)) {
    next.status = 'needs_review';
    next.needs_review_reason = 'automation cannot mark candidate as registered';
    next.terminal_at = null;
  }

  await pool.execute(
    `INSERT INTO ingestion_candidates (
       id, run_id, source_id, legacy_scraped_event_id, source_url, normalized_source_url, source_url_hash,
       event_date, title, venue_name, location, address, poster_url, poster_storage_path, extracted_text,
       activity_type, dance_scope, genre_family, dance_genre, tags_json, confidence_score,
       classification_reason, needs_review_reason, validation_errors_json, validation_warnings_json,
       evidence_json, duplicate_json, status, terminal_at, terminal_reason, reviewed_by, reviewed_at,
       raw_json, created_at, updated_at
     ) VALUES (${Array.from({ length: 35 }, () => '?').join(',')})
     ON DUPLICATE KEY UPDATE
       run_id = VALUES(run_id),
       source_id = VALUES(source_id),
       legacy_scraped_event_id = COALESCE(VALUES(legacy_scraped_event_id), legacy_scraped_event_id),
       source_url = VALUES(source_url),
       normalized_source_url = VALUES(normalized_source_url),
       source_url_hash = VALUES(source_url_hash),
       event_date = VALUES(event_date),
       title = VALUES(title),
       venue_name = VALUES(venue_name),
       location = VALUES(location),
       address = VALUES(address),
       poster_url = COALESCE(VALUES(poster_url), poster_url),
       poster_storage_path = COALESCE(VALUES(poster_storage_path), poster_storage_path),
       extracted_text = COALESCE(NULLIF(VALUES(extracted_text), ''), extracted_text),
       activity_type = VALUES(activity_type),
       dance_scope = VALUES(dance_scope),
       genre_family = VALUES(genre_family),
       dance_genre = VALUES(dance_genre),
       tags_json = VALUES(tags_json),
       confidence_score = VALUES(confidence_score),
       classification_reason = VALUES(classification_reason),
       needs_review_reason = VALUES(needs_review_reason),
       validation_errors_json = VALUES(validation_errors_json),
       validation_warnings_json = VALUES(validation_warnings_json),
       evidence_json = VALUES(evidence_json),
       duplicate_json = VALUES(duplicate_json),
       status = VALUES(status),
       terminal_at = VALUES(terminal_at),
       terminal_reason = VALUES(terminal_reason),
       raw_json = VALUES(raw_json),
       updated_at = VALUES(updated_at)`,
    [
      next.id,
      next.run_id,
      next.source_id,
      next.legacy_scraped_event_id,
      next.source_url,
      next.normalized_source_url,
      next.source_url_hash,
      next.event_date,
      next.title,
      next.venue_name,
      next.location,
      next.address,
      next.poster_url,
      next.poster_storage_path,
      next.extracted_text,
      next.activity_type,
      next.dance_scope,
      next.genre_family,
      next.dance_genre,
      next.tags_json,
      next.confidence_score,
      next.classification_reason,
      next.needs_review_reason,
      next.validation_errors_json,
      next.validation_warnings_json,
      next.evidence_json,
      next.duplicate_json,
      next.status,
      next.terminal_at,
      next.terminal_reason,
      next.reviewed_by,
      next.reviewed_at,
      next.raw_json,
      next.created_at,
      next.updated_at,
    ],
  );

  if (!existing || String(existing.status) !== String(next.status)) {
    await writeStateLog(pool, {
      candidateId: next.id,
      fromStatus: existing?.status || null,
      toStatus: next.status,
      actorType,
      reason: duplicate?.reason || next.needs_review_reason || null,
      details: duplicate ? { duplicate } : null,
    });
  }

  if (duplicate) await saveDuplicateLink(pool, next, duplicate);

  const saved = await loadExistingCandidate(pool, next.id);
  return { skipped: false, candidate: rowToCandidate(saved) };
}

async function listCandidates(req, res) {
  await requireAdmin(req);
  const pool = getMysqlPool();
  const status = String(req.query.status || req.query.tab || '').toLowerCase();
  const scope = String(req.query.scope || '').toLowerCase();
  const page = Math.max(1, Number(req.query.page || 1));
  const pageSize = Math.min(Math.max(Number(req.query.pageSize || req.query.limit || 100), 1), 500);
  const where = [];
  const params = [];

  if (candidateStatuses.has(status)) {
    where.push('status = ?');
    params.push(status);
  }
  if (scope && scope !== 'all') {
    where.push('dance_scope = ?');
    params.push(scope);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const countParams = [...params];
  if (status === 'new') {
    const [allRows] = await pool.execute(
      `SELECT * FROM ingestion_candidates ${whereSql}
       ORDER BY created_at DESC, id DESC`,
      countParams,
    );
    const collapsedRows = collapseDateExpansionRows(allRows);
    const dataRows = collapsedRows.slice((page - 1) * pageSize, page * pageSize);
    res.json({
      data: dataRows.map(rowToCandidate),
      total: collapsedRows.length,
      page,
      pageSize,
    });
    return;
  }

  const [countRows] = await pool.execute(
    `SELECT COUNT(*) AS total FROM ingestion_candidates ${whereSql}`,
    countParams,
  );
  params.push((page - 1) * pageSize, pageSize);
  const [rows] = await pool.execute(
    `SELECT * FROM ingestion_candidates ${whereSql}
     ORDER BY created_at DESC, id DESC
     LIMIT ?, ?`,
    params,
  );

  res.json({
    data: rows.map(rowToCandidate),
    total: Number(countRows[0]?.total || 0),
    page,
    pageSize,
  });
}

async function postCandidates(req, res) {
  const isAutomation = hasValidIngestionToken(req);
  if (!isAutomation) await requireAdmin(req);
  const actorType = isAutomation ? 'automation' : 'admin';
  const pool = getMysqlPool();
  const values = Array.isArray(req.body) ? req.body : [req.body || {}];
  const liveEvents = await loadLiveEventsForDuplicateDetection(pool);
  const saved = [];
  const skipped = [];

  const candidates = sortDateExpansionInputs(values.map((value) => normalizeCandidateInput(value)));
  for (const candidate of candidates) {
    if (!candidate.source_url || !candidate.event_date || !candidate.title) {
      skipped.push({
        id: candidate.id,
        reason: candidate.needs_review_reason || 'missing required candidate fields',
      });
      continue;
    }
    const dateExpansionRows = await loadDateExpansionCandidateRows(pool, candidate);
    const dateExpansion = shouldSkipDateExpansionCandidate(candidate, dateExpansionRows);
    if (dateExpansion.skip) {
      skipped.push({
        id: candidate.id,
        reason: dateExpansionSkipReason(dateExpansion.primary),
      });
      continue;
    }
    const duplicate = findLiveDuplicate(candidate, liveEvents);
    const result = await upsertCandidate(pool, candidate, { actorType, duplicate });
    if (result.skipped) skipped.push({ id: candidate.id, reason: result.reason });
    else saved.push(result.candidate);
  }

  res.json({
    data: saved,
    count: saved.filter((row) => row.status !== 'duplicate').length,
    duplicateCount: saved.filter((row) => row.status === 'duplicate').length,
    skipped,
    total: saved.length,
  });
}

export async function cafe24IngestorV3Candidates(req, res) {
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method === 'GET') {
    await listCandidates(req, res);
    return;
  }
  if (req.method === 'POST') {
    await postCandidates(req, res);
    return;
  }
  res.status(405).json({ error: 'Method not allowed' });
}

export async function cafe24IngestorV3ReviewCandidate(req, res) {
  await requireAdmin(req);
  const candidateId = String(req.params?.id || req.body?.id || '').trim();
  const nextStatus = String(req.body?.status || '').toLowerCase();
  const reason = String(req.body?.reason || '').trim() || null;
  if (!candidateId) {
    res.status(400).json({ error: 'candidate id required' });
    return;
  }
  if (!candidateStatuses.has(nextStatus) || nextStatus === 'registered') {
    res.status(400).json({ error: 'invalid or blocked review status' });
    return;
  }

  const pool = getMysqlPool();
  const existing = await loadExistingCandidate(pool, candidateId);
  if (!existing) {
    res.status(404).json({ error: 'candidate not found' });
    return;
  }
  if (String(existing.status) === 'registered') {
    res.status(409).json({ error: 'registered candidates cannot be changed by review endpoint' });
    return;
  }

  const now = new Date().toISOString();
  await pool.execute(
    `UPDATE ingestion_candidates
     SET status = ?,
         terminal_at = CASE WHEN ? IN ('excluded', 'archived') THEN ? ELSE NULL END,
         terminal_reason = ?,
         reviewed_at = ?,
         updated_at = ?
     WHERE id = ?`,
    [nextStatus, nextStatus, mysqlDateTime(now), reason, mysqlDateTime(now), mysqlDateTime(now), candidateId],
  );
  await writeStateLog(pool, {
    candidateId,
    fromStatus: existing.status,
    toStatus: nextStatus,
    actorType: 'admin',
    reason,
  });
  const saved = await loadExistingCandidate(pool, candidateId);
  res.json({ data: rowToCandidate(saved) });
}

export async function cafe24IngestorV3RegisterBlocked(_req, res) {
  res.status(409).json({
    error: 'Live event writes are blocked in Ingestor V3 automation layer.',
    message: 'Registration to events must be implemented as a separate explicit admin action.',
  });
}
