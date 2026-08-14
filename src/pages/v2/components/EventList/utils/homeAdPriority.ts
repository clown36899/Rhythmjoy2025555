import type { Event } from "../../../utils/eventListUtils";

type HomeAdSortMode = "created_at" | "date";

interface RankHomeAdEventsOptions {
    todayDateKey: string;
    now: Date;
    randomSeed: number;
    timeWindowHours: number;
    sortBy: HomeAdSortMode;
    useFallback: boolean;
}

interface RankedHomeAdEvent {
    event: Event;
    nextStartDate: string;
    createdAt: number | null;
}

export const HOME_AD_LOW_PRIORITY_AUTO_INTERVAL = 8;

const GENERIC_HOME_AD_ORGANIZERS = new Set([
    "swing enjoy",
    "swingenjoy",
    "익명",
    "anonymous",
    "unknown",
]);

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const normalizeDateKey = (value?: string | null) => {
    const dateKey = value?.trim().slice(0, 10) || "";
    return DATE_KEY_PATTERN.test(dateKey) ? dateKey : null;
};

const normalizeHomeAdKeyPart = (value?: string | null) => (
    value?.trim().replace(/\s+/g, " ").toLowerCase() || ""
);

const getHomeAdVenueKey = (event: Event) => {
    const venueId = normalizeHomeAdKeyPart(event.venue_id);
    if (venueId) return `venue:${venueId}`;

    const venueName = normalizeHomeAdKeyPart(event.venue_name || event.location || event.place_name);
    if (venueName) return `place:${venueName}`;

    return "";
};

const getHomeAdSourceKey = (event: Event) => {
    const sourceName = normalizeHomeAdKeyPart(event.link_name1);
    return sourceName ? `source:${sourceName}` : "";
};

export const getHomeAdDedupeKey = (event: Event) => {
    const userId = event.user_id?.trim();
    const venueKey = getHomeAdVenueKey(event);
    if (userId) return venueKey ? `user:${userId}|${venueKey}` : `user:${userId}`;

    const organizerName = normalizeHomeAdKeyPart(event.organizer_name || event.organizer);
    if (organizerName && !GENERIC_HOME_AD_ORGANIZERS.has(organizerName)) {
        const organizerKey = `organizer:${organizerName}`;
        return venueKey ? `${organizerKey}|${venueKey}` : organizerKey;
    }

    // 수집 기본값이나 익명 표시는 실제 작성자 식별자가 아니다. 원문 출처가
    // 있으면 그 출처를 작성자 대용으로 써 같은 출처·장소만 한 건으로 제한한다.
    const sourceKey = getHomeAdSourceKey(event);
    if (sourceKey) return venueKey ? `${sourceKey}|${venueKey}` : sourceKey;

    // 실제 작성자와 원문 출처를 모두 알 수 없을 때는 별개 행사를 합치지 않는다.
    return `event:${event.id}`;
};

export const limitHomeAdOnePerAuthorVenue = (events: Event[]) => {
    const seenKeys = new Set<string>();
    const filtered: Event[] = [];

    for (const event of events) {
        const dedupeKey = getHomeAdDedupeKey(event);
        if (seenKeys.has(dedupeKey)) continue;
        seenKeys.add(dedupeKey);
        filtered.push(event);
    }

    return filtered;
};

const getEventStartDates = (event: Event) => {
    const explicitDates = Array.from(new Set(
        (event.event_dates || [])
            .map(normalizeDateKey)
            .filter((date): date is string => Boolean(date)),
    )).sort((a, b) => a.localeCompare(b));

    if (explicitDates.length > 0) return explicitDates;

    // 시작일이 있으면 대표 날짜(date)보다 우선한다. 종료일은 메인 광고
    // 노출 가능 여부를 연장하는 근거로 사용하지 않는다.
    const startDate = normalizeDateKey(event.start_date) || normalizeDateKey(event.date);
    return startDate ? [startDate] : [];
};

