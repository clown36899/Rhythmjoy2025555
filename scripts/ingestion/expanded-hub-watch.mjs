import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import { getAutomationSourceList } from './collection-registry.mjs';

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, value = 'true'] = arg.replace(/^--/, '').split('=');
    return [key, value];
  }),
);

const today = args.get('date') || new Date().toISOString().slice(0, 10);
const mode = args.get('mode') || 'expanded-research';
const outputPrefix = args.get('output-prefix') || `expanded-genre-hub-watch-${today}`;
const timeoutMs = Number(args.get('timeout-ms') || 16000);
const limit = Number(args.get('limit') || 0);
const browserHeadless = process.env.INGESTION_BROWSER_HEADLESS === '1';
const safeMode = process.env.INGESTION_SAFE_MODE !== '0';
const sourceDelayMs = Number(process.env.EXPANDED_HUB_WATCH_SOURCE_DELAY_MS || (safeMode ? 8000 : 0));

const priorityHubIds = new Set([
  'latin-in-seoul',
  'latin-in-seoul-weekly',
  'where-to-dance-salsa-seoul',
  'where-to-dance-bachata-seoul',
  'salsavida-seoul',
  'salsavida-seoul-calendar',
  'place-ocean',
  'korea-latin-dance-hub',
  'latindancehub-seoul-guide',
  'flowdat-korea',
  'social-dance-today',
  'tangocalendar',
  'tanguear-seoul',
  'tangotocup-seoul',
  'jeju-summ-milonga',
  'chuncheon-tango-festival',
  'koreatango',
  'dancecode',
  'freezekr-stage',
  'dancechives',
  'flowdat-street-search',
]);

const activityTerms = {
  class: ['강습', '수업', '레슨', '클래스', '워크샵', '워크숍', '입문', '초급', '기초', '원데이', 'lesson', 'class', 'workshop', 'beginner', 'training', 'course'],
  social: ['소셜', 'social', 'milonga', '밀롱가', 'practica', '프랙티카', 'dj', 'bar', 'club', 'party', '파티'],
  event: ['행사', '대회', '배틀', 'battle', 'festival', '페스티벌', '공연', 'performance', 'showcase', 'competition', 'jam'],
  recruit: ['모집', '신청', '참가', '오디션', 'audition', 'recruit', 'application', 'register', 'entry', 'crew', 'team'],
};

const liveTerms = [
  'weekly',
  'last updated',
  'updated',
  'calendar',
  'schedule',
  'upcoming',
  'every',
  '매주',
  '주간',
  '이번 주',
  '캘린더',
  '일정',
  '진행중',
  '모집중',
];

const originalRouteTerms = [
  'instagram',
  'kakao',
  'naver',
  'ticket',
  'forms',
  'apply',
  'register',
  '신청',
  '예매',
  '원본',
  '문의',
];

