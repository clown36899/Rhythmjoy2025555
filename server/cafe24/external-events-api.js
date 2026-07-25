import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import { isIP } from 'node:net';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { Agent, fetch as undiciFetch } from 'undici';
import { getMysqlPool } from './mysql-pool.js';
import {
  enqueueNewEventNotification,
  normalizeEventPayload,
  saveEvent,
} from './events-api.js';
import { sanitizeEventForViewer } from './event-security.js';
import { getCurrentUser, requireAdmin } from './auth-api.js';

// sharp/libvips security advisory GHSA-f88m-g3jw-g9cj workaround.
// These decoders are not accepted by the API and are blocked before any image is processed.
sharp.block({
  operation: ['VipsForeignLoadNsgif', 'VipsForeignLoadTiff', 'VipsForeignLoadVips'],
});

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
const KAKAO_ADDRESS_API_URL = 'https://dapi.kakao.com/v2/local/search/address.json';
const API_KEY_PREFIX = 'rj_live_';
const EVENTS_TABLE = /^[a-z0-9_]+$/i.test(process.env.MYSQL_EVENTS_TABLE || '')
  ? process.env.MYSQL_EVENTS_TABLE
  : 'events';
const IMAGE_VARIANTS = Object.freeze({
  micro: Object.freeze({ width: 100, quality: 70 }),
  thumbnail: Object.freeze({ width: 300, quality: 75 }),
  medium: Object.freeze({ width: 650, quality: 90 }),
  full: Object.freeze({ width: 1300, quality: 85 }),
});
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
const addressToolRequests = new Map();

function apiError(message, statusCode = 400, code = 'invalid_request') {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

export function createPartnerApiKey() {
  const prefix = crypto.randomBytes(6).toString('hex');
  const apiKey = `${API_KEY_PREFIX}${prefix}_${crypto.randomBytes(32).toString('base64url')}`;
  return {
    prefix,
    apiKey,
    keyHash: crypto.createHash('sha256').update(apiKey).digest('hex'),
  };
}

export function normalizePartnerClassification(categoryValue, genreValue) {
  const category = cleanString(categoryValue, 32, 'default_category');
  const genre = cleanString(genreValue, 64, 'default_genre');
  if (Boolean(category) !== Boolean(genre)) {
    throw apiError('기본 분류를 지정하려면 최상위 분류와 하위 분류를 함께 선택해 주세요.');
  }
  if (category && (!SITE_GENRES_BY_CATEGORY[category] || !SITE_GENRES_BY_CATEGORY[category].includes(genre))) {
    throw apiError('사이트에서 사용하는 올바른 최상위·하위 분류 조합을 선택해 주세요.');
  }
  return { category: category || null, genre: genre || null };
}

export function normalizeAllowedClassifications(value) {
  if (value === undefined || value === null || (Array.isArray(value) && value.length === 0)) return null;
  if (!Array.isArray(value)) {
    throw apiError('허용 장르는 배열이어야 합니다.');
  }
  const unique = [];
  for (const item of value) {
    const category = cleanString(item?.category, 32, 'allowed_classifications.category', { required: true });
    const genre = cleanString(item?.genre, 64, 'allowed_classifications.genre', { required: true });
    if (!SITE_GENRES_BY_CATEGORY[category]?.includes(genre)) {
      throw apiError('사이트에서 사용하는 올바른 허용 장르만 선택해 주세요.');
    }
    const key = `${category}:${genre}`;
    if (!unique.some((entry) => `${entry.category}:${entry.genre}` === key)) unique.push({ category, genre });
  }
  return unique.length ? unique : null;
}

function normalizeAllowedCategory(value, { required = true } = {}) {
  const category = cleanString(value, 32, 'allowed_category', { required });
  if (category && !SITE_GENRES_BY_CATEGORY[category]) {
    throw apiError(`allowed_category는 ${Object.keys(SITE_GENRES_BY_CATEGORY).join(', ')} 중 하나여야 합니다.`);
  }
  return category || null;
}

function parseAllowedClassifications(value) {
  if (!value) return null;
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(parsed) && parsed.length ? parsed : null;
  } catch {
    return null;
  }
}

function normalizePartnerEnvironment(value, fallback = 'test') {
  const environment = cleanString(value === undefined ? fallback : value, 16, 'environment', { required: true });
  if (!['test', 'live'].includes(environment)) {
    throw apiError('environment는 test 또는 live여야 합니다.');
  }
  return environment;
}

function requireSameOrigin(req) {
  const origin = cleanString(req.get?.('origin'), 512, 'origin');
  const host = cleanString(req.get?.('host'), 255, 'host', { required: true });
  if (!origin) throw apiError('관리자 변경 요청의 Origin 헤더가 필요합니다.', 403, 'invalid_origin');
  let originUrl;
  try {
    originUrl = new URL(origin);
  } catch {
    throw apiError('관리자 변경 요청의 Origin이 올바르지 않습니다.', 403, 'invalid_origin');
  }
  if (originUrl.host !== host || !['http:', 'https:'].includes(originUrl.protocol)) {
    throw apiError('다른 사이트에서 보낸 관리자 변경 요청은 허용되지 않습니다.', 403, 'invalid_origin');
  }
}

function normalizePositiveInteger(value, field, fallback) {
  const number = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(number) || number < 1 || number > 100_000) {
    throw apiError(`${field} 값은 1 이상 100000 이하의 정수여야 합니다.`);
  }
  return number;
}

async function requireExistingOwnerUser(pool, ownerUserId) {
  const id = cleanString(ownerUserId, 64, 'owner_user_id', { required: true });
  const [rows] = await pool.execute(
    'SELECT id, email, nickname, is_admin FROM users WHERE id = ? LIMIT 1',
    [id],
  );
  if (!rows[0]) throw apiError('연결할 회원 계정을 찾을 수 없습니다.', 404, 'user_not_found');
  return rows[0];
}