export const getHomeAdNextStartDate = (event: Event, todayDateKey: string) => {
    return getEventStartDates(event).find((date) => date >= todayDateKey) || null;
};

/** 오늘부터 다음 주 일요일까지를 가까운 미래 우선 노출 구간으로 계산한다. */
export const getHomeAdNearFutureEndDate = (todayDateKey: string) => {
    const normalizedToday = normalizeDateKey(todayDateKey);
    if (!normalizedToday) return todayDateKey;

    const [year, month, day] = normalizedToday.split("-").map(Number);
    const today = new Date(Date.UTC(year, month - 1, day));
    const daysUntilNextSunday = ((7 - today.getUTCDay()) % 7) + 7;
    today.setUTCDate(today.getUTCDate() + daysUntilNextSunday);
    return today.toISOString().slice(0, 10);
};

const getCreatedAt = (event: Event) => {
    if (!event.created_at) return null;
    const timestamp = new Date(event.created_at).getTime();
    return Number.isFinite(timestamp) ? timestamp : null;
};

const compareRegistrationProximity = (nowTimestamp: number) => (
    a: RankedHomeAdEvent,
    b: RankedHomeAdEvent,
) => {
    if (a.createdAt === null && b.createdAt === null) {
        return a.nextStartDate.localeCompare(b.nextStartDate);
    }
    if (a.createdAt === null) return 1;
    if (b.createdAt === null) return -1;

    const distance = Math.abs(nowTimestamp - a.createdAt) - Math.abs(nowTimestamp - b.createdAt);
    if (distance !== 0) return distance;
    return b.createdAt - a.createdAt;
};

const compareUpcomingStart = (nowTimestamp: number) => (
    a: RankedHomeAdEvent,
    b: RankedHomeAdEvent,
) => {
    const dateOrder = a.nextStartDate.localeCompare(b.nextStartDate);
    if (dateOrder !== 0) return dateOrder;
    return compareRegistrationProximity(nowTimestamp)(a, b);
};

const featureOneTodayEvent = (
    events: RankedHomeAdEvent[],
    randomSeed: number,
    nowTimestamp: number,
) => {
    const sorted = [...events].sort(compareRegistrationProximity(nowTimestamp));
    if (sorted.length < 2) return sorted;

    const featuredIndex = Math.abs(Math.trunc(randomSeed)) % sorted.length;
    const [featured] = sorted.splice(featuredIndex, 1);
    return [featured, ...sorted];
};

/**
 * 메인 신규 이벤트 광고 우선순위.
 *
 * 1. 이미 시작일이 지난 일정은 제외한다.
 * 2. 오늘 일정 중 한 건을 페이지 진입 시드로 선두에 고정한다.
 * 3. 오늘 이후 다음 주 일요일까지의 일정에 우선점을 준다.
 * 4. 나머지는 최근 등록 시각, 가까운 미래 시작일 순으로 채운다.
 */
