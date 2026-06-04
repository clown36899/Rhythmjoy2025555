import type { Handler } from '@netlify/functions';

const TANGO_CALENDAR_API = 'https://tangocalendar.kr/api/events';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const tangoSources = [
  {
    id: 'tangocalendar',
    name: 'Tango Calendar Korea',
    url: 'https://tangocalendar.kr/',
    role: '서울 라이브 일정',
    policy: 'external_hub_only',
    note: '밀롱가/이벤트/DJ 흐름과 반복 venue 파악용. 포스터 없는 일정은 직접 저장하지 않음.',
  },
  {
    id: 'tango-now',
    name: 'Tango NOW',
    url: 'https://ktnow.kr/',
    role: '전국 라이브 일정',
    policy: 'external_hub_only',
    note: '밀롱가/이벤트/클래스/Shop 분류가 있는 전국 탱고 일정 허브.',
  },
  {
    id: 'koreatango',
    name: 'Korea Tango Cooperative',
    url: 'https://www.koreatango.co.kr/',
    role: '공식 조직/대회 축',
    policy: 'verified_original_required',
    note: '공식 포스터와 날짜/장소가 확인된 대회/행사는 선별 후보화 가능.',
  },
  {
    id: 'tango-map-korea',
    name: 'Tango Map Korea',
    url: 'https://tango.bien.ltd/',
    role: '장소 지도 참고',
    policy: 'external_hub_only',
    note: '장소 정규화와 커뮤니티 지형 파악용.',
  },
];

const knownMajorEvents = [
  {
    name: 'TangotoWorld CUP Seoul Preliminary 2026',
    date: '2026-07-10~2026-07-12',
    venue: 'Freestyle Tango Studio',
    sourceUrl: 'https://tangotocup.com/competition/65',
    role: 'competition',
  },
  {
    name: 'JEJU SUMM MILONGA',
    date: '2026-08-21~2026-08-23',
    venue: 'SEAORE RESORT, Jeju',
    sourceUrl: 'https://www.jejusummmilonga.com/',
    role: 'festival-milonga',
  },
  {
    name: 'Chuncheon International Tango Festival',
    date: '2026-10-03~2026-10-05',
    venue: 'Chuncheon',
    sourceUrl: 'https://kcctf.org/',
    role: 'festival',
  },
  {
    name: 'Seoul Tango Festival 2026',
    date: '2026',
    venue: 'Seoul',
    sourceUrl: 'https://seoultangofestival.com/2026/01/16/2026-stf/',
    role: 'festival',
  },
];

function kstToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function parseDateParts(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  return { year, month, day };
}

function toDateString(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function addDays(date: string, amount: number): string {
  const { year, month, day } = parseDateParts(date);
  return new Date(Date.UTC(year, month - 1, day + amount)).toISOString().slice(0, 10);
}

function monthRange(date: string): [string, string] {
  const { year, month } = parseDateParts(date);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return [toDateString(year, month, 1), toDateString(year, month, last)];
}

function clean(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function formatKst(value: string | null | undefined): string {
  if (!value) return '';
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));
}

function formatKstDate(value: string | null | undefined): string {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value));
}

function eventVenue(event: any): string {
  return clean(event?.venue) || clean(event?.venueName) || clean(event?.location?.name) || clean(event?.location);
}

function eventSourceUrl(event: any): string {
  return `https://tangocalendar.kr/?event=${encodeURIComponent(String(event?.id || ''))}`;
}

function increment(map: Map<string, number>, key: unknown) {
  const normalized = clean(key);
  if (!normalized || normalized === 'T.B.A') return;
  map.set(normalized, (map.get(normalized) || 0) + 1);
}

function topEntries(map: Map<string, number>, limit = 12) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko'))
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }));
}

function normalizeEvent(event: any) {
  return {
    id: String(event?.id || ''),
    title: clean(event?.title) || '제목 미정',
    description: clean(event?.description),
    startAt: clean(event?.startDate),
    date: formatKstDate(event?.startDate),
    startKst: formatKst(event?.startDate),
    endKst: formatKst(event?.endDate),
    venue: eventVenue(event),
    djName: clean(event?.djName),
    entranceFee: clean(event?.entranceFee),
    sourceUrl: eventSourceUrl(event),
  };
}

