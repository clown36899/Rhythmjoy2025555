import { describe, expect, it } from 'vitest';
import { isCalendarClassLikeCategory, isCalendarSocialLikeEvent } from './calendarEventKind';

describe('calendar event kind detection', () => {
  it('lets an explicit class category override stale social fields', () => {
    expect(isCalendarSocialLikeEvent({
      id: 'social-316',
      category: 'class',
      activity_type: 'class',
      genre: '소셜',
      group_id: 2,
    })).toBe(false);
  });

  it('keeps legacy social records recognizable when category is not class-like', () => {
    expect(isCalendarSocialLikeEvent({
      id: '30f3fdea',
      category: 'event',
      genre: 'DJ,소셜',
      group_id: 2,
    })).toBe(true);
  });

  it('lets an explicit social category override stale class activity_type', () => {
    expect(isCalendarSocialLikeEvent({
      category: 'social',
      activity_type: 'class',
    })).toBe(true);
  });

  it('treats club and regular lessons as class-like', () => {
    expect(isCalendarClassLikeCategory('club')).toBe(true);
    expect(isCalendarClassLikeCategory('regular')).toBe(true);
  });
});
