import { describe, expect, it } from "vitest";
import type { Event } from "../../../utils/eventListUtils";
import {
    isHomeAdClubEvent,
    isHomeAdCurrentMonthEvent,
    isHomeAdExplicitEvent,
    isHomeAdRegularClass,
    isHomeAdSocialEvent,
    getHomeAdNearFutureEndDate,
    getHomeAdNextStartDate,
    getNextHomeAdAutoIndex,
    limitHomeAdOnePerAuthorVenue,
    rankHomeAdEvents,
    selectHomeAdDisplayEvents,
} from "./homeAdPriority";

const makeEvent = (id: number, overrides: Partial<Event> = {}) => ({
    id,
    title: `event-${id}`,
    date: "2026-08-20",
    start_date: "2026-08-20",
    end_date: "2026-08-20",
    created_at: "2026-08-01T00:00:00+09:00",
    genre: "워크샵",
    ...overrides,
} as Event);

const defaultOptions = {
    todayDateKey: "2026-08-11",
    now: new Date("2026-08-11T11:00:00+09:00"),
    randomSeed: 0,
    timeWindowHours: 72,
    sortBy: "created_at" as const,
    useFallback: true,
};

describe("home ad start-date priority", () => {
    it("does not keep an already-started event alive because its end date is in the future", () => {
        const event = makeEvent(1, {
            date: "2026-08-01",
            start_date: "2026-08-01",
            end_date: "2026-08-30",
        });

        expect(getHomeAdNextStartDate(event, "2026-08-11")).toBeNull();
        expect(rankHomeAdEvents([event], defaultOptions)).toEqual([]);
    });

    it("does not revive a multi-date event after its first start date", () => {
        const event = makeEvent(2, {
            start_date: "2026-08-01",
            event_dates: ["2026-08-03", "2026-08-15", "2026-08-22"],
        });

        expect(getHomeAdNextStartDate(event, "2026-08-11")).toBeNull();
        expect(rankHomeAdEvents([event], defaultOptions)).toEqual([]);
    });

    it("uses the earliest explicit event date only when start_date and date are absent", () => {
        const event = makeEvent(3, {
            start_date: undefined,
            date: undefined,
            event_dates: ["2026-08-22", "2026-08-15"],
        });

        expect(getHomeAdNextStartDate(event, "2026-08-11")).toBe("2026-08-15");
    });

    it("features one seeded today event, then events through next week, then recent registrations", () => {
        const todayNewest = makeEvent(1, {
            date: "2026-08-11",
            start_date: "2026-08-11",
            created_at: "2026-08-11T10:30:00+09:00",
        });
        const todayOlder = makeEvent(2, {
            date: "2026-08-11",
            start_date: "2026-08-11",
            created_at: "2026-08-11T09:30:00+09:00",
        });
        const recentFarFuture = makeEvent(3, {
            date: "2026-09-01",
            start_date: "2026-09-01",
            created_at: "2026-08-11T10:45:00+09:00",
        });
        const olderNearFuture = makeEvent(4, {
            date: "2026-08-12",
            start_date: "2026-08-12",
        });
        const olderFarFuture = makeEvent(5, {
            date: "2026-08-30",
            start_date: "2026-08-30",
        });

        expect(rankHomeAdEvents([
            olderFarFuture,
            todayNewest,
            recentFarFuture,
            olderNearFuture,
            todayOlder,
        ], {
            ...defaultOptions,
            randomSeed: 1,
        })).toEqual([
            todayOlder,
            todayNewest,
            olderNearFuture,
            recentFarFuture,
            olderFarFuture,
        ]);
    });

    it("uses the end of next week as the inclusive near-future priority boundary", () => {
        const nextSunday = makeEvent(1, {
            date: "2026-08-23",
            start_date: "2026-08-23",
            created_at: "2026-07-01T00:00:00+09:00",
        });
        const followingMonday = makeEvent(2, {
            date: "2026-08-24",
            start_date: "2026-08-24",
            created_at: "2026-08-14T10:50:00+09:00",
        });

        expect(getHomeAdNearFutureEndDate("2026-08-14")).toBe("2026-08-23");
        expect(rankHomeAdEvents([followingMonday, nextSunday], {
            ...defaultOptions,
            todayDateKey: "2026-08-14",
            now: new Date("2026-08-14T11:00:00+09:00"),
        })).toEqual([nextSunday, followingMonday]);
    });

    it("keeps near-future priority events even when fallback filling is disabled", () => {
        const nextWeek = makeEvent(1, {
            date: "2026-08-20",
            start_date: "2026-08-20",
            created_at: "2026-07-01T00:00:00+09:00",
        });
        const oldFarFuture = makeEvent(2, {
            date: "2026-09-20",
            start_date: "2026-09-20",
            created_at: "2026-07-01T00:00:00+09:00",
        });

        expect(rankHomeAdEvents([oldFarFuture, nextWeek], {
            ...defaultOptions,
            todayDateKey: "2026-08-14",
            now: new Date("2026-08-14T11:00:00+09:00"),
            useFallback: false,
        })).toEqual([nextWeek]);
    });

    it("guarantees this month's events before classes and pushes club schedules behind", () => {
        const nearClass = makeEvent(1, {
            date: "2026-08-15",
            start_date: "2026-08-15",
            category: "class",
        });
        const nearClub = makeEvent(2, {
            date: "2026-08-12",
            start_date: "2026-08-12",
            category: "club",
            genre: "팀원모집",
        });
        const monthEndCompetition = makeEvent(3, {
            date: "2026-08-30",
            start_date: "2026-08-30",
            category: "event",
            activity_type: "event",
            genre: "대회",
            created_at: "2026-07-01T00:00:00+09:00",
        });

        expect(rankHomeAdEvents([
            nearClub,
            nearClass,
            monthEndCompetition,
        ], defaultOptions)).toEqual([
            monthEndCompetition,
            nearClass,
            nearClub,
        ]);
    });

    it("keeps regular classes last among current and future candidates in both sort modes", () => {
        const todayRegularClass = makeEvent(1, {
            title: "린디합 정규 강습 12기",
            date: "2026-08-11",
            start_date: "2026-08-11",
            category: "club",
            genre: "정규강습",
            created_at: "2026-08-11T10:55:00+09:00",
        });
        const nearOneDayClass = makeEvent(2, {
            title: "린디합 원데이 워크샵",
            date: "2026-08-12",
            start_date: "2026-08-12",
            category: "class",
            genre: "린디합",
        });
        const clubRecruit = makeEvent(3, {
            title: "공연팀 18시즌 모집",
            date: "2026-08-13",
            start_date: "2026-08-13",
            category: "club",
            genre: "팀원모집",
        });
        const monthEvent = makeEvent(4, {
            title: "8월 스윙 대회",
            date: "2026-08-30",
            start_date: "2026-08-30",
            category: "event",
            genre: "대회",
        });

        const expected = [monthEvent, nearOneDayClass, clubRecruit, todayRegularClass];
        expect(rankHomeAdEvents([
            todayRegularClass,
            clubRecruit,
            nearOneDayClass,
            monthEvent,
        ], defaultOptions)).toEqual(expected);
        expect(rankHomeAdEvents([
            todayRegularClass,
            clubRecruit,
            nearOneDayClass,
            monthEvent,
        ], {
            ...defaultOptions,
            sortBy: "date",
        })).toEqual(expected);
    });

    it("keeps this month's explicit events when fallback filling is disabled", () => {
        const monthEndEvent = makeEvent(1, {
            date: "2026-08-30",
            start_date: "2026-08-30",
            category: "event",
            activity_type: "event",
            created_at: "2026-07-01T00:00:00+09:00",
        });

        expect(rankHomeAdEvents([monthEndEvent], {
            ...defaultOptions,
            useFallback: false,
        })).toEqual([monthEndEvent]);
    });

});