async function fetchCalendarRange(label: string, startDate: string, endDate: string) {
  const url = `${TANGO_CALENDAR_API}?startDate=${startDate}&endDate=${endDate}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6500);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json,text/html;q=0.9,*/*;q=0.8',
        'User-Agent': 'SwingEnjoyBot/1.0 tango-scene-map',
      },
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);

    const raw = await response.json();
    const events = Array.isArray(raw) ? raw.map(normalizeEvent) : [];
    const venueCounts = new Map<string, number>();
    const titleCounts = new Map<string, number>();
    let unknownVenueCount = 0;

    events.forEach((event) => {
      if (event.venue) increment(venueCounts, event.venue);
      else unknownVenueCount += 1;
      increment(titleCounts, event.title);
    });

    return {
      label,
      startDate,
      endDate,
      sourceUrl: url,
      ok: true,
      count: events.length,
      unknownVenueCount,
      topVenues: topEntries(venueCounts, 12),
      topTitles: topEntries(titleCounts, 12),
      events,
    };
  } catch (error: any) {
    return {
      label,
      startDate,
      endDate,
      sourceUrl: url,
      ok: false,
      error: error?.name === 'AbortError' ? 'timeout' : String(error?.message || error),
      count: 0,
      unknownVenueCount: 0,
      topVenues: [],
      topTitles: [],
      events: [],
    };
  } finally {
    clearTimeout(timeout);
  }
}

function buildVenueCandidates(ranges: Array<Awaited<ReturnType<typeof fetchCalendarRange>>>) {
  const seen = new Set<string>();
  const venues = new Map<string, { name: string; count: number; titles: Map<string, number>; firstSeen: string; lastSeen: string; firstSeenAt: string; lastSeenAt: string }>();

  ranges.forEach((range) => {
    range.events.forEach((event) => {
      if (seen.has(event.id)) return;
      seen.add(event.id);
      if (!event.venue) return;
      const current = venues.get(event.venue) || {
        name: event.venue,
        count: 0,
        titles: new Map<string, number>(),
        firstSeen: event.startKst,
        lastSeen: event.startKst,
        firstSeenAt: event.startAt,
        lastSeenAt: event.startAt,
      };
      current.count += 1;
      increment(current.titles, event.title);
      if (event.startAt && (!current.firstSeenAt || event.startAt < current.firstSeenAt)) {
        current.firstSeenAt = event.startAt;
        current.firstSeen = event.startKst;
      }
      if (event.startAt && (!current.lastSeenAt || event.startAt > current.lastSeenAt)) {
        current.lastSeenAt = event.startAt;
        current.lastSeen = event.startKst;
      }
      venues.set(event.venue, current);
    });
  });

  return [...venues.values()]
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ko'))
    .slice(0, 20)
    .map((venue) => ({
      name: venue.name,
      count: venue.count,
      firstSeen: venue.firstSeen,
      lastSeen: venue.lastSeen,
      topTitles: topEntries(venue.titles, 5),
      mapStatus: 'needs-kakao-place-link',
    }));
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  const date = /^\d{4}-\d{2}-\d{2}$/.test(event.queryStringParameters?.date || '')
    ? String(event.queryStringParameters?.date)
    : kstToday();
  const [monthStart, monthEnd] = monthRange(date);
  const ranges = await Promise.all([
    fetchCalendarRange('today', date, date),
    fetchCalendarRange('week', date, addDays(date, 6)),
    fetchCalendarRange('month', monthStart, monthEnd),
  ]);
  const [today, week, month] = ranges;
  const venueCandidates = buildVenueCandidates(ranges);

  const payload = {
    generatedAt: new Date().toISOString(),
    generatedFor: date,
    scope: 'tango',
    mode: 'read-only-scene-map',
    counts: {
      today: today.count,
      week: week.count,
      month: month.count,
    },
    health: {
      calendarOk: ranges.every((range) => range.ok),
      failedRanges: ranges.filter((range) => !range.ok).map((range) => ({ label: range.label, error: range.error })),
    },
    candidateWrite: {
      saved: 0,
      imageBacked: 0,
      skippedNoPoster: week.count,
      total: week.count,
      reason: 'Tango Calendar/Tango NOW 반복 일정은 포스터 없는 허브 데이터이므로 DB 후보 저장 대신 씬맵으로 노출한다.',
    },
    todayEvents: today.events,
    weekEvents: week.events,
    monthTopTitles: month.topTitles,
    venueCandidates,
    sources: tangoSources,
    knownMajorEvents,
    calendarRanges: ranges,
  };

  return {
    statusCode: 200,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=120, stale-while-revalidate=600',
    },
    body: JSON.stringify(payload),
  };
};
