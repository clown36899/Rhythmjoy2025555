const instagramPostPattern = /^https:\/\/(?:www\.)?instagram\.com\/(?:[^/]+\/)?(?:p|reel)\/[A-Za-z0-9_-]+\/?$/i;

function unwrapSearchUrl(value = '', baseUrl = 'https://www.google.com/') {
  try {
    const parsed = new URL(value, baseUrl);
    if (/google\./i.test(parsed.hostname) && parsed.pathname === '/url') {
      return parsed.searchParams.get('q') || parsed.searchParams.get('url') || '';
    }
    return parsed.href;
  } catch {
    return '';
  }
}

export function buildBenefitSearchUrls(query = '', configuredUrl = '') {
  const normalizedQuery = String(query || '').trim();
  const relevanceUrl = configuredUrl || `https://www.google.com/search?q=${encodeURIComponent(normalizedQuery)}`;
  try {
    const parsed = new URL(relevanceUrl);
    if (!/^(?:www\.)?google\./i.test(parsed.hostname)) {
      return [relevanceUrl];
    }
    if (normalizedQuery) parsed.searchParams.set('q', normalizedQuery);
    parsed.searchParams.set('hl', 'ko');
    parsed.searchParams.set('gl', 'kr');
    parsed.searchParams.delete('tbs');
    const relevance = parsed.toString();
    const latest = new URL(relevance);
    latest.searchParams.set('tbs', 'sbd:1');
    return [latest.toString(), relevance];
  } catch {
    return [relevanceUrl];
  }
}

export function mergeBenefitSearchTargets(...batches) {
  const uniqueInOrder = (key) => {
    const seen = new Set();
    const values = [];
    const longestBatch = Math.max(0, ...batches.map((batch) => batch?.[key]?.length || 0));
    for (let index = 0; index < longestBatch; index += 1) {
      for (const batch of batches) {
        const value = batch?.[key]?.[index];
        if (!value || seen.has(value)) continue;
        seen.add(value);
        values.push(value);
      }
    }
    return values;
  };
  return {
    postUrls: uniqueInOrder('postUrls'),
    profileUrls: uniqueInOrder('profileUrls'),
    documentUrls: uniqueInOrder('documentUrls'),
  };
}

export function normalizeInstagramPostUrl(value = '', baseUrl) {
  const unwrapped = unwrapSearchUrl(value, baseUrl);
  if (!unwrapped) return '';
  try {
    const parsed = new URL(unwrapped);
    parsed.search = '';
    parsed.hash = '';
    const normalized = `https://www.instagram.com${parsed.pathname.endsWith('/') ? parsed.pathname : `${parsed.pathname}/`}`;
    return instagramPostPattern.test(normalized) ? normalized : '';
  } catch {
    return '';
  }
}

export function extractInstagramPostUrls(hrefs = [], baseUrl) {
  return [...new Set(hrefs.map((href) => normalizeInstagramPostUrl(href, baseUrl)).filter(Boolean))];
}

export function normalizeInstagramProfileUrl(value = '', baseUrl) {
  const unwrapped = unwrapSearchUrl(value, baseUrl);
  if (!unwrapped) return '';
  try {
    const parsed = new URL(unwrapped);
    if (!/(^|\.)instagram\.com$/i.test(parsed.hostname)) return '';
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts.length !== 1 || /^(p|reel|explore|accounts|stories)$/i.test(parts[0])) return '';
    return `https://www.instagram.com/${parts[0]}/`;
  } catch {
    return '';
  }
}

export function extractInstagramProfileUrls(hrefs = [], baseUrl) {
  return [...new Set(hrefs.map((href) => normalizeInstagramProfileUrl(href, baseUrl)).filter(Boolean))];
}

