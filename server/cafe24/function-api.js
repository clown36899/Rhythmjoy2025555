import crypto from 'node:crypto';
import { benefitFieldsFromStructuredData } from './ingestion-benefit-fields.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getCurrentUser, requireAdmin } from './auth-api.js';
import {
  deleteCafe24TableRows,
  loadCafe24TableRows,
  saveCafe24TableRow,
} from './generic-data-api.js';
import { canManageEvent, userMatchesId } from './event-security.js';
import { removeEventUploads as removeEventUploadFiles } from './upload-cleanup.js';
import {
  collapseDateExpansionRows,
  dateExpansionSkipReason,
  normalizeDateExpansionUrl,
  shouldHidePastCandidate,
  shouldSkipDateExpansionCandidate,
  sortDateExpansionInputs,
} from './ingestion-date-expansion.js';
import { findGeneratedRegularSocialReplacements } from './regular-social-reconciler.js';

const allowedScopes = new Set(['swing', 'salsa', 'bachata', 'tango', 'street']);
const imageExtByMime = {
  'image/avif': '.avif',
  'image/gif': '.gif',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/svg+xml': '.svg',
  'image/webp': '.webp',
};

function isLocalDevelopmentRequest(req) {
  if (process.env.NODE_ENV === 'production') return false;
  const host = String(req.headers.host || '').split(':')[0];
  const remoteAddress = String(req.socket?.remoteAddress || '');
  const localHosts = new Set(['localhost', '127.0.0.1', '::1']);
  const localRemotes = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
  return localHosts.has(host) && (localRemotes.has(remoteAddress) || remoteAddress.startsWith('::ffff:127.0.0.1'));
}

function uploadRoot() {
  return path.resolve(process.cwd(), process.env.CAFE24_UPLOADS_DIR || 'uploads');
}

function publicUploadPath(...parts) {
  return `/uploads/${parts.map((part) => String(part || '').replace(/^\/+|\/+$/g, '')).filter(Boolean).join('/')}`;
}

function safeSegment(value, fallback = 'file') {
  return String(value || fallback)
    .normalize('NFKD')
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90) || fallback;
}

function extensionFrom(value = '', mimeType = '') {
  const byMime = imageExtByMime[String(mimeType || '').split(';')[0].toLowerCase()];
  if (byMime) return byMime;
  const ext = path.extname(String(value || '').split('?')[0]).toLowerCase();
  return ext && ext.length <= 8 ? ext : '.webp';
}

function decodeBase64Payload(dataUrl) {
  const value = String(dataUrl || '');
  const match = value.match(/^data:([^;]+);base64,(.+)$/);
  if (match) {
    return {
      buffer: Buffer.from(match[2], 'base64'),
      mimeType: match[1],
    };
  }
  return {
    buffer: Buffer.from(value, 'base64'),
    mimeType: '',
  };
}

async function writeUploadFile(folder, filename, buffer) {
  const root = uploadRoot();
  const relative = path.join(folder, filename);
  const target = path.resolve(root, relative);
  if (!target.startsWith(root)) throw new Error('Invalid upload path');
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, buffer);
  return publicUploadPath(relative);
}

async function storeDataImage(dataUrl, folder, filenameHint = 'image') {
  const { buffer, mimeType } = decodeBase64Payload(dataUrl);
  if (!buffer.length) return null;
  const filename = `${safeSegment(filenameHint)}-${Date.now()}${extensionFrom('', mimeType)}`;
  return writeUploadFile(folder, filename, buffer);
}

async function fetchBuffer(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'User-Agent': 'SwingEnjoyCafe24/1.0',
      },
    });
    if (!response.ok) throw new Error(`download failed ${response.status}`);
    return {
      buffer: Buffer.from(await response.arrayBuffer()),
      mimeType: response.headers.get('content-type') || '',
    };
  } finally {
    clearTimeout(timer);
  }
}

const blockedRemoteAssetHosts = new Set([
  ['su', 'pabase', 'co'].join('.'),
]);

function isBlockedRemoteAssetUrl(value) {
  try {
    const hostname = new URL(String(value || '')).hostname.toLowerCase();
    return Array.from(blockedRemoteAssetHosts).some((host) => hostname === host || hostname.endsWith(`.${host}`));
  } catch (_error) {
    return false;
  }
}