describe("home ad display selection", () => {
    const futureEvents = Array.from({ length: 15 }, (_, index) => makeEvent(index + 1));

    it("shows up to fifteen current or future candidates", () => {
        expect(selectHomeAdDisplayEvents({
            primaryEvents: futureEvents,
            maxItems: 15,
        })).toEqual(futureEvents);
    });

    it("keeps fewer than ten candidates without filling past events", () => {
        const primary = futureEvents.slice(0, 8);

        expect(selectHomeAdDisplayEvents({
            primaryEvents: primary,
            maxItems: 15,
        })).toEqual(primary);
    });

    it("preserves the configured maximum", () => {
        expect(selectHomeAdDisplayEvents({
            primaryEvents: futureEvents,
            maxItems: 5,
        })).toEqual(futureEvents.slice(0, 5));
    });
});

describe("home ad event classification", () => {
    it("keeps a competition as an event even when DJ/social metadata conflicts", () => {
        const competition = makeEvent(1, {
            date: "2026-08-17",
            start_date: "2026-08-17",
            category: "event",
            activity_type: "social",
            genre: "대회,소셜",
            dance_tags: ["battle", "dj"],
        });

        expect(isHomeAdExplicitEvent(competition)).toBe(true);
        expect(isHomeAdSocialEvent(competition)).toBe(false);
        expect(isHomeAdCurrentMonthEvent(competition, "2026-08-14")).toBe(true);
    });

    it("still excludes a genuine social and recognizes club/team schedules", () => {
        expect(isHomeAdSocialEvent(makeEvent(1, {
            category: "social",
            activity_type: "social",
            genre: "소셜",
        }))).toBe(true);
        expect(isHomeAdClubEvent(makeEvent(2, {
            category: "class",
            title: "공연팀 17시즌 안내",
        }))).toBe(true);
    });

    it("recognizes only regular-class evidence and leaves a one-day class at normal priority", () => {
        expect(isHomeAdRegularClass(makeEvent(1, {
            category: "club",
            genre: "정규강습",
        }))).toBe(true);
        expect(isHomeAdRegularClass(makeEvent(2, {
            category: "class",
            genre: "린디합",
            dance_tags: ["academy_regular"],
        }))).toBe(true);
        expect(isHomeAdRegularClass(makeEvent(3, {
            category: "regular",
            genre: "린디합",
        }))).toBe(true);
        expect(isHomeAdRegularClass(makeEvent(4, {
            title: "린디합 원데이 워크샵",
            category: "class",
            genre: "린디합",
        }))).toBe(false);
    });
});