async function writeAdminAudit(connection, admin, partnerId, action, details, requestIp) {
  await connection.execute(
    `INSERT INTO external_api_admin_audit_logs
       (admin_user_id, partner_id, action, details_json, request_ip, created_at)
     VALUES (?, ?, ?, ?, ?, NOW())`,
    [String(admin.id), partnerId, action, JSON.stringify(details || {}), requestIp || null],
  );
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

export function isKakaoMapAddress(value) {
  const text = String(value || '').trim();
  return /^(?:서울(?:특별시)?|부산(?:광역시)?|대구(?:광역시)?|인천(?:광역시)?|광주(?:광역시)?|대전(?:광역시)?|울산(?:광역시)?|세종(?:특별자치시)?|제주(?:특별자치도)?|경기(?:도)?|강원(?:특별자치도)?|충북|충청북도|충남|충청남도|전북|전북특별자치도|전남|전라남도|경북|경상북도|경남|경상남도)\s+.+\s+\d+(?:-\d+)?(?:\s|$)/.test(text);
}

function isPublicIpv4(address) {
  const ipv4 = String(address).match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipv4) return false;
  const octets = ipv4.slice(1).map(Number);
  if (octets.some((part) => part < 0 || part > 255)) return false;
  const [a, b, c] = octets;
  return !(
    a === 0
    || a === 10
    || a === 127
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 0 && c === 0)
    || (a === 192 && b === 0 && c === 2)
    || (a === 192 && b === 168)
    || (a === 198 && (b === 18 || b === 19))
    || (a === 198 && b === 51 && c === 100)
    || (a === 203 && b === 0 && c === 113)
    || a >= 224
  );
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
  if (isIP(normalized) === 4) return isPublicIpv4(normalized);
  return true;
}

export function isPublicAddress(address) {
  const normalized = String(address || '').replace(/^\[|\]$/g, '');
  if (isIP(normalized) === 6) {
    const lower = normalized.toLowerCase();
    const mappedIpv4 = lower.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
    if (mappedIpv4) return isPublicIpv4(mappedIpv4[1]);
    return !(
      lower === '::1'
      || lower === '::'
      || lower.startsWith('fc')
      || lower.startsWith('fd')
      || lower.startsWith('fe8')
      || lower.startsWith('fe9')
      || lower.startsWith('fea')
      || lower.startsWith('feb')
      || lower.startsWith('ff')
    );
  }
  return isPublicHostname(normalized);
}

