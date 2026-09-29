import { describe, expect, it } from 'vitest';
import {
  getCalendarSocialDisplayText,
  getCalendarSocialSpecialLabel,
  getCalendarSocialSourceInfo,
  isCalendarRegularSocialGuide,
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

  it('does not show a graduation label on a class that only mentions its later graduation date', () => {
    expect(getCalendarSocialDisplayText({
      title: '네오스윙 141기 린디합 입문',
      description: '8/30~10/18 강습, 10/25 졸업파티',
      category: 'class',
      genre: '린디합',
      activity_type: 'class',
    })).toBe('');
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
    })).toBe('소셜');
  });

  it('distinguishes recurring-day guides from registered DJ-less socials and confirmed closures', () => {
    const guide = { id: 'regular-social:neo-fri:2026-10-02', title: '해피홀 금요 소셜', category: 'social',
      automation: { generated_by: 'regular-social-rolling-v1', source_id: 'neo_swing' } };
    expect(isCalendarRegularSocialGuide(guide)).toBe(true);
    expect(getCalendarSocialDisplayText(guide)).toBe('정규 요일');
    expect(getCalendarSocialDisplayText({ ...guide, id: 'registered', automation: null })).toBe('소셜');
    expect(isCalendarRegularSocialGuide({ ...guide, automation: { ...guide.automation, exception_id: 'confirmed', exception_type: 'override' } })).toBe(false);
    expect(getCalendarSocialDisplayText({ ...guide, genre: '휴무' })).toBe('휴무');
    expect(isCalendarRegularSocialGuide({ ...guide, dj_name: '호두' })).toBe(false);
    expect(isCalendarRegularSocialGuide({ ...guide, category: 'class' })).toBe(false);
  });

  it('keeps the individual notice separate from its official directory without inventing an original for a profile', () => {
    expect(getCalendarSocialSourceInfo({ link1: 'https://www.instagram.com/happyhall2004/p/Ddk16JhRVkq/' })).toEqual({
      originalUrl: 'https://www.instagram.com/happyhall2004/p/Ddk16JhRVkq/',
      officialUrl: 'https://www.instagram.com/happyhall2004/', sourceName: '해피홀',
    });
    expect(getCalendarSocialSourceInfo({ link1: 'https://www.instagram.com/neo_swing/?igsh=example' }).originalUrl).toBeNull();
    const cafe = getCalendarSocialSourceInfo({
      link1: 'https://cafe.naver.com/f-e/cafes/10026855/articles/99999',
      automation: { source_id: 'swingfriends-happyhall-cafe' },
    });
    expect(cafe.officialUrl).toContain('/menus/305');
    expect(cafe.originalUrl).toContain('/articles/99999');
    expect(getCalendarSocialSourceInfo({ link1: cafe.originalUrl, organizer: 'swingfriends-happyhall-cafe' }).officialUrl).toContain('/menus/305');
    expect(getCalendarSocialSourceInfo({ link1: 'https://example.com/notice' })).toMatchObject({
      originalUrl: 'https://example.com/notice', officialUrl: null,
    });
    expect(getCalendarSocialSourceInfo({ link1: 'javascript:alert(1)' })).toMatchObject({ originalUrl: null, officialUrl: null });
  });
});
