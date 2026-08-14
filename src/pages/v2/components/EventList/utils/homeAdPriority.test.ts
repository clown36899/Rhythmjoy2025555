import { describe, expect, it } from "vitest";
import type { Event } from "../../../utils/eventListUtils";
import {
    getHomeAdNearFutureEndDate,
    getHomeAdNextStartDate,
    getNextHomeAdAutoIndex,
    limitHomeAdOnePerAuthorVenue,
    rankHomeAdEvents,
    rankPastHomeAdEvents,
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
        expect(rankPastHomeAdEvents([event], defaultOptions.todayDateKey, defaultOptions.now)).toEqual([event]);
    });

    it("uses the next explicit event date when a multi-date event still has a future occurrence", () => {
        const event = makeEvent(2, {
            start_date: "2026-08-01",
            event_dates: ["2026-08-03", "2026-08-15", "2026-08-22"],
        });

        expect(getHomeAdNextStartDate(event, "2026-08-11")).toBe("2026-08-15");
        expect(rankHomeAdEvents([event], defaultOptions)).toEqual([event]);
        expect(rankPastHomeAdEvents([event], defaultOptions.todayDateKey, defaultOptions.now)).toEqual([]);
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

    it("sorts past filler by the closest past start date", () => {
        const older = makeEvent(1, { date: "2026-07-01", start_date: "2026-07-01" });
        const closer = makeEvent(2, { date: "2026-08-10", start_date: "2026-08-10" });

        expect(rankPastHomeAdEvents(
            [older, closer],
            defaultOptions.todayDateKey,
            defaultOptions.now,
        )).toEqual([closer, older]);
    });
});

describe("home ad low-priority auto rotation", () => {
    const events = [makeEvent(1), makeEvent(2), makeEvent(3), makeEvent(4)];
    const lowPriorityIds = new Set<number | string>([3, 4]);

    it("keeps past filler out of the front for the first seven automatic transitions", () => {
        for (let step = 1; step < 8; step += 1) {
            expect(lowPriorityIds.has(events[getNextHomeAdAutoIndex(events, lowPriorityIds, step)].id)).toBe(false);
        }
    });

    it("moves forward through the ranked event order", () => {
        expect(getNextHomeAdAutoIndex(events, new Set(), 1)).toBe(1);
        expect(getNextHomeAdAutoIndex(events, new Set(), 2)).toBe(2);
        expect(getNextHomeAdAutoIndex(events, new Set(), 4)).toBe(0);
        expect(getNextHomeAdAutoIndex(events, lowPriorityIds, 1)).toBe(1);
        expect(getNextHomeAdAutoIndex(events, lowPriorityIds, 2)).toBe(0);
    });

    it("allows one rotating past filler on every eighth automatic transition", () => {
        expect(getNextHomeAdAutoIndex(events, lowPriorityIds, 8)).toBe(2);
        expect(getNextHomeAdAutoIndex(events, lowPriorityIds, 16)).toBe(3);
        expect(lowPriorityIds.has(events[getNextHomeAdAutoIndex(events, lowPriorityIds, 9)].id)).toBe(false);
    });
});

describe("home ad author and venue deduplication", () => {
    it("uses the original source when the organizer is the platform fallback", () => {
        const beerParty = makeEvent(1, {
            title: "경성홀 BEER PARTY",
            organizer: "Swing Enjoy",
            venue_id: "kyungsung-hall",
            link_name1: "경성홀",
        });
        const holidayWorkshop = makeEvent(2, {
            title: "광복절 특별 워크숍",
            organizer: "Swing Enjoy",
            venue_id: "kyungsung-hall",
            link_name1: "경성홀",
        });
        const championsCup = makeEvent(3, {
            title: "챔피언스컵",
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
