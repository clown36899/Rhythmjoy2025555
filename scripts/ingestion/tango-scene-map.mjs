#!/usr/bin/env node

import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getCollectionSources } from './collection-registry.mjs';

const TANGO_CALENDAR_API = 'https://tangocalendar.kr/api/events';
const DEFAULT_OUTPUT_DATE = getKstDateString(new Date());
const OUTPUT_DIR = 'docs/research-data';
const DOCS_DIR = 'docs';

const knownMajorEvents = [
  {
    name: 'TangotoWorld CUP Seoul Preliminary 2026',
    date: '2026-07-10~2026-07-12',
    venue: 'Freestyle Tango Studio',
    sourceUrl: 'https://tangotocup.com/competition/65',
    role: 'competition',
    note: '공식 대회 페이지. 8개 카테고리, 2026-07-11 서울 예선 설명.',
  },
  {
    name: 'JEJU SUMM MILONGA',
    date: '2026-08-21~2026-08-23',
    venue: 'SEAORE RESORT, Jeju',
    sourceUrl: 'https://www.jejusummmilonga.com/',
    role: 'festival-milonga',
    note: '제주 섬 밀롱가 축. 공식 페이지 기준 선별 반영 후보.',
  },
  {
    name: 'Chuncheon International Tango Festival',
    date: '2026-10-03~2026-10-05',
    venue: 'Chuncheon',
    sourceUrl: 'https://kcctf.org/',
    role: 'festival',
    note: '춘천 국제 탱고 축. 공식 페이지 기준 선별 반영 후보.',
  },
  {
    name: 'Seoul Tango Festival 2026',
    date: '2026',
    venue: 'Seoul',
    sourceUrl: 'https://seoultangofestival.com/2026/01/16/2026-stf/',
    role: 'festival',
    note: '공식 페이지의 세부 날짜/장소/이미지 확인 후 선별 반영.',
  },
];

function parseArgs(argv) {
  const args = {
    date: DEFAULT_OUTPUT_DATE,
    outputPrefix: null,
    dryRun: false,
    saveCandidates: false,
    candidateRange: 'week',
  };

  for (const arg of argv) {
    if (arg.startsWith('--date=')) args.date = arg.slice('--date='.length);
    if (arg.startsWith('--output-prefix=')) args.outputPrefix = arg.slice('--output-prefix='.length);
    if (arg === '--dry-run') args.dryRun = true;
    if (arg === '--save-candidates') args.saveCandidates = true;
    if (arg.startsWith('--candidate-range=')) args.candidateRange = arg.slice('--candidate-range='.length);
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date)) {
    throw new Error(`Invalid --date: ${args.date}`);
  }
  if (!['today', 'week', 'month'].includes(args.candidateRange)) {
    throw new Error(`Invalid --candidate-range: ${args.candidateRange}`);
  }
  args.outputPrefix ||= `tango-scene-map-${args.date}`;
  return args;
}

function getKstDateString(date) {
  const utc = date.getTime() + date.getTimezoneOffset() * 60000;
  const kst = new Date(utc + 9 * 60 * 60000);
  return kst.toISOString().slice(0, 10);
}

function parseDateParts(date) {
  const [year, month, day] = date.split('-').map(Number);
  return { year, month, day };
}

