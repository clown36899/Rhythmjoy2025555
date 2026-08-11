import { describe, expect, it } from 'vitest';
import {
    getExplicitCalendarTabFilter,
    getInitialCalendarTabFilter,
    resolveCalendarTabFilterOnNavigation,
} from './calendarTabFilter';

describe('calendar tab filter URL contract', () => {
    it.each([
        ['?category=all', 'all'],
        ['?category=social', 'social-events'],
        ['?category=classes', 'classes'],
    ] as const)('maps %s to %s', (search, expected) => {
        expect(getExplicitCalendarTabFilter(search)).toBe(expected);
    });

    it('defaults missing and unknown categories to all only for initial state', () => {
        expect(getExplicitCalendarTabFilter('?date=2026-08-12')).toBeNull();
        expect(getExplicitCalendarTabFilter('?category=unknown')).toBeNull();
        expect(getInitialCalendarTabFilter('?date=2026-08-12')).toBe('all');
    });

    it('resets a mounted social tab to all only when navigation explicitly requests all', () => {
        expect(resolveCalendarTabFilterOnNavigation(
            '?date=2026-08-12&category=all',
            'social-events',
        )).toBe('all');
        expect(resolveCalendarTabFilterOnNavigation(
            '?date=2026-08-12',
            'social-events',
        )).toBe('social-events');
    });
});
