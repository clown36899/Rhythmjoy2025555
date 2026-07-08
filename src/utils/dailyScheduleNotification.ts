import type { Event as AppEvent } from '../lib/cafe24Client';
import type { NotificationRecord } from '../lib/notificationStore';
import {
    getCalendarDateKey,
    getCalendarKstDateKey,
    isEventShownOnCalendarDate,
} from './calendarEventVisibility';

export type DailyScheduleEventPreview = Partial<AppEvent> & {
    id: number | string;
    title: string;
    time?: string | null;
    start_time?: string | null;
    place_name?: string | null;
};

interface DailyScheduleNotificationOptions {
    receivedAt?: string;
    localTest?: boolean;
    adminOnly?: boolean;
}

export function getDailyScheduleDateKey(date: Date = new Date()) {
    return getCalendarKstDateKey(date);
}

export function isDailyScheduleEventOnDate(event: DailyScheduleEventPreview, dateKey: string) {
    return isEventShownOnCalendarDate(event, dateKey);
}

export function getDailyScheduleTime(event: DailyScheduleEventPreview) {
    const rawTime = String(event.time || event.start_time || '').trim();
    return rawTime ? rawTime.slice(0, 5) : '';
}

function getDailySchedulePlace(event: DailyScheduleEventPreview) {
    return event.place_name || event.venue_name || event.location || '장소 미정';
}

function getDailyScheduleImage(event?: DailyScheduleEventPreview | null) {
    if (!event) return undefined;
    return event.image_thumbnail || event.image_medium || event.image || event.image_full || event.image_micro || undefined;
}

function getDailyScheduleCategory(event: DailyScheduleEventPreview) {
    const category = String(event.category || event.activity_type || 'event').toLowerCase();
    if (category === 'class' || category === 'regular') return 'class';
    if (category === 'club') return 'club';
    if (category === 'social') return 'social';
    return 'event';
}

function getDailyScheduleEventDate(event: DailyScheduleEventPreview, dateKey: string) {
    return (
        getCalendarDateKey(event.start_date) ||
        getCalendarDateKey(event.date) ||
        getCalendarDateKey(event.end_date) ||
        dateKey
    );
}

export function sortDailyScheduleEvents(events: DailyScheduleEventPreview[]) {
    return [...events].sort((a, b) => {
        const timeCompare = getDailyScheduleTime(a).localeCompare(getDailyScheduleTime(b));
        if (timeCompare !== 0) return timeCompare;
        return a.title.localeCompare(b.title, 'ko');
    });
}

export function getDailyScheduleEvents(events: DailyScheduleEventPreview[], dateKey: string) {
    return sortDailyScheduleEvents(events.filter((event) => isDailyScheduleEventOnDate(event, dateKey)));
}

export function shouldSendDailyScheduleNotification(events: DailyScheduleEventPreview[]) {
    return events.length > 0;
}

export function buildDailyScheduleNotification(
    events: DailyScheduleEventPreview[],
    dateKey: string = getDailyScheduleDateKey(),
    options: DailyScheduleNotificationOptions = {},
): NotificationRecord {
    const sortedEvents = sortDailyScheduleEvents(events);
    const firstEvent = sortedEvents[0];
    const count = sortedEvents.length;
    const firstTime = firstEvent ? getDailyScheduleTime(firstEvent) : '';
    const firstPlace = firstEvent ? getDailySchedulePlace(firstEvent) : '';
    const firstSummary = firstEvent
        ? `${firstTime ? `${firstTime} ` : ''}${firstEvent.title} · ${firstPlace}`
        : '';
    const body = count > 0
        ? `${firstSummary}${count > 1 ? ` 외 ${count - 1}개` : ''}`
        : '오늘 등록된 스윙 일정이 없습니다.';

    return {
        id: `daily-schedule-${dateKey}-${Date.now()}`,
        title: count > 0 ? `오늘 일정 ${count}개` : '오늘 일정 없음',
        body,
        url: `/calendar?date=${dateKey}&scrollToToday=true`,
        received_at: options.receivedAt || new Date().toISOString(),
        is_read: false,
        image: getDailyScheduleImage(firstEvent),
        data: {
            kind: 'daily_schedule_morning',
            queueSource: 'daily_schedule_morning',
            date: dateKey,
            count,
            localTest: options.localTest ?? false,
            adminOnly: options.adminOnly ?? false,
            items: sortedEvents.map((event, index) => ({
                eventId: String(event.id),
                title: event.title,
                body: `${getDailyScheduleEventDate(event, dateKey)} · ${getDailySchedulePlace(event)}`,
                url: `/calendar?id=${event.id}&date=${dateKey}`,
                image: getDailyScheduleImage(event),
                category: getDailyScheduleCategory(event),
                location: getDailySchedulePlace(event),
                date: getDailyScheduleEventDate(event, dateKey),
                time: getDailyScheduleTime(event),
                order: index,
            })),
        },
    };
}
