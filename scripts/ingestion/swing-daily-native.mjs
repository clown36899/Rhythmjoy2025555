#!/usr/bin/env node
import { chromium } from 'playwright';
import { buildNetlifyPayload, normalizeSourceUrl, prepareCandidate } from './candidate-utils.mjs';
import { getAutomationSourceList, getExcludedSourceReason } from './collection-registry.mjs';

const profile = process.env.INGESTION_PROFILE || 'swing-daily';
const endpoint = process.env.NETLIFY_INGEST_ENDPOINT || 'https://swingenjoy.com/.netlify/functions/scraped-events';
const dryRun = process.env.INGESTION_NATIVE_DRY_RUN === '1';
const sourceLimit = Number(process.env.INGESTION_NATIVE_SOURCE_LIMIT || 0);
const sourceIds = (process.env.INGESTION_NATIVE_SOURCE_IDS || '')
  .split(',')
  .map((id) => id.trim())
  .filter(Boolean);
const postLimit = Number(process.env.INGESTION_NATIVE_POST_LIMIT || 4);
const maxFutureDays = Number(process.env.INGESTION_NATIVE_MAX_FUTURE_DAYS || 180);
const sourceTimeoutMs = Number(process.env.INGESTION_NATIVE_SOURCE_TIMEOUT_MS || 45000);
const postTimeoutMs = Number(process.env.INGESTION_NATIVE_POST_TIMEOUT_MS || 28000);
const cleanupCount = process.env.INGESTION_PRE_CLEANUP_COUNT || '0';
const today = todayKST();

const result = {
  inserted: 0,
  skipped: 0,
  accessFailures: [],
  issues: [],
  candidates: [],
};

const venueAliases = [
  [/경성홀|kyungsung/i, '경성홀'],
  [/해피홀|happy\s*hall/i, '해피홀'],
  [/스윙\s*타임|swing\s*time/i, '스윙타임'],
  [/봉천\s*살롱|bongcheon/i, '봉천살롱'],
  [/비밥\s*바|bebop/i, '비밥바'],
  [/피에스타|fiesta/i, '피에스타'],
  [/루나|luna/i, '루나'],
  [/인더무드|in\s*the\s*mood/i, '인더무드'],
  [/쏘셜\s*클럽|소셜\s*클럽|sosyal|social\s*club/i, '소셜클럽'],
  [/탐나홀|tamna/i, '탐나홀'],
  [/kp\s*댄스홀|kp\s*dance/i, 'KP댄스홀'],
  [/스탭업|step\s*up/i, '스탭업댄스'],
];

const sourceSpecificVenue = new Map([
  ['happyhall2004', '해피홀'],
  ['swingtimebar', '스윙타임'],
  ['fiesta_swingdance', '피에스타'],
  ['bongcheonsalon', '봉천살롱'],
  ['bebopbar_swing', '비밥바'],
  ['luna_swingbar', '루나'],
  ['inthemood_sillim', '인더무드'],
  ['kyungsunghall', '경성홀'],
  ['tamnahall', '탐나홀'],
  ['kpdancehall', 'KP댄스홀'],
  ['stepupdance_swing', '스탭업댄스'],
  ['sosyalclub_swing', '소셜클럽'],
]);

function todayKST() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function log(message) {
  console.log(`[native-ingestion] ${message}`);
}

function compactText(value = '') {
  return String(value || '').replace(/\u200b/g, '').replace(/\s+/g, ' ').trim();
}

function cleanTitle(value = '') {
  return compactText(value)
    .replace(/^[^:]{1,80}\s+on\s+Instagram:\s*/i, '')
    .replace(/^말머리\s*/i, '')
    .replace(/^(필독|공지)\s*/i, '')
    .replace(/^\[[^\]]{1,16}\]\s*/, '')
    .replace(/\s*댓글\s*\(?\d+\)?\s*$/i, '')
    .slice(0, 120);
}

function makeCandidateTitle({ source, rawTitle, cleanText, eventType, djs = [] }) {
  const cleaned = cleanTitle(rawTitle || '');
  const looksGeneratedByPlatform = /on\s+Instagram|Instagram\s+photos|네이버\s*카페|Daum\s*카페|강습일정\s*필독말머리/i.test(rawTitle || '');
  if (cleaned && cleaned.length <= 64 && !looksGeneratedByPlatform) return cleaned;

  const firstMeaningfulLine = String(cleanText || '')
    .split(/\n| {2,}/)
    .map((line) => cleanTitle(line))
    .find((line) => line.length >= 6 && line.length <= 64 && !/작성자|조회수|댓글|URL 복사|목록/.test(line));
  if (firstMeaningfulLine && !/on\s+Instagram/i.test(firstMeaningfulLine)) return firstMeaningfulLine;

  if (eventType === '소셜' && djs.length) return `${source.name} 소셜 (${djs.slice(0, 2).join(', ')})`;
  return `${source.name} ${eventType}`;
}

