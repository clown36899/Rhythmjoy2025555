export const SCENE_STATS_METHOD_VERSION = 'scene-occurrence-v4';
export const SCENE_STATS_TIME_ZONE = 'Asia/Seoul';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ABSOLUTE_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/i;
const SUPPORTED_EVENT_CATEGORIES = new Set([
  'class',
  'regular',
  'club',
  'club_lesson',
  'club_regular',
  'social',
  'group',
  'event',
]);
const UNAVAILABLE_STATUSES = new Set(['deleted', 'hidden', 'draft', 'rejected', 'cancelled', 'canceled']);
const CLASS_CATEGORIES = new Set(['class', 'regular', 'club_lesson', 'club_regular']);
const SOCIAL_CATEGORIES = new Set(['social', 'group', 'club']);
const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

function text(value) {
  return String(value ?? '').trim();
}

function normalizedToken(value) {
  return text(value).toLowerCase().replace(/[\s_\-/]+/g, '');
}

function asFalse(value) {
  return value === false || value === 0 || ['false', '0', 'no'].includes(text(value).toLowerCase());
}

function asTrue(value) {
  return value === true || value === 1 || ['true', '1', 'yes'].includes(text(value).toLowerCase());
}

function parseArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function validSceneDate(value) {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? kstDateKey(value) : '';
  }
  const candidate = value && typeof value === 'object' && !Array.isArray(value)
    ? (value.date ?? value.start_date ?? value.startDate)
    : value;
  const candidateText = text(candidate);
  if (ABSOLUTE_TIMESTAMP_RE.test(candidateText)) {
    const timestamp = new Date(candidateText);
    return Number.isFinite(timestamp.getTime()) ? kstDateKey(timestamp) : '';
  }
  const date = candidateText.slice(0, 10);
  if (!DATE_RE.test(date)) return '';
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? date : '';
}

function kstDateKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid scene stats clock');
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SCENE_STATS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (type) => parts.find((item) => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function monthKeyAtOffset(dateKey, offset) {
  const [year, month] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function daysInMonth(monthKey) {
  const [year, month] = monthKey.split('-').map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function monthEnd(monthKey) {
  return `${monthKey}-${String(daysInMonth(monthKey)).padStart(2, '0')}`;
}

function weekdayLabel(dateKey) {
  return DAY_LABELS[new Date(`${dateKey}T00:00:00Z`).getUTCDay()] || '-';
}

function sceneEventType(event) {
  const category = text(event.category).toLowerCase();
  const activityType = text(event.activity_type).toLowerCase();
  if (activityType === 'class') return '강습';
  if (activityType === 'social') return '동호회 이벤트+소셜';
  if (activityType === 'event') return '행사';
  if (CLASS_CATEGORIES.has(category)) return '강습';
  if (SOCIAL_CATEGORIES.has(category)) return '동호회 이벤트+소셜';
  return '행사';
}

function mappedGenre(value) {
  const token = normalizedToken(value);
  if (!token) return null;
  if (['lindyhop', 'lindy', '린디합', '린디'].includes(token)) return '린디합';
  if (['solojazz', 'vernacularjazz', '솔로재즈'].includes(token)) return '솔로재즈';
  if (['balboa', 'bal', '발보아'].includes(token)) return '발보아';
  if (['blues', '블루스'].includes(token)) return '블루스';
  if (['shag', 'collegiateshag', '샤그', '쉐그'].includes(token)) return '샤그';
  if (['jitterbug', '지터벅'].includes(token)) return '지터벅';
  if (['tap', 'tapdance', '탭', '탭댄스'].includes(token)) return '탭댄스';
  if (['westcoastswing', 'wcs', '웨스트코스트스윙'].includes(token)) return '웨스트코스트스윙';
  if (['slowlindy', '슬로우린디'].includes(token)) return '슬로우린디';
  if (['swing', '스윙'].includes(token)) return '스윙 종합';
  return null;
}

export function sceneEventGenre(event) {
  const structuredCandidates = [event.dance_genre, event.danceGenre];
  for (const candidate of structuredCandidates) {
    const genre = mappedGenre(candidate);
    if (genre) return genre;
  }

  const legacyCandidates = text(event.genre).split(',').map((value) => value.trim()).filter(Boolean);
  for (const candidate of legacyCandidates) {
    const genre = mappedGenre(candidate);
    if (genre) return genre;
  }
  return '장르 미분류';
}

function eventDateResult(event) {
  const explicitValues = parseArray(event.event_dates ?? event.eventDates ?? event.event_dates_json);
  const validExplicit = explicitValues.map(validSceneDate).filter(Boolean);
  const invalidExplicitCount = explicitValues.filter((value) => !validSceneDate(value)).length;

  if (explicitValues.length > 0) {
    return {
      dates: [...new Set(validExplicit)].sort(),
      source: 'event_dates',
      invalidExplicitCount,
    };
  }

  const fallback = validSceneDate(event.start_date ?? event.startDate ?? event.date ?? event.date_value);
  return {
    dates: fallback ? [fallback] : [],
    source: 'start_date',
    invalidExplicitCount,
  };
}

function unavailableReason(event) {
  if (
    asTrue(event.is_hidden) || asTrue(event.hidden) || asTrue(event.is_deleted) || asTrue(event.deleted)
    || text(event.deleted_at)
  ) return 'unavailable_status';
  if (
    Object.prototype.hasOwnProperty.call(event, 'is_published') && asFalse(event.is_published)
  ) return 'unavailable_status';
  if (UNAVAILABLE_STATUSES.has(text(event.status).toLowerCase())) return 'unavailable_status';
  return null;
}

function rowExclusionReason(event) {
  const unavailable = unavailableReason(event);
  if (unavailable) return unavailable;

  const category = text(event.category).toLowerCase();
  if (!SUPPORTED_EVENT_CATEGORIES.has(category)) return 'unsupported_category';

  const scope = text(event.dance_scope ?? event.danceScope).toLowerCase();
  if (scope && scope !== 'swing') return 'non_swing_scope';

  if (text(event.activity_type).toLowerCase() === 'sale') return 'non_event_activity';
  return null;
}

function occurrenceSignature(occurrence) {
  return [
    normalizedToken(occurrence.title),
    occurrence.date,
    normalizedToken(occurrence.time),
    normalizedToken(occurrence.location),
    occurrence.type,
  ].join('|');
}

function occurrenceQuality(occurrence) {
  return (occurrence.genre !== '장르 미분류' ? 4 : 0)
    + (occurrence.createdAt ? 2 : 0)
    + (occurrence.time ? 1 : 0)
    + (occurrence.location ? 1 : 0);
}

function addBreakdown(map, key) {
  map.set(key, (map.get(key) || 0) + 1);
}

function breakdown(map) {
  return Array.from(map.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ko'));
}

function emptyDayStats(day) {
  return { day, count: 0, typeBreakdown: [], genreBreakdown: [], topGenre: '-', items: [] };
}

function dayStats(occurrences) {
  const map = new Map();
  for (const occurrence of occurrences) {
    const day = occurrence.day;
    const bucket = map.get(day) || { items: [], types: new Map(), genres: new Map() };
    bucket.items.push(occurrence.item);
    addBreakdown(bucket.types, occurrence.type);
    if (occurrence.genre !== '장르 미분류') addBreakdown(bucket.genres, occurrence.genre);
    map.set(day, bucket);
  }

  return DAY_LABELS.map((day) => {
    const bucket = map.get(day);
    if (!bucket) return emptyDayStats(day);
    const genres = breakdown(bucket.genres);
    return {
      day,
      count: bucket.items.length,
      typeBreakdown: breakdown(bucket.types),
      genreBreakdown: genres,
      topGenre: genres[0]?.name || '-',
      items: bucket.items.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title, 'ko')),
    };
  });
}

function calendarDayDifference(start, end) {
  const startMs = Date.parse(`${start}T00:00:00Z`);
  const endMs = Date.parse(`${end}T00:00:00Z`);
  return Math.floor((endMs - startMs) / 86_400_000);
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return sorted[middle];
  return Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function leadTimeAnalysis(records) {
  const result = {
    classEarly: 0,
    classMid: 0,
    classLate: 0,
    eventEarly: 0,
    eventMid: 0,
    eventLate: 0,
    classSampleSize: 0,
    eventSampleSize: 0,
    classMedianDays: null,
    eventMedianDays: null,
    excludedSamples: 0,
  };
  const classDays = [];
  const eventDays = [];

  for (const record of records) {
    const createdAt = validSceneDate(record.created_at);
    const firstDate = record.dates[0];
    if (!createdAt || !firstDate) {
      result.excludedSamples += 1;
      continue;
    }
    const days = calendarDayDifference(createdAt, firstDate);
    if (days < 0) {
      result.excludedSamples += 1;
      continue;
    }

    if (record.type === '강습') {
      classDays.push(days);
      if (days >= 28) result.classEarly += 1;
      else if (days >= 7) result.classMid += 1;
      else result.classLate += 1;
    } else {
      eventDays.push(days);
      if (days >= 42) result.eventEarly += 1;
      else if (days >= 14) result.eventMid += 1;
      else result.eventLate += 1;
    }
  }

  result.classSampleSize = classDays.length;
  result.eventSampleSize = eventDays.length;
  result.classMedianDays = median(classDays);
  result.eventMedianDays = median(eventDays);
  return result;
}

function incrementReason(reasons, reason) {
  reasons[reason] = (reasons[reason] || 0) + 1;
}

export function buildTrustedSceneStats(events = [], audience = {}, options = {}) {
  const now = options.now ? new Date(options.now) : new Date();
  const generatedAt = now.toISOString();
  const asOfDate = kstDateKey(now);
  const currentMonth = asOfDate.slice(0, 7);
  const windowStartMonth = monthKeyAtOffset(asOfDate, -11);
  const windowStart = `${windowStartMonth}-01`;
  const windowEnd = monthEnd(currentMonth);
  const monthKeys = Array.from({ length: 12 }, (_, index) => monthKeyAtOffset(asOfDate, index - 11));
  const exclusions = {};
  let invalidDateEntries = 0;
  const trustedRecords = [];

  events.forEach((event, index) => {
    const structuralReason = rowExclusionReason(event);
    if (structuralReason) {
      incrementReason(exclusions, structuralReason);
      return;
    }

    const dateResult = eventDateResult(event);
    invalidDateEntries += dateResult.invalidExplicitCount;
    if (!dateResult.dates.length) {
      incrementReason(exclusions, 'missing_valid_date');
      return;
    }

    const datesInWindow = dateResult.dates.filter((date) => date >= windowStart && date <= windowEnd);
    if (!datesInWindow.length) {
      incrementReason(exclusions, 'outside_window');
      return;
    }

    const category = text(event.category).toLowerCase();
    trustedRecords.push({
      event,
      eventId: text(event.id) || `row:${index}`,
      title: text(event.title) || '제목 없음',
      category,
      type: sceneEventType(event),
      genre: sceneEventGenre(event),
      created_at: event.created_at,
      createdAt: validSceneDate(event.created_at),
      time: text(event.time ?? event.time_text),
      location: text(event.location ?? event.venue_name ?? event.address),
      dates: dateResult.dates,
      datesInWindow,
      dateSource: dateResult.source,
    });
  });

  const rawOccurrences = [];
  for (const record of trustedRecords) {
    for (const date of record.datesInWindow) {
      const day = weekdayLabel(date);
      const item = {
        type: record.type,
        title: record.title,
        date,
        createdAt: record.createdAt,
        genre: record.genre,
        day,
        eventId: record.eventId,
        time: record.time,
        location: record.location,
      };
      rawOccurrences.push({ ...record, date, day, item });
    }
  }

  rawOccurrences.sort((a, b) => (
    a.date.localeCompare(b.date)
    || occurrenceSignature(a).localeCompare(occurrenceSignature(b), 'ko')
    || a.eventId.localeCompare(b.eventId)
  ));
  const occurrenceBySignature = new Map();
  for (const occurrence of rawOccurrences) {
    const signature = occurrenceSignature(occurrence);
    const current = occurrenceBySignature.get(signature);
    if (!current || occurrenceQuality(occurrence) > occurrenceQuality(current)) {
      occurrenceBySignature.set(signature, occurrence);
    }
  }
  const occurrences = Array.from(occurrenceBySignature.values())
    .sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title, 'ko'));

  const monthlyMap = new Map(monthKeys.map((month) => [month, {
    month,
    classes: 0,
    events: 0,
    socials: 0,
    clubs: 0,
    total: 0,
    registrations: 0,
    dailyAvg: 0,
    maxDaily: 0,
    maxDailyDate: null,
    maxDailyItems: [],
    uniqueEvents: 0,
    eventIds: new Set(),
    daily: new Map(),
  }]));

  for (const occurrence of occurrences) {
    const month = monthlyMap.get(occurrence.date.slice(0, 7));
    if (!month) continue;
    if (occurrence.type === '강습') month.classes += 1;
    else if (occurrence.type === '동호회 이벤트+소셜') month.socials += 1;
    else month.events += 1;
    month.total += 1;
    month.eventIds.add(occurrence.eventId);
    const dailyItems = month.daily.get(occurrence.date) || [];
    dailyItems.push(occurrence.item);
    month.daily.set(occurrence.date, dailyItems);
  }

  for (const record of trustedRecords) {
    const registrationMonth = record.createdAt?.slice(0, 7);
    const month = monthlyMap.get(registrationMonth);
    if (month) month.registrations += 1;
  }

  const monthly = monthKeys.map((monthKey) => {
    const month = monthlyMap.get(monthKey);
    for (const [date, items] of month.daily) {
      if (items.length > month.maxDaily) {
        month.maxDaily = items.length;
        month.maxDailyDate = date;
        month.maxDailyItems = [...items].sort((a, b) => a.title.localeCompare(b.title, 'ko'));
      }
    }
    month.uniqueEvents = month.eventIds.size;
    month.dailyAvg = Number((month.total / daysInMonth(monthKey)).toFixed(1));
    const { eventIds, daily, ...safeMonth } = month;
    return safeMonth;
  });

  const genreMap = new Map();
  const typeCounts = { class: 0, event: 0, social: 0 };
  for (const occurrence of occurrences) {
    if (occurrence.genre !== '장르 미분류') addBreakdown(genreMap, occurrence.genre);
    if (occurrence.type === '강습') typeCounts.class += 1;
    else if (occurrence.type === '행사') typeCounts.event += 1;
    else typeCounts.social += 1;
  }
  const topGenresList = breakdown(genreMap).slice(0, 10).map((item) => item.name);
  const totalWeekly = dayStats(occurrences);
  const monthlyWeekly = dayStats(occurrences.filter((item) => item.date.startsWith(currentMonth)));
  const topDayRow = [...totalWeekly].sort((a, b) => b.count - a.count)[0];
  const currentMonthStats = monthly.find((item) => item.month === currentMonth);
  const includedEventIds = new Set(occurrences.map((item) => item.eventId));
  const genreClassifiedOccurrences = occurrences.filter((item) => item.genre !== '장르 미분류').length;
  const explicitDateRecords = trustedRecords.filter((item) => item.dateSource === 'event_dates').length;
  const fallbackDateRecords = trustedRecords.filter((item) => item.dateSource === 'start_date').length;
  const leadTime = leadTimeAnalysis(
    trustedRecords.filter((record) => includedEventIds.has(record.eventId)),
  );

  return {
    backend: 'cafe24-mysql',
    monthly,
    totalWeekly,
    monthlyWeekly,
    topGenresList,
    summary: {
      totalItems: occurrences.length,
      uniqueEvents: includedEventIds.size,
      dailyAverage: currentMonthStats?.dailyAvg || 0,
      currentMonthOccurrences: currentMonthStats?.total || 0,
      currentMonthUniqueEvents: currentMonthStats?.uniqueEvents || 0,
      upcomingOccurrences: occurrences.filter((item) => item.date >= asOfDate).length,
      topDay: topDayRow?.count ? topDayRow.day : '-',
      memberCount: Number(audience.memberCount || 0),
      pwaCount: Number(audience.pwaCount || 0),
      pushCount: Number(audience.pushCount || 0),
    },
    eventBreakdown: typeCounts,
    leadTimeAnalysis: leadTime,
    dataQuality: {
      methodologyVersion: SCENE_STATS_METHOD_VERSION,
      source: 'production_events',
      timezone: SCENE_STATS_TIME_ZONE,
      generatedAt,
      asOfDate,
      windowStart,
      windowEnd,
      currentMonthProvisional: asOfDate <= windowEnd,
      sourceRows: events.length,
      trustedRows: trustedRecords.length,
      includedEventRecords: includedEventIds.size,
      rawOccurrences: rawOccurrences.length,
      includedOccurrences: occurrences.length,
      deduplicatedOccurrences: rawOccurrences.length - occurrences.length,
      invalidDateEntries,
      explicitDateRecords,
      fallbackDateRecords,
      genreClassifiedOccurrences,
      genreCoverageRate: occurrences.length
        ? Number(((genreClassifiedOccurrences / occurrences.length) * 100).toFixed(1))
        : 0,
      excludedRows: Object.values(exclusions).reduce((sum, count) => sum + count, 0),
      exclusions,
      datePolicy: 'event_dates 우선, 없으면 start_date/date를 단일 회차로 사용',
      dedupePolicy: '제목·개최일·시간·장소·유형이 같은 회차만 중복 제거',
    },
    generatedAt,
  };
}
