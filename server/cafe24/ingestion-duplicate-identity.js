import crypto from 'node:crypto';

export function normalizeIngestionIdentityText(value = '') {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/seoul/g, '서울')
    .replace(/dj\s*/gi, '')
    .replace(/[^\p{L}\p{N}가-힣]/gu, '');
}

export function ingestionIdentityTextSimilarity(a = '', b = '') {
  const left = normalizeIngestionIdentityText(a);
  const right = normalizeIngestionIdentityText(b);
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

export function looksLikeGenericIngestionIdentityTitle(value = '') {
  const normalized = normalizeIngestionIdentityText(value);
  if (!normalized) return true;
  if (normalized.length <= 6 && /강습|소셜|행사|파티|안내/.test(normalized)) return true;
  if (/^(?:[가-힣a-z0-9]+)?(?:강습|소셜|행사|파티|이벤트)?안내$/.test(normalized)) return true;
  if (/^(?:강습|소셜|행사|파티|이벤트|공지)$/.test(normalized)) return true;
  return false;
}

function activityGroup(value = '') {
  const activity = String(value || '').trim().toLowerCase();
  if (['class', 'club', 'recruit'].includes(activity)) return 'class';
  if (['social', 'event', 'sale'].includes(activity)) return activity;
  if (/강습|수업|레슨|클래스|class|lesson/.test(activity)) return 'class';
  if (/소셜|social/.test(activity)) return 'social';
  if (/행사|파티|event|party/.test(activity)) return 'event';
  return '';
}

function rowStructuredData(row = {}) {
  if (row?.structured_data && typeof row.structured_data === 'object') return row.structured_data;
  if (row?.raw?.structured_data && typeof row.raw.structured_data === 'object') return row.raw.structured_data;
  if (typeof row?.raw_json === 'string') {
    try {
      return JSON.parse(row.raw_json)?.structured_data || {};
    } catch {
      return {};
    }
  }
  return {};
}

export function ingestionIdentityTitle(row = {}) {
  const structuredData = rowStructuredData(row);
  return String(row?.title || structuredData.title || '').trim();
}

export function ingestionIdentityActivity(row = {}) {
  const structuredData = rowStructuredData(row);
  return activityGroup(
    row?.activity_type
    || row?.category
    || structuredData.activity_type
    || structuredData.category
    || structuredData.event_type,
  );
}

export function ingestionIdentityVenue(row = {}) {
  const structuredData = rowStructuredData(row);
  return String(
    row?.venue_name
    || row?.location
    || structuredData.venue_name
    || structuredData.location
    || '',
  ).trim();
}

function ingestionIdentityDjs(row = {}) {
  const structuredData = rowStructuredData(row);
  const values = [
    ...(Array.isArray(row?.djs) ? row.djs : []),
    ...(Array.isArray(structuredData.djs) ? structuredData.djs : []),
    row?.dj_name,
    structuredData.dj_name,
  ].filter(Boolean);
  return [...new Set(values
    .map(normalizeIngestionIdentityText)
    .filter((value) => value && !['미정', '없음', 'unknown', 'tbd'].includes(value)))]
    .sort((left, right) => left.localeCompare(right, 'ko'));
}

function ingestionIdentityTimes(row = {}) {
  const structuredData = rowStructuredData(row);
  return [...new Set([
    ...(Array.isArray(row?.times) ? row.times : []),
    ...(Array.isArray(structuredData.times) ? structuredData.times : []),
    row?.time,
    structuredData.time,
  ].filter(Boolean).map((value) => String(value).trim()).filter(Boolean))].sort();
}

function ingestionIdentityEvidence(row = {}) {
  const structuredData = rowStructuredData(row);
  return [
    ingestionIdentityTitle(row),
    row?.description,
    row?.content,
    row?.extracted_text,
    structuredData.description,
    structuredData.note,
  ].filter(Boolean).join('\n');
}

export function ingestionTitleIdentityMatches(leftTitle = '', rightTitle = '', {
  allowGeneric = false,
  minimumDistinctiveLength = 7,
} = {}) {
  const left = normalizeIngestionIdentityText(leftTitle);
  const right = normalizeIngestionIdentityText(rightTitle);
  if (!left || !right) return false;
  const shortestLength = Math.min(left.length, right.length);
  const genericTitlePair = looksLikeGenericIngestionIdentityTitle(leftTitle)
    || looksLikeGenericIngestionIdentityTitle(rightTitle);
  if (!allowGeneric && genericTitlePair) return false;
  if (left === right) {
    return shortestLength >= (allowGeneric ? minimumDistinctiveLength : 4);
  }
  if (shortestLength < minimumDistinctiveLength) return false;
  if (left.includes(right) || right.includes(left)) return true;
  return ingestionIdentityTextSimilarity(left, right) >= 0.92;
}

export function ingestionRowsContentCompatible(existing = {}, incoming = {}) {
  const existingActivity = ingestionIdentityActivity(existing);
  const incomingActivity = ingestionIdentityActivity(incoming);
  if (existingActivity && incomingActivity && existingActivity !== incomingActivity) return false;

  const existingVenue = normalizeIngestionIdentityText(ingestionIdentityVenue(existing));
  const incomingVenue = normalizeIngestionIdentityText(ingestionIdentityVenue(incoming));
  if (
    existingVenue
    && incomingVenue
    && !existingVenue.includes(incomingVenue)
    && !incomingVenue.includes(existingVenue)
    && ingestionIdentityTextSimilarity(existingVenue, incomingVenue) < 0.7
  ) return false;

  const existingTimes = ingestionIdentityTimes(existing);
  const incomingTimes = ingestionIdentityTimes(incoming);
  if (
    existingTimes.length
    && incomingTimes.length
    && !existingTimes.some((time) => incomingTimes.includes(time))
  ) return false;

  const existingDjs = ingestionIdentityDjs(existing);
  const incomingDjs = ingestionIdentityDjs(incoming);
  if (
    existingActivity === 'social'
    && incomingActivity === 'social'
    && existingDjs.length
    && incomingDjs.length
    && (
      existingDjs.length !== incomingDjs.length
      || existingDjs.some((dj, index) => dj !== incomingDjs[index])
    )
  ) return false;

  const existingTitle = ingestionIdentityTitle(existing);
  const incomingTitle = ingestionIdentityTitle(incoming);
  if (ingestionTitleIdentityMatches(existingTitle, incomingTitle)) return true;

  const genericTitlePair = looksLikeGenericIngestionIdentityTitle(existingTitle)
    || looksLikeGenericIngestionIdentityTitle(incomingTitle);
  if (genericTitlePair) {
    const existingEvidence = normalizeIngestionIdentityText(ingestionIdentityEvidence(existing));
    const incomingEvidence = normalizeIngestionIdentityText(ingestionIdentityEvidence(incoming));
    if (
      Math.min(existingEvidence.length, incomingEvidence.length) >= 12
      && ingestionIdentityTextSimilarity(existingEvidence, incomingEvidence) >= 0.94
    ) return true;
  }

  if (existingActivity === 'social' && incomingActivity === 'social') {
    return Boolean(
      existingVenue
      && incomingVenue
      && (existingVenue.includes(incomingVenue) || incomingVenue.includes(existingVenue))
      && existingDjs.length
      && existingDjs.length === incomingDjs.length
      && existingDjs.every((dj, index) => dj === incomingDjs[index]),
    );
  }

  return false;
}

export function buildIngestionContentCollisionId(candidate = {}, {
  sourceUrl = '',
  date = '',
} = {}) {
  const structuredData = rowStructuredData(candidate);
  const discriminator = [
    normalizeIngestionIdentityText(ingestionIdentityTitle(candidate)),
    ingestionIdentityActivity(candidate),
    normalizeIngestionIdentityText(ingestionIdentityVenue(candidate)),
    ingestionIdentityDjs(candidate).join(','),
    (Array.isArray(structuredData.times) ? structuredData.times : [structuredData.time || candidate.time])
      .filter(Boolean)
      .map(normalizeIngestionIdentityText)
      .sort()
      .join(','),
    normalizeIngestionIdentityText(ingestionIdentityEvidence(candidate)).slice(0, 2000),
  ].join('|');
  return crypto.createHash('sha256')
    .update(`${String(sourceUrl || candidate.source_url || '').trim()}|${String(date || structuredData.date || candidate.event_date || candidate.date || '').slice(0, 10)}|${discriminator}`)
    .digest('hex')
    .slice(0, 16);
}