function getYearForMonth(month) {
  const now = new Date();
  const currentMonth = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', month: 'numeric' }).format(now));
  const currentYear = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', year: 'numeric' }).format(now));
  return Number(month) + 1 < currentMonth ? currentYear + 1 : currentYear;
}

function isoDate(year, month, day) {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function extractDates(text = '') {
  const raw = compactText(text);
  const dates = [];
  const isTimeContext = (index, length) => {
    const context = raw.slice(Math.max(0, index - 10), Math.min(raw.length, index + length + 10));
    return /(?:오전|오후|저녁|am|pm)\s*$/i.test(context.slice(0, 10))
      || /^\s*(?:시|:|\d{2}\b)/.test(context.slice(10))
      || /\d{1,2}\s*[:：]\s*\d{2}/.test(context);
  };

  for (const match of raw.matchAll(/(20\d{2})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/g)) {
    dates.push(isoDate(match[1], match[2], match[3]));
  }

  for (const match of raw.matchAll(/(\d{1,2})\s*월\s*((?:\d{1,2}\s*(?:일)?\s*(?:[,，·ㆍ/&]|및|와|과|~|-)?\s*){1,8})/g)) {
    const month = Number(match[1]);
    const year = getYearForMonth(month);
    const days = [...match[2].matchAll(/\d{1,2}/g)].map((day) => Number(day[0])).filter((day) => day >= 1 && day <= 31);
    for (const day of days) dates.push(isoDate(year, month, day));
  }

  for (const match of raw.matchAll(/(?<!\d)(\d{1,2})\s*[./]\s*(\d{1,2})(?!\d)/g)) {
    const month = Number(match[1]);
    const day = Number(match[2]);
    if (isTimeContext(match.index, match[0].length)) continue;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      dates.push(isoDate(getYearForMonth(month), month, day));
    }
  }

  const todayMs = Date.parse(`${today}T00:00:00+09:00`);
  return unique(dates)
    .filter((date) => {
      const dateMs = Date.parse(`${date}T00:00:00+09:00`);
      return Number.isFinite(dateMs)
        && date >= today
        && (dateMs - todayMs) / 86400000 <= maxFutureDays;
    })
    .sort();
}

function inferActivity(text = '') {
  if (/(참가자|팀원|크루|멤버|강사|댄서|출연진)\s*모집|오디션/i.test(text)) return { activity: 'recruit', eventType: '모집' };
  if (/강습|수업|레슨|클래스|워크샵|워크숍|특강|원데이|오픈\s*클래스|입문|초급|중급|class|lesson|workshop/i.test(text)) {
    return { activity: 'class', eventType: '강습' };
  }
  if (/소셜|social|DJ|디제이|파티|party/i.test(text)) return { activity: 'social', eventType: '소셜' };
  return { activity: 'event', eventType: '행사' };
}

function inferVenue(text = '', source) {
  const combined = `${text} ${source?.name || ''} ${source?.id || ''}`;
  const matched = venueAliases.find(([pattern]) => pattern.test(combined));
  return matched?.[1] || sourceSpecificVenue.get(source?.id) || '';
}

function inferDjs(text = '') {
  const djs = [];
  for (const match of text.matchAll(/(?:DJ|디제이)\s*[:：]?\s*([A-Za-z0-9가-힣._&+\-/ ]{1,28})/gi)) {
    const value = compactText(match[1])
      .replace(/\s*(?:와|과|및|님|입니다|입니다\.|와 함께).*$/i, '')
      .replace(/\s*\d{1,2}[:：]\d{2}.*$/, '')
      .trim();
    if (value && value.length <= 28) djs.push(value);
  }
  return unique(djs).slice(0, 5);
}

function pickPosterImage(images = []) {
  return images
    .filter((image) => image?.src && Number(image.w || 0) >= 300 && Number(image.h || 0) >= 300)
    .filter((image) => !/profile|avatar|emoji|emoticon|static\/cafe|btn_|logo/i.test(image.src))
    .sort((a, b) => (Number(b.w || 0) * Number(b.h || 0)) - (Number(a.w || 0) * Number(a.h || 0)))[0]?.src || '';
}

