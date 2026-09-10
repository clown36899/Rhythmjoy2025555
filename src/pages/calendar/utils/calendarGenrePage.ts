import { normalizeVisibleDanceScope, type DanceScope } from '../../../utils/danceTaxonomy';

export type CalendarGenreScope = Exclude<DanceScope, 'unknown'>;

// Public scene guides do not enable expanded event publication or ingestion.
// Both the page and site header use this boundary to select the same surface.
export function getCalendarGenrePage(search: string) {
    const params = new URLSearchParams(search);
    const scope = normalizeVisibleDanceScope(params.get('dance'), true);
    return { scope, showGuide: scope !== 'swing' || params.get('section') === 'guide' };
}

export function getCalendarGenreSearch(search: string, scope: CalendarGenreScope, guide = false) {
    const params = new URLSearchParams(search);
    params.set('dance', scope);
    if (guide) params.set('section', 'guide');
    else params.delete('section');
    // A detail link and scroll request belong to the genre being left.
    ['id', 'scrollToToday', 'nav'].forEach(key => params.delete(key));
    return params.toString();
}
