#!/usr/bin/env node
import { chromium } from 'playwright-extra';
import stealthPlugin from 'puppeteer-extra-plugin-stealth';
import { buildNetlifyPayload, getBlockedKeywordReason, normalizeSourceUrl, prepareCandidate } from './candidate-utils.mjs';
import { getAutomationSourceList, getExcludedSourceReason } from './collection-registry.mjs';

chromium.use(stealthPlugin());


const profile = process.env.INGESTION_PROFILE || 'swing-daily';
const endpoint = process.env.NETLIFY_INGEST_ENDPOINT || 'https://swingenjoy.com/.netlify/functions/scraped-events';
const dryRun = process.env.INGESTION_NATIVE_DRY_RUN === '1';
const sourceLimit = Number(process.env.INGESTION_NATIVE_SOURCE_LIMIT || 0);
const sourceIds = (process.env.INGESTION_NATIVE_SOURCE_IDS || '')
  .split(',')
  .map((id) => id.trim())
  .filter(Boolean);
const sourcePriorities = (process.env.INGESTION_NATIVE_SOURCE_PRIORITY || process.env.INGESTION_NATIVE_PRIORITY || '')
  .split(',')
  .map((priority) => priority.trim())
  .filter(Boolean)
  .map((priority) => Number(priority))
  .filter((priority) => Number.isFinite(priority));
const postLimit = Number(process.env.INGESTION_NATIVE_POST_LIMIT || 4);
const maxFutureDays = Number(process.env.INGESTION_NATIVE_MAX_FUTURE_DAYS || 180);
const sourceTimeoutMs = Number(process.env.INGESTION_NATIVE_SOURCE_TIMEOUT_MS || 45000);
const postTimeoutMs = Number(process.env.INGESTION_NATIVE_POST_TIMEOUT_MS || 28000);
const postRequestTimeoutMs = Number(process.env.INGESTION_NATIVE_POST_REQUEST_TIMEOUT_MS || 20_000);
const imageFetchTimeoutMs = Number(process.env.INGESTION_NATIVE_IMAGE_FETCH_TIMEOUT_MS || 12_000);
const runBudgetMs = Number(process.env.INGESTION_NATIVE_RUN_BUDGET_MS || 20 * 60_000);
const cleanupCount = process.env.INGESTION_PRE_CLEANUP_COUNT || '0';
const browserCdpUrl = process.env.INGESTION_BROWSER_CDP_URL || 'http://localhost:9222';
const browserProfileDir = process.env.INGESTION_BROWSER_PROFILE_DIR || '/Users/inteyeo/.chrome-automation';
const browserHeadless = process.env.INGESTION_BROWSER_HEADLESS === '1';
const instagramSafeMode = process.env.INGESTION_INSTAGRAM_SAFE_MODE !== '0';
const instagramSourceDelayMs = Number(process.env.INGESTION_INSTAGRAM_SOURCE_DELAY_MS || (instagramSafeMode ? 45_000 : 0));
const instagramPostDelayMs = Number(process.env.INGESTION_INSTAGRAM_POST_DELAY_MS || (instagramSafeMode ? 12_000 : 0));
const instagramProfileWaitMs = Number(process.env.INGESTION_INSTAGRAM_PROFILE_WAIT_MS || (instagramSafeMode ? 5_500 : 1_800));
const instagramFailureCircuitThreshold = Number(process.env.INGESTION_INSTAGRAM_FAILURE_CIRCUIT_THRESHOLD || (instagramSafeMode ? 3 : 0));
const today = todayKST();
const runStartedAtMs = Date.now();
const oneDayPattern = /원\s*데이|원데이|\b1\s*day\b|\bone\s*day\b|\boneday\b|일일\s*(?:클래스|강습|수업|체험)|하루(?:만|짜리)?\s*(?:클래스|강습|수업|체험|배워)|체험\s*(?:클래스|강습|수업)|오픈\s*클래스|open\s*class/i;

const result = {
  inserted: 0,
  skipped: 0,
  accessFailures: [],
  instagramCircuitSkips: [],
  noContentSources: [],
  issues: [],
  candidates: [],
  deadlineReached: false,
  remainingSources: [],
};

const sourceTypeWeight = new Map([
  ['littly', 0],
  ['naver_cafe', 1],
  ['daum_cafe', 2],
  ['website', 3],
  ['instagram', 10],
]);

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
  ['swingcats20', '루나'],
  ['inthemood_sillim', '인더무드'],
  ['swingpopseoul', 'Dialogue'],
  ['kyungsunghall', '경성홀'],
  ['tamnahall', '탐나홀'],
  ['kpdancehall', 'KP댄스홀'],
  ['stepupdance_swing', '스탭업댄스'],
  ['sosyalclub_swing', '소셜클럽'],
  ['daejeon_swingfever', '스윙잇'],
  ['allaboutswing_official', '경성홀'],
  ['swingscandal-littly', '사보이'],
  ['balboaland-instagram', '피에스타'],
  ['swingkids-oneday-littly', '스윙키즈'],
  ['swingfriends-oneday-littly', '스윙프렌즈'],
  ['swing_friends', '스윙타임'],
  ['neoswing-daum', '해피홀'],
  ['swinghouse-littly', '비밥바'],
  ['goldenswing', '당산벙커'],
  ['goldenswing-littly', '당산벙커'],
]);

