const instagramPostPattern = /^https:\/\/(?:www\.)?instagram\.com\/(?:[^/]+\/)?(?:p|reel)\/[A-Za-z0-9_-]+\/?$/i;

export function classifyInstagramProfilePage({
  url = '',
  title = '',
  bodyText = '',
  linkCount = 0,
} = {}) {
  if (Number(linkCount) > 0) return 'content';

  const pageText = `${title}\n${bodyText}\n${url}`.normalize('NFKC');
  if (/sorry,?\s+this\s+page\s+isn['’]?t\s+available|page\s+isn['’]?t\s+available|페이지를\s*사용할\s*수\s*없습니다|링크가\s*잘못되었거나\s*페이지가\s*삭제/i.test(pageText)) {
    return 'source_unavailable';
  }
  if (/no\s+posts\s+yet|아직\s*게시물|게시물\s*없음/i.test(pageText)) {
    return 'no_content';
  }
  if (
    /\/challenge\/|\/checkpoint\//i.test(url)
    || /temporarily\s+blocked|try\s+again\s+later|please\s+wait\s+(?:a\s+)?few\s+minutes|we\s+restrict\s+certain\s+activity|automated\s+behavio(?:u)?r|privacy\s+checks|비정상적인\s*활동|잠시\s*후\s*다시\s*시도/i.test(pageText)
  ) {
    return 'global_block';
  }
  if (
    /\/accounts\/login/i.test(url)
    || /log\s*in|sign\s*up|login\s*to\s*instagram|로그인|가입하기/i.test(pageText)
  ) {
    return 'login_wall';
  }
  return 'post_list_unavailable';
}

export function shouldOpenInstagramCircuit(reason = '') {
  return /^instagram global access blocked\b/i.test(String(reason || '').trim());
}

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

