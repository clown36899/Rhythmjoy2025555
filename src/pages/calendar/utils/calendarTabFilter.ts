export type CalendarTabFilter = 'all' | 'social-events' | 'classes';

export function getExplicitCalendarTabFilter(search: string): CalendarTabFilter | null {
    const category = new URLSearchParams(search).get('category');
    if (category === 'all') return 'all';
    if (category === 'social') return 'social-events';
    if (category === 'classes') return 'classes';
    return null;
}

export function getInitialCalendarTabFilter(search: string): CalendarTabFilter {
    return getExplicitCalendarTabFilter(search) || 'all';
}

export function resolveCalendarTabFilterOnNavigation(
    search: string,
    currentFilter: CalendarTabFilter,
): CalendarTabFilter {
    return getExplicitCalendarTabFilter(search) || currentFilter;
}