function escapeRegex(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function countTerms(text, terms) {
  const lower = text.toLowerCase();
  return terms.reduce((count, term) => {
    const pattern = new RegExp(escapeRegex(term.toLowerCase()), 'g');
    return count + (lower.match(pattern)?.length || 0);
  }, 0);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jitter(ms) {
  if (!ms) return 0;
  return Math.max(0, Math.round(ms * (0.8 + Math.random() * 0.4)));
}

function normalizeDate(year, month, day) {
  const date = new Date(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00+09:00`);
  if (Number.isNaN(date.getTime())) return null;
  if (date.getMonth() + 1 !== Number(month) || date.getDate() !== Number(day)) return null;
  return date;
}

function toIso(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function extractDateCandidates(text, todayIso) {
  const todayDate = new Date(`${todayIso}T00:00:00+09:00`);
  const found = new Map();
  const monthNames = {
    jan: 1,
    january: 1,
    feb: 2,
    february: 2,
    mar: 3,
    march: 3,
    apr: 4,
    april: 4,
    may: 5,
    jun: 6,
    june: 6,
    jul: 7,
    july: 7,
    aug: 8,
    august: 8,
    sep: 9,
    sept: 9,
    september: 9,
    oct: 10,
    october: 10,
    nov: 11,
    november: 11,
    dec: 12,
    december: 12,
  };

  const add = (date, raw) => {
    if (!date) return;
    const iso = toIso(date);
    const item = found.get(iso) || { date: iso, raw: [], future: date >= todayDate };
    if (raw && item.raw.length < 4 && !item.raw.includes(raw.trim())) item.raw.push(raw.trim());
    found.set(iso, item);
  };

  for (const match of text.matchAll(/(20\d{2})\s*[.\/\-년]\s*(0?[1-9]|1[0-2])\s*[.\/\-월]\s*(0?[1-9]|[12]\d|3[01])/g)) {
    add(normalizeDate(Number(match[1]), Number(match[2]), Number(match[3])), match[0]);
  }

  for (const match of text.matchAll(/(0?[1-9]|1[0-2])\s*월\s*(0?[1-9]|[12]\d|3[01])\s*일/g)) {
    const month = Number(match[1]);
    const day = Number(match[2]);
    const year = month < todayDate.getMonth() + 1 ? todayDate.getFullYear() + 1 : todayDate.getFullYear();
    add(normalizeDate(year, month, day), match[0]);
  }

  for (const match of text.matchAll(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(0?[1-9]|[12]\d|3[01])(?:\s*[–-]\s*(0?[1-9]|[12]\d|3[01]))?(?:,?\s*(20\d{2}))?/gi)) {
    const month = monthNames[match[1].toLowerCase().replace('.', '')];
    const year = match[4] ? Number(match[4]) : (month < todayDate.getMonth() + 1 ? todayDate.getFullYear() + 1 : todayDate.getFullYear());
    add(normalizeDate(year, month, Number(match[2])), match[0]);
    if (match[3]) add(normalizeDate(year, month, Number(match[3])), match[0]);
  }

  return [...found.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function linesWithTerms(text, terms, max = 10) {
  const lowerTerms = terms.map((term) => term.toLowerCase());
  const lines = text.split(/\n+/).map((line) => line.trim().replace(/\s+/g, ' ')).filter(Boolean);
  const hits = [];
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (lowerTerms.some((term) => lower.includes(term)) && line.length >= 6 && line.length <= 220) {
      if (!hits.includes(line)) hits.push(line);
    }
    if (hits.length >= max) break;
  }
  return hits;
}

function getWatchRole(source) {
  if (source.discoveryOnly || source.promotionPolicy === 'external_hub_only') return 'hub-discovery';
  if (source.promotionPolicy === 'official_event_page_allowed') return 'official-event-axis';
  if (source.sourceKind === 'festival') return 'official-event-axis';
  return 'origin-candidate';
}

function classifySource(source, data) {
  if (!data.ok) {
    return {
      status: 'blocked',
      action: 'manual-retry-or-replace',
      reason: data.error || `HTTP ${data.status || 'unknown'}`,
    };
  }

  if (data.textLength < 500 && source.id === 'tangocalendar') {
    return {
      status: 'needs-js-route',
      action: 'inspect-rendered-calendar-or-api',
      reason: '페이지는 살아있지만 본문 추출이 짧아 캘린더 렌더링 경로 분석 필요',
    };
  }

  if (data.futureDateCount > 0 && data.imageCandidateCount > 0 && getWatchRole(source) === 'official-event-axis') {
    return {
      status: 'official-candidate',
      action: 'manual-originality-check',
      reason: '공식 축에서 미래 날짜와 이미지 후보 확인',
    };
  }

  if (getWatchRole(source) === 'hub-discovery') {
    return {
      status: data.liveSignalScore > 0 ? 'live-hub' : 'hub-needs-review',
      action: 'extract-venue-organizer-list',
      reason: '허브/디렉터리이므로 자체 저장하지 말고 원본 venue/organizer를 역추적',
    };
  }

  if (data.futureDateCount > 0 && data.imageCandidateCount > 0) {
    return {
      status: 'origin-candidate',
      action: 'item-level-check',
      reason: '미래 날짜와 이미지가 있으므로 개별 항목 단위 확인 필요',
    };
  }

  if (data.liveSignalScore > 0) {
    return {
      status: 'scene-map-source',
      action: 'keep-for-scene-map',
      reason: '현재성 신호는 있으나 저장 후보 필드가 부족',
    };
  }

  return {
    status: 'weak-source',
    action: 'deprioritize',
    reason: '현재성/날짜/이미지 신호가 약함',
  };
}

async function probe(page, source) {
  try {
    const response = await page.goto(source.url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    await page.waitForTimeout(source.type === 'instagram' ? 1800 : 900);
    await page.evaluate(() => window.scrollBy(0, Math.round(window.innerHeight * 0.8))).catch(() => {});
    await page.waitForTimeout(350);
    const data = await page.evaluate(() => {
      const text = document.body?.innerText || '';
      const images = Array.from(document.images)
        .map((image) => ({
          src: image.currentSrc || image.src || '',
          alt: image.alt || '',
          width: image.naturalWidth || 0,
          height: image.naturalHeight || 0,
        }))
        .filter((image) => image.src);
      const links = Array.from(document.querySelectorAll('a[href]'))
        .map((link) => ({
          text: (link.innerText || link.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 140),
          href: link.href,
        }))
        .filter((link) => link.href);
      return {
        finalUrl: location.href,
        title: document.title || '',
        text,
        images,
        links,
      };
    });

    const dates = extractDateCandidates(data.text, today);
    const imageCandidates = data.images
      .filter((image) => image.width >= 120 && image.height >= 80)
      .sort((a, b) => (b.width * b.height) - (a.width * a.height))
      .slice(0, 12);
    const relevantLinks = data.links
      .filter((link) => originalRouteTerms.some((term) => `${link.text} ${link.href}`.toLowerCase().includes(term.toLowerCase())))
      .slice(0, 18);
    const activityCounts = Object.fromEntries(
      Object.entries(activityTerms).map(([key, terms]) => [key, countTerms(data.text, terms)]),
    );
    const liveSignalScore = countTerms(data.text, liveTerms);
    const evidenceTerms = [...liveTerms, ...Object.values(activityTerms).flat()];
    const summary = {
      ok: true,
      status: response?.status() || null,
      finalUrl: data.finalUrl,
      title: data.title,
      textLength: data.text.length,
      linkCount: data.links.length,
      imageCandidateCount: imageCandidates.length,
      futureDateCount: dates.filter((date) => date.future).length,
      pastDateCount: dates.filter((date) => !date.future).length,
      futureDates: dates.filter((date) => date.future).slice(0, 12),
      activityCounts,
      liveSignalScore,
      relevantLinks,
      imageCandidates,
      evidence: linesWithTerms(data.text, evidenceTerms, 12),
    };
    return { ...summary, ...classifySource(source, summary) };
  } catch (error) {
    const summary = {
      ok: false,
      status: null,
      finalUrl: source.url,
      title: '',
      textLength: 0,
      linkCount: 0,
      imageCandidateCount: 0,
      futureDateCount: 0,
      pastDateCount: 0,
      futureDates: [],
      activityCounts: {},
      liveSignalScore: 0,
      relevantLinks: [],
      imageCandidates: [],
      evidence: [],
      error: error.message.split('\n')[0],
    };
    return { ...summary, ...classifySource(source, summary) };
  }
}

function summarizeByScope(results) {
  return ['salsa', 'bachata', 'tango', 'street'].reduce((summary, scope) => {
    const rows = results.filter((result) => result.scope === scope);
    const activityTotals = { class: 0, social: 0, event: 0, recruit: 0 };
    for (const row of rows) {
      for (const key of Object.keys(activityTotals)) {
        activityTotals[key] += row.activityCounts[key] || 0;
      }
    }
    summary[scope] = {
      total: rows.length,
      accessible: rows.filter((row) => row.ok).length,
      liveHubs: rows.filter((row) => row.status === 'live-hub').map((row) => row.id),
      officialCandidates: rows.filter((row) => row.status === 'official-candidate').map((row) => row.id),
      blocked: rows.filter((row) => row.status === 'blocked').map((row) => row.id),
      activityTotals,
      nextTargets: rows
        .filter((row) => ['live-hub', 'official-candidate', 'origin-candidate', 'needs-js-route'].includes(row.status))
        .sort((a, b) => (b.futureDateCount + b.liveSignalScore + b.imageCandidateCount) - (a.futureDateCount + a.liveSignalScore + a.imageCandidateCount))
        .slice(0, 8)
        .map((row) => ({
          id: row.id,
          name: row.name,
          status: row.status,
          action: row.action,
          futureDateCount: row.futureDateCount,
          imageCandidateCount: row.imageCandidateCount,
        })),
    };
    return summary;
  }, {});
}

function renderMarkdown(report) {
  const resultRows = report.results.map((row) => (
    `| ${row.scope} | ${row.name.replace(/\|/g, '/')} | ${row.watchRole} | ${row.status} | ${row.action} | ${row.futureDateCount} | ${row.imageCandidateCount} | ${row.reason.replace(/\|/g, '/')} | ${row.url} |`
  )).join('\n');

  const scopeSections = Object.entries(report.byScope).map(([scope, data]) => {
    const activity = Object.entries(data.activityTotals).map(([key, value]) => `${key}:${value}`).join(', ');
    const nextTargets = data.nextTargets.length
      ? data.nextTargets.map((target) => `- ${target.name}: ${target.status}, ${target.action}, future=${target.futureDateCount}, images=${target.imageCandidateCount}`).join('\n')
      : '- 후보 없음';
    return `### ${scope}\n\n- 접근 성공: ${data.accessible}/${data.total}\n- 살아있는 허브: ${data.liveHubs.length ? data.liveHubs.join(', ') : '없음'}\n- 공식 이벤트 후보: ${data.officialCandidates.length ? data.officialCandidates.join(', ') : '없음'}\n- 접근 문제: ${data.blocked.length ? data.blocked.join(', ') : '없음'}\n- 활동 키워드: ${activity}\n\n${nextTargets}`;
  }).join('\n\n');

  return `# 확장 장르 허브 워치 결과 ${report.today}\n\n**모드**: \`${report.mode}\`  \n**저장 여부**: DB/Storage 저장 없음. 리서치 스냅샷만 생성.  \n**검사 소스**: ${report.results.length}개  \n**접근 성공**: ${report.results.filter((row) => row.ok).length}개\n\n## 결론\n\n타장르는 개별 이벤트를 바로 수집하지 않고, 먼저 살아있는 허브에서 venue/organizer를 뽑아야 한다. 이번 워치 결과 기준 우선 루트는 다음이다.\n\n- 라틴/바차타: Latin in Seoul, Where to Dance Salsa/Bachata, SalsaVida, PlaceOcean\n- 탱고: Tango Calendar Korea, Tanguear, Korea Tango Cooperative, TangotoCUP, Jeju SUMM Milonga, Chuncheon Tango Festival\n- 스트릿: DanceCode, DanceChives, Flowdat, FREEZE는 DNS 재검증 후 보류\n\n## 장르별 결과\n\n${scopeSections}\n\n## 소스별 결과\n\n| 장르 | 소스 | 역할 | 상태 | 다음 액션 | 미래날짜 | 이미지 | 이유 | URL |\n|---|---|---|---|---|---:|---:|---|---|\n${resultRows}\n\n## 운영 반영 규칙\n\n1. \`live-hub\`는 저장하지 않고 venue/organizer 추출 대상으로 둔다.\n2. \`official-candidate\`는 날짜/장소/이미지/공식성을 수동 확인한 뒤에만 후보 저장으로 승격한다.\n3. \`needs-js-route\`는 페이지가 살아있지만 렌더링/API 분석이 먼저 필요하다.\n4. \`blocked\`는 자동화 안정성이 낮으므로 대체 소스나 수동 확인 루트를 찾는다.\n\n==TELEGRAM_SUMMARY_START==\n신규: 0건\n스킵: ${report.results.length}건\n과거데이터삭제: 0건\n접근불가: ${report.results.filter((row) => row.status === 'blocked').map((row) => `${row.id}(${row.reason})`).join(', ') || '없음'}\n이슈: expanded hub watch only; 운영 저장 없음; 허브 우선/원본 역추적 전략\n==TELEGRAM_SUMMARY_END==\n`;
}

async function main() {
  const allSources = getAutomationSourceList(mode);
  const selected = allSources
    .filter((source) => priorityHubIds.has(source.id) || source.discoveryOnly || source.promotionPolicy === 'official_event_page_allowed')
    .sort((a, b) => a.priority - b.priority || a.scope.localeCompare(b.scope) || a.name.localeCompare(b.name, 'ko'));
  const sources = limit > 0 ? selected.slice(0, limit) : selected;

  const browser = await chromium.launch({ headless: browserHeadless });
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: 'ko-KR' });
  const results = [];

  for (const source of sources) {
    if (safeMode && sourceDelayMs > 0) {
      const waitMs = jitter(sourceDelayMs);
      console.log(`safe wait ${Math.round(waitMs / 1000)}s before ${source.id}`);
      await sleep(waitMs);
    }
    const page = await context.newPage();
    const watchRole = getWatchRole(source);
    const result = await probe(page, source);
    await page.close().catch(() => {});
    const row = {
      id: source.id,
      name: source.name,
      scope: source.scope,
      dance_genre: source.dance_genre,
      type: source.type,
      url: source.url,
      watchRole,
      discoveryOnly: source.discoveryOnly,
      saveEnabled: source.saveEnabled,
      promotionPolicy: source.promotionPolicy,
      notes: source.notes,
      ...result,
    };
    results.push(row);
    console.log(`${row.scope.padEnd(7)} ${row.id.padEnd(30)} ${row.status.padEnd(20)} future=${row.futureDateCount} images=${row.imageCandidateCount} live=${row.liveSignalScore}`);
  }

  await browser.close();

  const report = {
    generatedAt: new Date().toISOString(),
    today,
    mode,
    constraints: {
      dbWrites: false,
      storageWrites: false,
      netlifyScrapedEventsCalled: false,
    },
    byScope: summarizeByScope(results),
    results,
  };

  await fs.mkdir('docs/research-data', { recursive: true });
  const jsonPath = `docs/research-data/${outputPrefix}.json`;
  const mdPath = `docs/${outputPrefix}.md`;
  await fs.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  await fs.writeFile(mdPath, renderMarkdown(report));
  console.log(`\nWROTE ${jsonPath}`);
  console.log(`WROTE ${mdPath}`);
}

await main();
