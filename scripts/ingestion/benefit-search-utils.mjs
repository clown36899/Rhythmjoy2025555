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

export function benefitSearchMatches(candidate = {}, benefitKind = '') {
  const sd = candidate.structured_data || {};
  if (sd.benefit_eligible !== true) return false;
  if (benefitKind === 'sale_event') {
    return sd.activity_type === 'sale';
  }
  return sd.benefit_kind === benefitKind;
}