function toDateString(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function addDays(date, amount) {
  const { year, month, day } = parseDateParts(date);
  const d = new Date(Date.UTC(year, month - 1, day + amount));
  return d.toISOString().slice(0, 10);
}

function monthRange(date) {
  const { year, month } = parseDateParts(date);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return [toDateString(year, month, 1), toDateString(year, month, last)];
}

function yearRange(date) {
  const { year } = parseDateParts(date);
  return [date, `${year}-12-31`];
}

function formatKst(iso) {
  if (!iso) return '';
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

function formatKstDate(iso) {
  if (!iso) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}

function formatKstTime(iso) {
  if (!iso) return '';
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function eventVenue(event) {
  return clean(event.venue) || clean(event.venueName) || clean(event.location?.name) || clean(event.location);
}

function increment(map, key) {
  const normalized = clean(key);
  if (!normalized) return;
  map.set(normalized, (map.get(normalized) || 0) + 1);
}

function topEntries(map, limit = 12) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko'))
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }));
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'SwingEnjoyBot/1.0 tango-scene-research',
      Accept: 'application/json,text/html;q=0.9,*/*;q=0.8',
    },
  });

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText} ${url}`);
  }

  return response.json();
}

async function fetchCalendarRange(label, startDate, endDate) {
  const url = `${TANGO_CALENDAR_API}?startDate=${startDate}&endDate=${endDate}`;
  const events = await fetchJson(url);
  const venueCounts = new Map();
  const titleCounts = new Map();
  const djCounts = new Map();
  const feeCounts = new Map();
  let unknownVenueCount = 0;

  for (const event of events) {
    const venue = eventVenue(event);
    if (venue) increment(venueCounts, venue);
    else unknownVenueCount += 1;

    increment(titleCounts, event.title);
    increment(djCounts, event.djName);
    increment(feeCounts, event.entranceFee);
  }

  return {
    label,
    startDate,
    endDate,
    sourceUrl: url,
    count: events.length,
    unknownVenueCount,
    topVenues: topEntries(venueCounts, 15),
    topTitles: topEntries(titleCounts, 20),
    topDjs: topEntries(djCounts, 12),
    feeDistribution: topEntries(feeCounts, 10),
    events: events.map((event) => ({
      id: event.id,
      title: clean(event.title),
      description: clean(event.description),
      startDate: event.startDate,
      endDate: event.endDate,
      startKst: formatKst(event.startDate),
      endKst: formatKst(event.endDate),
      venue: eventVenue(event),
      djName: clean(event.djName),
      entranceFee: clean(event.entranceFee),
      showMap: Boolean(event.showMap),
      organizerKakaoId: clean(event.organizerKakaoId),
      organizerFacebook: clean(event.organizerFacebook),
      organizerPhone: clean(event.organizerPhone),
      organizerOther: clean(event.organizerOther),
      sourceUrl: TANGO_CALENDAR_API,
    })),
  };
}

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTitle(html) {
  return clean(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, ' '));
}

function extractDateHints(text) {
  const patterns = [
    /\b20\d{2}[./-]\d{1,2}[./-]\d{1,2}\b/g,
    /\b\d{1,2}[./-]\d{1,2}[./-]20\d{2}\b/g,
    /\b\d{1,2}\s*(?:Jan|Feb|Mar|Apr|May|Jun|Jul|July|Aug|August|Sep|Sept|Oct|Nov|Dec)[a-z]*\s*,?\s*20\d{2}\b/gi,
    /\b20\d{2}\s*(?:Jan|Feb|Mar|Apr|May|Jun|Jul|July|Aug|August|Sep|Sept|Oct|Nov|Dec)[a-z]*\b/gi,
  ];
  return [...new Set(patterns.flatMap((pattern) => text.match(pattern) || []))].slice(0, 12);
}

async function probeSource(source) {
  const skipProbe = source.type === 'instagram' || /instagram\.com/.test(source.url);
  if (skipProbe) {
    return {
      ...source,
      probeStatus: 'skipped',
      reason: 'instagram/browser-session-required',
    };
  }

  try {
    const response = await fetch(source.url, {
      headers: {
        'User-Agent': 'SwingEnjoyBot/1.0 tango-scene-research',
        Accept: 'text/html,*/*;q=0.8',
      },
    });
    const html = await response.text();
    const text = stripHtml(html);
    return {
      ...source,
      probeStatus: response.status,
      title: extractTitle(html),
      textLength: text.length,
      imageCount: (html.match(/<img\b/gi) || []).length,
      dateHints: extractDateHints(text),
    };
  } catch (error) {
    return {
      ...source,
      probeStatus: 'error',
      error: error.message,
    };
  }
}

function normalizeSource(source) {
  return {
    id: source.id,
    name: source.name,
    url: source.url,
    type: source.type || source.role,
    priority: source.priority || 9,
    discoveryOnly: Boolean(source.discoveryOnly) || source.policy === 'discovery-only',
    role: source.sceneRole || source.role || source.sourceKind || 'source',
    policy: source.promotionPolicy || source.policy || source.notes || '',
    note: source.notes || source.note || '',
  };
}

function buildSourceList() {
  const registrySources = getCollectionSources('tango').map(normalizeSource);
  const merged = new Map();
  for (const source of registrySources) {
    merged.set(source.id, source);
  }
  return [...merged.values()].sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name, 'ko'));
}

function buildVenueMap(ranges) {
  const venueMap = new Map();
  const seenEventIds = new Set();
  for (const range of ranges) {
    for (const event of range.events) {
      if (seenEventIds.has(event.id)) continue;
      seenEventIds.add(event.id);
      const venue = clean(event.venue);
      if (!venue || venue === 'T.B.A') continue;
      const current = venueMap.get(venue) || {
        name: venue,
        count: 0,
        titles: new Map(),
        djs: new Map(),
        firstSeen: event.startKst,
        lastSeen: event.startKst,
      };
      current.count += 1;
      increment(current.titles, event.title);
      increment(current.djs, event.djName);
      current.lastSeen = event.startKst;
      venueMap.set(venue, current);
    }
  }

  return [...venueMap.values()]
    .map((venue) => ({
      name: venue.name,
      count: venue.count,
      topTitles: topEntries(venue.titles, 8),
      topDjs: topEntries(venue.djs, 8),
      firstSeen: venue.firstSeen,
      lastSeen: venue.lastSeen,
      mapStatus: 'needs-kakao-place-link',
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ko'));
}

function safeId(value) {
  return String(value || '')
    .trim()
    .replace(/[^\w-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
}

function sourceUrlForEvent(event) {
  return `https://tangocalendar.kr/?event=${encodeURIComponent(event.id)}`;
}

