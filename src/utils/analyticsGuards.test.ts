import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    addInAppHandoffAttribution,
    getAnalyticsInAppSource,
    isAndroidInAppAnalyticsHandoff,
} from './analyticsGuards';

describe('managed browser analytics exclusion', () => {
    beforeEach(() => {
        vi.resetModules();
        sessionStorage.clear();
        localStorage.clear();
        window.history.replaceState({}, '', '/');
    });
    afterEach(() => {
        vi.restoreAllMocks();
        sessionStorage.clear();
        window.history.replaceState({}, '', '/');
    });

    it('keeps ordinary visitors and unrelated query parameters enabled', async () => {
        const { isInternalAnalyticsContext } = await import('./analyticsGuards');
        expect(isInternalAnalyticsContext()).toBe(false);
        window.history.replaceState({}, '', '/?analytics=external&admin=true');
        expect(isInternalAnalyticsContext()).toBe(false);
    });

    it('preserves explicit exclusion across navigation and reload without an admin device marker', async () => {
        window.history.replaceState({}, '', '/?analytics=internal');
        let guards = await import('./analyticsGuards');
        expect(guards.isInternalAnalyticsContext()).toBe(true);
        window.history.replaceState({}, '', '/calendar');
        expect(guards.isInternalAnalyticsContext()).toBe(true);
        vi.resetModules();
        guards = await import('./analyticsGuards');
        expect(guards.isInternalAnalyticsContext()).toBe(true);
        expect(guards.isAdminAnalyticsShielded()).toBe(false);
        expect(localStorage.length).toBe(0);
        sessionStorage.clear();
        vi.resetModules();
        expect((await import('./analyticsGuards')).isInternalAnalyticsContext()).toBe(false);
    });

    it('keeps this document excluded when session storage is unavailable', async () => {
        const guards = await import('./analyticsGuards');
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
        expect(guards.isInternalAnalyticsContext()).toBe(false);
        window.history.replaceState({}, '', '/?analytics=internal');
        expect(guards.isInternalAnalyticsContext()).toBe(true);
        window.history.replaceState({}, '', '/calendar');
        expect(guards.isInternalAnalyticsContext()).toBe(true);
    });
});

describe('analytics in-app handoff guard', () => {
    it('identifies supported in-app sources', () => {
        expect(getAnalyticsInAppSource('Mozilla/5.0 Android KAKAOTALK')).toBe('kakao');
        expect(getAnalyticsInAppSource('Mozilla/5.0 iPhone Instagram 400.0')).toBe('instagram');
        expect(getAnalyticsInAppSource('Mozilla/5.0 FBAN/FBIOS')).toBe('facebook');
        expect(getAnalyticsInAppSource('Mozilla/5.0 Chrome/140.0')).toBeNull();
    });

    it('suppresses only Android contexts that will hand off to Chrome', () => {
        expect(isAndroidInAppAnalyticsHandoff('Mozilla/5.0 Android KAKAOTALK')).toBe(true);
        expect(isAndroidInAppAnalyticsHandoff('Mozilla/5.0 iPhone KAKAOTALK')).toBe(false);
        expect(isAndroidInAppAnalyticsHandoff('Mozilla/5.0 Android Chrome/140.0')).toBe(false);
    });

    it('adds missing attribution without overwriting campaign parameters', () => {
        const attributed = new URL(addInAppHandoffAttribution('https://swingenjoy.com/calendar?date=2026-08-12', 'kakao'));
        expect(attributed.searchParams.get('date')).toBe('2026-08-12');
        expect(attributed.searchParams.get('utm_source')).toBe('kakao');
        expect(attributed.searchParams.get('utm_medium')).toBe('in_app_handoff');

        const preserved = new URL(addInAppHandoffAttribution('https://swingenjoy.com/?utm_source=instagram&utm_medium=social', 'kakao'));
        expect(preserved.searchParams.get('utm_source')).toBe('instagram');
        expect(preserved.searchParams.get('utm_medium')).toBe('social');
    });
});
