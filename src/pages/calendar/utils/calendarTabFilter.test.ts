import { describe, expect, it } from 'vitest';
import { matchesCalendarTabFilter } from './calendarTabFilter';

describe('calendar kind matching', () => {
    it.each([
        ['all', 'class', true],
        ['all', 'club_lesson', true],
        ['all', 'regular', true],
        ['all', 'social', true],
        ['all', 'event', true],
        ['all', undefined, true],
        ['classes', 'class', true],
        ['classes', 'club_lesson', true],
        ['classes', 'event', false],
        ['social-events', 'regular', false],
        ['social-events', 'social', true],
        ['social-events', undefined, true],
    ] as const)('matches %s filter against %s category', (filter, category, expected) => {
        expect(matchesCalendarTabFilter({ category }, filter)).toBe(expected);
    });
});
