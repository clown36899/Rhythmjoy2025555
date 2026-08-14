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

export const getHomeAdDedupeKey = (event: Event) => {
    const userId = event.user_id?.trim();
    const venueKey = getHomeAdVenueKey(event);
    if (userId) return venueKey ? `user:${userId}|${venueKey}` : `user:${userId}`;

    const organizerName = normalizeHomeAdKeyPart(event.organizer_name || event.organizer);
    if (organizerName && !GENERIC_HOME_AD_ORGANIZERS.has(organizerName)) {
        const organizerKey = `organizer:${organizerName}`;
        return venueKey ? `${organizerKey}|${venueKey}` : organizerKey;
    }

    // 수집 기본값이나 익명 표시는 실제 작성자 식별자가 아니다. 이를 작성자로
    // 묶으면 같은 장소의 서로 다른 행사까지 메인 광고에서 사라진다.
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
 * 3. 나머지는 최근 등록 시각, 가까운 미래 시작일 순으로 채운다.
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

    const recentlyRegistered = futureEvents
        .filter(({ createdAt }) => createdAt !== null && createdAt >= windowStart)
        .sort(compareRegistrationProximity(nowTimestamp));

    if (!useFallback) {
        return [...todayEvents, ...recentlyRegistered].map(({ event }) => event);
    }

    const recentIds = new Set(recentlyRegistered.map(({ event }) => event.id));
    const upcomingFallback = futureEvents
        .filter(({ event }) => !recentIds.has(event.id))
        .sort(compareUpcomingStart(nowTimestamp));

    return [
        ...todayEvents,
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
        return (events.length - (autoStep % events.length)) % events.length;
    }

    if (autoStep % HOME_AD_LOW_PRIORITY_AUTO_INTERVAL === 0) {
        const lowPriorityStep = Math.floor(autoStep / HOME_AD_LOW_PRIORITY_AUTO_INTERVAL) - 1;
        return lowPriorityIndices[lowPriorityStep % lowPriorityIndices.length];
    }

    const completedLowPrioritySteps = Math.floor(autoStep / HOME_AD_LOW_PRIORITY_AUTO_INTERVAL);
    const regularStep = autoStep - completedLowPrioritySteps;
    return regularIndices[
        (regularIndices.length - (regularStep % regularIndices.length)) % regularIndices.length
    ];
};