export function naverScheduleOverviewPriority(value = '', today = '', { allowedActivityTypes = [] } = {}) {
  const normalized = String(value || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
  const classOnly = allowedActivityTypes.length === 1 && allowedActivityTypes[0] === 'class';
  if (classOnly && /강습|수업|클래스|살사|바차타|린디|발보아/.test(normalized)
    && /개강|모집|시작/.test(normalized) && /\d{1,2}\s*(?:월|[./])\s*\d{1,2}/.test(normalized)
    && !/발표회|수료식|엠티|\bMT\b/i.test(normalized)) return 0;
  if (!isNaverScheduleOverviewText(normalized)) return 4;
  // Class-only boards need individual start dates before mixed monthly notices.
  if (allowedActivityTypes.length === 1 && allowedActivityTypes[0] === 'class') return 5;
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

// The existing profile ordering must read icon labels as well as legacy text.
// Pinned posts remain available after recent posts for monthly schedules.
export function readInstagramProfileDocument() {
    const links = [...document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]')]
      .map((a, index) => ({
        href: a.href ? a.href.split('?')[0] : '',
        pinned: /고정|pinned/i.test([a.textContent || '', ...Array.from(a.querySelectorAll('[aria-label], [title], img[alt]'), node => [node.getAttribute('aria-label'), node.getAttribute('title'), node.getAttribute('alt')].filter(Boolean).join(' '))].join(' ')),
        index,
      }))
      .filter((item) => item.href)
      .sort((a, b) => {
        const aPinned = a.pinned ? 1 : 0;
        const bPinned = b.pinned ? 1 : 0;
        return aPinned - bPinned || a.index - b.index;
      });
    const seen = new Set();
    const dedupedLinks = [];
    for (const item of links) {
      if (seen.has(item.href)) continue;
      seen.add(item.href);
      dedupedLinks.push(item.href);
    }
    const bodyText = (document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 3000);
    const title = document.title || '';
    const url = window.location.href;
    return { links: dedupedLinks.slice(0, 48), bodyText, title, url };
}

// Read each rendered carousel page through its public Next button. This owns only
// discovery; the existing candidate validator and publication policy still apply.
export async function readInstagramCarouselDocument(page, { maxSlides = 8, budgetMs = 10000, readinessMs = 8000, expectedUrl = page.url() } = {}) {
  const originalPath = new URL(page.url()).pathname;
  const requestedCode = new URL(expectedUrl).pathname.match(/\/(?:p|reel)\/([^/]+)/)?.[1];
  const actualCode = originalPath.match(/\/(?:p|reel)\/([^/]+)/)?.[1];
  if (requestedCode && requestedCode !== actualCode && !/\/accounts\/login|\/challenge\/|\/checkpoint\//i.test(page.url())) {
    throw new Error(`Instagram post URL mismatch: requested=${expectedUrl} final=${page.url()}`);
  }
  const readPost = async () => {
    const readyDeadline = Date.now() + readinessMs;
    for (;;) {
      const data = await page.evaluate(readInstagramPostDocument);
      const state = classifyInstagramProfilePage({ url: page.url(), bodyText: data.accessDialogText || '' });
      if (state === 'login_wall') throw new Error(`instagram post login required: requested=${expectedUrl} final=${page.url()}`);
      if (state === 'global_block') throw new Error('instagram global access blocked');
      if (state === 'source_unavailable') throw new Error('instagram source unavailable');
      // Header/footer rendering is not a loaded post and must not complete it.
      if (data.articleText || (data.metaDescription && data.images?.some(image => image.w >= 300 && image.h >= 300))) return data;
      if (Date.now() >= readyDeadline) throw new Error(`Instagram post content not ready: requested=${expectedUrl} final=${page.url()}`);
      await page.waitForTimeout(250);
    }
  };
  const first = await readPost();
  const images = new Map(first.images.map(image => [image.src, image]));
  const texts = new Set([first.articleText].filter(Boolean));
  const deadline = Date.now() + budgetMs;
  let carouselError = '';
  for (let slide = 1; slide < maxSlides && Date.now() < deadline; slide += 1) {
    const next = page.getByRole('button', { name: /^(다음|Next)$/ });
    if (await next.count() !== 1 || !await next.isVisible()) break;
    try {
      await next.click({ timeout: Math.min(1500, Math.max(1, deadline - Date.now())) });
    } catch {
      await readPost(); // A newly shown access wall must stop the source immediately.
      // Preserve already read evidence and report incompleteness; never force
      // through login overlays or mark this post fully scanned.
      carouselError = 'carousel Next control unavailable';
      break;
    }
    await page.waitForTimeout(250);
    if (new URL(page.url()).pathname !== originalPath) throw new Error('Instagram carousel left the source post');
    const current = await readPost();
    for (const image of current.images) if (image.src) images.set(image.src, image);
    if (current.articleText) texts.add(current.articleText);
  }
  const remainingNext = page.getByRole('button', { name: /^(다음|Next)$/ });
  const carouselIncomplete = Boolean(carouselError) || (await remainingNext.count() === 1 && await remainingNext.isVisible());
  return { ...first, images: [...images.values()], articleText: [...texts].join('\n'), carouselIncomplete, carouselError };
}

// Runs inside the page; keep the legacy article layout and current unwrapped layout.
export function readInstagramPostDocument() {
    const accessDialogText = [...document.querySelectorAll('[role="dialog"]')]
      .filter((node) => !node.hidden && node.getAttribute('aria-hidden') !== 'true'
        && getComputedStyle(node).display !== 'none' && getComputedStyle(node).visibility !== 'hidden')
      .map((node) => node.textContent || '')
      // A login link in the ordinary post footer is not an access wall.
      .filter((text) => /게시물을\s*놓치지|Instagram에\s*가입|log\s*in\s*to\s*(?:see|continue)|log\s*into\s*instagram|sign\s*up\s*to\s*see|see\s*more\s*from|temporarily\s*blocked|try\s*again\s*later|잠시\s*후\s*다시\s*시도/i.test(text))
      .join('\n');
    const metaDescription = document.querySelector('meta[property="og:description"]')?.getAttribute('content') || '';
    const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content') || '';
    const ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute('content') || '';
    const twitterImage = document.querySelector('meta[name="twitter:image"], meta[property="twitter:image"]')?.getAttribute('content') || '';
    const articleText = [...document.querySelectorAll('article span, h1, div[role="button"]')]
      .map((node) => node.textContent || '')
      .filter((text) => text.trim().length > 20)
      .join('\n');
    const article = document.querySelector('article') || document;
    const currentCode = window.location.pathname.match(/\/(?:p|reel)\/([^/]+)/)?.[1];
    const images = [...article.querySelectorAll('img')]
      .filter((img) => {
        const linkedPost = img.closest('a[href]')?.getAttribute('href') || '';
        const linkedCode = linkedPost.match(/\/(?:p|reel)\/([^/?#]+)/)?.[1];
        return !linkedCode || linkedCode === currentCode;
      })
      .map((img) => ({
        src: img.currentSrc || img.src,
        alt: img.alt || '',
        w: img.naturalWidth || img.width || 0,
        h: img.naturalHeight || img.height || 0,
        rectW: Math.round(img.getBoundingClientRect().width || 0),
        rectH: Math.round(img.getBoundingClientRect().height || 0),
      }));
    const publishedAt = document.querySelector('time[datetime]')?.getAttribute('datetime') || '';
    const profileHrefs = [...article.querySelectorAll('a[href]')]
      .map((anchor) => anchor.href || anchor.getAttribute('href') || '')
      .filter(Boolean)
      .slice(0, 80);
    return { metaDescription, ogTitle, ogImage, twitterImage, articleText, images, publishedAt, profileHrefs, accessDialogText };
}

// Browser-serializable reader shared by readiness and extraction. A comma-joined
// selector selects DOM order, so an outer ArticleContentBox can win over its
// actual article_viewer and mix the author/comments into event evidence.
export function readNaverArticleDocument({ readyOnly = false } = {}) {
  const first = (selectors) => selectors.map(selector => document.querySelector(selector)).find(Boolean);
  const viewer = first([
    '.article_viewer', '.se-main-container', '.ContentRenderer', '#tbody',
    '.NHN_Writeform_Main', '.post_ct', '.se-viewer', '.article-content',
  ]);
  const text = viewer?.innerText ?? viewer?.textContent ?? '';
  const images = [...(viewer?.querySelectorAll('img') || [])].map(img => ({
    src: img.currentSrc || img.src || img.getAttribute('data-src') || img.getAttribute('data-lazysrc') || img.getAttribute('data-original') || img.getAttribute('data-url') || '',
    w: img.naturalWidth || img.width || 0,
    h: img.naturalHeight || img.height || 0,
  })).filter(img => img.src);
  if (readyOnly) return Boolean(text.trim() || images.length);
  const badTitleRe = /인기\s*멤버|새싹\s*멤버|멤버\s*등급|부\s*매니저|매니저|스탭|운영진|1\s*:\s*1\s*채팅|작성자|조회수?|댓글|목록|URL\s*복사|좋아요|신고|게시글/i;
  const title = [...document.querySelectorAll('.title_text, .tit_area .tit')]
    .map(node => (node.textContent || '').replace(/\s+/g, ' ').trim())
    .find(value => value && !badTitleRe.test(value)) || '';
  const publishedAt = document.querySelector('meta[property="article:published_time"]')?.getAttribute('content')
    || document.querySelector('time[datetime]')?.getAttribute('datetime')
    || first(['.ArticleWriter .date', '.article_info .date', '.date'])?.textContent || '';
  return { title, text, images, publishedAt };
}

// Public cafe links only; comment navigation must never overwrite article titles.
export function readNaverArticleListDocument() {
    const textOf = (node) => (node?.textContent || '').replace(/\s+/g, ' ').trim();
    const imageOf = (root) => {
      const img = root?.querySelector('img');
      return img?.currentSrc || img?.src || img?.getAttribute('data-src') || img?.getAttribute('data-lazysrc') || '';
    };
    return [...document.querySelectorAll('a[href*="/articles/"], a[href*="ArticleRead"], a[href*="articleid"]')]
      .filter((anchor) => !/[?&]commentFocus=true(?:&|$)/i.test(anchor.href))
      .map((anchor, index) => {
        const href = anchor.href;
        const row = anchor.closest('tr, li, .ArticleListItem, .item, .board-list, .article-board, .article-list') || anchor.parentElement;
        const rowTitle = textOf(row?.querySelector('a.tit, a.article, .tit, .article, strong, .title'));
        const title = textOf(anchor) || rowTitle;
        return {
          href,
          title,
          rowText: textOf(row),
          posterUrl: imageOf(row),
          index,
        };
      })
      .filter((item) => item.href && item.title && !/commentFocus=true/.test(item.href));
}