describe("home ad auto rotation", () => {
    const events = [makeEvent(1), makeEvent(2), makeEvent(3), makeEvent(4)];

    it("moves through the current and future candidates in ranked order", () => {
        expect(getNextHomeAdAutoIndex(events, 1)).toBe(1);
        expect(getNextHomeAdAutoIndex(events, 2)).toBe(2);
        expect(getNextHomeAdAutoIndex(events, 4)).toBe(0);
    });
});

describe("home ad author and venue deduplication", () => {
    it("uses the original source when the organizer is the platform fallback", () => {
        const beerParty = makeEvent(1, {
            title: "경성홀 BEER PARTY",
            user_id: "automatic-ingestor",
            organizer_name: "관리자",
            organizer: "Swing Enjoy",
            venue_id: "kyungsung-hall",
            link_name1: "경성홀",
        });
        const holidayWorkshop = makeEvent(2, {
            title: "광복절 특별 워크숍",
            user_id: "automatic-ingestor",
            organizer_name: "관리자",
            organizer: "Swing Enjoy",
            venue_id: "kyungsung-hall",
            link_name1: "경성홀",
        });
        const championsCup = makeEvent(3, {
            title: "챔피언스컵",
            user_id: "automatic-ingestor",
            organizer_name: "관리자",
            organizer: "Swing Enjoy",
            venue_id: "kyungsung-hall",
            genre: "대회",
            link_name1: "스윙패밀리 강습/행사",
        });

        expect(limitHomeAdOnePerAuthorVenue([beerParty, holidayWorkshop, championsCup])).toEqual([
            beerParty,
            championsCup,
        ]);
    });

    it("keeps source-less fallback-organizer events separate", () => {
        const first = makeEvent(1, { organizer: "익명", venue_id: "same-hall" });
        const second = makeEvent(2, { organizer: "익명", venue_id: "same-hall" });

        expect(limitHomeAdOnePerAuthorVenue([first, second])).toEqual([first, second]);
    });

    it("still limits a known author to one event per venue", () => {
        const first = makeEvent(1, {
            organizer: "real-organizer",
            venue_id: "same-hall",
        });
        const second = makeEvent(2, {
            organizer: "REAL-ORGANIZER",
            venue_id: "same-hall",
        });
        const otherVenue = makeEvent(3, {
            organizer: "real-organizer",
            venue_id: "other-hall",
        });

        expect(limitHomeAdOnePerAuthorVenue([first, second, otherVenue])).toEqual([
            first,
            otherVenue,
        ]);
    });
});
