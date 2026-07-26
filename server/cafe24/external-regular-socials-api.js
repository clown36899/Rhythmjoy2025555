import { getMysqlPool } from './mysql-pool.js';
import {
  apiError,
  authenticatePartner,
  cleanExternalIdParam,
  enforceRateLimit,
  recordRequest,
} from './external-events-api.js';
import { runRegularSocialReconciliation } from './regular-social-reconciler.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const HTTPS_RE = /^https:\/\//i;
const ALLOWED_RULE_FIELDS = new Set([
  'external_id', 'title', 'weekday', 'time', 'location', 'venue_name',
  'source_url', 'source_id', 'valid_from', 'valid_until', 'active',
]);
const ALLOWED_EXCEPTION_FIELDS = new Set([
  'external_id', 'date', 'type', 'title', 'time', 'location', 'venue_name',
  'dj_name', 'source_url', 'description',
]);

function cleanText(value, field, { required = false, max = 255 } = {}) {
  const result = String(value ?? '').trim();
  if (required && !result) throw apiError(`${field} 값이 필요합니다.`);
  if (result.length > max) throw apiError(`${field} 값은 ${max}자 이하여야 합니다.`);
  return result;
}

function assertKnownFields(input, allowed) {
  for (const field of Object.keys(input || {})) {
    if (!allowed.has(field)) throw apiError(`지원하지 않는 필드입니다: ${field}`);
  }
}

function cleanDate(value, field, required = false) {
  const result = cleanText(value, field, { required, max: 10 });
  if (!result) return null;
  if (!DATE_RE.test(result) || Number.isNaN(Date.parse(`${result}T12:00:00+09:00`))) {
    throw apiError(`${field}는 YYYY-MM-DD 형식이어야 합니다.`);
  }
  return result;
}

function cleanUrl(value, field, required = false) {
  const result = cleanText(value, field, { required, max: 2048 });
  if (!result) return null;
  if (!HTTPS_RE.test(result)) throw apiError(`${field}는 공개 HTTPS URL이어야 합니다.`);
  try {
    new URL(result);
  } catch {
    throw apiError(`${field} URL이 올바르지 않습니다.`);
  }
  return result;
}

function assertSocialPartner(partner) {
  const category = String(partner.allowed_category || partner.default_category || '');
  if (category && category !== 'social') {
    throw apiError('정규 소셜 API는 social 권한이 있는 API Key만 사용할 수 있습니다.', 403, 'forbidden_category');
  }
}

export function normalizeRegularSocialRulePayload(input = {}, externalIdOverride = null) {
  assertKnownFields(input, ALLOWED_RULE_FIELDS);
  const externalId = cleanExternalIdParam(externalIdOverride ?? input.external_id);
  const weekday = Number(input.weekday);
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
    throw apiError('weekday는 0(일요일)부터 6(토요일) 사이의 정수여야 합니다.');
  }
  const validFrom = cleanDate(input.valid_from, 'valid_from');
  const validUntil = cleanDate(input.valid_until, 'valid_until');
  if (validFrom && validUntil && validFrom > validUntil) {
    throw apiError('valid_until은 valid_from보다 빠를 수 없습니다.');
  }
  if (input.active !== undefined && typeof input.active !== 'boolean') {
    throw apiError('active는 true 또는 false여야 합니다.');
  }
  return {
    externalId,
    title: cleanText(input.title, 'title', { required: true }),
    weekday,
    time: cleanText(input.time, 'time'),
    location: cleanText(input.location, 'location', { required: true }),
    venueName: cleanText(input.venue_name || input.location, 'venue_name', { required: true }),
    sourceUrl: cleanUrl(input.source_url, 'source_url', true),
    sourceId: cleanText(input.source_id || externalId, 'source_id', { required: true, max: 160 }),
    validFrom,
    validUntil,
    active: input.active === undefined ? true : Boolean(input.active),
  };
}