async function assertPublicDns(hostname) {
  if (isIP(hostname)) {
    if (!isPublicAddress(hostname)) throw apiError('내부 네트워크 이미지 주소는 사용할 수 없습니다.');
    return [{ address: hostname, family: isIP(hostname) }];
  }
  let addresses;
  try {
    addresses = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw apiError('이미지 호스트의 DNS 주소를 확인할 수 없습니다.');
  }
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) {
    throw apiError('내부 네트워크로 연결되는 이미지 주소는 사용할 수 없습니다.');
  }
  return addresses;
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
  const genreInput = cleanString(input.genre || partner.default_genre, 64, 'genre', { required: true });
  const allowedGenres = SITE_GENRES_BY_CATEGORY[category];

  if (!allowedGenres) {
    throw apiError(`category는 ${Object.keys(SITE_GENRES_BY_CATEGORY).join(', ')} 중 하나여야 합니다.`);
  }
  const requestedGenres = Array.from(new Set(
    genreInput.split(',').map((value) => value.trim()).filter(Boolean),
  ));
  if (!requestedGenres.length || requestedGenres.some((value) => !allowedGenres.includes(value))) {
    throw apiError(`${category}에서 사용할 수 있는 genre는 ${allowedGenres.join(', ')}입니다.`);
  }
  if (category !== 'event' && requestedGenres.length > 1) {
    throw apiError('소셜, 강습, 동호회 일정은 genre를 1개만 선택할 수 있습니다.');
  }
  if (category === 'event' && requestedGenres.includes('기타') && requestedGenres.length > 1) {
    throw apiError('행사 장르 기타는 다른 장르와 동시에 선택할 수 없습니다.');
  }
  if (category === 'event' && requestedGenres.includes('파티') && requestedGenres.includes('대회')) {
    throw apiError('행사 장르 파티와 대회는 동시에 선택할 수 없습니다.');
  }
  const genre = requestedGenres.join(',');
  const allowedClassifications = parseAllowedClassifications(partner.allowed_classifications);
  if (partner.allowed_category && category !== partner.allowed_category) {
    throw apiError('이 API Key에 허용되지 않은 최상위 분류입니다.', 403, 'classification_not_allowed');
  }
  if (
    allowedClassifications
    && requestedGenres.some((requestedGenre) => !allowedClassifications.some(
      (item) => item.category === category && item.genre === requestedGenre,
    ))
  ) {
    throw apiError('이 API Key에 허용되지 않은 분류와 장르입니다.', 403, 'classification_not_allowed');
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
  const address = cleanString(input.address, MAX_TEXT_FIELD_LENGTH, 'address');
  if (!hasAnyImageInput && category === 'social' && !address) {
    throw apiError('이미지 없는 소셜은 상세 카카오맵 표시에 사용할 address 값이 필요합니다.');
  }
  if (!hasAnyImageInput && category === 'social' && !isKakaoMapAddress(address)) {
    throw apiError('address는 시·도부터 번지까지 포함한 대한민국 도로명주소 또는 지번주소여야 합니다.');
  }
  if (imageMode === 'upload') {
    const uploadedUrl = new URL(imageUrl);
    const uploadOrigin = String(process.env.EXTERNAL_API_PUBLIC_ORIGIN || 'https://swingenjoy.com').replace(/\/+$/, '');
    const partnerFolder = crypto.createHash('sha256').update(String(partner.id)).digest('hex').slice(0, 16);
    if (
      uploadedUrl.origin !== uploadOrigin
      || !uploadedUrl.pathname.startsWith(`/uploads/external-events/${partnerFolder}/`)
    ) {
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
      address,
      location_link: normalizeExternalUrl(input.location_link, 'location_link'),
      description: cleanString(input.description, MAX_DESCRIPTION_LENGTH, 'description'),
      category,
      genre,
      scope: 'domestic',
      dance_scope: 'swing',
      dance_genre: GENRE_TO_DANCE_GENRE[requestedGenres[0]] || 'swing',
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
            allowed_category, allowed_classifications, environment,
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

export function normalizeKakaoAddressDocuments(documents) {
  return (Array.isArray(documents) ? documents : []).slice(0, 5).map((document) => {
    const road = document?.road_address || {};
    const jibun = document?.address || {};
    return {
      address: String(road.address_name || jibun.address_name || '').trim(),
      road_address: String(road.address_name || '').trim() || null,
      jibun_address: String(jibun.address_name || '').trim() || null,
      building_name: String(road.building_name || '').trim() || null,
      postal_code: String(road.zone_no || '').trim() || null,
      latitude: String(document?.y || '').trim() || null,
      longitude: String(document?.x || '').trim() || null,
    };
  }).filter((candidate) => candidate.address);
}

export function selectExactKakaoAddress(candidates, query) {
  return (Array.isArray(candidates) ? candidates : []).find((candidate) => (
    [candidate.address, candidate.road_address, candidate.jibun_address]
      .filter(Boolean)
      .includes(query)
  )) || null;
}

async function searchKakaoAddress(query) {
  const restApiKey = String(process.env.VITE_KAKAO_REST_API_KEY || '').trim();
  if (!restApiKey) {
    throw apiError('주소 확인 서비스를 사용할 수 없습니다.', 503, 'address_service_unavailable');
  }
  const url = new URL(KAKAO_ADDRESS_API_URL);
  url.searchParams.set('query', query);
  url.searchParams.set('size', '5');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  let response;
  try {
    response = await undiciFetch(url, {
      signal: controller.signal,
      headers: { Authorization: `KakaoAK ${restApiKey}` },
    });
  } catch {
    throw apiError('주소 확인 서비스에 연결할 수 없습니다.', 503, 'address_service_unavailable');
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    throw apiError('주소 확인 서비스가 요청을 처리하지 못했습니다.', 503, 'address_service_unavailable');
  }
  const payload = await response.json();
  return normalizeKakaoAddressDocuments(payload?.documents);
}

async function requireVerifiedKakaoAddress(value) {
  const query = cleanString(value, MAX_TEXT_FIELD_LENGTH, 'address', { required: true });
  const candidates = await searchKakaoAddress(query);
  const exact = selectExactKakaoAddress(candidates, query);
  if (!exact) {
    throw apiError(
      '선택한 카카오맵 표준 주소와 정확히 일치하지 않습니다. 주소 확인 API의 candidates에서 사용자가 선택한 address를 보내주세요.',
      422,
      'address_not_found',
    );
  }
  return { ...exact, address: query };
}

function enforceAddressToolRateLimit(userId, requestIp) {
  const now = Date.now();
  const key = `${userId}:${requestIp || 'unknown'}`;
  const recent = (addressToolRequests.get(key) || []).filter((timestamp) => now - timestamp < 60_000);
  if (recent.length >= 20) {
    throw apiError('주소 변환은 분당 20회까지 사용할 수 있습니다.', 429, 'rate_limit_exceeded');
  }
  recent.push(now);
  addressToolRequests.set(key, recent);
  if (addressToolRequests.size > 2_000) {
    for (const [entryKey, timestamps] of addressToolRequests) {
      if (!timestamps.some((timestamp) => now - timestamp < 60_000)) addressToolRequests.delete(entryKey);
    }
  }
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

export async function createImageVariants(buffer) {
  // Decode and inspect before conversion. Generating variants sequentially keeps
  // peak memory predictable when several large partner uploads arrive together.
  await normalizeExternalImage(buffer);
  const entries = [];
  for (const [name, options] of Object.entries(IMAGE_VARIANTS)) {
    const data = await sharp(buffer, {
      animated: false,
      failOn: 'warning',
      limitInputPixels: 40_000_000,
    })
      .rotate()
      .resize({ width: options.width, withoutEnlargement: true })
      .webp({ quality: options.quality })
      .toBuffer();
    const output = await sharp(data, { failOn: 'warning' }).metadata();
    if (output.format !== 'webp' || !output.width || !output.height) {
      throw apiError('변환된 이미지 파일을 검증하지 못했습니다.');
    }
    entries.push([name, data]);
  }
  return Object.fromEntries(entries);
}

async function readResponseBody(response, maxBytes) {
  const declared = Number(response.headers.get('content-length') || 0);
  if (declared > maxBytes) throw apiError('외부 이미지가 허용 용량을 초과합니다.', 413, 'payload_too_large');
  const reader = response.body?.getReader();
  if (!reader) throw apiError('외부 이미지 본문을 읽을 수 없습니다.');
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw apiError('외부 이미지가 허용 용량을 초과합니다.', 413, 'payload_too_large');
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

async function downloadExternalImage(urlValue, maxBytes) {
  let current = new URL(normalizeExternalUrl(urlValue, 'image_url', { image: true }));
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    const addresses = await assertPublicDns(current.hostname);
    let addressIndex = 0;
    const dispatcher = new Agent({
      connect: {
        lookup: (_hostname, options, callback) => {
          if (options?.all) {
            callback(null, addresses.map(({ address, family }) => ({ address, family })));
            return;
          }
          const selected = addresses[addressIndex % addresses.length];
          addressIndex += 1;
          callback(null, selected.address, selected.family);
        },
      },
    });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    let response;
    try {
      response = await undiciFetch(current, {
        redirect: 'manual',
        signal: controller.signal,
        dispatcher,
        headers: {
          Accept: 'image/avif,image/webp,image/png,image/jpeg',
          'User-Agent': 'SwingEnjoyExternalEventAPI/1.0',
        },
      });
    } catch {
      dispatcher.destroy();
      throw apiError('외부 이미지를 내려받을 수 없습니다.');
    } finally {
      clearTimeout(timer);
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      dispatcher.destroy();
      if (!location || redirects === 3) throw apiError('외부 이미지 리디렉션이 너무 많습니다.');
      current = new URL(location, current);
      normalizeExternalUrl(current.href, 'image_url', { image: true });
      continue;
    }
    if (!response.ok) {
      dispatcher.destroy();
      throw apiError(`외부 이미지 응답 오류입니다: ${response.status}`);
    }
    const contentType = String(response.headers.get('content-type') || '').split(';')[0].toLowerCase();
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(contentType)) {
      dispatcher.destroy();
      throw apiError('외부 URL이 허용된 이미지 Content-Type을 반환하지 않았습니다.');
    }
    try {
      return await readResponseBody(response, maxBytes);
    } finally {
      await dispatcher.close().catch(() => {});
    }
  }
  throw apiError('외부 이미지를 내려받을 수 없습니다.');
}

async function storeImageVariants(buffer, partner) {
  const variants = await createImageVariants(buffer);
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const partnerFolder = crypto.createHash('sha256').update(String(partner.id)).digest('hex').slice(0, 16);
  const assetFolder = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
  const relativeDir = path.posix.join('external-events', partnerFolder, yyyy, mm, assetFolder);
  const uploadRoot = path.resolve(process.cwd(), process.env.CAFE24_UPLOADS_DIR || 'uploads');
  const targetDir = path.join(uploadRoot, ...relativeDir.split('/'));
  await fs.mkdir(targetDir, { recursive: true });
  await Promise.all(Object.entries(variants).map(([name, data]) => (
    fs.writeFile(path.join(targetDir, `${name}.webp`), data, { flag: 'wx' })
  )));
  return {
    image: `/uploads/${relativeDir}/full.webp`,
    image_micro: `/uploads/${relativeDir}/micro.webp`,
    image_thumbnail: `/uploads/${relativeDir}/thumbnail.webp`,
    image_medium: `/uploads/${relativeDir}/medium.webp`,
    image_full: `/uploads/${relativeDir}/full.webp`,
    bytes: Object.fromEntries(Object.entries(variants).map(([name, data]) => [name, data.length])),
  };
}

function uploadedVariantFields(imageUrl) {
  const url = new URL(imageUrl);
  const base = url.pathname.replace(/\/(?:micro|thumbnail|medium|full)\.webp$/, '');
  if (base === url.pathname) throw apiError('업로드 이미지 URL 형식이 올바르지 않습니다.');
  return {
    image: `${base}/full.webp`,
    image_micro: `${base}/micro.webp`,
    image_thumbnail: `${base}/thumbnail.webp`,
    image_medium: `${base}/medium.webp`,
    image_full: `${base}/full.webp`,
  };
}

async function materializeEventImage(normalized, partner) {
  const source = normalized.event.external_source;
  if (!source?.image_mode) return normalized;
  let fields;
  if (source.image_mode === 'upload') {
    fields = uploadedVariantFields(normalized.event.image);
  } else {
    const maxBytes = Number(process.env.EXTERNAL_IMAGE_MAX_BYTES || 32 * 1024 * 1024);
    const buffer = await downloadExternalImage(normalized.event.image, maxBytes);
    fields = await storeImageVariants(buffer, partner);
  }
  Object.assign(normalized.event, fields);
  return normalized;
}

async function removeStoredEventImages(event, partner) {
  const partnerFolder = crypto.createHash('sha256').update(String(partner.id)).digest('hex').slice(0, 16);
  const uploadRoot = path.resolve(process.cwd(), process.env.CAFE24_UPLOADS_DIR || 'uploads');
  const partnerRoot = path.resolve(uploadRoot, 'external-events', partnerFolder);
  const imagePaths = ['image', 'image_micro', 'image_thumbnail', 'image_medium', 'image_full']
    .map((field) => String(event?.[field] || ''))
    .filter((value) => value.startsWith('/uploads/external-events/'));
  const directories = new Set();
  for (const imagePath of imagePaths) {
    const relative = imagePath.slice('/uploads/'.length).split('/').filter(Boolean);
    const directory = path.dirname(path.resolve(uploadRoot, ...relative));
    if (directory.startsWith(`${partnerRoot}${path.sep}`)) directories.add(directory);
  }
  await Promise.all(Array.from(directories).map((directory) => fs.rm(directory, { recursive: true, force: true })));
}

export async function uploadExternalEventImage(req, res) {
  const pool = getMysqlPool();
  const partner = await authenticatePartner(req, pool);
  await recordRequest(pool, { partnerId: partner.id, statusCode: 202, result: 'attempt', requestIp: req.ip, strict: true });
  await enforceRateLimit(pool, partner);
  const contentType = String(req.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(contentType)) {
    throw apiError(
      'Content-Type은 image/jpeg, image/png, image/webp, image/avif 중 하나여야 합니다.',
      415,
      'unsupported_media_type',
    );
  }
  const maxBytes = Number(process.env.EXTERNAL_IMAGE_MAX_BYTES || 32 * 1024 * 1024);
  if (!Buffer.isBuffer(req.body) || !req.body.length || req.body.length > maxBytes) {
    throw apiError(`이미지 파일은 ${Math.floor(maxBytes / 1024 / 1024)}MB 이하여야 합니다.`, 413, 'payload_too_large');
  }

  const stored = await storeImageVariants(req.body, partner);

  const configuredOrigin = String(process.env.EXTERNAL_API_PUBLIC_ORIGIN || '').replace(/\/+$/, '');
  const requestOrigin = `${req.protocol}://${req.get('host')}`;
  const origin = configuredOrigin || requestOrigin;
  const absoluteVariants = Object.fromEntries(
    ['image_micro', 'image_thumbnail', 'image_medium', 'image_full']
      .map((key) => [key, `${origin}${stored[key]}`]),
  );
  await recordRequest(pool, {
    partnerId: partner.id,
    statusCode: 201,
    result: 'image_uploaded',
    requestIp: req.ip,
  });
  res.status(201).json({
    ok: true,
    image_url: absoluteVariants.image_full,
    variants: absoluteVariants,
    content_type: 'image/webp',
    bytes: stored.bytes,
  });
}

async function enforceRateLimit(pool, partner) {
  const [rows] = await pool.execute(
    `SELECT
       SUM(created_at >= DATE_SUB(NOW(), INTERVAL 1 MINUTE)) AS minute_count,
       SUM(created_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)) AS day_count
       FROM external_api_request_logs
      WHERE partner_id = ?
        AND result = 'attempt'
        AND created_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)`,
    [partner.id],
  );
  const minuteCount = Number(rows[0]?.minute_count || 0);
  const dayCount = Number(rows[0]?.day_count || 0);
  if (minuteCount > Number(partner.per_minute_limit || 10)) {
    throw apiError('분당 API 요청 한도를 초과했습니다.', 429, 'rate_limit_exceeded');
  }
  if (dayCount > Number(partner.daily_limit || 200)) {
    throw apiError('24시간 API 요청 한도를 초과했습니다.', 429, 'rate_limit_exceeded');
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
    if (values.strict) {
      throw apiError('요청 제한 기록을 저장할 수 없어 안전하게 요청을 중단했습니다.', 503, 'rate_limit_unavailable');
    }
    console.warn('[external-events] failed to write request log', error?.message || error);
  }
}

export async function validateExternalAddress(req, res) {
  const pool = getMysqlPool();
  const partner = await authenticatePartner(req, pool);
  const query = cleanString(req.body?.query ?? req.query?.query, MAX_TEXT_FIELD_LENGTH, 'query', { required: true });
  await recordRequest(pool, {
    partnerId: partner.id,
    statusCode: 202,
    result: 'attempt',
    requestIp: req.ip,
    strict: true,
  });
  await enforceRateLimit(pool, partner);
  const candidates = await searchKakaoAddress(query);
  if (!candidates.length) {
    await recordRequest(pool, {
      partnerId: partner.id,
      statusCode: 422,
      result: 'rejected',
      errorCode: 'address_not_found',
      requestIp: req.ip,
    });
    throw apiError('카카오맵에서 확인되는 주소가 없습니다.', 422, 'address_not_found');
  }
  await recordRequest(pool, {
    partnerId: partner.id,
    statusCode: 200,
    result: 'address_validated',
    requestIp: req.ip,
  });
  res.json({ ok: true, query, selection_required: true, candidates });
}

export async function normalizeExternalAddressForMember(req, res) {
  const user = await getCurrentUser(req);
  if (!user) throw apiError('로그인 후 주소 변환기를 사용해 주세요.', 401, 'login_required');
  enforceAddressToolRateLimit(String(user.id), req.ip);
  const query = cleanString(req.body?.query ?? req.query?.query, MAX_TEXT_FIELD_LENGTH, 'query', { required: true });
  const candidates = await searchKakaoAddress(query);
  if (!candidates.length) {
    throw apiError('카카오맵에서 확인되는 주소가 없습니다.', 422, 'address_not_found');
  }
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    ok: true,
    query,
    selection_required: true,
    candidates,
  });
}

export async function createExternalEvent(req, res) {
  const pool = getMysqlPool();
  let partner;
  let normalized;

  try {
    partner = await authenticatePartner(req, pool);
    await recordRequest(pool, {
      partnerId: partner.id,
      externalId: req.body?.external_id,
      statusCode: 202,
      result: 'attempt',
      requestIp: req.ip,
      strict: true,
    });
    await enforceRateLimit(pool, partner);
    normalized = normalizeExternalEventPayload(req.body, partner);
    if (partner.environment === 'test') {
      if (!normalized.event.image && normalized.event.category === 'social') {
        const verifiedAddress = await requireVerifiedKakaoAddress(normalized.event.address);
        normalized.event.address = verifiedAddress.address;
      }
      if (normalized.event.external_source?.image_mode === 'url') {
        const maxBytes = Number(process.env.EXTERNAL_IMAGE_MAX_BYTES || 32 * 1024 * 1024);
        const buffer = await downloadExternalImage(normalized.event.image, maxBytes);
        await createImageVariants(buffer);
      } else if (normalized.event.external_source?.image_mode === 'upload') {
        uploadedVariantFields(normalized.event.image);
      }
      await recordRequest(pool, {
        partnerId: partner.id,
        externalId: normalized.externalId,
        statusCode: 200,
        result: 'test_validated',
        requestIp: req.ip,
      });
      res.status(200).json({
        ok: true,
        test_mode: true,
        persisted: false,
        message: '요청 형식을 확인했습니다. 테스트 모드이므로 실제 일정에는 등록하지 않았습니다.',
        normalized: {
          external_id: normalized.externalId,
          category: normalized.event.category,
          genre: normalized.event.genre,
          event_dates: normalized.event.event_dates,
        },
      });
      return;
    }

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
    if (!normalized.event.image && normalized.event.category === 'social') {
      const verifiedAddress = await requireVerifiedKakaoAddress(normalized.event.address);
      normalized.event.address = verifiedAddress.address;
    }
    await materializeEventImage(normalized, partner);

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

function cleanExternalIdParam(value) {
  try {
    return cleanString(decodeURIComponent(String(value || '')), MAX_EXTERNAL_ID_LENGTH, 'external_id', { required: true });
  } catch (error) {
    if (error?.statusCode) throw error;
    throw apiError('external_id URL 인코딩이 올바르지 않습니다.');
  }
}

async function findOwnedExternalEvent(pool, partnerId, externalId) {
  const [rows] = await pool.execute(
    `SELECT x.event_id, e.raw_json
       FROM external_partner_events x
       JOIN ${EVENTS_TABLE} e ON e.id = x.event_id
      WHERE x.partner_id = ? AND x.external_id = ?
      LIMIT 1`,
    [partnerId, externalId],
  );
  if (!rows[0]) throw apiError('해당 파트너가 등록한 일정을 찾을 수 없습니다.', 404, 'not_found');
  let existing = {};
  try {
    existing = typeof rows[0].raw_json === 'string' ? JSON.parse(rows[0].raw_json) : (rows[0].raw_json || {});
  } catch {
    existing = {};
  }
  return { eventId: String(rows[0].event_id), existing };
}

export async function updateExternalEvent(req, res) {
  const pool = getMysqlPool();
  const partner = await authenticatePartner(req, pool);
  const externalId = cleanExternalIdParam(req.params.externalId);
  await recordRequest(pool, {
    partnerId: partner.id, externalId, statusCode: 202, result: 'attempt', requestIp: req.ip, strict: true,
  });
  await enforceRateLimit(pool, partner);
  if (req.body?.external_id !== undefined && String(req.body.external_id) !== externalId) {
    throw apiError('URL의 external_id와 본문의 external_id가 일치해야 합니다.');
  }
  const normalized = normalizeExternalEventPayload({ ...req.body, external_id: externalId }, partner);
  if (partner.environment === 'test') {
    await recordRequest(pool, {
      partnerId: partner.id, externalId, statusCode: 200, result: 'test_validated', requestIp: req.ip,
    });
    res.status(200).json({ ok: true, test_mode: true, persisted: false });
    return;
  }
  const owned = await findOwnedExternalEvent(pool, partner.id, externalId);
  if (!normalized.event.image && normalized.event.category === 'social') {
    const verifiedAddress = await requireVerifiedKakaoAddress(normalized.event.address);
    normalized.event.address = verifiedAddress.address;
  }
  await materializeEventImage(normalized, partner);
  const partnerUser = {
    id: partner.owner_user_id || `external:${partner.id}`,
    nickname: partner.name,
    is_admin: false,
  };
  const event = normalizeEventPayload({
    ...normalized.event,
    id: owned.eventId,
  }, { ...owned.existing, id: owned.eventId }, partnerUser);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await saveEvent(event, connection);
    await connection.execute(
      `UPDATE external_partner_events SET source_url = ? WHERE partner_id = ? AND external_id = ?`,
      [normalized.event.link1 || null, partner.id, externalId],
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  const previousImage = String(owned.existing.image_full || owned.existing.image || '');
  const nextImage = String(event.image_full || event.image || '');
  if (previousImage && previousImage !== nextImage) {
    await removeStoredEventImages(owned.existing, partner).catch((error) => {
      console.warn('[external-events] failed to remove replaced image', error?.message || error);
    });
  }
  await recordRequest(pool, {
    partnerId: partner.id,
    externalId,
    eventId: owned.eventId,
    statusCode: 200,
    result: 'updated',
    requestIp: req.ip,
  });
  res.status(200).json({ ok: true, event_id: owned.eventId, event: sanitizeEventForViewer(event, null) });
}

export async function deleteExternalEvent(req, res) {
  const pool = getMysqlPool();
  const partner = await authenticatePartner(req, pool);
  const externalId = cleanExternalIdParam(req.params.externalId);
  await recordRequest(pool, {
    partnerId: partner.id, externalId, statusCode: 202, result: 'attempt', requestIp: req.ip, strict: true,
  });
  await enforceRateLimit(pool, partner);
  if (partner.environment === 'test') {
    await recordRequest(pool, {
      partnerId: partner.id, externalId, statusCode: 200, result: 'test_validated', requestIp: req.ip,
    });
    res.status(200).json({ ok: true, test_mode: true, persisted: false });
    return;
  }
  const owned = await findOwnedExternalEvent(pool, partner.id, externalId);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute(
      `DELETE FROM external_partner_events WHERE partner_id = ? AND external_id = ? AND event_id = ?`,
      [partner.id, externalId, owned.eventId],
    );
    await connection.execute(`DELETE FROM ${EVENTS_TABLE} WHERE id = ?`, [owned.eventId]);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  await removeStoredEventImages(owned.existing, partner).catch((error) => {
    console.warn('[external-events] failed to remove deleted event image', error?.message || error);
  });
  await recordRequest(pool, {
    partnerId: partner.id,
    externalId,
    eventId: owned.eventId,
    statusCode: 200,
    result: 'deleted',
    requestIp: req.ip,
  });
  res.status(200).json({ ok: true, deleted: true, event_id: owned.eventId });
}

export async function listExternalPartners(req, res) {
  await requireAdmin(req);
  res.setHeader('Cache-Control', 'no-store');
  const pool = getMysqlPool();
  const [partners] = await pool.execute(
    `SELECT p.id, p.name, p.key_prefix, p.is_active, p.default_category, p.default_genre,
            p.allowed_category, p.allowed_classifications, p.environment,
            p.owner_user_id, p.per_minute_limit, p.daily_limit, p.created_at, p.updated_at,
            u.email AS owner_email, u.nickname AS owner_nickname,
            COUNT(DISTINCT e.event_id) AS event_count,
            MAX(l.created_at) AS last_request_at
       FROM external_api_partners p
       LEFT JOIN users u ON u.id = p.owner_user_id
       LEFT JOIN external_partner_events e ON e.partner_id = p.id
       LEFT JOIN external_api_request_logs l ON l.partner_id = p.id
      GROUP BY p.id
      ORDER BY p.created_at DESC`,
  );
  res.json({ ok: true, partners });
}

export async function requestExternalPartnerAccess(req, res) {
  requireSameOrigin(req);
  const user = await getCurrentUser(req);
  if (!user) throw apiError('로그인 후 연동을 신청해 주세요.', 401, 'login_required');
  const partnerName = cleanString(req.body?.partner_name, 120, 'partner_name', { required: true });
  const contact = cleanString(req.body?.contact, 255, 'contact', { required: true });
  const note = cleanString(req.body?.note, 2000, 'note');
  const pool = getMysqlPool();
  const [pending] = await pool.execute(
    `SELECT id FROM external_api_partner_requests
      WHERE requester_user_id = ? AND status = 'pending' LIMIT 1`,
    [String(user.id)],
  );
  if (pending[0]) throw apiError('이미 검토 중인 연동 신청이 있습니다.', 409, 'request_already_pending');
  const id = crypto.randomUUID();
  await pool.execute(
    `INSERT INTO external_api_partner_requests
       (id, requester_user_id, partner_name, contact, note, status)
     VALUES (?, ?, ?, ?, ?, 'pending')`,
    [id, String(user.id), partnerName, contact, note || null],
  );
  res.status(201).json({ ok: true, request_id: id, status: 'pending' });
}

export async function listMyExternalPartners(req, res) {
  const user = await getCurrentUser(req);
  if (!user) throw apiError('로그인 후 확인해 주세요.', 401, 'login_required');
  const pool = getMysqlPool();
  const [partners] = await pool.execute(
    `SELECT id, name, environment, per_minute_limit, daily_limit
       FROM external_api_partners
      WHERE owner_user_id = ? AND is_active = 1
      ORDER BY created_at DESC`,
    [String(user.id)],
  );
  res.setHeader('Cache-Control', 'no-store');
  res.json({ ok: true, partners });
}

export async function autoIncreaseExternalTestLimit(req, res) {
  requireSameOrigin(req);
  const user = await getCurrentUser(req);
  if (!user) throw apiError('로그인 후 요청해 주세요.', 401, 'login_required');
  const partnerId = cleanString(req.params?.partnerId, 64, 'partner_id', { required: true });
  const pool = getMysqlPool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      `SELECT id, name, environment, per_minute_limit, daily_limit
         FROM external_api_partners
        WHERE id = ? AND owner_user_id = ? AND is_active = 1
        LIMIT 1 FOR UPDATE`,
      [partnerId, String(user.id)],
    );
    const partner = rows[0];
    if (!partner) throw apiError('본인 계정에 연결된 활성 파트너를 찾을 수 없습니다.', 404, 'not_found');
    if (partner.environment !== 'test') {
      throw apiError('자동 상향은 테스트 모드에서만 가능합니다.', 403, 'live_limit_requires_admin');
    }
    const [recent] = await connection.execute(
      `SELECT id FROM external_api_request_logs
        WHERE partner_id = ? AND result = 'test_limit_auto_increased'
          AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
        LIMIT 1`,
      [partnerId],
    );
    if (recent[0]) {
      throw apiError('자동 상향은 파트너별 24시간에 한 번만 가능합니다.', 429, 'limit_request_cooldown');
    }
    const perMinuteLimit = Math.max(Number(partner.per_minute_limit), 60);
    const dailyLimit = Math.max(Number(partner.daily_limit), 3000);
    await connection.execute(
      `UPDATE external_api_partners
          SET per_minute_limit = ?, daily_limit = ?, updated_at = NOW()
        WHERE id = ?`,
      [perMinuteLimit, dailyLimit, partnerId],
    );
    await connection.execute(
      `INSERT INTO external_api_request_logs
         (partner_id, status_code, result, request_ip, created_at)
       VALUES (?, 200, 'test_limit_auto_increased', ?, NOW())`,
      [partnerId, req.ip || null],
    );
    await connection.commit();
    res.json({ ok: true, partner_id: partnerId, per_minute_limit: perMinuteLimit, daily_limit: dailyLimit });
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
}

export async function listExternalPartnerRequests(req, res) {
  await requireAdmin(req);
  res.setHeader('Cache-Control', 'no-store');
  const pool = getMysqlPool();
  const [requests] = await pool.execute(
    `SELECT r.*, u.email AS requester_email, u.nickname AS requester_nickname
       FROM external_api_partner_requests r
       LEFT JOIN users u ON u.id = r.requester_user_id
      ORDER BY (r.status = 'pending') DESC, r.created_at DESC
      LIMIT 100`,
  );
  res.json({ ok: true, requests });
}

export async function searchExternalPartnerUsers(req, res) {
  await requireAdmin(req);
  res.setHeader('Cache-Control', 'no-store');
  const query = cleanString(req.query?.query, 120, 'query');
  const pool = getMysqlPool();
  const [users] = await pool.execute(
    `SELECT id, email, nickname, is_admin, created_at
       FROM users
      WHERE (? = '' OR LOCATE(?, COALESCE(email, '')) > 0 OR LOCATE(?, COALESCE(nickname, '')) > 0)
      ORDER BY is_admin DESC, created_at DESC
      LIMIT 50`,
    [query, query, query],
  );
  res.json({ ok: true, users });
}

export async function createExternalPartner(req, res) {
  requireSameOrigin(req);
  const admin = await requireAdmin(req);
  res.setHeader('Cache-Control', 'no-store');
  const pool = getMysqlPool();
  const owner = await requireExistingOwnerUser(pool, req.body?.owner_user_id);
  const name = cleanString(req.body?.name, 120, 'name', { required: true });
  const classification = normalizePartnerClassification(
    req.body?.default_category,
    req.body?.default_genre,
  );
  const allowedClassifications = normalizeAllowedClassifications(req.body?.allowed_classifications);
  const allowedCategory = normalizeAllowedCategory(req.body?.allowed_category);
  if (allowedClassifications?.some((item) => item.category !== allowedCategory)) {
    throw apiError('하위 장르는 선택한 최상위 분류 안에서만 허용할 수 있습니다.');
  }
  const environment = normalizePartnerEnvironment(req.body?.environment);
  const perMinuteLimit = normalizePositiveInteger(req.body?.per_minute_limit, 'per_minute_limit', environment === 'test' ? 30 : 10);
  const dailyLimit = normalizePositiveInteger(req.body?.daily_limit, 'daily_limit', environment === 'test' ? 1000 : 200);
  const partnerId = crypto.randomUUID();
  const applicationId = cleanString(req.body?.application_id, 64, 'application_id');
  const issued = createPartnerApiKey();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute(
      `INSERT INTO external_api_partners
         (id, name, key_prefix, key_hash, is_active, default_category, default_genre,
          allowed_category, allowed_classifications, environment, owner_user_id, per_minute_limit, daily_limit)
       VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        partnerId,
        name,
        issued.prefix,
        issued.keyHash,
        classification.category,
        classification.genre,
        allowedCategory,
        allowedClassifications ? JSON.stringify(allowedClassifications) : null,
        environment,
        String(owner.id),
        perMinuteLimit,
        dailyLimit,
      ],
    );
    await writeAdminAudit(connection, admin, partnerId, 'created', {
      owner_user_id: String(owner.id),
      default_category: classification.category,
      default_genre: classification.genre,
      allowed_classifications: allowedClassifications,
      allowed_category: allowedCategory,
      environment,
      per_minute_limit: perMinuteLimit,
      daily_limit: dailyLimit,
    }, req.ip);
    if (applicationId) {
      const [result] = await connection.execute(
        `UPDATE external_api_partner_requests
            SET status = 'approved', approved_partner_id = ?, reviewed_at = NOW()
          WHERE id = ? AND requester_user_id = ? AND status = 'pending'`,
        [partnerId, applicationId, String(owner.id)],
      );
      if (!result.affectedRows) throw apiError('승인할 연동 신청을 찾을 수 없습니다.', 404, 'request_not_found');
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  res.status(201).json({
    ok: true,
    partner_id: partnerId,
    api_key: issued.apiKey,
    warning: '이 키는 지금 한 번만 표시됩니다. 안전한 비밀 저장소에 보관해 주세요.',
  });
}

export async function updateExternalPartnerStatus(req, res) {
  requireSameOrigin(req);
  const admin = await requireAdmin(req);
  const partnerId = cleanString(req.params.partnerId, 64, 'partner_id', { required: true });
  const pool = getMysqlPool();
  const [existingRows] = await pool.execute(
    `SELECT id, name, is_active, default_category, default_genre, allowed_category, allowed_classifications,
            environment, owner_user_id,
            per_minute_limit, daily_limit
       FROM external_api_partners WHERE id = ? LIMIT 1`,
    [partnerId],
  );
  const existing = existingRows[0];
  if (!existing) throw apiError('파트너를 찾을 수 없습니다.', 404, 'not_found');
  const nextOwnerId = req.body?.owner_user_id === undefined
    ? (existing.owner_user_id ? String(existing.owner_user_id) : null)
    : String((await requireExistingOwnerUser(pool, req.body.owner_user_id)).id);
  const statusOnlyEmergencyStop = !nextOwnerId
    && req.body?.is_active === false
    && Object.keys(req.body || {}).every((field) => field === 'is_active');
  if (!nextOwnerId && !statusOnlyEmergencyStop) {
    throw apiError('파트너 키에는 연결 회원이 필요합니다.');
  }
  const classification = normalizePartnerClassification(
    req.body?.default_category === undefined ? existing.default_category : req.body.default_category,
    req.body?.default_genre === undefined ? existing.default_genre : req.body.default_genre,
  );
  const allowedClassifications = req.body?.allowed_classifications === undefined
    ? parseAllowedClassifications(existing.allowed_classifications)
    : normalizeAllowedClassifications(req.body.allowed_classifications);
  const allowedCategory = req.body?.allowed_category === undefined
    ? normalizeAllowedCategory(existing.allowed_category, { required: false })
    : normalizeAllowedCategory(req.body.allowed_category);
  if (allowedClassifications?.some((item) => item.category !== allowedCategory)) {
    throw apiError('하위 장르는 선택한 최상위 분류 안에서만 허용할 수 있습니다.');
  }
  const environment = normalizePartnerEnvironment(req.body?.environment, existing.environment || 'test');
  const next = {
    name: req.body?.name === undefined
      ? String(existing.name)
      : cleanString(req.body.name, 120, 'name', { required: true }),
    isActive: req.body?.is_active === undefined ? Boolean(existing.is_active) : req.body.is_active,
    ownerUserId: nextOwnerId,
    category: classification.category,
    genre: classification.genre,
    allowedClassifications,
    allowedCategory,
    environment,
    perMinuteLimit: normalizePositiveInteger(
      req.body?.per_minute_limit,
      'per_minute_limit',
      Number(existing.per_minute_limit),
    ),
    dailyLimit: normalizePositiveInteger(
      req.body?.daily_limit,
      'daily_limit',
      Number(existing.daily_limit),
    ),
  };
  if (typeof next.isActive !== 'boolean') throw apiError('is_active는 boolean 값이어야 합니다.');
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute(
      `UPDATE external_api_partners
          SET name = ?, is_active = ?, default_category = ?, default_genre = ?,
              allowed_category = ?, allowed_classifications = ?, environment = ?,
              owner_user_id = ?, per_minute_limit = ?, daily_limit = ?, updated_at = NOW()
        WHERE id = ?`,
      [
        next.name,
        next.isActive ? 1 : 0,
        next.category,
        next.genre,
        next.allowedCategory,
        next.allowedClassifications ? JSON.stringify(next.allowedClassifications) : null,
        next.environment,
        next.ownerUserId,
        next.perMinuteLimit,
        next.dailyLimit,
        partnerId,
      ],
    );
    await writeAdminAudit(connection, admin, partnerId, 'updated', next, req.ip);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  res.json({ ok: true, partner_id: partnerId, is_active: next.isActive });
}

export async function rotateExternalPartnerKey(req, res) {
  requireSameOrigin(req);
  const admin = await requireAdmin(req);
  res.setHeader('Cache-Control', 'no-store');
  const partnerId = cleanString(req.params.partnerId, 64, 'partner_id', { required: true });
  const pool = getMysqlPool();
  const [partnerRows] = await pool.execute(
    'SELECT owner_user_id FROM external_api_partners WHERE id = ? LIMIT 1',
    [partnerId],
  );
  if (!partnerRows[0]) throw apiError('파트너를 찾을 수 없습니다.', 404, 'not_found');
  if (!partnerRows[0].owner_user_id) {
    throw apiError('키를 재발급하기 전에 파트너 회원 계정을 연결해 주세요.');
  }
  const issued = createPartnerApiKey();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [result] = await connection.execute(
      `UPDATE external_api_partners
          SET key_prefix = ?, key_hash = ?, is_active = 1, updated_at = NOW()
        WHERE id = ?`,
      [issued.prefix, issued.keyHash, partnerId],
    );
    if (!result.affectedRows) throw apiError('파트너를 찾을 수 없습니다.', 404, 'not_found');
    await writeAdminAudit(connection, admin, partnerId, 'key_rotated', {}, req.ip);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  res.json({
    ok: true,
    partner_id: partnerId,
    api_key: issued.apiKey,
    warning: '이 키는 지금 한 번만 표시되며 기존 키는 즉시 사용할 수 없습니다.',
  });
}

export async function listExternalRequestLogs(req, res) {
  await requireAdmin(req);
  res.setHeader('Cache-Control', 'no-store');
  const requestedLimit = Number(req.query.limit || 100);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 500)
    : 100;
  const pool = getMysqlPool();
  const [logs] = await pool.execute(
    `SELECT l.id, l.partner_id, p.name AS partner_name, l.external_id, l.event_id,
            l.status_code, l.result, l.error_code, l.request_ip, l.created_at
       FROM external_api_request_logs l
       JOIN external_api_partners p ON p.id = l.partner_id
      ORDER BY l.id DESC
      LIMIT ${limit}`,
  );
  res.json({ ok: true, logs });
}

export async function listExternalAdminAuditLogs(req, res) {
  await requireAdmin(req);
  res.setHeader('Cache-Control', 'no-store');
  const requestedLimit = Number(req.query.limit || 100);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 500)
    : 100;
  const pool = getMysqlPool();
  const [logs] = await pool.execute(
    `SELECT a.id, a.admin_user_id, u.email AS admin_email, a.partner_id,
            p.name AS partner_name, a.action, a.details_json, a.request_ip, a.created_at
       FROM external_api_admin_audit_logs a
       LEFT JOIN users u ON u.id = a.admin_user_id
       LEFT JOIN external_api_partners p ON p.id = a.partner_id
      ORDER BY a.id DESC
      LIMIT ${limit}`,
  );
  res.json({ ok: true, logs });
}