async function imageToDataUrl(page, imageUrl, referer = '') {
  if (!imageUrl) return '';
  try {
    return await page.evaluate(async ({ url }) => {
      const response = await fetch(url, { credentials: 'include' });
      if (!response.ok) throw new Error(`image fetch ${response.status}`);
      const blob = await response.blob();
      if (blob.size < 1000 || blob.size > 5_500_000) return '';
      return await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = () => resolve('');
        reader.readAsDataURL(blob);
      });
    }, { url: imageUrl });
  } catch {}

  try {
    const response = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        ...(referer ? { Referer: referer } : {}),
      },
    });
    if (!response.ok) return '';
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length < 1000 || buffer.length > 5_500_000) return '';
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    return `data:${contentType};base64,${buffer.toString('base64')}`;
  } catch {
    return '';
  }
}

async function safeGoto(page, url, timeout = sourceTimeoutMs) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
  await page.waitForTimeout(1800);
}

async function collectInstagramLinks(page, source) {
  await safeGoto(page, source.url);
  await page.keyboard.press('Escape').catch(() => {});
  return await page.evaluate(() => [...new Set([...document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]')]
    .map((a) => a.href)
    .filter(Boolean)
    .map((href) => href.split('?')[0]))].slice(0, 8)).catch(() => []);
}

async function scrapeInstagramPost(page, url, source) {
  await safeGoto(page, url, postTimeoutMs);
  await page.keyboard.press('Escape').catch(() => {});
  const data = await page.evaluate(() => {
    const metaDescription = document.querySelector('meta[property="og:description"]')?.getAttribute('content') || '';
    const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content') || '';
    const articleText = [...document.querySelectorAll('article span, h1, div[role="button"]')]
      .map((node) => node.textContent || '')
      .filter((text) => text.trim().length > 20)
      .join('\n');
    const images = [...document.querySelectorAll('article img, img[src*="cdninstagram"], img[src*="fbcdn"], img[src*="scontent"]')]
      .map((img) => ({
        src: img.currentSrc || img.src,
        w: img.naturalWidth || img.width || 0,
        h: img.naturalHeight || img.height || 0,
      }));
    return { metaDescription, ogTitle, articleText, images };
  });

  let text = data.articleText || data.metaDescription || data.ogTitle || '';
  const quoted = data.metaDescription.match(/:\s*"([\s\S]*?)(?:"$|$)/);
  if (quoted?.[1] && quoted[1].length > text.length / 2) text = quoted[1];
  const posterUrl = pickPosterImage(data.images);
  return buildCandidatesFromText({ source, sourceUrl: url, text, title: data.ogTitle || text, posterUrl, page });
}

async function collectNaverArticleLinks(page, source) {
  await safeGoto(page, source.url);
  return await page.evaluate(() => [...new Map([...document.querySelectorAll('a[href*="/articles/"], a[href*="ArticleRead"], a[href*="articleid"]')]
    .map((a) => [a.href.split('&commentFocus=')[0], {
      href: a.href.split('&commentFocus=')[0],
      title: (a.textContent || '').trim(),
    }])
    .filter(([, item]) => item.href && item.title)
  ).values()].slice(0, 24)).catch(() => []);
}

async function scrapeNaverArticle(page, link, source) {
  await safeGoto(page, link.href, postTimeoutMs);
  const frame = page.frames().find((item) => item.name() === 'cafe_main') || page.mainFrame();
  const data = await frame.evaluate(() => {
    const title = document.querySelector('.title_text, h3.title_text, .ArticleTitle, h1')?.textContent || '';
    const viewer = document.querySelector('.article_viewer, .se-main-container, #app, body');
    const text = viewer?.innerText || document.body.innerText || '';
    const images = [...document.querySelectorAll('.article_viewer img, .se-main-container img, img[src*="postfiles"], img[src*="cafeptthumb"]')]
      .map((img) => ({
        src: img.currentSrc || img.src,
        w: img.naturalWidth || img.width || 0,
        h: img.naturalHeight || img.height || 0,
      }));
    return { title, text, images };
  });

  const posterUrl = pickPosterImage(data.images);
  return buildCandidatesFromText({
    source,
    sourceUrl: normalizeSourceUrl(link.href),
    text: `${data.title}\n${data.text}`,
    title: data.title || link.title,
    posterUrl,
    page,
    referer: 'https://cafe.naver.com/',
  });
}

