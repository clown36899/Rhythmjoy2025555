import { describe, expect, it } from 'vitest';
import {
  getCalendarSocialDisplayText,
  getCalendarSocialSpecialLabel,
  isCalendarClassLikeCategory,
  isCalendarSocialLikeEvent,
} from './calendarEventKind';

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

  it('hides a stored graduation cohort in the calendar DJ slot', () => {
    expect(getCalendarSocialDisplayText({
      title: '네오 8/23 졸업파티',
      description: 'NEO SWING 140기 7/5~8/16 강습, 8/23 졸업파티',
      category: 'social',
      genre: '졸공',
      activity_type: 'social',
      group_id: 2,
    })).toBe('졸공');

    expect(getCalendarSocialDisplayText({
      title: 'DJ 졸공 98회 | 98학기 SWING FESTIVAL',
      category: 'social',
      genre: '졸공',
      djs: ['졸공 98회'],
    })).toBe('졸공');
  });

  it('shows a graduation label even when a legacy event has no cohort', () => {
    expect(getCalendarSocialDisplayText({
      title: '여름 졸업공연',
      category: 'social',
      genre: '졸공',
    })).toBe('졸공');
  });

  it('shows social closures as a plain closure label without a DJ prefix', () => {
    const closure = {
      title: '경성홀 일요 소셜 휴무',
      category: 'social',
      genre: '휴무',
      dj_name: '휴무',
      automation: { exception_type: 'closure' },
    };

    expect(getCalendarSocialSpecialLabel(closure)).toBe('휴무');
    expect(getCalendarSocialDisplayText(closure)).toBe('휴무');
  });

  it('preserves ordinary social DJs and keeps undetermined DJs hidden', () => {
    expect(getCalendarSocialDisplayText({
      title: '경성홀 토요 소셜',
      category: 'social',
      djs: ['DJ 메이저', 'DJ 미정'],
    })).toBe('DJ 메이저');
    expect(getCalendarSocialDisplayText({
      title: 'DJ 미정 | 해피홀 일요 소셜',
      category: 'social',
    })).toBe('');
  });
});