export const rankHomeAdEvents = (
    events: Event[],
    options: RankHomeAdEventsOptions,
) => {
    const {
        todayDateKey,
        now,
        randomSeed,
        timeWindowHours,
        sortBy,
        useFallback,
    } = options;
    const nowTimestamp = now.getTime();
    const windowStart = nowTimestamp - timeWindowHours * 60 * 60 * 1000;

    const candidates = events.reduce<RankedHomeAdEvent[]>((ranked, event) => {
        const nextStartDate = getHomeAdNextStartDate(event, todayDateKey);
        if (!nextStartDate) return ranked;
        ranked.push({ event, nextStartDate, createdAt: getCreatedAt(event) });
        return ranked;
    }, []);

    const todayEvents = featureOneTodayEvent(
        candidates.filter((candidate) => candidate.nextStartDate === todayDateKey),
        randomSeed,
        nowTimestamp,
    );
    const futureEvents = candidates.filter((candidate) => candidate.nextStartDate > todayDateKey);

    if (sortBy === "date") {
        return [
            ...todayEvents,
            ...futureEvents.sort(compareUpcomingStart(nowTimestamp)),
        ].map(({ event }) => event);
    }

    const nearFutureEndDate = getHomeAdNearFutureEndDate(todayDateKey);
    const nearFutureEvents = futureEvents
        .filter(({ nextStartDate }) => nextStartDate <= nearFutureEndDate)
        .sort(compareUpcomingStart(nowTimestamp));
    const laterFutureEvents = futureEvents
        .filter(({ nextStartDate }) => nextStartDate > nearFutureEndDate);

    const recentlyRegistered = laterFutureEvents
        .filter(({ createdAt }) => createdAt !== null && createdAt >= windowStart)
        .sort(compareRegistrationProximity(nowTimestamp));

    if (!useFallback) {
        return [...todayEvents, ...nearFutureEvents, ...recentlyRegistered].map(({ event }) => event);
    }

    const recentIds = new Set(recentlyRegistered.map(({ event }) => event.id));
    const upcomingFallback = laterFutureEvents
        .filter(({ event }) => !recentIds.has(event.id))
        .sort(compareUpcomingStart(nowTimestamp));

    return [
        ...todayEvents,
        ...nearFutureEvents,
        ...recentlyRegistered,
        ...upcomingFallback,
    ].map(({ event }) => event);
};

/** 시작일이 지난 일정은 유효 일정만으로 광고 칸이 부족할 때 쓰는 보충 후보로만 반환한다. */
export const rankPastHomeAdEvents = (
    events: Event[],
    todayDateKey: string,
    now: Date,
) => {
    const nowTimestamp = now.getTime();

    return events
        .reduce<RankedHomeAdEvent[]>((ranked, event) => {
            const startDates = getEventStartDates(event);
            const latestPastStart = [...startDates].reverse().find((date) => date < todayDateKey);
            if (!latestPastStart || startDates.some((date) => date >= todayDateKey)) return ranked;

            ranked.push({
                event,
                nextStartDate: latestPastStart,
                createdAt: getCreatedAt(event),
            });
            return ranked;
        }, [])
        .sort((a, b) => {
            const dateOrder = b.nextStartDate.localeCompare(a.nextStartDate);
            if (dateOrder !== 0) return dateOrder;
            return compareRegistrationProximity(nowTimestamp)(a, b);
        })
        .map(({ event }) => event);
};

/**
 * 지난 일정 보충 카드는 배경 스택에는 유지하되 자동 전면 노출은 8회 중 1회로 제한한다.
 * 수동 인디케이터/스와이프 이동은 이 제한을 받지 않는다.
 */
export const getNextHomeAdAutoIndex = (
    events: Event[],
    lowPriorityEventIds: ReadonlySet<number | string>,
    autoStep: number,
) => {
    if (events.length <= 1) return 0;

    const regularIndices = events
        .map((event, index) => ({ event, index }))
        .filter(({ event }) => !lowPriorityEventIds.has(event.id))
        .map(({ index }) => index);
    const lowPriorityIndices = events
        .map((event, index) => ({ event, index }))
        .filter(({ event }) => lowPriorityEventIds.has(event.id))
        .map(({ index }) => index);

    if (regularIndices.length === 0 || lowPriorityIndices.length === 0) {
        return autoStep % events.length;
    }

    if (autoStep % HOME_AD_LOW_PRIORITY_AUTO_INTERVAL === 0) {
        const lowPriorityStep = Math.floor(autoStep / HOME_AD_LOW_PRIORITY_AUTO_INTERVAL) - 1;
        return lowPriorityIndices[lowPriorityStep % lowPriorityIndices.length];
    }

    const completedLowPrioritySteps = Math.floor(autoStep / HOME_AD_LOW_PRIORITY_AUTO_INTERVAL);
    const regularStep = autoStep - completedLowPrioritySteps;
    return regularIndices[regularStep % regularIndices.length];
};
