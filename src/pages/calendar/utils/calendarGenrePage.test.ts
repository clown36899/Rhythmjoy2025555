import { describe, expect, it } from 'vitest';
import { getCalendarGenrePage, getCalendarGenreSearch } from './calendarGenrePage';
import { getVisibleDanceScopeOptions, normalizeVisibleDanceScope } from '../../../utils/danceTaxonomy';

describe('calendar genre guide navigation boundary', () => {
    it('preserves legacy calendar URLs and falls back safely for unknown genres', () => {
        for (const search of ['', '?view=list', '?dance=swing&view=map', '?dance=invalid']) {
            expect(getCalendarGenrePage(search)).toEqual({ scope: 'swing', showGuide: false });
        }
    });

    it('routes every expanded genre to the shared guide without enabling event publication', () => {
        for (const { key } of getVisibleDanceScopeOptions(true).filter(option => option.key !== 'swing')) {
            expect(getCalendarGenrePage(`?dance=${key}&view=calendar&id=old-swing-event`))
                .toEqual({ scope: key, showGuide: true });
            expect(normalizeVisibleDanceScope(key, false)).toBe('swing');
        }
    });

    it('clears stale event/scroll actions while retaining the users calendar mode and filter', () => {
        const search = getCalendarGenreSearch('?view=list&filter=class&id=42&scrollToToday=true&nav=123', 'salsa');
        const params = new URLSearchParams(search);
        expect(params.get('view')).toBe('list');
        expect(params.get('filter')).toBe('class');
        expect(params.get('dance')).toBe('salsa');
        expect(['id', 'scrollToToday', 'nav'].some(key => params.has(key))).toBe(false);
        expect(getCalendarGenrePage(getCalendarGenreSearch(search, 'swing')).showGuide).toBe(false);
    });

    it('supports an explicit swing guide and clears it when returning to the calendar', () => {
        const search = getCalendarGenreSearch('?view=map', 'swing', true);
        expect(getCalendarGenrePage(search)).toEqual({ scope: 'swing', showGuide: true });
        expect(getCalendarGenrePage(getCalendarGenreSearch(search, 'swing')).showGuide).toBe(false);
    });
});