async function collectDaumArticleLinks(page, source) {
  await safeGoto(page, source.url);
  return await page.evaluate(() => [...new Map([...document.querySelectorAll('a[href*="m.cafe.daum.net"]')]
    .map((a) => [a.href.split('#')[0], {
      href: a.href.split('#')[0],
      title: (a.textContent || '').trim(),
    }])
    .filter(([, item]) => /\/[A-Za-z0-9]+\/\d+\??/.test(item.href) && item.title)
  ).values()].slice(0, 20)).catch(() => []);
}

async function scrapeDaumArticle(page, link, source) {
  await safeGoto(page, link.href, postTimeoutMs);
  const data = await page.evaluate(() => {
    const title = document.querySelector('h3, h2, .tit_subject, .tit_view')?.textContent || '';
    const text = document.body.innerText || '';
    const images = [...document.querySelectorAll('img')]
      .map((img) => ({
        src: img.currentSrc || img.src,
        w: img.naturalWidth || img.width || 0,
        h: img.naturalHeight || img.height || 0,
      }));
    return { title, text, images };
  });
  const posterUrl = pickPosterImage(data.images);
  return buildCandidatesFromText({
    source,
    sourceUrl: normalizeSourceUrl(link.href),
    text: `${data.title}\n${data.text}`,
    title: data.title || link.title,
    posterUrl,
    page,
    referer: 'https://m.cafe.daum.net/',
  });
}

async function buildCandidatesFromText({ source, sourceUrl, text, title, posterUrl, page, referer = '' }) {
  const sourceExcluded = getExcludedSourceReason(sourceUrl);
  if (sourceExcluded) {
    result.skipped += 1;
    return [];
  }

  const cleanText = compactText(text);
  if (!cleanText || cleanText.length < 20) {
    result.skipped += 1;
    return [];
  }

  const dates = extractDates(cleanText);
  if (!dates.length) {
    result.skipped += 1;
    return [];
  }

  if (!posterUrl) {
    result.skipped += 1;
    result.issues.push(`${source.id}: poster missing`);
    return [];
  }

  const imageData = await imageToDataUrl(page, posterUrl, referer || sourceUrl);
  const { activity, eventType } = inferActivity(cleanText);
  const venue = inferVenue(cleanText, source);
  const djs = inferDjs(cleanText);
  const candidateTitle = makeCandidateTitle({ source, rawTitle: title, cleanText, eventType, djs });
  const candidates = [];

  for (const date of dates.slice(0, 8)) {
    const raw = {
      keyword: source.name,
      source_url: sourceUrl,
      poster_url: posterUrl,
      ...(imageData ? { imageData } : {}),
      extracted_text: cleanText.slice(0, 6000),
      structured_data: {
        title: candidateTitle,
        date,
        event_type: eventType,
        activity_type: activity,
        location: venue || source.name,
        venue_name: venue || source.name,
        dance_scope: source.scope,
        genre_family: source.genre_family,
        dance_genre: source.dance_genre,
        ...(djs.length ? { djs } : {}),
      },
    };

    const prepared = prepareCandidate(raw, { today });
    if (!prepared.validation.ok) {
      result.skipped += 1;
      log(`skip ${source.id} ${date}: ${prepared.validation.errors.join('; ')}`);
      continue;
    }

    candidates.push(buildNetlifyPayload(raw, { today }));
  }

  return candidates;
}

async function postCandidate(candidate) {
  if (dryRun) {
    result.inserted += 1;
    result.candidates.push(`${candidate.keyword}:${candidate.structured_data?.date}:${candidate.structured_data?.title}`);
    return;
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(candidate),
  });
  const bodyText = await response.text();
  let body = {};
  try { body = JSON.parse(bodyText); } catch {}

  if (!response.ok) {
    result.skipped += 1;
    result.issues.push(`post ${candidate.id}: HTTP ${response.status}`);
    log(`post failed ${candidate.id}: ${response.status} ${bodyText.slice(0, 300)}`);
    return;
  }

  if (Array.isArray(body.skipped) && body.skipped.length) {
    result.skipped += body.skipped.length;
    result.candidates.push(`skip:${candidate.keyword}:${body.skipped[0].reason}`);
    return;
  }

  result.inserted += Number(body.count ?? 1);
  result.candidates.push(`${candidate.keyword}:${candidate.structured_data?.date}:${candidate.structured_data?.title}`);
}

