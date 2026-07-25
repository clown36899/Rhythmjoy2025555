import crypto from 'node:crypto';
import { isIP } from 'node:net';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { getMysqlPool } from './mysql-pool.js';
import {
  enqueueNewEventNotification,
  normalizeEventPayload,
  saveEvent,
} from './events-api.js';
import { sanitizeEventForViewer } from './event-security.js';

export const SITE_GENRES_BY_CATEGORY = Object.freeze({
  social: Object.freeze(['소셜', '졸공']),
  event: Object.freeze(['워크샵', '파티', '대회', '라이브밴드', '기타']),
  class: Object.freeze(['린디합', '솔로재즈', '발보아', '블루스', '팀원모집', '기타']),
  club: Object.freeze(['정규강습', '린디합', '솔로재즈', '발보아', '블루스', '팀원모집', '기타']),
});

const GENRE_TO_DANCE_GENRE = Object.freeze({
  린디합: 'lindyhop',
  솔로재즈: 'solojazz',
  발보아: 'balboa',
  블루스: 'blues',
});

const MAX_EXTERNAL_ID_LENGTH = 160;
const MAX_TITLE_LENGTH = 255;
const MAX_DESCRIPTION_LENGTH = 20_000;
const MAX_TEXT_FIELD_LENGTH = 255;
const MAX_LINK_LENGTH = 2_048;
const API_KEY_PREFIX = 'rj_live_';
const ALLOWED_EXTERNAL_EVENT_FIELDS = new Set([
  'external_id',
  'title',
  'event_dates',
  'time',
  'location',
  'address',
  'location_link',
  'description',
  'category',
  'genre',
  'source_url',
  'link_name1',
  'image_mode',
  'image_url',
  'venue_name',
]);