export function normalizeBenefitDocumentUrl(value = '', baseUrl) {
  const unwrapped = unwrapSearchUrl(value, baseUrl);
  if (!unwrapped) return '';
  try {
    const parsed = new URL(unwrapped);
    const host = parsed.hostname.replace(/^www\./i, '').toLowerCase();
    parsed.hash = '';

    if (host === 'm.cafe.daum.net' || host === 'cafe.daum.net') {
      if (!/^\/[^/]+\/[A-Za-z0-9]+\/\d+\/?$/i.test(parsed.pathname)) return '';
      return `https://m.cafe.daum.net${parsed.pathname.replace(/\/$/, '')}`;
    }
    if (host === 'cafe.naver.com') {
      if (!/^\/f-e\/cafes\/\d+\/articles\/\d+\/?$/i.test(parsed.pathname)) return '';
      return `https://cafe.naver.com${parsed.pathname.replace(/\/$/, '')}`;
    }
    if (host === 'm.blog.naver.com' || host === 'blog.naver.com') {
      if (!/^\/[^/]+\/\d+\/?$/i.test(parsed.pathname)) return '';
      return `https://m.blog.naver.com${parsed.pathname.replace(/\/$/, '')}`;
    }
    if (host === 'facebook.com' || host === 'm.facebook.com') {
      if (!/\/(?:posts\/|permalink\.php|story\.php)/i.test(`${parsed.pathname}${parsed.search}`)) return '';
      return `https://www.facebook.com${parsed.pathname}${parsed.search}`;
    }
    return '';
  } catch {
    return '';
  }
}

export function extractBenefitDocumentUrls(hrefs = [], baseUrl) {
  return [...new Set(hrefs.map((href) => normalizeBenefitDocumentUrl(href, baseUrl)).filter(Boolean))];
}

export function benefitSearchMatches(candidate = {}, benefitKind = '') {
  const sd = candidate.structured_data || {};
  if (sd.benefit_eligible !== true) return false;
  if (benefitKind === 'sale_event') {
    return sd.activity_type === 'sale';
  }
  return sd.benefit_kind === benefitKind;
}

export function expectedInstagramHandleForSource(source = {}) {
  if (source.type === 'benefit_search') return '';
  try {
    const parsed = new URL(source.url || '');
    if (!/(^|\.)instagram\.com$/i.test(parsed.hostname)) return '';
    const [handle = ''] = parsed.pathname.split('/').filter(Boolean);
    return /^(p|reel|explore|accounts|stories|search)$/i.test(handle) ? '' : handle.toLowerCase();
  } catch {
    return '';
  }
}

