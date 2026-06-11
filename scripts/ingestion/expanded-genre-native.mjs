import { chromium } from 'playwright';
import {
  buildNetlifyPayload,
  normalizeSourceUrl,
  prepareCandidate,
} from './candidate-utils.mjs';
import {
  getAutomationSourceList,
  getExcludedSourceReason,
} from './collection-registry.mjs';

const profile = process.env.INGESTION_PROFILE || 'expanded-ingestion';
const endpoint = process.env.NETLIFY_INGEST_ENDPOINT || 'https://swingenjoy.com/api/scraped-events';
const dryRun = process.env.EXPANDED_INGESTION_DRY_RUN !== '0';
const sourceIds = (process.env.EXPANDED_INGESTION_SOURCE_IDS || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const sourceLimit = Number(process.env.EXPANDED_INGESTION_SOURCE_LIMIT || 0);
const postLimit = Number(process.env.EXPANDED_INGESTION_POST_LIMIT || 4);
const sourceTimeoutMs = Number(process.env.EXPANDED_INGESTION_SOURCE_TIMEOUT_MS || 18000);
const postTimeoutMs = Number(process.env.EXPANDED_INGESTION_POST_TIMEOUT_MS || 22000);
const maxFutureDays = Number(process.env.EXPANDED_INGESTION_MAX_FUTURE_DAYS || 540);
const browserHeadless = process.env.INGESTION_BROWSER_HEADLESS === '1';
const safeMode = process.env.INGESTION_SAFE_MODE !== '0';
const sourceDelayMs = Number(process.env.EXPANDED_INGESTION_SOURCE_DELAY_MS || (safeMode ? 12_000 : 0));
const today = todayKST();

const result = {
  scanned: 0,
  validated: 0,
  inserted: 0,
  skipped: 0,
  accessFailures: [],
  issues: [],
  candidates: [],
};

const supportedWebsiteSources = new Set([
  'dancecode',
  'koreatango',
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
  console.log(`[expanded-native] ${message}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jitter(ms) {
  if (!ms) return 0;
  return Math.max(0, Math.round(ms * (0.8 + Math.random() * 0.4)));
}

function compactText(value = '') {
  return String(value || '').replace(/\r/g, '').replace(/[ \t]+/g, ' ').trim();
}

function isoDate(year, month, day) {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  const date = new Date(`${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T00:00:00+09:00`);
  if (Number.isNaN(date.getTime())) return '';
  if (date.getFullYear() !== y || date.getMonth() + 1 !== m || date.getDate() !== d) return '';
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function normalizeYear(value) {
  const year = Number(value);
  if (year >= 2000) return year;
  if (year >= 0 && year <= 80) return 2000 + year;
  return 1900 + year;
}

function contextAround(text, index, length) {
  return compactText(text.slice(Math.max(0, index - 60), Math.min(text.length, index + length + 100)));
}

function scoreDateContext(context = '') {
  let score = 0;
  if (/행사\s*(기간|일정|일시)|공연\s*일시|행사일정|event\s*date|date/i.test(context)) score += 7;
  if (/일시|날짜|시작|개강|열립니다|진행|starts?|schedule/i.test(context)) score += 3;
  if (/접수\s*기간|신청|마감|입금|결제|등록|티켓\s*오픈|얼리\s*버드|deadline|registration|closed/i.test(context)) score -= 8;
  if (/작성|업로드|views?|조회|공지|notice/i.test(context)) score -= 3;
  return score;
}

function extractDateMentions(text = '') {
  const raw = compactText(text);
  const mentions = [];
  const add = (date, rawValue, index, length) => {
    if (!date || date < today) return;
    const todayMs = Date.parse(`${today}T00:00:00+09:00`);
    const dateMs = Date.parse(`${date}T00:00:00+09:00`);
    if (!Number.isFinite(dateMs) || (dateMs - todayMs) / 86400000 > maxFutureDays) return;
    const context = contextAround(raw, index, length);
    mentions.push({
      date,
      raw: rawValue,
      context,
      score: scoreDateContext(context),
      index,
    });
  };

  for (const match of raw.matchAll(/((?:20)?\d{2})\s*년\s*(0?[1-9]|1[0-2])\s*월\s*(0?[1-9]|[12]\d|3[01])\s*일/g)) {
    add(isoDate(normalizeYear(match[1]), match[2], match[3]), match[0], match.index, match[0].length);
  }

  for (const match of raw.matchAll(/(20\d{2})\s*[.\/-]\s*(0?[1-9]|1[0-2])\s*[.\/-]\s*(0?[1-9]|[12]\d|3[01])/g)) {
    add(isoDate(match[1], match[2], match[3]), match[0], match.index, match[0].length);
  }

  return mentions;
}

function extractLabeledPrimaryDate(text = '') {
  const labeledPatterns = [
    /행사\s*기간\s*\n?\s*((?:20)?\d{2})\s*년\s*(0?[1-9]|1[0-2])\s*월\s*(0?[1-9]|[12]\d|3[01])\s*일/i,
    /행사\s*일시\s*[|:\n]?\s*((?:20)?\d{2})\s*년\s*(0?[1-9]|1[0-2])\s*월\s*(0?[1-9]|[12]\d|3[01])\s*일/i,
    /공연\s*일시\s*[|:\n]?\s*((?:20)?\d{2})\s*[.년]\s*(0?[1-9]|1[0-2])\s*[.월]\s*(0?[1-9]|[12]\d|3[01])/i,
    /일시\s*[|:\n]?\s*((?:20)?\d{2})\s*년\s*(0?[1-9]|1[0-2])\s*월\s*(0?[1-9]|[12]\d|3[01])\s*일/i,
  ];

  for (const pattern of labeledPatterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const date = isoDate(normalizeYear(match[1]), match[2], match[3]);
    if (!date || date < today) continue;
    const todayMs = Date.parse(`${today}T00:00:00+09:00`);
    const dateMs = Date.parse(`${date}T00:00:00+09:00`);
    if (!Number.isFinite(dateMs) || (dateMs - todayMs) / 86400000 > maxFutureDays) continue;
    return {
      date,
      raw: match[0],
      context: compactText(match[0]),
      score: 99,
      index: match.index || 0,
    };
  }

  return null;
}

function selectPrimaryDate(text = '') {
  const labeled = extractLabeledPrimaryDate(text);
  if (labeled) return labeled;

  const mentions = extractDateMentions(text);
  const deduped = [...new Map(mentions.map((mention) => [`${mention.date}:${mention.context}`, mention])).values()];
  return deduped
    .filter((mention) => mention.score >= 1)
    .sort((a, b) => b.score - a.score || a.date.localeCompare(b.date) || a.index - b.index)[0] || null;
}

function pickTitle(data, source) {
  const title = compactText(data.title || '')
    .replace(/^댄스코드\s*-\s*/i, '')
    .replace(/\s*:\s*Korea Tango Cooperative.*$/i, '')
    .replace(/\s*\|\s*.*$/, '');
  if (title && title.length >= 3 && title.length <= 100) return title;
  return data.headings.find((heading) => heading.length >= 3 && heading.length <= 100) || source.name;
}

function pickPosterImage(images = []) {
  return images
    .filter((image) => image?.src && Number(image.w || 0) >= 400 && Number(image.h || 0) >= 300)
    .filter((image) => !/blank_|logo|sns_|google|translate|cert|mark|profile|avatar|favicon/i.test(`${image.src} ${image.alt || ''}`))
    .sort((a, b) => (Number(b.w || 0) * Number(b.h || 0)) - (Number(a.w || 0) * Number(a.h || 0)))[0]?.src || '';
}

function inferActivityForExpanded(text = '', source) {
  if (source.id === 'dancecode' && /행사\s*(기간|장소)|행사정보|행사 정보/.test(text)) return 'event';
  if (/(팀원|크루|멤버|강사|댄서|출연진)\s*모집|오디션|audition|crew\s*recruit|team\s*recruit/i.test(text)) return 'recruit';
  if (/강습|수업|레슨|클래스|워크샵|워크숍|특강|원데이|오픈\s*클래스|입문|초급|class|lesson|workshop/i.test(text)) return 'class';
  if (/소셜|social|프랙티카|practica|밀롱가|milonga|\bdj\b|디제이/i.test(text)) return 'social';
  return 'event';
}

function inferEventType(activity) {
  return {
    class: '강습',
    social: '소셜',
    event: '행사',
    recruit: '모집',
  }[activity] || '행사';
}

function inferTags(text = '') {
  const tags = new Set();
  if (/배틀|battle|open\s*style/i.test(text)) tags.add('battle');
  if (/참가\s*신청|참가자|참가비|participant/i.test(text)) tags.add('participant');
  if (/공연|performance|showcase/i.test(text)) tags.add('performance');
  if (/워크샵|워크숍|workshop/i.test(text)) tags.add('workshop');
  if (/\bdj\b|디제이/i.test(text)) tags.add('dj');
  if (/오픈\s*클래스|open\s*class/i.test(text)) tags.add('open_class');
  return [...tags];
}

function extractVenue(text = '', source) {
  const lines = text.split(/\n+/).map((line) => compactText(line)).filter(Boolean);
  const placeLabelIndex = lines.findIndex((line) => /^행사장소$|^공연\s*장소/.test(line));
  const labeled = placeLabelIndex >= 0 ? lines[placeLabelIndex + 1] : '';
  const inline = text.match(/(?:행사장소|공연\s*장소)\s*[|:\n]\s*([^\n]+)/)?.[1] || '';
  const raw = compactText(labeled || inline || '');
  if (!raw) return { location: source.name, venue_name: source.name, address: '' };

  const parenAddress = raw.match(/^(.+?)\s*[（(](.+?)[）)]$/);
  if (parenAddress) {
    return {
      location: compactText(parenAddress[1]),
      venue_name: compactText(parenAddress[1]),
      address: compactText(parenAddress[2]),
    };
  }

  const venueMatch = raw.match(/([가-힣A-Za-z0-9·\s]+(?:문화센터|공연장|아트홀|센터|홀|스튜디오|극장))/);
  return {
    location: compactText(venueMatch?.[1] || raw),
    venue_name: compactText(venueMatch?.[1] || raw),
    address: raw.length > 15 ? raw : '',
  };
}

function isStreetOutOfScope(text = '') {
  if (!/현대\s*무용|컨템포러리|발레|한국\s*무용|뮤지컬|k-?pop|커버\s*댄스|힐\s*댄스/i.test(text)) return false;
  return /공연|예매|티켓|관람/.test(text) && !/배틀|battle|workshop|워크샵|워크숍/i.test(text);
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
  await page.waitForTimeout(1000);
}

async function collectWebsiteLinks(page, source) {
  await safeGoto(page, source.url);
  return await page.evaluate((sourceId) => {
    const links = [...document.querySelectorAll('a[href]')]
      .map((anchor) => ({
        text: (anchor.innerText || anchor.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 140),
        href: anchor.href,
      }))
      .filter((link) => link.href && !link.href.startsWith('javascript:'));

    const seen = new Set();
    const filtered = links.filter((link) => {
      if (seen.has(link.href)) return false;
      seen.add(link.href);
      if (sourceId === 'dancecode') return /\/dance\/view\/\d+/.test(link.href) && !/모집마감/.test(link.text);
      if (sourceId === 'koreatango') return /bmode=view/.test(link.href);
      return false;
    });
    return filtered.slice(0, 12);
  }, source.id).catch(() => []);
}

async function scrapeDetailPage(page, link, source) {
  await safeGoto(page, link.href, postTimeoutMs);
  await page.evaluate(() => window.scrollBy(0, Math.round(window.innerHeight * 0.8))).catch(() => {});
  await page.waitForTimeout(350);

  const data = await page.evaluate(() => ({
    finalUrl: location.href,
    title: document.title || '',
    headings: [...document.querySelectorAll('h1,h2,h3,.bo_v_tit,.view_tit,.tit')]
      .map((node) => (node.innerText || '').trim().replace(/\s+/g, ' '))
      .filter(Boolean)
      .slice(0, 10),
    text: document.body?.innerText || '',
    images: [...document.images]
      .map((image) => ({
        src: image.currentSrc || image.src || '',
        w: image.naturalWidth || 0,
        h: image.naturalHeight || 0,
        alt: image.alt || '',
      }))
      .filter((image) => image.src),
  }));

  const text = data.text || '';
  if (source.scope === 'street' && isStreetOutOfScope(text)) {
    result.skipped += 1;
    result.candidates.push(`skip:${source.id}:out-of-scope mixed art/commercial performance:${link.text}`);
    return [];
  }

  const dateMention = selectPrimaryDate(text);
  if (!dateMention) {
    result.skipped += 1;
    result.candidates.push(`skip:${source.id}:no verified event date:${link.text}`);
    return [];
  }

  const posterUrl = pickPosterImage(data.images);
  if (!posterUrl) {
    result.skipped += 1;
    result.candidates.push(`skip:${source.id}:no poster:${link.text}`);
    return [];
  }

  const activity = inferActivityForExpanded(text, source);
  const venue = extractVenue(text, source);
  const imageData = await imageToDataUrl(page, posterUrl, data.finalUrl);
  const title = pickTitle(data, source);
  const raw = {
    keyword: `${source.scope}:${source.id}`,
    source_url: normalizeSourceUrl(data.finalUrl || link.href),
    poster_url: posterUrl,
    ...(imageData ? { imageData } : {}),
    extracted_text: text.slice(0, 8000),
    structured_data: {
      title,
      date: dateMention.date,
      location: venue.location,
      venue_name: venue.venue_name,
      ...(venue.address ? { address: venue.address } : {}),
      event_type: inferEventType(activity),
      activity_type: activity,
      dance_scope: source.scope,
      genre_family: source.genre_family,
      dance_genre: source.dance_genre,
      tags: inferTags(text),
      source_profile: profile,
      source_name: source.name,
      date_evidence: dateMention.raw,
    },
  };

  const prepared = prepareCandidate(raw, { today });
  if (!prepared.validation.ok) {
    result.skipped += 1;
    result.candidates.push(`skip:${source.id}:${prepared.validation.errors.join('; ')}:${title}`);
    return [];
  }

  try {
    return [buildNetlifyPayload(raw, { today })];
  } catch (error) {
    result.skipped += 1;
    result.candidates.push(`skip:${source.id}:${error.message}:${title}`);
    return [];
  }
}

async function postCandidate(candidate) {
  result.validated += 1;
  if (dryRun) {
    result.candidates.push(`dry-run:${candidate.keyword}:${candidate.structured_data?.date}:${candidate.structured_data?.title}`);
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
    result.candidates.push(`skip:${candidate.keyword}:${body.skipped[0].reason || 'duplicate'}`);
    return;
  }

  const count = Number(body.count ?? body.success_count ?? 1);
  result.inserted += count;
  result.candidates.push(`saved:${candidate.keyword}:${candidate.structured_data?.date}:${candidate.structured_data?.title}`);
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
  if (!supportedWebsiteSources.has(source.id)) {
    result.accessFailures.push(`${source.id}(unsupported expanded website source)`);
    return [];
  }

  const links = await withBoundedStep(source.id, () => collectWebsiteLinks(page, source), sourceTimeoutMs);
  if (!links.length) {
    result.accessFailures.push(`${source.id}(no detail links)`);
    return [];
  }

  const candidates = [];
  for (const link of links.slice(0, postLimit)) {
    result.scanned += 1;
    const pageCandidates = await withBoundedStep(`${source.id}:detail`, () => scrapeDetailPage(page, link, source), postTimeoutMs + 9000);
    candidates.push(...pageCandidates);
  }
  return candidates;
}

async function main() {
  if (profile !== 'expanded-ingestion') {
    throw new Error(`expanded native collector requires expanded-ingestion profile: ${profile}`);
  }

  const sources = getAutomationSourceList(profile)
    .filter((source) => source.saveEnabled && !source.discoveryOnly && source.scope !== 'swing')
    .filter((source) => ['website', 'directory'].includes(source.type))
    .filter((source) => sourceIds.length === 0 || sourceIds.includes(source.id))
    .sort((a, b) => a.priority - b.priority || a.scope.localeCompare(b.scope) || a.name.localeCompare(b.name, 'ko'))
    .slice(0, sourceLimit > 0 ? sourceLimit : undefined);

  log(`start profile=${profile} sources=${sources.length} today=${today} dryRun=${dryRun} headless=${browserHeadless} safeMode=${safeMode}`);
  const browser = await chromium.launch({ headless: browserHeadless });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    locale: 'ko-KR',
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

      log(`source ${source.id} ${source.scope} ${source.type} ${source.url}`);
      if (safeMode && sourceDelayMs > 0) {
        const waitMs = jitter(sourceDelayMs);
        log(`safe wait ${Math.round(waitMs / 1000)}s before ${source.id}`);
        await sleep(waitMs);
      }
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
  const accessFailures = [...new Set(result.accessFailures)].slice(0, 12);
  const issues = [...new Set(result.issues)].slice(0, 8);
  console.log('INGESTION_RESULT_JSON_START');
  console.log(JSON.stringify({
    engine: 'expanded-native',
    profile,
    dryRun,
    scannedCount: result.scanned,
    validatedCount: result.validated,
    insertCount: result.inserted,
    skipCount: result.skipped,
    accessFailures,
    issues,
    candidates: result.candidates.slice(0, 30),
  }, null, 2));
  console.log('INGESTION_RESULT_JSON_END');
  console.log('==TELEGRAM_SUMMARY_START==');
  console.log(`신규: ${result.inserted}건${dryRun ? ' (dry-run)' : ''}`);
  console.log(`검증후보: ${result.validated}건`);
  console.log(`스캔: ${result.scanned}건`);
  console.log(`스킵: ${result.skipped}건`);
  console.log('과거데이터삭제: 0건');
  console.log(`접근불가: ${accessFailures.length ? accessFailures.join(', ') : 'none'}`);
  console.log(`이슈: ${issues.length ? issues.join(' / ') : 'none'}`);
  console.log('==TELEGRAM_SUMMARY_END==');
}

main().catch((error) => {
  result.issues.push(error.message);
  printSummary();
  process.exitCode = 1;
});