let lastInstagramHitAt = 0;
let instagramProfileFailureStreak = 0;
let instagramCircuitOpen = false;

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

function recordNoContent(sourceOrLabel, reason) {
  const label = typeof sourceOrLabel === 'string' ? sourceOrLabel : sourceOrLabel.id;
  result.noContentSources.push(`${label}(${reason})`);
  log(`no content ${label}: ${reason}`);
}

function recordAccessFailure(sourceOrLabel, reason) {
  const label = typeof sourceOrLabel === 'string' ? sourceOrLabel : sourceOrLabel.id;
  result.accessFailures.push(`${label}(${reason})`);
  log(`access failure ${label}: ${reason}`);
  if (instagramSafeMode && !String(label).includes(':post') && /^instagram /.test(reason) && reason !== 'instagram safe circuit open') {
    instagramProfileFailureStreak += 1;
    if (instagramFailureCircuitThreshold > 0 && instagramProfileFailureStreak >= instagramFailureCircuitThreshold) {
      instagramCircuitOpen = true;
      log(`instagram safe circuit opened after ${instagramProfileFailureStreak} consecutive profile failures`);
    }
  }
}

function recordInstagramCircuitSkip(source) {
  const label = typeof source === 'string' ? source : source.id;
  result.instagramCircuitSkips.push(label);
  log(`instagram circuit skip ${label}`);
}

function compactText(value = '') {
  return String(value || '').replace(/\u200b/g, '').replace(/\s+/g, ' ').trim();
}

function cleanTitle(value = '') {
  return compactText(value)
    .replace(/^Instagram(?:의)?\s+[^:：]{1,120}\s*[:：]\s*["“”']?\s*/i, '')
    .replace(/^[^:]{1,80}\s+on\s+Instagram:\s*/i, '')
    .replace(/^\[(?:정모|행사|강습|공지사항|공지|필독|이벤트|소셜|모집)[^\]]{0,20}\]\s*/i, '')
    .replace(/^(?:월|화|수|목|금|토|일)(?:\s*\/\s*(?:월|화|수|목|금|토|일))*\s+/i, '')
    .replace(/^(?:사항|강습일정|공지사항|공지|필독)\s*(?:필독|공지)?말머리\s*/i, '')
    .replace(/^강습일정\s*공지말머리\s*/i, '')
    .replace(/^사항\s*(?:필독|공지)말머리\s*/i, '')
    .replace(/^말머리\s*/i, '')
    .replace(/^\[(?:정모|행사|강습|공지사항|공지|필독|이벤트|소셜|모집)[^\]]{0,20}\]\s*/i, '')
    .replace(/^(필독|공지)\s*/i, '')
    .replace(/^\[(?:공지사항|공지|필독)\]\s*/i, '')
    .replace(/\s*댓글\s*\(?\d+\)?\s*$/i, '')
    .slice(0, 120);
}