export function isVerifiedInstagramFallbackProfile({
  expectedHandle = '',
  title = '',
  bodyText = '',
  url = '',
} = {}) {
  const expected = String(expectedHandle || '').trim().replace(/^@/, '').toLowerCase();
  if (!expected) return false;

  try {
    const parsed = new URL(url || '');
    const [pathHandle = ''] = parsed.pathname.split('/').filter(Boolean);
    if (!/(^|\.)imginn\.com$/i.test(parsed.hostname) || pathHandle.toLowerCase() !== expected) {
      return false;
    }
  } catch {
    return false;
  }

  const pageText = `${title}\n${bodyText}`.normalize('NFKC').toLowerCase();
  if (/content\s+not\s+found|page\s+not\s+found|profile\s+not\s+found|user\s+not\s+found|doesn['’]?t\s+exist|cloudflare|attention\s+required|captcha|blocked/i.test(pageText)) {
    return false;
  }
  return pageText.includes(`@${expected}`) || pageText.includes(expected);
}

export function isDirectInstagramPostMediaUrl(value = '') {
  const normalized = String(value || '').replace(/&amp;/gi, '&');
  return /(?:[?&])ig_cache_key=[^&]+/i.test(normalized)
    || /(?:[?&])_nc_sid=58cdad(?:&|$)/i.test(normalized);
}

export function isNaverScheduleOverviewText(value = '') {
  const normalized = String(value || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
  return /(?:20\d{2}\s*년\s*)?\d{1,2}\s*월[^\n]{0,40}(?:월간\s*)?(?:전체\s*)?(?:일정|일정표|스케줄|운영\s*안내)/i.test(normalized)
    || /(?:월간\s*)?(?:일정|일정표|스케줄)[^\n]{0,30}\d{1,2}\s*월/i.test(normalized);
}

export function isNaverAdministrativeNoticeText(value = '') {
  const normalized = String(value || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
  if (isNaverScheduleOverviewText(normalized)) return false;
  return /\[?운영진공지\]?|윤리위원회|강사\s*선정\s*발표|강사\s*모집\s*공고|강습\s*신청\s*및\s*입금\s*방법/i.test(normalized);
}

export function naverScheduleOverviewPriority(value = '', today = '') {
  const normalized = String(value || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
  if (!isNaverScheduleOverviewText(normalized)) return 4;
  const match = String(today || '').match(/^(20\d{2})-(\d{2})-\d{2}$/);
  if (!match) return 3;
  const [, year, monthText] = match;
  const month = Number(monthText);
  const currentYear = new RegExp(`${year}\\s*년`).test(normalized);
  const currentMonth = new RegExp(`(?:^|[^0-9])${month}\\s*월`).test(normalized);
  const mixedActivityCalendar = !/정규\s*강습\s*신청/i.test(normalized);
  if (currentYear && currentMonth && mixedActivityCalendar) return 0;
  if (currentYear && currentMonth) return 1;
  if (currentMonth && mixedActivityCalendar) return 2;
  return 3;
}

function normalizeExpectedInstagramHandles(...values) {
  return [...new Set(values.flatMap((value) => (
    Array.isArray(value) ? value : [value]
  )).map((value) => String(value || '').trim().replace(/^@/, '').toLowerCase()).filter(Boolean))];
}

export function instagramPostMatchesExpectedHandle(url = '', expectedHandle = '') {
  const expected = normalizeExpectedInstagramHandles(expectedHandle);
  if (!expected.length) return true;
  try {
    const parsed = new URL(url, 'https://www.instagram.com/');
    if (!/(^|\.)instagram\.com$/i.test(parsed.hostname)) return false;
    const segments = parsed.pathname.split('/').filter(Boolean).map((segment) => segment.toLowerCase());
    if (/^(p|reel)$/.test(segments[0] || '') && segments[1]) return true;
    if (segments.length >= 3 && /^(p|reel)$/.test(segments[1])) return expected.includes(segments[0]);
    return false;
  } catch {
    return false;
  }
}

export function instagramAuthorMatches({
  expectedHandle = '',
  expectedHandles = [],
  ogTitle = '',
  metaDescription = '',
  profileHrefs = [],
} = {}) {
  const expected = normalizeExpectedInstagramHandles(expectedHandle, expectedHandles);
  if (!expected.length) return true;

  const linkedHandles = [...new Set(profileHrefs.flatMap((href) => {
    try {
      const parsed = new URL(href, 'https://www.instagram.com/');
      if (!/(^|\.)instagram\.com$/i.test(parsed.hostname)) return [];
      const segments = parsed.pathname.split('/').filter(Boolean);
      if (segments.length !== 1 || /^(p|reel|explore|accounts|stories|search)$/i.test(segments[0])) return [];
      return [segments[0].toLowerCase()];
    } catch {
      return [];
    }
  }))];
  if (expected.some((handle) => linkedHandles.includes(handle))) return true;
  if (linkedHandles.length > 0) return false;

  const metadata = `${ogTitle}\n${metaDescription}`.normalize('NFKC').toLowerCase();
  return expected.some((handle) => metadata.includes(`@${handle}`) || metadata.includes(handle));
}

export function isStaleBenefitSourcePost({
  publishedAt = '',
  today = '',
  maxAgeDays = 180,
} = {}) {
  if (!publishedAt || !today) return false;
  const published = new Date(publishedAt);
  const cutoff = new Date(`${today}T00:00:00+09:00`);
  if (Number.isNaN(published.getTime()) || Number.isNaN(cutoff.getTime())) return false;
  return cutoff.getTime() - published.getTime() > maxAgeDays * 86_400_000;
}