function apiError(message, statusCode = 400, code = 'invalid_request') {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function cleanString(value, maxLength, field, { required = false } = {}) {
  const text = value === undefined || value === null ? '' : String(value).trim();
  if (required && !text) throw apiError(`${field} 값이 필요합니다.`);
  if (text.length > maxLength) throw apiError(`${field} 값이 너무 깁니다.`);
  return text;
}

function normalizeDate(value, field) {
  const text = cleanString(value, 10, field, { required: true });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw apiError(`${field} 값은 YYYY-MM-DD 형식이어야 합니다.`);
  }
  const date = new Date(`${text}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text) {
    throw apiError(`${field} 값이 올바른 날짜가 아닙니다.`);
  }
  return text;
}

function isPublicHostname(hostname) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (
    normalized === 'localhost'
    || normalized.endsWith('.localhost')
    || normalized.endsWith('.local')
    || normalized === '0.0.0.0'
    || normalized === '::1'
  ) return false;

  if (isIP(normalized) === 6) return false;
  const ipv4 = normalized.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipv4) return true;
  const octets = ipv4.slice(1).map(Number);
  if (octets.some((part) => part < 0 || part > 255)) return false;
  const [a, b] = octets;
  return !(
    a === 0
    || a === 10
    || a === 127
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || a >= 224
  );
}

export function normalizeExternalUrl(value, field, { image = false } = {}) {
  const text = cleanString(value, MAX_LINK_LENGTH, field);
  if (!text) return '';

  let url;
  try {
    url = new URL(text);
  } catch {
    throw apiError(`${field} 값은 올바른 URL이어야 합니다.`);
  }
  if (url.protocol !== 'https:') throw apiError(`${field} 값은 HTTPS 주소만 사용할 수 있습니다.`);
  if (!url.hostname || !isPublicHostname(url.hostname)) {
    throw apiError(`${field} 값에 내부 또는 허용되지 않은 주소를 사용할 수 없습니다.`);
  }
  if (url.username || url.password) throw apiError(`${field} 값에 사용자 정보를 포함할 수 없습니다.`);
  if (image && !/\.(?:avif|jpe?g|png|webp)(?:$|[?#])/i.test(url.href)) {
    throw apiError('image_url은 AVIF, JPEG, PNG, WebP 이미지 주소만 사용할 수 있습니다.');
  }
  return url.href;
}

export function parseExternalApiKey(headerValue) {
  const match = String(headerValue || '').match(/^Bearer\s+(\S+)$/i);
  if (!match || !match[1].startsWith(API_KEY_PREFIX)) {
    throw apiError('올바른 Bearer API Key가 필요합니다.', 401, 'invalid_api_key');
  }
  const key = match[1];
  const separator = key.indexOf('_', API_KEY_PREFIX.length);
  if (separator < 0) throw apiError('올바른 Bearer API Key가 필요합니다.', 401, 'invalid_api_key');
  return {
    key,
    prefix: key.slice(API_KEY_PREFIX.length, separator),
    hash: crypto.createHash('sha256').update(key).digest('hex'),
  };
}

function hashesMatch(left, right) {
  if (!left || !right || left.length !== right.length) return false;
  return crypto.timingSafeEqual(Buffer.from(left), Buffer.from(right));
}

export function normalizeExternalEventPayload(input = {}, partner = {}) {
  if (
    Object.prototype.hasOwnProperty.call(input, 'start_date')
    || Object.prototype.hasOwnProperty.call(input, 'end_date')
  ) {
    throw apiError('start_date와 end_date는 지원하지 않습니다. 모든 일정은 event_dates를 사용하세요.');
  }
  const unknownFields = Object.keys(input).filter((field) => !ALLOWED_EXTERNAL_EVENT_FIELDS.has(field));
  if (unknownFields.length) {
    throw apiError(`허용되지 않은 필드입니다: ${unknownFields.join(', ')}`);
  }
  const externalId = cleanString(input.external_id, MAX_EXTERNAL_ID_LENGTH, 'external_id', { required: true });
  const title = cleanString(input.title, MAX_TITLE_LENGTH, 'title', { required: true });
  const category = cleanString(input.category || partner.default_category, 32, 'category', { required: true });
  const genre = cleanString(input.genre || partner.default_genre, 64, 'genre', { required: true });
  const allowedGenres = SITE_GENRES_BY_CATEGORY[category];

  if (!allowedGenres) {
    throw apiError(`category는 ${Object.keys(SITE_GENRES_BY_CATEGORY).join(', ')} 중 하나여야 합니다.`);
  }
  if (!allowedGenres.includes(genre)) {
    throw apiError(`${category}에서 사용할 수 있는 genre는 ${allowedGenres.join(', ')}입니다.`);
  }

  if (input.event_dates !== undefined && !Array.isArray(input.event_dates)) {
    throw apiError('event_dates 값은 날짜 배열이어야 합니다.');
  }
  if (input.event_dates?.length > 366) {
    throw apiError('event_dates는 최대 366개까지 사용할 수 있습니다.');
  }
  const eventDates = Array.from(new Set(
    (input.event_dates || []).map((date) => normalizeDate(date, 'event_dates')),
  )).sort();
  if (!eventDates.length) {
    throw apiError('event_dates에 날짜를 하나 이상 보내야 합니다.');
  }
  const startDate = eventDates[0];
  const endDate = eventDates.length ? eventDates[eventDates.length - 1] : startDate;

  const imageUrl = normalizeExternalUrl(input.image_url, 'image_url', { image: true });
  const imageMode = cleanString(input.image_mode, 16, 'image_mode');
  const hasAnyImageInput = Boolean(imageMode || imageUrl);
  if (hasAnyImageInput && !imageMode) {
    throw apiError('image_url을 사용하려면 image_mode 값이 필요합니다. upload 또는 url을 선택하세요.');
  }
  if (imageMode && !['upload', 'url'].includes(imageMode)) {
    throw apiError('image_mode은 upload 또는 url만 사용할 수 있습니다.');
  }
  if (imageMode && !imageUrl) {
    throw apiError('image_mode을 사용하려면 image_url 값이 필요합니다.');
  }
  if (!hasAnyImageInput && category !== 'social') {
    throw apiError('행사, 강습, 동호회 일정은 image_mode과 image_url이 필요합니다.');
  }
  if (!hasAnyImageInput && category === 'social' && !cleanString(input.address, MAX_TEXT_FIELD_LENGTH, 'address')) {
    throw apiError('이미지 없는 소셜은 상세 카카오맵 표시에 사용할 address 값이 필요합니다.');
  }
  if (imageMode === 'upload') {
    const uploadedUrl = new URL(imageUrl);
    if (!uploadedUrl.pathname.startsWith('/uploads/external-events/')) {
      throw apiError('image_mode이 upload이면 이미지 업로드 API가 반환한 image_url을 사용해야 합니다.');
    }
  }
  const sourceUrl = normalizeExternalUrl(input.source_url, 'source_url');
  if (!sourceUrl) {
    throw apiError('source_url 값이 필요합니다.');
  }
  const activityType = category === 'social' ? 'social' : category === 'class' || category === 'club' ? 'class' : 'event';

  return {
    externalId,
    event: {
      title,
      date: startDate,
      start_date: startDate,
      end_date: endDate,
      event_dates: eventDates,
      time: cleanString(input.time, 120, 'time'),
      location: cleanString(input.location, MAX_TEXT_FIELD_LENGTH, 'location'),
      address: cleanString(input.address, MAX_TEXT_FIELD_LENGTH, 'address'),
      location_link: normalizeExternalUrl(input.location_link, 'location_link'),
      description: cleanString(input.description, MAX_DESCRIPTION_LENGTH, 'description'),
      category,
      genre,
      scope: 'domestic',
      dance_scope: 'swing',
      dance_genre: GENRE_TO_DANCE_GENRE[genre] || 'swing',
      activity_type: activityType,
      link1: sourceUrl,
      link_name1: sourceUrl ? cleanString(input.link_name1 || '자세히 보기', 120, 'link_name1') : '',
      image: imageUrl,
      image_micro: imageUrl,
      image_thumbnail: imageUrl,
      image_medium: imageUrl,
      image_full: imageUrl,
      organizer: '익명',
      venue_name: cleanString(input.venue_name || input.location, MAX_TEXT_FIELD_LENGTH, 'venue_name'),
      group_id: category === 'social' ? 2 : null,
      show_title_on_billboard: true,
      external_source: {
        partner_id: String(partner.id),
        partner_name: String(partner.name),
        external_id: externalId,
        source_url: sourceUrl || null,
        image_mode: imageUrl ? (imageMode || 'url') : null,
      },
    },
  };
}

async function authenticatePartner(req, pool) {
  const parsed = parseExternalApiKey(req.get('authorization'));
  const [rows] = await pool.execute(
    `SELECT id, name, key_hash, is_active, default_category, default_genre,
            owner_user_id, per_minute_limit, daily_limit
       FROM external_api_partners
      WHERE key_prefix = ?
      LIMIT 1`,
    [parsed.prefix],
  );
  const partner = rows[0];
  if (!partner || !hashesMatch(parsed.hash, partner.key_hash) || !partner.is_active) {
    throw apiError('API Key가 유효하지 않거나 중지되었습니다.', 401, 'invalid_api_key');
  }
  return partner;
}

export async function normalizeExternalImage(buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) {
    throw apiError('이미지 파일 본문이 필요합니다.');
  }

  let metadata;
  try {
    metadata = await sharp(buffer, {
      animated: false,
      failOn: 'warning',
      limitInputPixels: 40_000_000,
    }).metadata();
  } catch {
    throw apiError('손상되었거나 지원하지 않는 이미지 파일입니다.');
  }

  if (!['jpeg', 'png', 'webp', 'avif'].includes(metadata.format)) {
    throw apiError('JPEG, PNG, WebP, AVIF 이미지만 업로드할 수 있습니다.');
  }
  if (Number(metadata.pages || 1) > 1) {
    throw apiError('움직이는 이미지는 업로드할 수 없습니다.');
  }

  try {
    return await sharp(buffer, {
      animated: false,
      failOn: 'warning',
      limitInputPixels: 40_000_000,
    })
      .rotate()
      .resize({
        width: 2400,
        height: 2400,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 88 })
      .toBuffer();
  } catch {
    throw apiError('이미지를 안전한 형식으로 변환하지 못했습니다.');
  }
}

export async function uploadExternalEventImage(req, res) {
  const pool = getMysqlPool();
  const partner = await authenticatePartner(req, pool);
  await enforceRateLimit(pool, partner);
  const contentType = String(req.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(contentType)) {
    throw apiError(
      'Content-Type은 image/jpeg, image/png, image/webp, image/avif 중 하나여야 합니다.',
      415,
      'unsupported_media_type',
    );
  }
  const maxBytes = Number(process.env.EXTERNAL_IMAGE_MAX_BYTES || 8 * 1024 * 1024);
  if (!Buffer.isBuffer(req.body) || !req.body.length || req.body.length > maxBytes) {
    throw apiError(`이미지 파일은 ${Math.floor(maxBytes / 1024 / 1024)}MB 이하여야 합니다.`, 413, 'payload_too_large');
  }

  const webp = await normalizeExternalImage(req.body);
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const partnerFolder = crypto.createHash('sha256').update(String(partner.id)).digest('hex').slice(0, 16);
  const fileName = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}.webp`;
  const uploadRoot = path.resolve(process.cwd(), process.env.CAFE24_UPLOADS_DIR || 'uploads');
  const relativePath = path.posix.join('external-events', partnerFolder, yyyy, mm, fileName);
  const filePath = path.join(uploadRoot, ...relativePath.split('/'));

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, webp, { flag: 'wx' });

  const configuredOrigin = String(process.env.EXTERNAL_API_PUBLIC_ORIGIN || '').replace(/\/+$/, '');
  const requestOrigin = `${req.protocol}://${req.get('host')}`;
  const origin = configuredOrigin || requestOrigin;
  const publicPath = `/uploads/${relativePath}`;
  await recordRequest(pool, {
    partnerId: partner.id,
    statusCode: 201,
    result: 'image_uploaded',
    requestIp: req.ip,
  });
  res.status(201).json({
    ok: true,
    image_url: `${origin}${publicPath}`,
    content_type: 'image/webp',
    bytes: webp.length,
  });
}

