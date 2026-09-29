import { isCalendarClassLikeCategory } from './calendarEventKind';

export type CalendarTabFilter = 'all' | 'social-events' | 'classes';

export function matchesCalendarTabFilter(
    event: { category?: string | null },
    filter: CalendarTabFilter,
) {
    if (filter === 'all') return true;
    const isClassLike = isCalendarClassLikeCategory(event.category);
    return filter === 'classes' ? isClassLike : !isClassLike;
}
