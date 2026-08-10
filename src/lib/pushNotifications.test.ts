import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    normalizePushPreferences,
    subscribeToPush,
} from './pushNotifications';

describe('push notification lifecycle', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        localStorage.clear();
    });

    it('keeps the canonical account enabled flag and intentionally disabled routes', () => {
        const prefs = normalizePushPreferences({
            enabled: true,
            pref_today_digest: false,
            pref_new_event_alerts: false,
            pref_events: false,
            pref_class: false,
            pref_clubs: false,
            pref_new_event_social: false,
            pref_new_event_class: false,
            pref_new_event_clubs: false,
        });

        expect(prefs.enabled).toBe(true);
        expect(prefs.pref_today_digest).toBe(false);
        expect(prefs.pref_new_event_alerts).toBe(false);
        expect(prefs.pref_events).toBe(false);
        expect(prefs.pref_new_event_social).toBe(false);
    });

    it('force-renews a browser subscription that the server no longer owns', async () => {
        const oldSubscription = {
            endpoint: 'https://fcm.googleapis.com/fcm/send/expired',
            unsubscribe: vi.fn().mockResolvedValue(true),
        };
        const newSubscription = {
            endpoint: 'https://fcm.googleapis.com/fcm/send/renewed',
        };
        const getSubscription = vi.fn()
            .mockResolvedValueOnce(oldSubscription)
            .mockResolvedValueOnce(null);
        const subscribe = vi.fn().mockResolvedValue(newSubscription);
        const registration = { pushManager: { getSubscription, subscribe } };

        Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
        Object.defineProperty(window, 'Notification', {
            configurable: true,
            value: { permission: 'granted' },
        });
        Object.defineProperty(globalThis, 'Notification', {
            configurable: true,
            value: window.Notification,
        });
        Object.defineProperty(window, 'PushManager', { configurable: true, value: class PushManager {} });
        Object.defineProperty(navigator, 'serviceWorker', {
            configurable: true,
            value: { ready: Promise.resolve(registration) },
        });

        const result = await subscribeToPush({ forceRenew: true });

        expect(oldSubscription.unsubscribe).toHaveBeenCalledTimes(1);
        expect(subscribe).toHaveBeenCalledTimes(1);
        expect(result).toBe(newSubscription);
    });
});
