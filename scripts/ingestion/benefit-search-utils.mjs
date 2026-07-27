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

export function isStaleBenefitSourcePost({
  publishedAt = '',
  today = '',
  evergreen = false,
  maxAgeDays = 180,
} = {}) {
  if (evergreen || !publishedAt || !today) return false;
  const published = new Date(publishedAt);
  const cutoff = new Date(`${today}T00:00:00+09:00`);
  if (Number.isNaN(published.getTime()) || Number.isNaN(cutoff.getTime())) return false;
  return cutoff.getTime() - published.getTime() > maxAgeDays * 86_400_000;
}