async function withBoundedStep(label, fn, timeoutMs) {
  let timer;
  try {
    return await Promise.race([
      fn(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timeout ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } catch (error) {
    result.accessFailures.push(`${label}(${error.message})`);
    return [];
  } finally {
    clearTimeout(timer);
  }
}

async function collectSource(page, source) {
  if (source.type === 'instagram') {
    const links = await withBoundedStep(source.id, () => collectInstagramLinks(page, source), sourceTimeoutMs);
    if (!links.length) {
      result.accessFailures.push(`${source.id}(no post links)`);
      return [];
    }
    const candidates = [];
    for (const url of links.slice(0, postLimit)) {
      const postCandidates = await withBoundedStep(`${source.id}:post`, () => scrapeInstagramPost(page, url, source), postTimeoutMs + 8000);
      candidates.push(...postCandidates);
    }
    return candidates;
  }

  if (source.type === 'naver_cafe') {
    const links = await withBoundedStep(source.id, () => collectNaverArticleLinks(page, source), sourceTimeoutMs);
    if (!links.length) {
      result.accessFailures.push(`${source.id}(no article links)`);
      return [];
    }
    const candidates = [];
    for (const link of links.slice(0, postLimit)) {
      const postCandidates = await withBoundedStep(`${source.id}:article`, () => scrapeNaverArticle(page, link, source), postTimeoutMs + 8000);
      candidates.push(...postCandidates);
    }
    return candidates;
  }

  if (source.type === 'daum_cafe') {
    const links = await withBoundedStep(source.id, () => collectDaumArticleLinks(page, source), sourceTimeoutMs);
    if (!links.length) {
      result.accessFailures.push(`${source.id}(no article links)`);
      return [];
    }
    const candidates = [];
    for (const link of links.slice(0, postLimit)) {
      const postCandidates = await withBoundedStep(`${source.id}:article`, () => scrapeDaumArticle(page, link, source), postTimeoutMs + 8000);
      candidates.push(...postCandidates);
    }
    return candidates;
  }

  result.accessFailures.push(`${source.id}(unsupported ${source.type})`);
  return [];
}

async function main() {
  if (profile !== 'swing-daily') {
    throw new Error(`native collector supports swing-daily only: ${profile}`);
  }

  const sources = getAutomationSourceList('swing-daily')
    .filter((source) => source.saveEnabled && source.scope === 'swing')
    .filter((source) => sourceIds.length === 0 || sourceIds.includes(source.id))
    .slice(0, sourceLimit > 0 ? sourceLimit : undefined);

  log(`start profile=${profile} sources=${sources.length} today=${today} dryRun=${dryRun}`);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1200 },
    deviceScaleFactor: 2,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.setDefaultNavigationTimeout(18000);

  try {
    for (const source of sources) {
      const excluded = getExcludedSourceReason(source.url);
      if (excluded) {
        result.skipped += 1;
        log(`excluded source ${source.id}: ${excluded}`);
        continue;
      }

      log(`source ${source.id} ${source.type} ${source.url}`);
      const candidates = await collectSource(page, source);
      const deduped = [...new Map(candidates.map((candidate) => [candidate.id, candidate])).values()];
      for (const candidate of deduped) {
        await postCandidate(candidate);
      }
    }
  } finally {
    await browser.close();
  }

  printSummary();
}

function printSummary() {
  const accessFailures = unique(result.accessFailures).slice(0, 12);
  const issues = unique(result.issues).slice(0, 8);
  console.log('INGESTION_RESULT_JSON_START');
  console.log(JSON.stringify({
    engine: 'native',
    insertCount: result.inserted,
    skipCount: result.skipped,
    accessFailures,
    issues,
    candidates: result.candidates.slice(0, 20),
  }, null, 2));
  console.log('INGESTION_RESULT_JSON_END');
  console.log('==TELEGRAM_SUMMARY_START==');
  console.log(`신규: ${result.inserted}건`);
  console.log(`스킵: ${result.skipped}건`);
  console.log(`과거데이터삭제: ${cleanupCount}건`);
  console.log(`접근불가: ${accessFailures.length ? accessFailures.join(', ') : 'none'}`);
  console.log(`이슈: ${issues.length ? issues.join(' / ') : 'none'}`);
  console.log('==TELEGRAM_SUMMARY_END==');
}

main().catch((error) => {
  result.issues.push(error.message);
  printSummary();
  process.exitCode = 1;
});