export function normalizeRegularSocialExceptionPayload(input = {}, externalIdOverride = null) {
  assertKnownFields(input, ALLOWED_EXCEPTION_FIELDS);
  const externalId = cleanExternalIdParam(externalIdOverride ?? input.external_id);
  const type = cleanText(input.type, 'type', { required: true, max: 16 });
  if (!['closure', 'override'].includes(type)) {
    throw apiError('type은 closure 또는 override여야 합니다.');
  }
  const djName = cleanText(input.dj_name, 'dj_name');
  const title = cleanText(input.title, 'title');
  const time = cleanText(input.time, 'time');
  const location = cleanText(input.location, 'location');
  const venueName = cleanText(input.venue_name || location, 'venue_name');
  if (type === 'override' && !djName && !title && !time && !location && !input.description) {
    throw apiError('override에는 dj_name, title, time, location, description 중 하나가 필요합니다.');
  }
  return {
    externalId,
    date: cleanDate(input.date, 'date', true),
    type,
    title: title || null,
    time: time || null,
    location: location || null,
    venueName: venueName || null,
    djName: djName || null,
    sourceUrl: cleanUrl(input.source_url, 'source_url'),
    description: cleanText(input.description, 'description', { max: 20000 }) || null,
  };
}

async function beginPartnerRequest(req, externalId) {
  const pool = getMysqlPool();
  const partner = await authenticatePartner(req, pool);
  assertSocialPartner(partner);
  await recordRequest(pool, {
    partnerId: partner.id, externalId, statusCode: 202, result: 'attempt', requestIp: req.ip, strict: true,
  });
  await enforceRateLimit(pool, partner);
  return { pool, partner };
}

async function finishRequest(pool, req, partner, externalId, result, statusCode) {
  await recordRequest(pool, {
    partnerId: partner.id, externalId, statusCode, result, requestIp: req.ip,
  });
}

function scheduleReconciliation() {
  setImmediate(() => runRegularSocialReconciliation().catch((error) => {
    console.error('[external-regular-socials] reconciliation failed', error);
  }));
}

export async function createRegularSocialRule(req, res) {
  const { pool, partner } = await beginPartnerRequest(req, null);
  const normalized = normalizeRegularSocialRulePayload(req.body);
  if (partner.environment === 'test') {
    await finishRequest(pool, req, partner, normalized.externalId, 'test_validated', 200);
    res.json({ ok: true, test_mode: true, persisted: false, normalized });
    return;
  }
  const [result] = await pool.execute(
    `INSERT INTO external_regular_social_rules
       (partner_id, external_id, title, weekday, time_text, location, venue_name,
        source_url, source_id, valid_from, valid_until, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
     ON DUPLICATE KEY UPDATE title = VALUES(title), weekday = VALUES(weekday),
       time_text = VALUES(time_text), location = VALUES(location), venue_name = VALUES(venue_name),
       source_url = VALUES(source_url), source_id = VALUES(source_id),
       valid_from = VALUES(valid_from), valid_until = VALUES(valid_until),
       is_active = VALUES(is_active), updated_at = NOW()`,
    [
      partner.id, normalized.externalId, normalized.title, normalized.weekday, normalized.time,
      normalized.location, normalized.venueName, normalized.sourceUrl, normalized.sourceId,
      normalized.validFrom, normalized.validUntil, normalized.active ? 1 : 0,
    ],
  );
  const created = Number(result.affectedRows) === 1;
  await finishRequest(pool, req, partner, normalized.externalId, created ? 'rule_created' : 'rule_updated', created ? 201 : 200);
  scheduleReconciliation();
  res.status(created ? 201 : 200).json({ ok: true, created, external_id: normalized.externalId });
}

export async function updateRegularSocialRule(req, res) {
  const { pool, partner } = await beginPartnerRequest(req, null);
  const externalId = cleanExternalIdParam(req.params.externalId);
  const normalized = normalizeRegularSocialRulePayload({ ...req.body, external_id: externalId }, externalId);
  if (partner.environment === 'test') {
    await finishRequest(pool, req, partner, externalId, 'test_validated', 200);
    res.json({ ok: true, test_mode: true, persisted: false, normalized });
    return;
  }
  const [result] = await pool.execute(
    `UPDATE external_regular_social_rules
        SET title = ?, weekday = ?, time_text = ?, location = ?, venue_name = ?,
            source_url = ?, source_id = ?, valid_from = ?, valid_until = ?,
            is_active = ?, updated_at = NOW()
      WHERE partner_id = ? AND external_id = ?`,
    [
      normalized.title, normalized.weekday, normalized.time, normalized.location,
      normalized.venueName, normalized.sourceUrl, normalized.sourceId, normalized.validFrom,
      normalized.validUntil, normalized.active ? 1 : 0, partner.id, externalId,
    ],
  );
  if (!result.affectedRows) throw apiError('정규 소셜 규칙을 찾을 수 없습니다.', 404, 'not_found');
  await finishRequest(pool, req, partner, externalId, 'rule_updated', 200);
  scheduleReconciliation();
  res.json({ ok: true, external_id: externalId });
}

