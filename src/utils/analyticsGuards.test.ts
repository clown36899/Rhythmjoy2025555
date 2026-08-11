import { describe, expect, it } from 'vitest';
import {
    addInAppHandoffAttribution,
    getAnalyticsInAppSource,
    isAndroidInAppAnalyticsHandoff,
} from './analyticsGuards';

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
