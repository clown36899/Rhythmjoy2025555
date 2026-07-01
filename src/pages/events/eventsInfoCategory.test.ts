import { describe, expect, it } from 'vitest';
import { getActivityTypeForCategory, getEventsInfoCategory } from './eventsInfoCategory';

describe('events info category routing', () => {
  it('uses category before stale activity_type for event cards', () => {
    expect(getEventsInfoCategory({ category: 'event', activity_type: 'class' })).toBe('event');
    expect(getEventsInfoCategory({ category: 'event', activity_type: 'social' })).toBe('event');
  });

  it('routes explicit social, class, and club categories to their own sections', () => {
    expect(getEventsInfoCategory({ category: 'social', activity_type: 'event' })).toBe('social');
    expect(getEventsInfoCategory({ category: 'class', activity_type: 'event' })).toBe('class');
    expect(getEventsInfoCategory({ category: 'club', activity_type: 'class' })).toBe('club');
  });

  it('normalizes activity_type from category when saving edits', () => {
    expect(getActivityTypeForCategory('event')).toBe('event');
    expect(getActivityTypeForCategory('social')).toBe('social');
    expect(getActivityTypeForCategory('class')).toBe('class');
    expect(getActivityTypeForCategory('club')).toBe('class');
  });
});