async function enforceRateLimit(pool, partner) {
  const [rows] = await pool.execute(
    `SELECT
       SUM(created_at >= DATE_SUB(NOW(), INTERVAL 1 MINUTE)) AS minute_count,
       SUM(created_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)) AS day_count
       FROM external_api_request_logs
      WHERE partner_id = ?
        AND created_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)`,
    [partner.id],
  );
  const minuteCount = Number(rows[0]?.minute_count || 0);
  const dayCount = Number(rows[0]?.day_count || 0);
  if (minuteCount >= Number(partner.per_minute_limit || 10)) {
    throw apiError('분당 등록 한도를 초과했습니다.', 429, 'rate_limit_exceeded');
  }
  if (dayCount >= Number(partner.daily_limit || 200)) {
    throw apiError('일일 등록 한도를 초과했습니다.', 429, 'rate_limit_exceeded');
  }
}

async function recordRequest(pool, values) {
  try {
    await pool.execute(
      `INSERT INTO external_api_request_logs
         (partner_id, external_id, event_id, status_code, result, error_code, request_ip, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        values.partnerId,
        values.externalId || null,
        values.eventId || null,
        values.statusCode,
        values.result,
        values.errorCode || null,
        values.requestIp || null,
      ],
    );
  } catch (error) {
    console.warn('[external-events] failed to write request log', error?.message || error);
  }
}

export async function createExternalEvent(req, res) {
  const pool = getMysqlPool();
  let partner;
  let normalized;

  try {
    partner = await authenticatePartner(req, pool);
    await enforceRateLimit(pool, partner);
    normalized = normalizeExternalEventPayload(req.body, partner);

    const [existingRows] = await pool.execute(
      `SELECT event_id
         FROM external_partner_events
        WHERE partner_id = ? AND external_id = ?
        LIMIT 1`,
      [partner.id, normalized.externalId],
    );
    if (existingRows[0]) {
      await recordRequest(pool, {
        partnerId: partner.id,
        externalId: normalized.externalId,
        eventId: existingRows[0].event_id,
        statusCode: 200,
        result: 'duplicate',
        requestIp: req.ip,
      });
      res.status(200).json({
        ok: true,
        duplicate: true,
        event_id: String(existingRows[0].event_id),
      });
      return;
    }

    const partnerUser = {
      id: partner.owner_user_id || `external:${partner.id}`,
      nickname: partner.name,
      is_admin: false,
    };
    const event = normalizeEventPayload(normalized.event, null, partnerUser);
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await saveEvent(event, connection);
      await connection.execute(
        `INSERT INTO external_partner_events
           (partner_id, external_id, event_id, source_url, created_at)
         VALUES (?, ?, ?, ?, NOW())`,
        [partner.id, normalized.externalId, event.id, normalized.event.link1 || null],
      );
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      if (error?.code === 'ER_DUP_ENTRY') {
        const [duplicateRows] = await pool.execute(
          `SELECT event_id FROM external_partner_events
            WHERE partner_id = ? AND external_id = ? LIMIT 1`,
          [partner.id, normalized.externalId],
        );
        if (duplicateRows[0]) {
          res.status(200).json({ ok: true, duplicate: true, event_id: String(duplicateRows[0].event_id) });
          return;
        }
      }
      throw error;
    } finally {
      connection.release();
    }

    await enqueueNewEventNotification(event);
    await recordRequest(pool, {
      partnerId: partner.id,
      externalId: normalized.externalId,
      eventId: event.id,
      statusCode: 201,
      result: 'created',
      requestIp: req.ip,
    });
    res.status(201).json({
      ok: true,
      duplicate: false,
      event_id: String(event.id),
      event: sanitizeEventForViewer(event, null),
    });
  } catch (error) {
    const statusCode = Number(error?.statusCode || 500);
    if (partner) {
      await recordRequest(pool, {
        partnerId: partner.id,
        externalId: normalized?.externalId || req.body?.external_id,
        statusCode,
        result: 'rejected',
        errorCode: error?.code || 'server_error',
        requestIp: req.ip,
      });
    }
    throw error;
  }
}