function safeEqualString(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function hasValidIngestionToken(req) {
  const expected = process.env.SCRAPED_EVENTS_INGEST_TOKEN || process.env.CAFE24_INGEST_TOKEN || '';
  if (!expected) return false;

  const headerToken = req.headers['x-ingestion-token'];
  const authHeader = req.headers.authorization || '';
  const bearerMatch = String(authHeader).match(/^Bearer\s+(.+)$/i);
  const provided = Array.isArray(headerToken) ? headerToken[0] : headerToken || bearerMatch?.[1] || '';

  return safeEqualString(provided, expected);
}

async function localizeImageUrl(url, folder, filenameHint = 'image') {
  const value = String(url || '').trim();
  if (!value) return null;
  if (value.startsWith('/uploads/')) return value;
  if (value.startsWith('data:image')) return storeDataImage(value, folder, filenameHint);
  if (!/^https?:\/\//i.test(value)) return value;
  if (isBlockedRemoteAssetUrl(value)) return null;

  try {
    const { buffer, mimeType } = await fetchBuffer(value);
    const filename = `${safeSegment(filenameHint)}-${Date.now()}${extensionFrom(value, mimeType)}`;
    return await writeUploadFile(folder, filename, buffer);
  } catch (error) {
    console.warn('[cafe24:function-api] image localization skipped:', error?.message || error);
    return value;
  }
}

function isLocalUpload(value) {
  return String(value || '').startsWith('/uploads/');
}

function resolveLocalUpload(value) {
  if (!isLocalUpload(value)) return null;
  const root = uploadRoot();
  const relative = decodeURIComponent(String(value).split('?')[0].replace(/^\/uploads\/?/, ''));
  const target = path.resolve(root, relative);
  return target.startsWith(root) ? target : null;
}

async function readImageSourceBuffer(value) {
  const source = String(value || '').trim();
  if (!source) return null;

  if (source.startsWith('data:image')) {
    const { buffer, mimeType } = decodeBase64Payload(source);
    return buffer.length ? { buffer, mimeType } : null;
  }

  if (source.startsWith('/uploads/')) {
    const target = resolveLocalUpload(source);
    if (!target) return null;
    return {
      buffer: await fs.readFile(target),
      mimeType: '',
    };
  }

  if (/^https?:\/\//i.test(source) && !isBlockedRemoteAssetUrl(source)) {
    return fetchBuffer(source);
  }

  return null;
}

async function loadSharp() {
  try {
    const sharpModule = await import('sharp');
    return sharpModule.default || sharpModule;
  } catch (error) {
    console.warn('[cafe24:function-api] sharp unavailable; image variants skipped:', error?.message || error);
    return null;
  }
}

async function createImageVariant(sharp, buffer, width, quality) {
  return sharp(buffer)
    .rotate()
    .resize({ width, withoutEnlargement: true })
    .webp({ quality })
    .toBuffer();
}

async function localizeEventImageVariants(url, folder, filenameHint = 'poster') {
  const value = String(url || '').trim();
  if (!value) return null;

  const localizedOriginal = await localizeImageUrl(value, folder, filenameHint);
  const source = await readImageSourceBuffer(localizedOriginal || value);
  const fallbackUrl = localizedOriginal || value;

  if (!source?.buffer?.length) {
    return {
      image: fallbackUrl,
      image_full: fallbackUrl,
    };
  }

  const sharp = await loadSharp();
  if (!sharp) {
    return {
      image: fallbackUrl,
      image_full: fallbackUrl,
    };
  }

  try {
    const variants = {
      micro: await createImageVariant(sharp, source.buffer, 100, 70),
      thumbnail: await createImageVariant(sharp, source.buffer, 300, 75),
      medium: await createImageVariant(sharp, source.buffer, 650, 90),
      full: await createImageVariant(sharp, source.buffer, 1300, 85),
    };

    const [micro, thumbnail, medium, full] = await Promise.all([
      writeUploadFile(folder, 'micro.webp', variants.micro),
      writeUploadFile(folder, 'thumbnail.webp', variants.thumbnail),
      writeUploadFile(folder, 'medium.webp', variants.medium),
      writeUploadFile(folder, 'full.webp', variants.full),
    ]);

    return {
      image: full,
      image_micro: micro,
      image_thumbnail: thumbnail,
      image_medium: medium,
      image_full: full,
      storage_path: folder.replace(/^images\//, ''),
    };
  } catch (error) {
    console.warn('[cafe24:function-api] image variants skipped:', error?.message || error);
    return {
      image: fallbackUrl,
      image_full: fallbackUrl,
    };
  }
}

async function removeLocalUpload(value) {
  const target = resolveLocalUpload(value);
  if (!target) return false;
  await fs.rm(target, { force: true, recursive: true }).catch(() => {});
  return true;
}

function kstToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function sortDescCreatedAt(rows) {
  return [...rows].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
}

function sortBenefitRows(rows, today = new Date().toISOString().slice(0, 10)) {
  const isCurrent = row => (
    row?.structured_data?.ongoing_sale === true
    || scrapedRowDate(row) >= today
  );
  return [...rows].sort((a, b) => (
    Number(isCurrent(a)) - Number(isCurrent(b))
    ||
    scrapedRowDate(a).localeCompare(scrapedRowDate(b))
    || String(a.created_at || '').localeCompare(String(b.created_at || ''))
  ));
}

function stripVirtualCandidateTaxonomy(structuredData = {}) {
  const {
    activity_label,
    genre_family,
    genre_family_label,
    dance_genre,
    dance_genre_label,
    dance_scope_label,
    taxonomy_confidence,
    tags,
    tag_labels,
    ...siteStructuredData
  } = structuredData || {};
  return siteStructuredData;
}

function filterScrapedRows(rows, req) {
  const tab = String(req.query.tab || '').toLowerCase();
  const type = String(req.query.type || '').toLowerCase();
  const scope = String(req.query.scope || '').toLowerCase();
  const today = kstToday();

  return rows.filter((row) => {
    const sd = row.structured_data || {};
    if (scope && allowedScopes.has(scope) && String(sd.dance_scope || '').toLowerCase() !== scope) return false;
    if (type === 'lessons' && !['class', 'lesson'].includes(String(sd.activity_type || row.activity_type || '').toLowerCase())) return false;
    if (type === 'social' && String(sd.activity_type || row.activity_type || '').toLowerCase() === 'class') return false;

    if (shouldHidePastCandidate(row, { today, tab })) return false;

    if (tab === 'collected') {
      return (row.is_collected === true || row.status === 'collected')
        && sd.benefit_eligible !== true;
    }
    if (tab === 'duplicate') return row.status === 'duplicate' || Boolean(sd._duplicate);
    if (tab === 'free') {
      return sd.benefit_eligible === true
        && ['free_event', 'discount_event', 'season_pass'].includes(String(sd.benefit_kind || ''))
        && row.status !== 'duplicate'
        && row.status !== 'excluded';
    }
    if (tab === 'new') {
      return row.is_collected !== true
        && row.status !== 'collected'
        && row.status !== 'duplicate'
        && row.status !== 'excluded';
    }
    return row.status !== 'excluded';
  });
}

function scrapedRowDate(row) {
  return String(row?.structured_data?.date || row?.date || row?.start_date || '').slice(0, 10);
}

function rowTitle(row) {
  return String(row?.structured_data?.title || row?.title || '').trim();
}

function rowLocation(row) {
  return String(row?.structured_data?.venue_name || row?.structured_data?.location || row?.venue_name || row?.location || '').trim();
}

function rowActivityType(row) {
  const value = String(row?.structured_data?.activity_type || row?.activity_type || '').trim().toLowerCase();
  if (['class', 'social', 'event', 'recruit', 'sale'].includes(value)) return value;
  const category = String(row?.structured_data?.category || row?.category || '').trim().toLowerCase();
  if (category === 'class' || category === 'club') return 'class';
  if (category === 'social') return 'social';
  if (category === 'event') return 'event';
  const eventType = String(row?.structured_data?.event_type || row?.event_type || '').trim();
  if (/강습|수업|레슨|클래스|class|lesson/i.test(eventType)) return 'class';
  if (/소셜|social/i.test(eventType)) return 'social';
  return '';
}

function rowSourceUrl(row, target = 'scraped_events') {
  return String(target === 'events' ? row?.link1 : row?.source_url || '').trim();
}

function normalizeDuplicateUrl(value) {
  return normalizeDateExpansionUrl(value);
}

function normalizeDuplicateText(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/seoul/g, '서울')
    .replace(/dj\s*/gi, '')
    .replace(/[^\p{L}\p{N}가-힣]/gu, '');
}

function duplicateTextSimilarity(a, b) {
  const left = normalizeDuplicateText(a);
  const right = normalizeDuplicateText(b);
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

function sameSourceUrl(left, right) {
  const a = normalizeDuplicateUrl(left);
  const b = normalizeDuplicateUrl(right);
  return Boolean(a && b && a === b);
}

function sameVenue(left, right) {
  const a = normalizeDuplicateText(left);
  const b = normalizeDuplicateText(right);
  if (!a || !b) return false;
  if (a.length >= 2 && b.length >= 2 && (a.includes(b) || b.includes(a))) return true;
  return duplicateTextSimilarity(a, b) >= 0.7;
}

function sourceIdentity(value = '') {
  try {
    const parsed = new URL(String(value || '').trim());
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (host === 'instagram.com' && parts[0]) return `${host}/${parts[0].toLowerCase()}`;
    const naverCafe = parsed.pathname.match(/\/cafes\/(\d+)\//);
    if (host === 'cafe.naver.com' && naverCafe) return `${host}/cafes/${naverCafe[1]}`;
    return host;
  } catch {
    return '';
  }
}

function sameSourceIdentity(left, right) {
  const a = sourceIdentity(left);
  const b = sourceIdentity(right);
  return Boolean(a && b && a === b);
}

function looksLikeGenericIngestionTitle(value = '') {
  const normalized = normalizeDuplicateText(value);
  if (!normalized) return true;
  if (normalized.length <= 6 && /강습|소셜|행사|파티|안내/.test(normalized)) return true;
  if (/^(?:[가-힣a-z0-9]+)?(?:강습|소셜|행사|파티|이벤트)?안내$/.test(normalized)) return true;
  if (/^(?:💜|💙|❤️|🧡|💛|💚|🩵|💖|✨)?강습안내(?:💜|💙|❤️|🧡|💛|💚|🩵|💖|✨)?$/.test(normalized)) return true;
  return false;
}

function duplicateDescriptor(target, row, reason) {
  return {
    target,
    existingId: row?.id || null,
    existingTitle: rowTitle(row) || null,
    existingDate: target === 'events'
      ? String(row?.start_date || row?.date || '').slice(0, 10)
      : scrapedRowDate(row),
    existingSourceUrl: rowSourceUrl(row, target) || null,
    reason,
  };
}

function terminalScrapedStatus(row) {
  return ['collected', 'duplicate', 'excluded'].includes(String(row?.status || '').toLowerCase()) || row?.is_collected === true;
}

export function canReopenGeneratedRegularSocialDuplicate(existingRow = {}, incomingRow = {}, duplicate = null) {
  const priorDuplicate = existingRow?.structured_data?._duplicate;
  const replacement = duplicate || priorDuplicate;
  const readiness = incomingRow?.auto_registration || {};
  return String(existingRow?.status || '').toLowerCase() === 'duplicate'
    && (
      !replacement
      || (
        replacement.target === 'events'
        && String(replacement.existingId || '').startsWith('regular-social:')
      )
    )
    && readiness.ready === true
    && readiness.ai_verified === true
    && Number(readiness.ai_confidence || 0) >= 0.98
    && String(incomingRow?.structured_data?.activity_type || '').toLowerCase() === 'social';
}

export function canReprocessCollectedAutomaticCandidate(existingRow = {}, incomingRow = {}, eventRows = []) {
  if (
    String(existingRow?.status || '').toLowerCase() !== 'collected'
    && existingRow?.is_collected !== true
  ) {
    return false;
  }
  if (!sameSourceUrl(
    rowSourceUrl(existingRow, 'scraped_events'),
    rowSourceUrl(incomingRow, 'scraped_events'),
  )) {
    return false;
  }
  if (scrapedRowDate(existingRow) !== scrapedRowDate(incomingRow)) return false;
  const validation = validateAutomaticRegistrationCandidate({
    ...incomingRow,
    status: 'pending',
    is_collected: false,
  });
  if (!validation.ok) return false;
  if (hasRegisteredEventLink(existingRow)) return true;

  const sourceUrl = rowSourceUrl(existingRow, 'scraped_events');
  const date = scrapedRowDate(existingRow);
  const exactOperationalMatches = eventRows.filter((event) => (
    sameSourceUrl(rowSourceUrl(event, 'events'), sourceUrl)
    && sameEventDate(event, date)
  ));
  return exactOperationalMatches.length === 1;
}

function isOfficialApiEvent(row = {}) {
  return Boolean(row.external_source?.partner_id && row.external_source?.external_id);
}

function isSocialDuplicateRow(row = {}) {
  return String(row.category || row.activity_type || row.structured_data?.category || row.structured_data?.activity_type || '')
    .toLowerCase() === 'social';
}

function duplicateMatch(row, candidate, target) {
  const date = scrapedRowDate(candidate);
  if (!date) return null;
  const existingSource = rowSourceUrl(row, target);
  const candidateSource = rowSourceUrl(candidate, 'scraped_events');

  if (sameSourceUrl(existingSource, candidateSource) && sameEventDate(row, date)) {
    return duplicateDescriptor(target, row, '같은 원본 URL과 날짜');
  }

  if (!sameEventDate(row, date)) return null;
  const titleScore = duplicateTextSimilarity(rowTitle(row), rowTitle(candidate));
  if (
    target === 'events'
    && isOfficialApiEvent(row)
    && isSocialDuplicateRow(row)
    && isSocialDuplicateRow(candidate)
    && sameVenue(rowLocation(row), rowLocation(candidate))
  ) {
    return duplicateDescriptor(target, row, '같은 날짜·장소의 공식 API 소셜 우선');
  }
  if (titleScore >= 0.88 && sameVenue(rowLocation(row), rowLocation(candidate))) {
    return duplicateDescriptor(target, row, '같은 날짜, 유사 제목, 같은 장소');
  }

  if (
    sameVenue(rowLocation(row), rowLocation(candidate))
    && sameSourceIdentity(existingSource, candidateSource)
    && rowActivityType(row)
    && rowActivityType(row) === rowActivityType(candidate)
    && (looksLikeGenericIngestionTitle(rowTitle(row)) || looksLikeGenericIngestionTitle(rowTitle(candidate)))
  ) {
    return duplicateDescriptor(target, row, '같은 출처, 날짜, 장소의 일반 제목 후보');
  }

  const normalizedTitle = normalizeDuplicateText(rowTitle(candidate));
  if (normalizedTitle.length >= 12 && titleScore >= 0.95) {
    return duplicateDescriptor(target, row, '같은 날짜와 거의 같은 제목');
  }

  return null;
}

function findOperationalDuplicateForScrapedItem(candidate, eventRows = []) {
  for (const event of eventRows) {
    const match = duplicateMatch(event, candidate, 'events');
    if (match) return match;
  }
  return null;
}

async function prepareScrapedItem(item) {
  const row = { ...(item || {}) };
  row.structured_data = stripVirtualCandidateTaxonomy(row.structured_data || {});
  row.id = String(row.id || crypto.randomUUID());
  row.created_at = row.created_at || new Date().toISOString();
  row.updated_at = new Date().toISOString();
  if (row.is_collected === true && !row.status) row.status = 'collected';

  if (row.imageData) {
    const stored = await storeDataImage(row.imageData, 'scraped', row.id);
    if (stored) row.poster_url = stored;
    delete row.imageData;
  }

  if (isBlockedRemoteAssetUrl(row.poster_url)) {
    row.poster_url = await localizeImageUrl(row.poster_url, 'scraped', row.id);
  }

  return row;
}

async function upsertScrapedItem(item) {
  const row = await prepareScrapedItem(item);
  return saveCafe24TableRow('scraped_events', row);
}

export function hasRegisteredEventLink(item = {}) {
  return Boolean(String(
    item.registered_event_id
    || item.structured_data?.registered_event_id
    || '',
  ).trim());
}

function requestsCollectedStatus(item = {}) {
  return item.is_collected === true || String(item.status || '').toLowerCase() === 'collected';
}

function replaceWorkingScrapedRow(rows, saved) {
  const id = String(saved?.id || '');
  if (!id) return rows;
  const index = rows.findIndex((row) => String(row?.id || '') === id);
  if (index === -1) return [...rows, saved];
  const next = [...rows];
  next[index] = saved;
  return next;
}

async function ingestScrapedItems(values) {
  let scrapedRows = await loadCafe24TableRows('scraped_events');
  const eventRows = await loadCafe24TableRows('events');
  const saved = [];
  const refreshed = [];
  const skipped = [];

  for (const value of sortDateExpansionInputs(values)) {
    const row = await prepareScrapedItem(value);
    const existingSameId = scrapedRows.find((item) => String(item?.id || '') === String(row.id));
    const reprocessCollectedAutomatic = existingSameId
      ? canReprocessCollectedAutomaticCandidate(existingSameId, row, eventRows)
      : false;

    if (String(existingSameId?.status || '').toLowerCase() === 'excluded') {
      const reason = '이미 제외 처리된 같은 후보';
      skipped.push({
        id: row.id,
        reason,
      });
      continue;
    }

    if (
      existingSameId
      && terminalScrapedStatus(existingSameId)
      && !canReopenGeneratedRegularSocialDuplicate(existingSameId, row)
      && !reprocessCollectedAutomatic
    ) {
      const reason = existingSameId.status === 'collected' || existingSameId.is_collected === true
        ? '이미 수집 완료된 같은 후보'
        : `이미 ${existingSameId.status} 처리된 같은 후보`;
      skipped.push({
        id: row.id,
        reason,
      });
      continue;
    }

    if (existingSameId) {
      const reopenGeneratedRegular = canReopenGeneratedRegularSocialDuplicate(existingSameId, row);
      const refreshedRow = await saveCafe24TableRow('scraped_events', {
        ...existingSameId,
        ...row,
        ...(reopenGeneratedRegular || reprocessCollectedAutomatic
          ? { status: 'pending', is_collected: false }
          : {}),
        display_no: existingSameId.display_no ?? row.display_no,
        created_at: existingSameId.created_at || row.created_at,
        updated_at: new Date().toISOString(),
      });
      refreshed.push(refreshedRow);
      scrapedRows = replaceWorkingScrapedRow(scrapedRows, refreshedRow);
      continue;
    }

    const dateExpansion = shouldSkipDateExpansionCandidate(row, scrapedRows);
    if (dateExpansion.skip) {
      skipped.push({
        id: row.id,
        reason: dateExpansionSkipReason(dateExpansion.primary),
        duplicate: dateExpansion.primary ? {
          target: 'scraped_events',
          existingId: dateExpansion.primary.id || null,
          existingTitle: rowTitle(dateExpansion.primary) || null,
          existingDate: scrapedRowDate(dateExpansion.primary) || null,
          existingSourceUrl: rowSourceUrl(dateExpansion.primary, 'scraped_events') || null,
          reason: dateExpansionSkipReason(dateExpansion.primary),
        } : null,
      });
      continue;
    }

    const duplicate = findOperationalDuplicateForScrapedItem(row, eventRows);
    if (duplicate && !canReopenGeneratedRegularSocialDuplicate(
      { status: 'duplicate', structured_data: { _duplicate: duplicate } },
      row,
      duplicate,
    )) {
      const duplicateRow = {
        ...row,
        is_collected: false,
        status: 'duplicate',
        structured_data: {
          ...(row.structured_data || {}),
          _duplicate: duplicate,
        },
      };
      const savedRow = await saveCafe24TableRow('scraped_events', duplicateRow);
      saved.push(savedRow);
      scrapedRows = replaceWorkingScrapedRow(scrapedRows, savedRow);
      skipped.push({
        id: savedRow.id,
        reason: duplicate.reason,
        duplicate,
      });
      continue;
    }

    const savedRow = await saveCafe24TableRow('scraped_events', row);
    saved.push(savedRow);
    scrapedRows = replaceWorkingScrapedRow(scrapedRows, savedRow);
  }

  const newCount = saved.filter((row) => String(row.status || '').toLowerCase() !== 'duplicate').length;
  const duplicateCount = saved.length - newCount;
  return {
    data: [...saved, ...refreshed],
    count: newCount,
    refreshedCount: refreshed.length,
    duplicateCount,
    skipped,
    total: saved.length + refreshed.length,
  };
}

export async function cafe24ScrapedEvents(req, res) {
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method === 'GET') {
    if (!isLocalDevelopmentRequest(req)) await requireAdmin(req);
    const allRows = await loadCafe24TableRows('scraped_events');
    const tab = String(req.query.tab || '').toLowerCase();
    const rawFiltered = filterScrapedRows(allRows, req);
    const visibleRows = tab === 'new' || !tab ? collapseDateExpansionRows(rawFiltered) : rawFiltered;
    const filtered = tab === 'free' ? sortBenefitRows(visibleRows) : sortDescCreatedAt(visibleRows);
    const page = Math.max(1, Number(req.query.page || 1));
    const pageSize = Math.min(Math.max(Number(req.query.pageSize || req.query.limit || 100), 1), 500);
    const data = filtered.slice((page - 1) * pageSize, page * pageSize);

    if (req.query.tab) {
      res.json({ data, total: filtered.length, page, pageSize });
      return;
    }
    res.json(data);
    return;
  }

  if (req.method === 'POST') {
    const isIngestionPost = hasValidIngestionToken(req);
    if (!isIngestionPost) await requireAdmin(req);
    const values = Array.isArray(req.body) ? req.body : [req.body || {}];
    if (isIngestionPost) {
      res.json(await ingestScrapedItems(values));
      return;
    }

    const saved = [];
    for (const value of values) {
      if (requestsCollectedStatus(value) && !hasRegisteredEventLink(value)) {
        res.status(400).json({
          error: '실제 등록 일정 ID 없이 수집 후보를 완료 처리할 수 없습니다. 등록 버튼을 사용해 주세요.',
        });
        return;
      }
      saved.push(await upsertScrapedItem(value));
    }
    res.json(Array.isArray(req.body) ? saved : saved[0]);
    return;
  }

  if (req.method === 'DELETE') {
    const isIngestionDelete = hasValidIngestionToken(req);
    if (!isIngestionDelete) await requireAdmin(req);
    const ids = Array.isArray(req.body?.ids)
      ? req.body.ids.map(String)
      : [req.body?.id].filter(Boolean).map(String);
    const rows = (await loadCafe24TableRows('scraped_events')).filter((row) => ids.includes(String(row.id)));
    const deletedImages = [];
    for (const row of rows) {
      if (await removeLocalUpload(row.poster_url)) deletedImages.push(row.poster_url);
    }
    await deleteCafe24TableRows('scraped_events', rows);
    res.json({ ok: true, deleted: rows.length, deletedIds: rows.map((row) => row.id), deletedImages });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}

function eventDate(eventData) {
  return String(eventData?.start_date || eventData?.date || '').slice(0, 10);
}

function sameEventDate(row, date) {
  if (!date) return false;
  const start = String(row.start_date || row.date || '').slice(0, 10);
  const end = String(row.end_date || row.start_date || row.date || '').slice(0, 10);
  return start === date || row.date === date || (start && end && start <= date && date <= end);
}

async function getOwnerUserId(req) {
  const admins = sortDescCreatedAt(await loadCafe24TableRows('board_admins')).reverse();
  return admins.find((row) => row.user_id)?.user_id || (await getCurrentUser(req))?.id || null;
}

function normalizeImageFields(eventData, fallbackImageUrl) {
  const primary = eventData.image_full || eventData.image || fallbackImageUrl || eventData.image_medium || eventData.image_thumbnail || eventData.image_micro || null;
  return {
    image: eventData.image || eventData.image_full || fallbackImageUrl || eventData.image_medium || eventData.image_thumbnail || eventData.image_micro || primary,
    image_micro: eventData.image_micro || null,
    image_thumbnail: eventData.image_thumbnail || null,
    image_medium: eventData.image_medium || null,
    image_full: eventData.image_full || eventData.image || fallbackImageUrl || null,
    storage_path: eventData.storage_path || null,
  };
}

function pickScrapedEventPatch(value = {}) {
  const patch = {};
  for (const key of ['keyword', 'poster_url', 'extracted_text']) {
    if (Object.prototype.hasOwnProperty.call(value, key)) patch[key] = value[key];
  }
  return patch;
}

function normalizedEventCategory(eventData = {}) {
  const category = String(eventData.category || '').toLowerCase();
  return ['social', 'class', 'event', 'club'].includes(category) ? category : '';
}

function activityFromEventData(eventData = {}) {
  const existing = String(eventData.activity_type || '').toLowerCase();
  if (existing === 'sale') return 'sale';
  if (existing === 'recruit') return 'recruit';
  const category = normalizedEventCategory(eventData);
  if (category === 'social') return 'social';
  if (category === 'class') return 'class';
  if (category === 'event' || category === 'club') return 'event';
  const genre = String(eventData.genre || '');
  if (genre.includes('소셜')) return 'social';
  if (genre.includes('강습')) return 'class';
  return ['social', 'class', 'event'].includes(existing) ? existing : '';
}

function eventTypeFromEventData(eventData = {}) {
  const category = normalizedEventCategory(eventData);
  const activity = activityFromEventData(eventData);
  const genre = String(eventData.genre || '');
  if (activity === 'sale' || genre.includes('판매')) return '판매이벤트';
  if (category === 'social' || activity === 'social' || genre.includes('소셜')) return '소셜';
  if (category === 'class' || activity === 'class' || genre.includes('강습')) return '강습';
  return '파티/행사';
}

function structuredDataFromEventData(eventData = {}) {
  const patch = {};
  const directKeys = [
    'title',
    'date',
    'location',
    'address',
    'venue_id',
    'venue_name',
    'location_link',
    'category',
    'genre',
    'dance_scope',
    'start_date',
    'end_date',
  ];
  for (const key of directKeys) {
    if (Object.prototype.hasOwnProperty.call(eventData, key)) patch[key] = eventData[key];
  }
  if (Object.prototype.hasOwnProperty.call(eventData, 'event_type')) {
    patch.event_type = eventData.event_type;
  } else if (eventData.activity_type || eventData.category || eventData.genre) {
    patch.event_type = eventTypeFromEventData(eventData);
  }
  const activityType = activityFromEventData(eventData);
  if (activityType) patch.activity_type = activityType;
  if (Object.prototype.hasOwnProperty.call(eventData, 'time')) patch.times = eventData.time ? [eventData.time] : [];
  return patch;
}

function scrapedEventPatchFromEventData(eventData = {}) {
  const patch = {};
  if (Object.prototype.hasOwnProperty.call(eventData, 'description')) patch.extracted_text = eventData.description || '';
  const poster = eventData.image_full || eventData.image_medium || eventData.image_thumbnail || eventData.image;
  if (poster !== undefined && poster !== null) patch.poster_url = poster;
  return patch;
}

export function buildCollectedScrapedEventRow({
  scrapedEvent,
  scrapedEventPatch = {},
  structuredData = {},
  registeredEvent,
  now = new Date().toISOString(),
}) {
  return {
    ...scrapedEvent,
    ...scrapedEventPatch,
    is_collected: true,
    status: 'collected',
    registered_event_id: registeredEvent?.id || null,
    registered_at: now,
    structured_data: {
      ...structuredData,
      registered_event_id: registeredEvent?.id || null,
    },
    updated_at: now,
  };
}

const AUTOMATIC_REGISTRATION_SOURCE_RULES = new Map([
  ['kyungsunghall', { activities: new Set(['social']), trustedVenue: '경성홀' }],
  ['swingscandal-cafe', { activities: new Set(['social']), trustedVenue: '사보이볼룸' }],
  ['neo_swing', { activities: new Set(['social', 'class']), trustedVenue: '해피홀' }],
  ['sosyalclub_swing', { activities: new Set(['social']), weekdays: new Set([3]) }],
  ['swingfriends-cafe', { activities: new Set(['social', 'class', 'event', 'sale']), trustedVenue: '스윙타임' }],
  ['swing_friends', { activities: new Set(['social', 'class', 'event', 'sale']), trustedVenue: '스윙타임' }],
  ['swingtown-cafe', { activities: new Set(['social', 'class', 'event']), trustedVenue: '봉천살롱' }],
]);

const AUTOMATIC_ACTIVITY_EVIDENCE_PATTERNS = {
  social: /(?:소셜|social|정모)/i,
  class: /(?:강습|수업|클래스|class|워크숍|워크샵|workshop|레슨|lesson)/i,
  event: /(?:행사|이벤트|event|파티|party|공연|대회)/i,
  recruit: /(?:모집|신청|등록|recruit)/i,
  sale: /(?:판매|정기권|정기\s*할인권|할인권|다회권|\d+\s*회권|패스|pass|티켓|ticket|월정액|멤버십)/i,
};

export function validateAutomaticRegistrationCandidate(scrapedEvent) {
  const structured = scrapedEvent?.structured_data || {};
  const readiness = scrapedEvent?.auto_registration || {};
  const sourceId = String(readiness.source_id || scrapedEvent?.source_id || '').trim();
  const activity = String(structured.activity_type || '').trim().toLowerCase();
  const sourceRule = AUTOMATIC_REGISTRATION_SOURCE_RULES.get(sourceId);
  const title = String(structured.title || '').trim();
  const date = String(structured.date || '').slice(0, 10);
  const venue = String(structured.venue_name || structured.location || '').trim();
  const djs = Array.isArray(structured.djs) ? structured.djs.map((dj) => String(dj || '').trim()).filter(Boolean) : [];
  const reasons = [];

  if (readiness.ready !== true) reasons.push('candidate was not approved by the collector gate');
  if (readiness.ai_verified !== true) reasons.push('candidate was not approved by AI adjudication');
  if (Number(readiness.ai_confidence || 0) < 0.98) reasons.push('AI confidence is below 0.98');
  if (readiness.mode !== 'shadow' && readiness.mode !== 'auto') reasons.push('source is not enrolled');
  if (!sourceRule?.activities?.has(activity)) reasons.push('source/activity is not server-enrolled');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) reasons.push('exact event date is required');
  if (!title || title.length < 4) reasons.push('concrete title is required');
  if (!venue) reasons.push('verified venue is required');
  if (
    sourceRule?.explicitVenue
    && !['source_text', 'poster_text', 'manual_verified'].includes(String(structured.venue_provenance || ''))
  ) {
    reasons.push('source requires a venue explicitly verified from the post');
  }
  if (
    sourceRule?.trustedVenue
    && String(structured.venue_provenance || '') === 'source_registry'
    && normalizeDuplicateText(sourceRule.trustedVenue) !== normalizeDuplicateText(venue)
  ) {
    reasons.push('source registry venue disagrees with configured fixed venue');
  }
  if (sourceRule?.weekdays?.size && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const weekday = new Date(`${date}T12:00:00+09:00`).getDay();
    if (!sourceRule.weekdays.has(weekday)) reasons.push('candidate weekday is not server-enrolled for source');
  }
  if (!scrapedEvent?.poster_url) reasons.push('poster image is required');
  if (activity === 'social' && djs.length === 0) reasons.push('social requires a DJ');
  if (structured.times?.length || structured.time) reasons.push('time fields are not accepted');
  const evidenceQuotes = Array.isArray(structured.ai_evidence_quotes)
    ? structured.ai_evidence_quotes.map((quote) => String(quote || '').trim()).filter(Boolean)
    : [];
  const trustedVenueContext = (
    sourceRule?.trustedVenue
    && String(structured.venue_provenance || '') === 'source_registry'
    && normalizeDuplicateText(sourceRule.trustedVenue) === normalizeDuplicateText(venue)
  )
    ? `검증된 공식 수집원 고정 장소: ${sourceRule.trustedVenue}`
    : '';
  const normalizedSourceText = [
    scrapedEvent?.extracted_text || '',
    title,
    trustedVenueContext,
  ].filter(Boolean).join('\n').normalize('NFKC').replace(/\s+/g, ' ').toLowerCase();
  if (!evidenceQuotes.length || evidenceQuotes.some((quote) => !normalizedSourceText.includes(
    quote.normalize('NFKC').replace(/\s+/g, ' ').toLowerCase(),
  ))) {
    reasons.push('AI evidence is not grounded in the stored source text');
  }
  const normalizedEvidence = evidenceQuotes.join(' ').normalize('NFKC').replace(/\s+/g, ' ').toLowerCase();
  const dateMatch = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateMatch) {
    const [, year, monthPadded, dayPadded] = dateMatch;
    const month = String(Number(monthPadded));
    const day = String(Number(dayPadded));
    const datePatterns = [
      new RegExp(`${year}\\s*[.\\-/년]\\s*0?${month}\\s*[.\\-/월]\\s*0?${day}(?:\\s*일)?`),
      new RegExp(`(?:^|\\D)0?${month}\\s*월\\s*0?${day}\\s*일`),
      new RegExp(`(?:^|\\D)0?${month}\\s*[./-]\\s*0?${day}(?:\\D|$)`),
    ];
    if (!datePatterns.some((pattern) => pattern.test(normalizedEvidence))) {
      reasons.push('AI evidence does not explicitly contain the candidate date');
    }
  }
  const normalizeVenueEvidence = (value) => String(value || '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/쏘셜클럽/g, '소셜클럽')
    .replace(/사보이홀|사보이볼룸\s*\(\s*사당\s*\)|사보이/g, '사보이볼룸');
  const normalizedVenue = normalizeVenueEvidence(venue);
  if (normalizedVenue && !normalizeVenueEvidence(normalizedEvidence).includes(normalizedVenue)) {
    reasons.push('AI evidence does not explicitly contain the candidate venue');
  }
  if (djs.some((dj) => !normalizedEvidence.includes(dj.normalize('NFKC').replace(/\s+/g, ' ').toLowerCase()))) {
    reasons.push('AI evidence does not explicitly contain every candidate DJ');
  }
  const activityPattern = AUTOMATIC_ACTIVITY_EVIDENCE_PATTERNS[activity];
  if (!activityPattern || !activityPattern.test(normalizedEvidence)) {
    reasons.push(`AI evidence does not explicitly identify activity ${activity}`);
  }
  const status = String(scrapedEvent?.status || 'pending').toLowerCase();
  if (status !== 'pending' || scrapedEvent?.is_collected) reasons.push('candidate is not pending');

  return {
    ok: reasons.length === 0,
    reasons,
    sourceId,
    activity,
    eventData: {
      title: activity === 'social' && djs.length
        ? `DJ ${djs.join(', ')} | ${title}`
        : title,
      date,
      start_date: date,
      end_date: date,
      location: venue,
      venue_name: String(structured.venue_name || venue),
      address: String(structured.address || ''),
      venue_id: structured.venue_id || null,
      location_link: String(structured.location_link || ''),
      category: activity === 'social' ? 'social' : activity === 'class' ? 'class' : 'event',
      activity_type: activity,
      event_type: structured.event_type || (activity === 'social' ? '소셜' : '파티/행사'),
      genre: structured.genre || structured.dance_genre || '스윙댄스',
      dance_scope: structured.dance_scope || 'swing',
      description: String(scrapedEvent?.extracted_text || '').slice(0, 6000),
      image: scrapedEvent?.poster_url || null,
      image_full: scrapedEvent?.poster_url || null,
      organizer: structured.organizer || sourceId,
      organizer_name: structured.organizer_name || sourceId,
    },
  };
}

export async function cafe24IngestorRegisterEvent(req, res) {
  const body = req.body || {};
  const automaticRequest = body.automatic === true && hasValidIngestionToken(req);
  if (!automaticRequest) await requireAdmin(req);
  const scrapedEventId = String(body.scrapedEventId || '').trim();

  if (!scrapedEventId) {
    res.status(400).json({ error: 'scrapedEventId가 필요합니다.' });
    return;
  }
  const scrapedRows = await loadCafe24TableRows('scraped_events');
  const scrapedEvent = scrapedRows.find((row) => String(row.id) === scrapedEventId);
  if (!scrapedEvent) {
    res.status(404).json({ error: '수집 후보를 찾을 수 없습니다.' });
    return;
  }
  if (scrapedEvent.status === 'excluded') {
    res.status(400).json({ error: '제외 처리된 후보는 등록할 수 없습니다.' });
    return;
  }
  const automaticValidation = automaticRequest
    ? validateAutomaticRegistrationCandidate(scrapedEvent)
    : null;
  if (automaticValidation && !automaticValidation.ok) {
    res.status(422).json({
      error: '자동등록 안전 기준을 충족하지 못했습니다.',
      reasons: automaticValidation.reasons,
    });
    return;
  }
  const eventData = automaticValidation?.eventData || body.eventData || {};
  const date = eventDate(eventData);
  if (!eventData.title || !date) {
    res.status(400).json({ error: '이벤트 제목과 날짜가 필요합니다.' });
    return;
  }

  const sourceUrl = String(scrapedEvent.source_url || eventData.link1 || '');
  const existingRows = await loadCafe24TableRows('events');
  const existing = existingRows.find((row) => String(row.id) === String(body.existingEventId || ''))
    || existingRows.find((row) => sourceUrl && row.link1 === sourceUrl && sameEventDate(row, date));

  let imageFields = normalizeImageFields(eventData, scrapedEvent.poster_url || eventData.image || eventData.image_full || null);
  const folder = `images/ingestor-events/${safeSegment(scrapedEventId)}`;
  const generatedImageFields = await localizeEventImageVariants(
    imageFields.image_full || imageFields.image || scrapedEvent.poster_url,
    folder,
    'poster',
  );
  if (generatedImageFields) {
    imageFields = {
      ...imageFields,
      ...generatedImageFields,
    };
  }

  const mergedStructuredData = stripVirtualCandidateTaxonomy({
    ...(scrapedEvent.structured_data || {}),
    ...structuredDataFromEventData(eventData),
    ...(body.scrapedStructuredData || {}),
  });
  const scrapedEventPatch = {
    ...scrapedEventPatchFromEventData(eventData),
    ...pickScrapedEventPatch(body.scrapedEventPatch || {}),
  };
  if (body.dryRun === true) {
    res.json({ dryRun: true, wouldInsert: !existing, existing: existing || null });
    return;
  }

  if (existing) {
    const repaired = await saveCafe24TableRow('events', {
      ...existing,
      ...eventData,
      ...imageFields,
      ...(automaticRequest ? { time: null } : {}),
      link1: existing.link1 || sourceUrl,
      updated_at: new Date().toISOString(),
    });
    const replacedRegularSocials = findGeneratedRegularSocialReplacements(
      existingRows,
      { ...repaired, ...eventData },
      scrapedEvent,
    );
    if (replacedRegularSocials.length) {
      await deleteCafe24TableRows('events', replacedRegularSocials);
    }
    await saveCafe24TableRow('scraped_events', buildCollectedScrapedEventRow({
      scrapedEvent,
      scrapedEventPatch,
      structuredData: mergedStructuredData,
      registeredEvent: repaired,
    }));
    res.json({
      skipped: true,
      repaired: true,
      reason: '이미 등록된 이벤트가 있어 이미지/완료 상태만 보정했습니다.',
      event: repaired,
      replaced_regular_socials: replacedRegularSocials.map((event) => ({
        id: event.id,
        title: event.title,
        date: eventDate(event),
      })),
    });
    return;
  }

  const ownerUserId = await getOwnerUserId(req);
  const finalPayload = {
    ...eventData,
    ...imageFields,
    ...benefitFieldsFromStructuredData(mergedStructuredData),
    ...(automaticRequest ? { time: null } : {}),
    id: eventData.id || crypto.randomUUID(),
    date,
    start_date: String(eventData.start_date || date).slice(0, 10),
    end_date: String(eventData.end_date || eventData.start_date || date).slice(0, 10),
    link1: sourceUrl,
    organizer: eventData.organizer || 'Swing Enjoy',
    organizer_name: eventData.organizer_name || '관리자',
    user_id: ownerUserId,
    created_at: eventData.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const inserted = await saveCafe24TableRow('events', finalPayload);
  const replacedRegularSocials = findGeneratedRegularSocialReplacements(existingRows, inserted, scrapedEvent);
  if (replacedRegularSocials.length) {
    await deleteCafe24TableRows('events', replacedRegularSocials);
  }
  await saveCafe24TableRow('scraped_events', buildCollectedScrapedEventRow({
    scrapedEvent,
    scrapedEventPatch,
    structuredData: mergedStructuredData,
    registeredEvent: inserted,
  }));
  res.status(201).json({
    event: inserted,
    owner_user_id: ownerUserId,
    replaced_regular_socials: replacedRegularSocials.map((event) => ({
      id: event.id,
      title: event.title,
      date: eventDate(event),
    })),
  });
}

function eventIdCandidates(eventId) {
  const stripped = String(eventId || '').replace(/^social-/, '').trim();
  const candidates = new Set();
  if (stripped) candidates.add(stripped);
  const numericId = Number(stripped);
  if (Number.isFinite(numericId) && numericId > 10000000) candidates.add(String(numericId - 10000000));
  return [...candidates];
}

async function removeEventUploads(event) {
  return removeEventUploadFiles(event);
}

export async function cafe24DeleteEventFunction(req, res) {
  const ids = eventIdCandidates(req.body?.eventId);
  if (!ids.length) {
    res.status(400).json({ error: 'Event ID is required.' });
    return;
  }

  const rows = await loadCafe24TableRows('events');
  const target = rows.find((row) => ids.includes(String(row.id)));
  if (!target) {
    res.json({ success: true, message: 'Event not found or already deleted.' });
    return;
  }

  const user = await getCurrentUser(req);
  const authorized = canManageEvent(user, target);
  if (!authorized) {
    res.status(403).json({ error: 'Unauthorized.' });
    return;
  }

  const imageCleanup = await removeEventUploads(target);
  await deleteCafe24TableRows('events', [target]);
  res.json({
    success: true,
    deletedImages: imageCleanup.count,
    deletedImageUrls: imageCleanup.urls,
    deletedStoragePath: imageCleanup.storagePath,
    deletedEventId: target.id,
  });
}

export async function cafe24DeleteSocialItem(req, res) {
  const { type, id, password } = req.body || {};
  const table = type === 'schedule' ? 'social_schedules' : 'social_groups';
  const rows = await loadCafe24TableRows(table);
  const target = rows.find((row) => String(row.id) === String(id));
  if (!target) {
    res.json({ success: true, message: 'Item not found or already deleted.' });
    return;
  }

  const user = await getCurrentUser(req);
  const authorized = Boolean(user?.is_admin || userMatchesId(user, target.user_id) || (target.password && password && target.password === password));
  if (!authorized) {
    res.status(403).json({ error: 'Unauthorized.' });
    return;
  }

  if (type === 'group') {
    const schedules = (await loadCafe24TableRows('social_schedules')).filter((row) => String(row.group_id) === String(id));
    await deleteCafe24TableRows('social_schedules', schedules);
  }
  if (target.storage_path) await removeLocalUpload(`/uploads/images/${target.storage_path}`);
  await deleteCafe24TableRows(table, [target]);
  res.json({ success: true });
}

async function requireInvitationAdmin(req) {
  const user = await getCurrentUser(req);
  if (user?.is_admin) return user;
  const adminEmail = process.env.VITE_ADMIN_EMAIL || '';
  const requestEmail = req.headers['x-admin-email'] || req.body?.adminEmail;
  if (adminEmail && requestEmail === adminEmail) return user || { email: requestEmail, is_admin: true };
  const error = new Error('권한이 없습니다');
  error.statusCode = 403;
  throw error;
}

export async function cafe24Invitations(req, res) {
  if (req.method === 'GET') {
    await requireInvitationAdmin(req);
    const invitations = sortDescCreatedAt(await loadCafe24TableRows('invitations'));
    res.json({ invitations });
    return;
  }

  if (req.method === 'POST') {
    await requireInvitationAdmin(req);
    const email = String(req.body?.email || '').trim();
    if (!email) {
      res.status(400).json({ error: '이메일이 필요합니다' });
      return;
    }
    const token = crypto.randomBytes(18).toString('base64url');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const invitation = await saveCafe24TableRow('invitations', {
      id: crypto.randomUUID(),
      email,
      invited_by: req.body?.adminEmail || req.headers['x-admin-email'] || null,
      token,
      expires_at: expiresAt,
      used: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    const origin = req.headers.origin || `${req.protocol}://${req.get('host')}`;
    res.json({ success: true, invitation, inviteUrl: `${origin}/invite/${token}` });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}

export async function cafe24ValidateInvitation(req, res) {
  const token = String(req.body?.token || '').trim();
  if (!token) {
    res.status(400).json({ error: '초대 코드가 필요합니다' });
    return;
  }
  const invitation = (await loadCafe24TableRows('invitations')).find((row) => row.token === token);
  if (!invitation) {
    res.status(404).json({ error: '유효하지 않은 초대 코드입니다' });
    return;
  }
  if (invitation.used) {
    res.status(400).json({ error: '이미 사용된 초대 코드입니다' });
    return;
  }
  if (new Date(invitation.expires_at) < new Date()) {
    res.status(400).json({ error: '만료된 초대 코드입니다' });
    return;
  }
  await saveCafe24TableRow('invitation_logs', {
    id: crypto.randomUUID(),
    invitation_token: token,
    email: invitation.email,
    action: 'validate',
    status: 'success',
    user_agent: req.headers['user-agent'] || 'unknown',
    ip_address: req.ip || req.headers['x-forwarded-for'] || 'unknown',
    created_at: new Date().toISOString(),
  });
  res.json({ valid: true, email: invitation.email });
}

export async function cafe24DeleteInvitation(req, res) {
  await requireInvitationAdmin(req);
  const invitationId = String(req.body?.invitationId || req.params.id || '').trim();
  const rows = await loadCafe24TableRows('invitations');
  const target = rows.find((row) => String(row.id) === invitationId);
  if (!target) {
    res.status(404).json({ error: '초대를 찾을 수 없습니다' });
    return;
  }
  await deleteCafe24TableRows('invitations', [target]);
  res.json({ success: true });
}

export async function cafe24BillboardManifest(req, res) {
  const userId = String(req.query.userId || '').trim();
  if (!userId) {
    res.status(400).json({ error: 'userId가 필요합니다' });
    return;
  }
  const user = (await loadCafe24TableRows('billboard_users')).find((row) => String(row.id) === userId);
  if (!user) {
    res.status(404).json({ error: '빌보드 사용자를 찾을 수 없습니다' });
    return;
  }
  const name = user.name || user.nickname || '빌보드';
  res.type('application/manifest+json').json({
    name: `${name} 빌보드`,
    short_name: name,
    description: `${name} 이벤트 빌보드 디스플레이`,
    start_url: `/billboard/${userId}`,
    display: 'fullscreen',
    background_color: '#000000',
    theme_color: '#000000',
    orientation: 'portrait',
    scope: `/billboard/${userId}`,
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
    ],
  });
}

async function discoverImageUrl(targetUrl) {
  const response = await fetch(targetUrl, {
    headers: {
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'User-Agent': 'Mozilla/5.0 (compatible; SwingEnjoyCafe24/1.0)',
    },
  });
  if (!response.ok) return '';
  const html = await response.text();
  const match = html.match(/<meta\s+[^>]*(?:property|name)=["'](?:og:image|twitter:image)["'][^>]*content=["']([^"']+)["'][^>]*>/i)
    || html.match(/<meta\s+[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["'](?:og:image|twitter:image)["'][^>]*>/i);
  if (!match?.[1]) return '';
  return new URL(match[1].replace(/&amp;/g, '&'), targetUrl).toString();
}

function logoFromUrl(url, sourceUrl = '') {
  return {
    sourceUrl: sourceUrl || url,
    micro: url,
    thumbnail: url,
    medium: url,
    full: url,
    storagePath: url.startsWith('/uploads/images/') ? url.replace(/^\/uploads\/images\//, '').split('/').slice(0, -1).join('/') : undefined,
    updatedAt: new Date().toISOString(),
  };
}

export async function cafe24OneDayRecruitLogo(req, res) {
  await requireAdmin(req);
  const body = req.body || {};
  const action = body.action;
  const linkId = String(body.linkId || '').trim();
  if (!linkId) {
    res.status(400).json({ error: '유효하지 않은 원데이 링크 ID입니다.' });
    return;
  }

  const links = await loadCafe24TableRows('swing_oneday_recruit_links');
  const link = links.find((row) => String(row.id) === linkId);
  if (!link) {
    res.status(404).json({ error: '원데이 링크를 찾을 수 없습니다.' });
    return;
  }

  if (action === 'deleteLogo') {
    await removeLocalUpload(link.logo_full || link.logo_medium || link.logo_thumbnail || link.logo_micro);
    const saved = await saveCafe24TableRow('swing_oneday_recruit_links', {
      ...link,
      logo_source_url: null,
      logo_micro: null,
      logo_thumbnail: null,
      logo_medium: null,
      logo_full: null,
      logo_storage_path: null,
      logo_updated_at: null,
    });
    res.json({ link: saved, logo: null });
    return;
  }

  let sourceUrl = '';
  if (action === 'uploadLogo') {
    if (!body.imageBase64) {
      res.status(400).json({ error: '이미지 데이터가 필요합니다.' });
      return;
    }
    const { buffer } = decodeBase64Payload(body.imageBase64);
    const filename = `${safeSegment(body.fileName || 'logo')}-${Date.now()}${extensionFrom(body.fileName, body.contentType)}`;
    sourceUrl = await writeUploadFile(`images/oneday-recruit-logos/${safeSegment(linkId)}`, filename, buffer);
  } else if (action === 'discoverAndSave') {
    const discovered = await discoverImageUrl(String(body.linkUrl || link.url || '')).catch(() => '');
    sourceUrl = discovered
      ? await localizeImageUrl(discovered, `images/oneday-recruit-logos/${safeSegment(linkId)}`, 'logo')
      : '';
  }

  if (!sourceUrl) {
    res.status(400).json({ error: '저장할 로고 이미지를 찾지 못했습니다.' });
    return;
  }
  const logo = logoFromUrl(sourceUrl, body.linkUrl || link.url || sourceUrl);
  const saved = await saveCafe24TableRow('swing_oneday_recruit_links', {
    ...link,
    logo_source_url: logo.sourceUrl,
    logo_micro: logo.micro,
    logo_thumbnail: logo.thumbnail,
    logo_medium: logo.medium,
    logo_full: logo.full,
    logo_storage_path: logo.storagePath || null,
    logo_updated_at: logo.updatedAt,
  });
  res.json({ link: saved, logo, sourceUrl: logo.sourceUrl });
}

export async function cafe24UnavailableFunction(req, res) {
  res.status(404).json({
    error: 'Cafe24 migration mode: this legacy function is not enabled.',
    function: req.params?.name || null,
  });
}