export async function deleteRegularSocialRule(req, res) {
  const { pool, partner } = await beginPartnerRequest(req, null);
  const externalId = cleanExternalIdParam(req.params.externalId);
  if (partner.environment === 'test') {
    await finishRequest(pool, req, partner, externalId, 'test_validated', 200);
    res.json({ ok: true, test_mode: true, persisted: false });
    return;
  }
  const [result] = await pool.execute(
    'DELETE FROM external_regular_social_rules WHERE partner_id = ? AND external_id = ?',
    [partner.id, externalId],
  );
  if (!result.affectedRows) throw apiError('정규 소셜 규칙을 찾을 수 없습니다.', 404, 'not_found');
  await finishRequest(pool, req, partner, externalId, 'rule_deleted', 200);
  scheduleReconciliation();
  res.json({ ok: true, deleted: true, external_id: externalId });
}

export async function upsertRegularSocialException(req, res) {
  const { pool, partner } = await beginPartnerRequest(req, null);
  const ruleExternalId = cleanExternalIdParam(req.params.externalId);
  const exceptionExternalId = cleanExternalIdParam(req.params.exceptionId || req.body?.external_id);
  const normalized = normalizeRegularSocialExceptionPayload(
    { ...req.body, external_id: exceptionExternalId },
    exceptionExternalId,
  );
  if (partner.environment === 'test') {
    await finishRequest(pool, req, partner, exceptionExternalId, 'test_validated', 200);
    res.json({ ok: true, test_mode: true, persisted: false, normalized });
    return;
  }
  const [rules] = await pool.execute(
    'SELECT 1 FROM external_regular_social_rules WHERE partner_id = ? AND external_id = ? LIMIT 1',
    [partner.id, ruleExternalId],
  );
  if (!rules[0]) throw apiError('정규 소셜 규칙을 찾을 수 없습니다.', 404, 'not_found');
  const [result] = await pool.execute(
    `INSERT INTO external_regular_social_exceptions
       (partner_id, rule_external_id, external_id, exception_date, exception_type,
        title, time_text, location, venue_name, dj_name, source_url, description, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
     ON DUPLICATE KEY UPDATE exception_date = VALUES(exception_date),
       exception_type = VALUES(exception_type), title = VALUES(title),
       time_text = VALUES(time_text), location = VALUES(location),
       venue_name = VALUES(venue_name), dj_name = VALUES(dj_name),
       source_url = VALUES(source_url), description = VALUES(description), updated_at = NOW()`,
    [
      partner.id, ruleExternalId, exceptionExternalId, normalized.date, normalized.type,
      normalized.title, normalized.time, normalized.location, normalized.venueName,
      normalized.djName, normalized.sourceUrl, normalized.description,
    ],
  );
  const created = Number(result.affectedRows) === 1;
  await finishRequest(
    pool, req, partner, exceptionExternalId,
    created ? 'exception_created' : 'exception_updated', created ? 201 : 200,
  );
  scheduleReconciliation();
  res.status(created ? 201 : 200).json({
    ok: true, created, rule_external_id: ruleExternalId, external_id: exceptionExternalId,
  });
}

export async function deleteRegularSocialException(req, res) {
  const { pool, partner } = await beginPartnerRequest(req, null);
  const ruleExternalId = cleanExternalIdParam(req.params.externalId);
  const exceptionExternalId = cleanExternalIdParam(req.params.exceptionId);
  const logId = exceptionExternalId;
  if (partner.environment === 'test') {
    await finishRequest(pool, req, partner, logId, 'test_validated', 200);
    res.json({ ok: true, test_mode: true, persisted: false });
    return;
  }
  const [result] = await pool.execute(
    `DELETE FROM external_regular_social_exceptions
      WHERE partner_id = ? AND rule_external_id = ? AND external_id = ?`,
    [partner.id, ruleExternalId, exceptionExternalId],
  );
  if (!result.affectedRows) throw apiError('정규 소셜 예외를 찾을 수 없습니다.', 404, 'not_found');
  await finishRequest(pool, req, partner, logId, 'exception_deleted', 200);
  scheduleReconciliation();
  res.json({ ok: true, deleted: true, external_id: exceptionExternalId });
}