function extractInstagramCaptionTitle(value = '') {
  const raw = String(value || '');
  const match = raw.match(/Instagram(?:의)?\s+[^:：]{1,120}\s*[:：]\s*["“”']?\s*([\s\S]{6,240})/i);
  if (!match?.[1]) return '';
  return cleanTitle(match[1])
    .split(/\n| {2,}/)
    .map((line) => cleanTitle(line))
    .find((line) => line.length >= 6 && line.length <= 64 && !/^\d+\s*(?:likes?|comments?)/i.test(line)) || '';
}

function makeCandidateTitle({ source, rawTitle, cleanText, eventType, djs = [] }) {
  const instagramCaptionTitle = extractInstagramCaptionTitle(rawTitle);
  if (instagramCaptionTitle) return instagramCaptionTitle;

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

function normalizeForCompare(value = '') {
  return String(value || '').normalize('NFKC').toLowerCase().replace(/[^\w가-힣]/g, '');
}

function looksLikeGenericTitle(title = '', source, eventType = '') {
  const normalizedTitle = normalizeForCompare(title);
  const suffixes = [eventType, '강습', '행사', '소셜', '모집'].filter(Boolean).map(normalizeForCompare);
  const sourceNames = [source?.name, source?.id].filter(Boolean).map(normalizeForCompare);
  return sourceNames.some((name) => suffixes.some((suffix) => normalizedTitle === `${name}${suffix}`));
}

function looksLikeBroadScheduleNotice(title = '', text = '') {
  const value = `${title}\n${text}`;
  return /(?:\d{4}\s*년도\s*)?\d+\s*학기\s*정규\s*수업.*확정|정규\s*수업\s*시간표|전체\s*강습\s*일정|강습\s*전체\s*일정|공지사항.*정규\s*수업|공지사항.*정규수업/i.test(value);
}

function selectCandidateDates({ title, cleanText, activity }) {
  const titleDates = extractDates(title);
  const sourceDates = titleDates.length ? titleDates : extractDates(cleanText);
  if (activity === 'class' || activity === 'recruit') return sourceDates.slice(0, 1);
  if (titleDates.length) return sourceDates.slice(0, 2);
  return sourceDates.slice(0, 8);
}

function socialDayTitle(day = '') {
  return ({
    월: '월요',
    화: '화요',
    수: '수요',
    목: '목요',
    금: '금요',
    토: '토요',
    일: '일요',
  })[day] || '';
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 0, readBody = (response) => response.text()) {
  const controller = new AbortController();
  const timer = timeoutMs > 0
    ? setTimeout(() => controller.abort(new Error(`timeout ${timeoutMs}ms`)), timeoutMs)
    : null;
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const body = await readBody(response);
    return { response, body };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function jitter(ms) {
  if (!ms) return 0;
  return Math.max(0, Math.round(ms * (0.8 + Math.random() * 0.4)));
}

function runRemainingMs() {
  if (!runBudgetMs) return Number.POSITIVE_INFINITY;
  return Math.max(0, runBudgetMs - (Date.now() - runStartedAtMs));
}

function hasRunBudget(minRemainingMs = 0) {
  return runRemainingMs() > minRemainingMs;
}

function runDeadlineGuardMs() {
  if (!runBudgetMs) return 0;
  return runBudgetMs >= 120_000 ? 60_000 : Math.max(1_000, Math.floor(runBudgetMs * 0.1));
}

function recordDeadlineReached(sources, startIndex) {
  if (result.deadlineReached) return;
  const remaining = sources.slice(startIndex).map((source) => source.id);
  result.deadlineReached = true;
  result.remainingSources = remaining;
  result.issues.push(`run budget reached; remaining sources ${remaining.length}`);
  log(`run budget reached; remaining=${remaining.length}; remaining_ms=${runRemainingMs()}`);
}

function sourceOrderWeight(source) {
  return sourceTypeWeight.get(source.type) ?? 5;
}

async function throttleInstagram(label, baseDelayMs) {
  if (!instagramSafeMode || !baseDelayMs) return;
  const elapsed = Date.now() - lastInstagramHitAt;
  const waitMs = elapsed > baseDelayMs ? 0 : jitter(baseDelayMs - elapsed);
  if (waitMs > 0) {
    log(`instagram safe wait ${Math.round(waitMs / 1000)}s before ${label}`);
    await sleep(waitMs);
  }
  lastInstagramHitAt = Date.now();
}

function markInstagramProfileSuccess() {
  instagramProfileFailureStreak = 0;
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
  if (/강습|수업|레슨|클래스|워크샵|워크숍|특강|원\s*데이|원데이|오픈\s*클래스|체험\s*(?:클래스|강습|수업)|일일\s*(?:클래스|강습|수업)|하루(?:만|짜리)?\s*(?:클래스|강습|수업|배워)|입문|초급|중급|class|lesson|workshop|one\s*day|oneday|open\s*class/i.test(text)) {
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
  for (const match of text.matchAll(/(?:DJ|디제이)\s*[:：]?\s*["'“”‘’]?\s*([A-Za-z0-9가-힣._&+\-/ ]{1,28})/gi)) {
    const value = compactText(match[1])
      .replace(/\s*(?:와|과|및|님|입니다|입니다\.|와 함께).*$/i, '')
      .replace(/\s*(?:소셜은|소셜\s*은|참석|되시며|됩니다|문의|입장|현금|카드|제로페이).*$/i, '')
      .replace(/\s*(?:AM|PM|오전|오후)\b.*$/i, '')
      .replace(/\s*\d{1,2}[:：]\d{2}.*$/, '')
      .trim();
    if (value && value.length <= 28) djs.push(value);
  }
  return unique(djs).slice(0, 5);
}

function to24Hour(hour, meridiem = '') {
  let value = Number(hour);
  if (/오후|저녁|pm/i.test(meridiem) && value < 12) value += 12;
  if (/오전|am/i.test(meridiem) && value === 12) value = 0;
  return String(value).padStart(2, '0');
}

function inferTimes(text = '') {
  const times = [];
  const pattern = /(?:\b(오전|오후|저녁|AM|PM)\s*)?(\d{1,2})(?:[:：](\d{2}))?\s*(?:-|~|–|—)\s*(\d{1,2})(?:[:：](\d{2}))?\s*시?/gi;
  for (const match of text.matchAll(pattern)) {
    const meridiem = match[1] || '';
    const startHour = to24Hour(match[2], meridiem);
    const endHour = to24Hour(match[4], meridiem);
    const startMinute = match[3] || '00';
    const endMinute = match[5] || '00';
    times.push(`${startHour}:${startMinute}-${endHour}:${endMinute}`);
  }
  return unique(times).slice(0, 3);
}

function inferFee(text = '') {
  const match = String(text || '').match(/\(?\s*(\d{1,3}(?:,\d{3})*)\s*원\s*\)?/);
  return match ? `${match[1]}원` : '';
}

function extractSocialScheduleItems(text = '', source) {
  const raw = compactText(text);
  const items = [];
  const pattern = /(?:^|\s)(\d{1,2})\s*(?:[./]|월)\s*(\d{1,2})\s*(?:일)?\s*(?:\(\s*([월화수목금토일])\s*\))?\s*(?:소셜|social)\s*[:：]?\s*([\s\S]*?)(?=(?:\s\d{1,2}\s*(?:[./]|월)\s*\d{1,2}\s*(?:일)?\s*(?:\(\s*[월화수목금토일]\s*\))?\s*(?:소셜|social)\s*[:：]?)|$)/gi;
  for (const match of raw.matchAll(pattern)) {
    const month = Number(match[1]);
    const day = Number(match[2]);
    if (month < 1 || month > 12 || day < 1 || day > 31) continue;
    const date = isoDate(getYearForMonth(month), month, day);
    if (date < today) continue;
    const segment = compactText(match[4] || '');
    const dayLabel = match[3] || '';
    const titleDay = socialDayTitle(dayLabel);
    items.push({
      date,
      day: dayLabel,
      title: titleDay ? `${source.name} ${titleDay} 소셜` : `${source.name} 소셜`,
      djs: inferDjs(segment),
      times: inferTimes(segment),
      fee: inferFee(segment),
    });
  }
  return items;
}

function imageNaturalArea(image) {
  return Number(image?.w || 0) * Number(image?.h || 0);
}

function imageRenderedArea(image) {
  return Number(image?.rectW || 0) * Number(image?.rectH || 0);
}

function isUsablePosterImage(image) {
  const src = String(image?.src || '');
  const alt = String(image?.alt || '');
  return src
    && Number(image.w || 0) >= 300
    && Number(image.h || 0) >= 300
    && !/profile|avatar|emoji|emoticon|static\/cafe|btn_|logo/i.test(`${src} ${alt}`);
}

function pickPosterImages(images = [], limit = 1) {
  const seen = new Set();
  return images
    .filter(isUsablePosterImage)
    .sort((a, b) => (
      Number(b.priority || 0) - Number(a.priority || 0)
      || imageRenderedArea(b) - imageRenderedArea(a)
      || imageNaturalArea(b) - imageNaturalArea(a)
    ))
    .map((image) => image.src)
    .filter((src) => {
      if (seen.has(src)) return false;
      seen.add(src);
      return true;
    })
    .slice(0, limit);
}

function pickPosterImage(images = []) {
  return pickPosterImages(images, 1)[0] || '';
}

function pickInstagramPostImageUrls(images = [], limit = 4) {
  const eligible = images.filter(isUsablePosterImage);
  const maxRenderedArea = Math.max(0, ...eligible.map(imageRenderedArea));
  const primaryImages = maxRenderedArea >= 90_000
    ? eligible.filter((image) => imageRenderedArea(image) >= maxRenderedArea * 0.55)
    : eligible.slice(0, limit);
  const seen = new Set();
  return primaryImages
    .map((image) => image.src)
    .filter((src) => {
      if (seen.has(src)) return false;
      seen.add(src);
      return true;
    })
    .slice(0, limit);
}

async function imageToDataUrl(page, imageUrl, referer = '') {
  if (!imageUrl) return '';
  try {
    return await page.evaluate(async ({ url, timeoutMs }) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(url, { credentials: 'include', signal: controller.signal });
        if (!response.ok) throw new Error(`image fetch ${response.status}`);
        const blob = await response.blob();
        if (blob.size < 1000 || blob.size > 5_500_000) return '';
        return await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.onerror = () => resolve('');
          reader.readAsDataURL(blob);
        });
      } finally {
        clearTimeout(timer);
      }
    }, { url: imageUrl, timeoutMs: imageFetchTimeoutMs });
  } catch {}

  try {
    const { response, body: buffer } = await fetchWithTimeout(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        ...(referer ? { Referer: referer } : {}),
      },
    }, imageFetchTimeoutMs, async (response) => Buffer.from(await response.arrayBuffer()));
    if (!response.ok) return '';
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
  await page.waitForTimeout(instagramProfileWaitMs);
  await page.keyboard.press('Escape').catch(() => {});
  const state = await page.evaluate(() => {
    const links = [...new Set([...document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]')]
      .map((a) => a.href)
      .filter(Boolean)
      .map((href) => href.split('?')[0]))].slice(0, 8);
    const bodyText = (document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 3000);
    const title = document.title || '';
    const url = window.location.href;
    return { links, bodyText, title, url };
  }).catch(() => ({ links: [], bodyText: '', title: '', url: '' }));

  if (state.links.length) return state.links;

  const pageText = `${state.title}\n${state.bodyText}\n${state.url}`;
  if (/no\s+posts\s+yet|아직\s*게시물|게시물\s*없음/i.test(pageText)) {
    throw new Error('no content: instagram no posts yet');
  }
  if (/accounts\/login|\/challenge\/|log\s*in|sign\s*up|login\s*to\s*instagram|로그인|가입하기|temporarily\s*blocked|please\s*wait|privacy\s*checks/i.test(pageText)) {
    throw new Error('instagram access blocked or login required');
  }

  throw new Error('instagram post list unavailable');
}

async function scrapeInstagramPost(page, url, source) {
  await safeGoto(page, url, postTimeoutMs);
  await page.keyboard.press('Escape').catch(() => {});
  const data = await page.evaluate(() => {
    const metaDescription = document.querySelector('meta[property="og:description"]')?.getAttribute('content') || '';
    const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content') || '';
    const ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute('content') || '';
    const twitterImage = document.querySelector('meta[name="twitter:image"], meta[property="twitter:image"]')?.getAttribute('content') || '';
    const articleText = [...document.querySelectorAll('article span, h1, div[role="button"]')]
      .map((node) => node.textContent || '')
      .filter((text) => text.trim().length > 20)
      .join('\n');
    const article = document.querySelector('article') || document;
    const images = [...article.querySelectorAll('img')]
      .map((img) => ({
        src: img.currentSrc || img.src,
        alt: img.alt || '',
        w: img.naturalWidth || img.width || 0,
        h: img.naturalHeight || img.height || 0,
        rectW: Math.round(img.getBoundingClientRect().width || 0),
        rectH: Math.round(img.getBoundingClientRect().height || 0),
      }));
    return { metaDescription, ogTitle, ogImage, twitterImage, articleText, images };
  });

  let text = data.articleText || data.metaDescription || data.ogTitle || '';
  const quoted = data.metaDescription.match(/:\s*"([\s\S]*?)(?:"$|$)/);
  if (quoted?.[1] && quoted[1].length > text.length / 2) text = quoted[1];
  const posterUrls = pickInstagramPostImageUrls(data.images, postLimit);
  const fallbackPosterUrl = pickPosterImage([
    { src: data.ogImage, w: 336, h: 336, priority: 1 },
    { src: data.twitterImage, w: 336, h: 336, priority: 1 },
    ...data.images,
  ]);
  return buildCandidatesFromText({
    source,
    sourceUrl: url,
    text,
    title: data.ogTitle || text,
    posterUrl: posterUrls[0] || fallbackPosterUrl,
    posterUrls: posterUrls.length ? posterUrls : [fallbackPosterUrl].filter(Boolean),
    page,
  });
}

async function collectNaverArticleLinks(page, source) {
  await safeGoto(page, source.url);
  await page.waitForFunction(() => document.querySelectorAll('a[href*="/articles/"], a[href*="ArticleRead"], a[href*="articleid"]').length > 0, null, { timeout: 9000 }).catch(() => {});
  return await page.evaluate(() => {
    const textOf = (node) => (node?.textContent || '').replace(/\s+/g, ' ').trim();
    const imageOf = (root) => {
      const img = root?.querySelector('img');
      return img?.currentSrc || img?.src || img?.getAttribute('data-src') || img?.getAttribute('data-lazysrc') || '';
    };
    const isAdminNotice = (title) => /\[?운영진공지\]?|필독|윤리위원회|강사\s*선정\s*발표|강사\s*모집\s*공고|강습\s*신청\s*및\s*입금\s*방법/i.test(title);
    const hasEventDate = (title) => /\b20\d{2}[.\-/년]\s*\d{1,2}[.\-/월]\s*\d{1,2}|(?:^|\s)\d{1,2}[./월]\s*\d{1,2}(?:일|\b)/.test(title);
    const items = [...document.querySelectorAll('a[href*="/articles/"], a[href*="ArticleRead"], a[href*="articleid"]')]
      .map((anchor, index) => {
        const href = anchor.href.split('&commentFocus=')[0];
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

    const deduped = [...new Map(items.map((item) => [item.href, item])).values()];
    return deduped
      .filter((item) => !isAdminNotice(`${item.title} ${item.rowText}`))
      .sort((a, b) => {
        const aDate = hasEventDate(a.title) ? 0 : 1;
        const bDate = hasEventDate(b.title) ? 0 : 1;
        return aDate - bDate || a.index - b.index;
      })
      .slice(0, 24);
  }).catch(() => []);
}

async function scrapeNaverArticle(page, link, source) {
  await safeGoto(page, link.href, postTimeoutMs);
  const frame = page.frames().find((item) => item.name() === 'cafe_main') || page.mainFrame();
  await frame.evaluate(() => window.scrollTo(0, Math.floor(document.body.scrollHeight / 2))).catch(() => {});
  await page.waitForTimeout(700);
  await frame.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {});
  await page.waitForTimeout(700);
  const data = await frame.evaluate(() => {
    const title = document.querySelector('.title_text, h3.title_text, .ArticleTitle, h1')?.textContent || '';
    const viewer = document.querySelector('.article_viewer, .se-main-container, .ContentRenderer, .ArticleContentBox, #tbody, .NHN_Writeform_Main, .post_ct, .se-viewer, .article_container, .article-content, .content-area');
    const text = viewer?.innerText || '';
    const imageRoot = viewer || document;
    const images = [...imageRoot.querySelectorAll('img[src*="postfiles"], img[src*="cafeptthumb"], .se-image-resource, img')]
      .map((img) => ({
        src: img.currentSrc || img.src || img.getAttribute('data-src') || img.getAttribute('data-lazysrc') || img.getAttribute('data-original') || img.getAttribute('data-url') || '',
        w: img.naturalWidth || img.width || 0,
        h: img.naturalHeight || img.height || 0,
      }))
      .filter((img) => img.src);
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

function resolveLittlyImageUrl(imageUrl = '') {
  const value = String(imageUrl || '').trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith('/images/')) return `https://cdn.litt.ly${value}`;
  return value;
}

async function collectLittlyCards(page, source) {
  await safeGoto(page, source.url, sourceTimeoutMs);
  const cards = await page.evaluate((sourceKind) => {
    const script = document.querySelector('script#data[type="text/plain"]');
    if (!script?.textContent) return [];
    let parsed;
    try {
      const encoded = script.textContent.trim();
      const bytes = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
      parsed = JSON.parse(new TextDecoder('utf-8').decode(bytes));
    } catch {
      try {
        parsed = JSON.parse(atob(script.textContent.trim()));
      } catch {
        return [];
      }
    }

    const blocks = Array.isArray(parsed.blocks) ? parsed.blocks : [];
    const profileTitle = parsed.profile?.title || parsed.profile?.subtitle || document.title || '';
    const oneDayHub = sourceKind === 'one_day_hub';
    const oneDayRe = /원\s*데이|원데이|\b1\s*day\b|\bone\s*day\b|\boneday\b|일일\s*(?:클래스|강습|수업|체험)|하루(?:만|짜리)?\s*(?:클래스|강습|수업|체험|배워)|체험\s*(?:클래스|강습|수업)|오픈\s*클래스|open\s*class/i;
    const collectableRe = /20\d{2}|원\s*데이|원데이|one\s*day|oneday|강습|수업|레슨|클래스|워크샵|워크숍|특강|입문|초급|소셜|파티|모집|class|lesson|workshop|social|party/i;
    const textBlocks = blocks
      .filter((block) => block?.use !== false && block?.type === 'text')
      .map((block) => [block.title, block.body].filter(Boolean).join('\n'))
      .filter(Boolean);

    return blocks
      .filter((block) => block?.use !== false && block?.type === 'link' && block.url)
      .map((block, index) => {
        const title = block.title || '';
        const body = block.body || '';
        const ownText = [title, body, block.url].filter(Boolean).join('\n');
        const localContext = textBlocks
          .filter((text) => oneDayRe.test(ownText) && oneDayRe.test(text))
          .slice(0, 2)
          .join('\n');
        return {
          index,
          href: block.url,
          title,
          body,
          image: block.image?.url || '',
          ownText,
          text: [profileTitle, localContext, title, body, block.url].filter(Boolean).join('\n'),
        };
      })
      .filter((item) => {
        if (oneDayHub && !oneDayRe.test(item.ownText)) return false;
        return collectableRe.test(item.text);
      })
      .slice(0, 18);
  }, source.sourceKind || '').catch(() => []);

  return cards;
}

async function scrapeLittlyCard(page, card, source) {
  const posterUrl = resolveLittlyImageUrl(card.image);
  return buildCandidatesFromText({
    source,
    sourceUrl: normalizeSourceUrl(card.href || source.url),
    text: card.text,
    title: card.title,
    posterUrl,
    page,
    referer: source.url,
  });
}

async function buildCandidatesFromText({ source, sourceUrl, text, title, posterUrl, posterUrls = [], page, referer = '' }) {
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
  const blockedKeywordReason = getBlockedKeywordReason(`${title}\n${cleanText}\n${sourceUrl}`);
  if (blockedKeywordReason) {
    result.skipped += 1;
    log(`skip ${source.id}: ${blockedKeywordReason}`);
    return [];
  }

  const posterUrlList = unique([...posterUrls, posterUrl].filter(Boolean));
  if (!posterUrlList.length) {
    result.skipped += 1;
    result.issues.push(`${source.id}: poster missing`);
    return [];
  }

  const { activity, eventType } = inferActivity(cleanText);
  const venue = inferVenue(cleanText, source);
  const djs = inferDjs(cleanText);
  const candidateTitle = makeCandidateTitle({ source, rawTitle: title, cleanText, eventType, djs });
  const isOneDayCandidate = oneDayPattern.test(`${candidateTitle}\n${cleanText}`);
  if (!isOneDayCandidate && looksLikeBroadScheduleNotice(candidateTitle, cleanText)) {
    result.skipped += 1;
    log(`skip ${source.id}: broad schedule notice (${candidateTitle})`);
    return [];
  }
  if (looksLikeGenericTitle(candidateTitle, source, eventType) && !(activity === 'social' && djs.length)) {
    result.skipped += 1;
    log(`skip ${source.id}: generic fallback title (${candidateTitle})`);
    return [];
  }

  const socialScheduleItems = activity === 'social' ? extractSocialScheduleItems(cleanText, source) : [];
  if (socialScheduleItems.length) {
    const candidates = [];
    const imageDataByUrl = new Map();
    const getImageData = async (imageUrl) => {
      if (!imageDataByUrl.has(imageUrl)) {
        imageDataByUrl.set(imageUrl, await imageToDataUrl(page, imageUrl, referer || sourceUrl));
      }
      return imageDataByUrl.get(imageUrl);
    };

    for (const [index, item] of socialScheduleItems.entries()) {
      const candidatePosterUrl = posterUrlList[index] || posterUrlList[0];
      const imageData = await getImageData(candidatePosterUrl);
      const raw = {
        keyword: source.name,
        source_url: sourceUrl,
        poster_url: candidatePosterUrl,
        ...(imageData ? { imageData } : {}),
        extracted_text: cleanText.slice(0, 6000),
        structured_data: {
          title: item.title,
          date: item.date,
          ...(item.day ? { day: item.day } : {}),
          event_type: eventType,
          activity_type: activity,
          location: venue || source.name,
          venue_name: venue || source.name,
          dance_scope: source.scope,
          genre_family: source.genre_family,
          dance_genre: source.dance_genre,
          ...(item.djs.length ? { djs: item.djs } : {}),
          ...(item.times.length ? { times: item.times } : {}),
          ...(item.fee ? { fee: item.fee } : {}),
        },
      };

      const prepared = prepareCandidate(raw, { today });
      if (!prepared.validation.ok) {
        result.skipped += 1;
        log(`skip ${source.id} ${item.date}: ${prepared.validation.errors.join('; ')}`);
        continue;
      }

      candidates.push(buildNetlifyPayload(raw, { today }));
    }

    return candidates;
  }

  const dates = selectCandidateDates({ title: candidateTitle, cleanText, activity });
  if (!dates.length) {
    result.skipped += 1;
    if (oneDayPattern.test(cleanText)) {
      result.issues.push(`${source.id}: one-day info has no explicit future date`);
    }
    return [];
  }

  const candidates = [];
  const imageDataByUrl = new Map();
  const getImageData = async (imageUrl) => {
    if (!imageDataByUrl.has(imageUrl)) {
      imageDataByUrl.set(imageUrl, await imageToDataUrl(page, imageUrl, referer || sourceUrl));
    }
    return imageDataByUrl.get(imageUrl);
  };

  for (const [index, date] of dates.entries()) {
    const candidatePosterUrl = posterUrlList[index] || posterUrlList[0];
    const imageData = await getImageData(candidatePosterUrl);
    const raw = {
      keyword: source.name,
      source_url: sourceUrl,
      poster_url: candidatePosterUrl,
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

  let response;
  let bodyText = '';
  try {
    const postResult = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(candidate),
    }, postRequestTimeoutMs);
    response = postResult.response;
    bodyText = postResult.body;
  } catch (error) {
    const message = error?.message || error?.name || 'post request failed';
    result.skipped += 1;
    result.issues.push(`post ${candidate.id}: ${message}`);
    log(`post failed ${candidate.id}: ${message}`);
    return;
  }

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
    const message = error.message || 'unknown error';
    if (message.startsWith('no content: ')) {
      recordNoContent(label, message.replace(/^no content:\s*/, ''));
    } else {
      recordAccessFailure(label, message);
    }
    return [];
  } finally {
    clearTimeout(timer);
  }
}

function hasAccessFailure(label) {
  return result.accessFailures.some((item) => item.startsWith(`${label}(`));
}

function hasNoContent(label) {
  return result.noContentSources.some((item) => item.startsWith(`${label}(`));
}

async function collectSource(page, source) {
  if (source.type === 'instagram') {
    if (instagramCircuitOpen) {
      recordInstagramCircuitSkip(source);
      return [];
    }
    await throttleInstagram(`profile ${source.id}`, instagramSourceDelayMs);
    const links = await withBoundedStep(source.id, () => collectInstagramLinks(page, source), sourceTimeoutMs);
    if (!links.length) {
      if (hasAccessFailure(source.id)) return [];
      if (hasNoContent(source.id)) return [];
      recordAccessFailure(source, 'instagram post links unavailable or session required');
      return [];
    }
    markInstagramProfileSuccess();
    const candidates = [];
    for (const url of links.slice(0, postLimit)) {
      await throttleInstagram(`post ${source.id}`, instagramPostDelayMs);
      const postCandidates = await withBoundedStep(`${source.id}:post`, () => scrapeInstagramPost(page, url, source), postTimeoutMs + 8000);
      candidates.push(...postCandidates);
    }
    return candidates;
  }

  if (source.type === 'naver_cafe') {
    const links = await withBoundedStep(source.id, () => collectNaverArticleLinks(page, source), sourceTimeoutMs);
    if (!links.length) {
      if (hasAccessFailure(source.id)) return [];
      recordNoContent(source, 'no article links');
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
      if (hasAccessFailure(source.id)) return [];
      recordNoContent(source, 'no article links');
      return [];
    }
    const candidates = [];
    for (const link of links.slice(0, postLimit)) {
      const postCandidates = await withBoundedStep(`${source.id}:article`, () => scrapeDaumArticle(page, link, source), postTimeoutMs + 8000);
      candidates.push(...postCandidates);
    }
    return candidates;
  }

  if (source.type === 'littly') {
    const cards = await withBoundedStep(source.id, () => collectLittlyCards(page, source), sourceTimeoutMs);
    if (!cards.length) {
      if (hasAccessFailure(source.id)) return [];
      recordNoContent(source, 'no active link cards');
      return [];
    }
    const candidates = [];
    for (const card of cards.slice(0, postLimit * 3)) {
      const cardCandidates = await withBoundedStep(`${source.id}:card`, () => scrapeLittlyCard(page, card, source), postTimeoutMs + 5000);
      candidates.push(...cardCandidates);
    }
    return candidates;
  }

  recordAccessFailure(source, `unsupported ${source.type}`);
  return [];
}

function browserContextOptions() {
  return {
    viewport: { width: 1600, height: 1200 },
    deviceScaleFactor: 2,
    locale: 'ko-KR',
  };
}

async function openBrowserContext() {
  try {
    const browser = await chromium.connectOverCDP(browserCdpUrl, { timeout: 6000 });
    const context = browser.contexts()[0];
    if (context) {
      log(`browser connected over CDP: ${browserCdpUrl}`);
      return { browser, context, close: () => browser.close() };
    }
    await browser.close();
  } catch (error) {
    log(`browser CDP unavailable: ${error.message}`);
  }

  try {
    const context = await chromium.launchPersistentContext(browserProfileDir, {
      ...browserContextOptions(),
      channel: 'chrome',
      headless: browserHeadless,
    });
    log(`browser persistent profile: ${browserProfileDir} headless=${browserHeadless}`);
    return { browser: null, context, close: () => context.close() };
  } catch (error) {
    log(`browser persistent profile unavailable: ${error.message}`);
  }

  const browser = await chromium.launch({ headless: browserHeadless });
  const context = await browser.newContext(browserContextOptions());
  log(`browser fallback: ephemeral chromium headless=${browserHeadless}`);
  return { browser, context, close: () => browser.close() };
}

async function main() {
  if (profile !== 'swing-daily') {
    throw new Error(`native collector supports swing-daily only: ${profile}`);
  }

  const sources = getAutomationSourceList('swing-daily')
    .filter((source) => source.saveEnabled && source.scope === 'swing')
    .filter((source) => sourcePriorities.length === 0 || sourcePriorities.includes(Number(source.priority)))
    .filter((source) => sourceIds.length === 0 || sourceIds.includes(source.id))
    .sort((a, b) => sourceOrderWeight(a) - sourceOrderWeight(b)
      || Number(a.priority || 99) - Number(b.priority || 99)
      || a.name.localeCompare(b.name, 'ko'))
    .slice(0, sourceLimit > 0 ? sourceLimit : undefined);

  log(`start profile=${profile} sources=${sources.length} today=${today} dryRun=${dryRun} priorities=${sourcePriorities.join(',') || 'all'} budget_ms=${runBudgetMs} post_timeout_ms=${postRequestTimeoutMs} image_timeout_ms=${imageFetchTimeoutMs}`);
  const browserSession = await openBrowserContext();
  const { context } = browserSession;
  const page = await context.newPage();
  await page.setViewportSize({ width: 1600, height: 1200 }).catch(() => {});
  page.setDefaultTimeout(12000);
  page.setDefaultNavigationTimeout(18000);

  try {
    const seenRunKeys = new Set();
    for (let sourceIndex = 0; sourceIndex < sources.length; sourceIndex += 1) {
      const source = sources[sourceIndex];
      if (!hasRunBudget(runDeadlineGuardMs())) {
        recordDeadlineReached(sources, sourceIndex);
        break;
      }

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
        if (!hasRunBudget(Math.min(10_000, runDeadlineGuardMs()))) {
          recordDeadlineReached(sources, sourceIndex + 1);
          break;
        }

        const sd = candidate.structured_data || {};
        const runKey = [
          sd.date,
          normalizeForCompare(sd.title),
          normalizeForCompare(sd.location || sd.venue_name),
        ].join('|');
        if (seenRunKeys.has(runKey)) {
          result.skipped += 1;
          log(`skip ${source.id} ${sd.date}: duplicate within run (${sd.title})`);
          continue;
        }
        seenRunKeys.add(runKey);
        await postCandidate(candidate);
      }

      if (result.deadlineReached) break;
    }
  } finally {
    await browserSession.close();
  }

  printSummary();
}

function printSummary() {
  const accessFailures = unique(result.accessFailures).slice(0, 12);
  const instagramCircuitSkipsAll = unique(result.instagramCircuitSkips);
  const instagramCircuitSkips = instagramCircuitSkipsAll.slice(0, 12);
  const noContentSources = unique(result.noContentSources).slice(0, 12);
  const issues = unique(result.issues).slice(0, 8);
  console.log('INGESTION_RESULT_JSON_START');
  console.log(JSON.stringify({
    engine: 'native',
    insertCount: result.inserted,
    skipCount: result.skipped,
    accessFailures,
    instagramCircuitSkips: {
      count: instagramCircuitSkipsAll.length,
      sources: instagramCircuitSkips,
    },
    noContentSources,
    issues,
    candidates: result.candidates.slice(0, 20),
    deadlineReached: result.deadlineReached,
    remainingSources: result.remainingSources.slice(0, 20),
    remainingSourceCount: result.remainingSources.length,
  }, null, 2));
  console.log('INGESTION_RESULT_JSON_END');
  console.log('==TELEGRAM_SUMMARY_START==');
  console.log(`신규: ${result.inserted}건`);
  console.log(`스킵: ${result.skipped}건`);
  console.log(`과거데이터삭제: ${cleanupCount}건`);
  console.log(`접근불가: ${accessFailures.length ? accessFailures.join(', ') : 'none'}`);
  console.log(`인스타회로차단: ${instagramCircuitSkipsAll.length ? `${instagramCircuitSkipsAll.length}건 (${instagramCircuitSkips.join(', ')}${instagramCircuitSkipsAll.length > instagramCircuitSkips.length ? ', ...' : ''})` : 'none'}`);
  console.log(`수집대상없음: ${noContentSources.length ? noContentSources.join(', ') : 'none'}`);
  console.log(`이슈: ${issues.length ? issues.join(' / ') : 'none'}`);
  console.log('==TELEGRAM_SUMMARY_END==');
}

main().catch((error) => {
  result.issues.push(error.message);
  printSummary();
  process.exitCode = 1;
});
