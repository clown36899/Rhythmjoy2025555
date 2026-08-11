import { describe, expect, it } from 'vitest';
import { parseNotificationLaunch } from './notificationLaunch';

const origin = 'https://swingenjoy.com';

describe('notification launch metadata', () => {
    it('recovers an internal calendar target and daily source from a server-invisible fragment', () => {
        const fragment = new URLSearchParams({
            notification_click: 'true',
            notification_target: '/calendar?date=2026-08-11&scrollToToday=true',
            notification_kind: 'daily_schedule',
            notification_source_id: '2026-08-11',
        });

        expect(parseNotificationLaunch({
            origin,
            pathname: '/',
            search: '',
            hash: `#${fragment.toString()}`,
        })).toEqual({
            target: '/calendar?date=2026-08-11&scrollToToday=true',
            kind: 'daily_schedule',
            sourceId: '2026-08-11',
        });
    });

    it('rejects an external notification target', () => {
        const fragment = new URLSearchParams({
            notification_click: 'true',
            notification_target: 'https://attacker.example/path',
            notification_kind: 'new_event',
            notification_source_id: 'event-created:test',
        });

        expect(parseNotificationLaunch({
            origin,
            pathname: '/',
            search: '',
            hash: `#${fragment.toString()}`,
        })?.target).toBe('/');
    });

    it('continues to consume legacy query-based launches without retaining internal metadata', () => {
        expect(parseNotificationLaunch({
            origin,
            pathname: '/calendar',
            search: '?date=2026-08-11&open_notifications=true&notification_kind=daily_schedule&notification_source_id=2026-08-11',
            hash: '',
        })).toEqual({
            target: '/calendar?date=2026-08-11',
            kind: 'daily_schedule',
            sourceId: '2026-08-11',
        });
    });
});
