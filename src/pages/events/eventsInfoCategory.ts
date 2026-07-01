import type { Event } from '../v2/utils/eventListUtils';

export type EventsInfoCategory = 'event' | 'class' | 'club' | 'social';

const normalizeCategoryValue = (value?: string | null) => String(value || '').trim().toLowerCase();

export const getActivityTypeForCategory = (category?: string | null): 'event' | 'class' | 'social' => {
  const normalized = normalizeCategoryValue(category);

  if (normalized === 'social') return 'social';
  if (
    normalized === 'class' ||
    normalized === 'regular' ||
    normalized === 'club' ||
    normalized === 'club_lesson' ||
    normalized === 'club_regular'
  ) {
    return 'class';
  }

  return 'event';
};

export const getEventsInfoCategory = (
  event: Pick<Event, 'category'> & { activity_type?: string | null }
): EventsInfoCategory => {
  const category = normalizeCategoryValue(event.category);

  if (category === 'club' || category === 'club_lesson' || category === 'club_regular') return 'club';
  if (category === 'social') return 'social';
  if (category === 'class' || category === 'regular') return 'class';
  if (category === 'event' || category === 'party') return 'event';

  const activityType = normalizeCategoryValue(event.activity_type);
  if (activityType === 'social') return 'social';
  if (activityType === 'class') return 'class';

  return 'event';
};