function classifyTangoActivity(event) {
  const title = `${event.title || ''} ${event.description || ''}`.toLowerCase();
  if (/class|lesson|workshop|워크샵|특강|수업|레슨|강습/.test(title)) {
    return { type: 'class', label: '강습', eventType: '강습', tags: ['workshop'], tagLabels: ['워크샵'] };
  }
  if (/festival|cup|competition|페스티벌|대회|공연/.test(title)) {
    return { type: 'event', label: '행사', eventType: '행사', tags: ['festival'], tagLabels: ['페스티벌'] };
  }
  return { type: 'social', label: '소셜', eventType: '소셜', tags: ['milonga'], tagLabels: ['밀롱가'] };
}

function buildTangoCandidate(event) {
  const date = formatKstDate(event.startDate);
  const startTime = formatKstTime(event.startDate);
  const endTime = formatKstTime(event.endDate);
  const venue = eventVenue(event);
  const activity = classifyTangoActivity(event);
  const sourceUrl = sourceUrlForEvent(event);
  const title = clean(event.title) || `Tango Calendar ${event.id}`;
  const djName = clean(event.djName);
  const fee = clean(event.entranceFee);
  const timeRange = [startTime, endTime].filter(Boolean).join('~');

  return {
    id: `tango_calendar_${safeId(event.id)}`,
    keyword: '탱고캘린더',
    source_url: sourceUrl,
    poster_url: null,
    extracted_text: [
      title,
      `날짜: ${date}`,
      timeRange ? `시간: ${timeRange}` : '',
      venue ? `장소: ${venue}` : '장소: 미정',
      djName ? `DJ: ${djName}` : '',
      fee ? `입장료: ${fee}` : '',
      clean(event.description),
      `원본 허브: ${TANGO_CALENDAR_API}`,
    ].filter(Boolean).join('\n'),
    structured_data: {
      title,
      date,
      end_date: formatKstDate(event.endDate) || date,
      time: timeRange,
      times: timeRange ? [timeRange] : [],
      location: venue || '',
      venue_name: venue || '',
      event_type: activity.eventType,
      activity_type: activity.type,
      activity_label: activity.label,
      genre_family: 'partner',
      genre_family_label: '파트너댄스',
      dance_scope: 'tango',
      dance_scope_label: '탱고',
      dance_genre: 'tango',
      dance_genre_label: '탱고',
      tags: activity.tags,
      tag_labels: activity.tagLabels,
      djs: djName ? [djName] : [],
      fee,
      source_id: 'tangocalendar',
      source_name: 'Tango Calendar Korea',
      source_url: sourceUrl,
      source_api_url: TANGO_CALENDAR_API,
      tango_calendar_event_id: event.id,
      candidate_origin: 'tango-calendar',
      research_candidate: true,
      needs_image: true,
      no_poster_reason: 'Tango Calendar API candidate has no poster image; admin review should attach/replace image before final registration.',
      show_map: Boolean(event.showMap),
      organizer: {
        kakao_id: clean(event.organizerKakaoId),
        facebook: clean(event.organizerFacebook),
        phone: clean(event.organizerPhone),
        other: clean(event.organizerOther),
      },
      collection_profile: 'expanded-ingestion',
      collection_note: '탱고 씬 지도/후보 검토용. 등록 버튼 전까지 운영 events에는 반영하지 않는다.',
      taxonomy_confidence: 'high',
    },
    is_collected: false,
    status: 'pending',
  };
}

function uniqueCandidates(candidates) {
  const byId = new Map();
  for (const candidate of candidates) {
    if (!candidate.id || !candidate.structured_data.date) continue;
    byId.set(candidate.id, candidate);
  }
  return [...byId.values()].sort((a, b) => {
    const ad = `${a.structured_data.date} ${a.structured_data.time || ''}`;
    const bd = `${b.structured_data.date} ${b.structured_data.time || ''}`;
    return ad.localeCompare(bd) || a.structured_data.title.localeCompare(b.structured_data.title, 'ko');
  });
}

function hasCandidateImage(candidate) {
  return Boolean(
    candidate.poster_url ||
    (typeof candidate.imageData === 'string' && candidate.imageData.startsWith('data:image'))
  );
}

function splitImageBackedCandidates(candidates) {
  const imageBacked = [];
  const noPoster = [];
  for (const candidate of candidates) {
    if (hasCandidateImage(candidate)) imageBacked.push(candidate);
    else noPoster.push(candidate);
  }
  return { imageBacked, noPoster };
}

async function saveTangoCandidatesViaFunction(candidates) {
  const { imageBacked, noPoster } = splitImageBackedCandidates(candidates);
  if (!imageBacked.length) {
    return { target: 'function', saved: 0, skipped: 0, skippedNoPoster: noPoster.length, total: candidates.length };
  }

  const defaultEndpoint = process.env.INGESTOR_V3 === '1'
    ? 'https://swingenjoy.com/api/ingestor-v3/candidates'
    : 'https://swingenjoy.com/api/scraped-events';
  const endpoint = process.env.SCRAPED_EVENTS_ENDPOINT || process.env.CAFE24_INGEST_ENDPOINT || defaultEndpoint;
  const ingestToken = process.env.SCRAPED_EVENTS_INGEST_TOKEN || process.env.CAFE24_INGEST_TOKEN || '';
  const headers = { 'Content-Type': 'application/json' };
  if (ingestToken) headers['X-Ingestion-Token'] = ingestToken;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(imageBacked),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`scraped-events function failed: ${response.status} ${JSON.stringify(payload)}`);
  }
  return {
    target: 'function',
    endpoint,
    saved: payload.count ?? 0,
    skipped: payload.skipped?.length ?? 0,
    skippedNoPoster: noPoster.length,
    total: candidates.length,
  };
}

async function saveTangoCandidates(candidates) {
  return saveTangoCandidatesViaFunction(candidates);
}

function mdTable(rows, columns) {
  if (!rows.length) return '_없음_';
  const header = `| ${columns.map((column) => column.label).join(' | ')} |`;
  const divider = `| ${columns.map(() => '---').join(' | ')} |`;
  const body = rows.map((row) => `| ${columns.map((column) => {
    const value = column.value(row);
    return String(value ?? '').replace(/\n/g, ' ').replace(/\|/g, '/');
  }).join(' | ')} |`);
  return [header, divider, ...body].join('\n');
}

function renderMarkdown(report) {
  const today = report.calendarRanges.find((range) => range.label === 'today');
  const week = report.calendarRanges.find((range) => range.label === 'week');
  const month = report.calendarRanges.find((range) => range.label === 'month');
  const year = report.calendarRanges.find((range) => range.label === 'year');

  return `# Tango Scene Map (${report.generatedFor})

Generated: ${report.generatedAt}

## Scope

- 대상: 한국/서울 중심 아르헨티나 탱고 씬
- 목적: 밀롱가, 프랙티카, 클래스, 대회/페스티벌, venue/organizer 축을 분리해서 장기적으로 씬 지도를 만든다.
- DB 저장: 기본 실행은 리서치 전용이다. \`--save-candidates\`를 붙이면 Cafe24 API를 통해 Tango Calendar 일정을 \`scraped_events\` 후보로만 저장한다. 운영 \`events\` 등록은 관리자 등록 버튼 전까지 하지 않는다.
- 자동 수집 분리: 스윙 일일 자동 수집에는 포함하지 않는다. 탱고는 이 스크립트처럼 별도 research/manual 파이프라인으로만 실행한다.

## Live Calendar Snapshot

| Range | Dates | Count | Unknown venue | Source |
| --- | --- | ---: | ---: | --- |
| Today | ${today.startDate}~${today.endDate} | ${today.count} | ${today.unknownVenueCount} | ${today.sourceUrl} |
| Week | ${week.startDate}~${week.endDate} | ${week.count} | ${week.unknownVenueCount} | ${week.sourceUrl} |
| Month | ${month.startDate}~${month.endDate} | ${month.count} | ${month.unknownVenueCount} | ${month.sourceUrl} |
| Year-to-date future | ${year.startDate}~${year.endDate} | ${year.count} | ${year.unknownVenueCount} | ${year.sourceUrl} |

### Today

${mdTable(today.events, [
  { label: 'KST', value: (row) => row.startKst },
  { label: 'Title', value: (row) => row.title },
  { label: 'Venue', value: (row) => row.venue || '장소미상' },
  { label: 'DJ', value: (row) => row.djName || '-' },
  { label: 'Fee', value: (row) => row.entranceFee || '-' },
])}

### This Week Top Venues

${mdTable(week.topVenues, [
  { label: 'Venue', value: (row) => row.name },
  { label: 'Count', value: (row) => row.count },
])}

### This Month Recurring Titles

${mdTable(month.topTitles.slice(0, 15), [
  { label: 'Title', value: (row) => row.name },
  { label: 'Count', value: (row) => row.count },
])}

## Venue Candidates

${mdTable(report.venueCandidates.slice(0, 20), [
  { label: 'Venue / bar / studio', value: (row) => row.name },
  { label: 'Hits', value: (row) => row.count },
  { label: 'Representative schedules', value: (row) => row.topTitles.map((item) => `${item.name}(${item.count})`).join(', ') },
  { label: 'Map status', value: (row) => row.mapStatus },
])}

## Major 2026 Axes

${mdTable(report.knownMajorEvents, [
  { label: 'Name', value: (row) => row.name },
  { label: 'Date', value: (row) => row.date },
  { label: 'Venue', value: (row) => row.venue },
  { label: 'Role', value: (row) => row.role },
  { label: 'Source', value: (row) => row.sourceUrl },
])}

## Source Map

${mdTable(report.sources, [
  { label: 'Source', value: (row) => row.name },
  { label: 'Role', value: (row) => row.role },
  { label: 'Policy', value: (row) => row.policy },
  { label: 'Probe', value: (row) => row.probeStatus },
  { label: 'Title / note', value: (row) => row.title || row.note || row.reason || '' },
  { label: 'URL', value: (row) => row.url },
])}

## Collection Logic

1. Tango Calendar Korea: 오늘/이번주/이번달 밀롱가 흐름과 반복 venue 파악에 사용한다. 이미지가 없으므로 사이트 내부 DB 저장 후보로 바로 승격하지 않는다.
2. 공식 대회/페스티벌: KTC, TangotoCUP, Jeju SUMM, Chuncheon, Seoul Tango Festival은 이미지/장소/날짜가 확인되면 개별 행사 후보로 선별할 수 있다.
3. Venue/organizer SNS: 엘땅고, 까사밀롱가, 탱고피플 등은 브라우저 세션 또는 수동 검증 대상이다. Instagram API 우회 수집은 하지 않는다.
4. 장소 지도: Tango Calendar venue 문자열을 Kakao Place 링크와 매칭하는 별도 테이블이 필요하다. 예: 탱고 클럽 오초, 탱고 엔빠스 스튜디오, 탱고 오나다.
5. 사용자 노출: 허브가 더 잘 정리하는 반복 밀롱가는 외부 링크/씬 지도 방식으로 소개하고, 공식 포스터가 있는 대회/페스티벌/워크샵만 행사 카드 후보로 올린다.

## Immediate Next Steps

- Kakao 장소 매칭: 상위 venue부터 place link, 주소, canonical name을 붙인다.
- Calendar deep-link: Tango Calendar 개별 event id가 공개 상세 URL을 갖는지 확인한다.
- 공식 포스터 축: TangotoCUP, Jeju SUMM, KTC, Seoul Tango Festival, Chuncheon을 개별 행사 후보로 수동 검증한다.
- Monthly refresh: 이 스크립트를 월 1회 돌려 venue/title 변화량을 비교한다.
`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const [monthStart, monthEnd] = monthRange(args.date);
  const [yearStart, yearEnd] = yearRange(args.date);
  const ranges = [
    await fetchCalendarRange('today', args.date, args.date),
    await fetchCalendarRange('week', args.date, addDays(args.date, 6)),
    await fetchCalendarRange('month', monthStart, monthEnd),
    await fetchCalendarRange('year', yearStart, yearEnd),
  ];

  const sources = await Promise.all(buildSourceList().map(probeSource));
  const candidateRange = ranges.find((range) => range.label === args.candidateRange);
  const candidates = uniqueCandidates((candidateRange?.events || []).map(buildTangoCandidate));
  const dryRunCandidateSplit = splitImageBackedCandidates(candidates);
  const candidateWrite = args.saveCandidates && !args.dryRun
    ? await saveTangoCandidates(candidates, args)
    : {
        dryRun: args.dryRun,
        saved: 0,
        skippedCollected: 0,
        skippedNoPoster: dryRunCandidateSplit.noPoster.length,
        imageBacked: dryRunCandidateSplit.imageBacked.length,
        total: candidates.length,
      };

  const report = {
    generatedAt: new Date().toISOString(),
    generatedFor: args.date,
    scope: 'tango',
    dbWrites: args.saveCandidates,
    candidateRange: args.candidateRange,
    candidateWrite,
    calendarRanges: ranges,
    venueCandidates: buildVenueMap(ranges),
    knownMajorEvents,
    sources,
  };

  const jsonPath = path.join(OUTPUT_DIR, `${args.outputPrefix}.json`);
  const markdownPath = path.join(DOCS_DIR, `${args.outputPrefix}.md`);

  if (!args.dryRun) {
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    await fs.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
    await fs.writeFile(markdownPath, renderMarkdown(report));
  }

  console.log(JSON.stringify({
    generatedFor: args.date,
    jsonPath,
    markdownPath,
    todayCount: ranges[0].count,
    weekCount: ranges[1].count,
    monthCount: ranges[2].count,
    candidateRange: args.candidateRange,
    candidateCount: candidates.length,
    candidateWrite,
    venueCandidates: report.venueCandidates.slice(0, 8).map((item) => ({ name: item.name, count: item.count })),
    sourceCount: sources.length,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
