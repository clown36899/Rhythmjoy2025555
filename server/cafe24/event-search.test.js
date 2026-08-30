import { describe, expect, it } from 'vitest';
import {
  eventMatchesSearch,
  getEventSearchTerms,
  searchValuesMatch,
} from './event-search.js';

describe('event search normalization', () => {
  it('splits a compact Korean day and category query without loosening character order', () => {
    expect(getEventSearchTerms('28일소셜')).toEqual(['28일', '소셜']);
    expect(getEventSearchTerms('8월28일소셜')).toEqual(['8월', '28일', '소셜']);
  });

  it('matches compact spacing and punctuation variants', () => {
    expect(searchValuesMatch(['해피홀 | 금요 소셜'], '해피홀금요소셜')).toBe(true);
    expect(searchValuesMatch(['스윙타임 (수) 소셜'], '스윙타임소셜')).toBe(true);
  });

  it('matches a day and Korean category from structured event fields', () => {
    const event = {
      title: 'Busan Balboa Social',
      start_date: '2026-08-28',
      category: 'social',
    };

    expect(eventMatchesSearch(event, '28일소셜')).toBe(true);
    expect(eventMatchesSearch(event, '8월 28일 소셜')).toBe(true);
    expect(eventMatchesSearch(event, '29일소셜')).toBe(false);
    expect(eventMatchesSearch({ ...event, category: 'class' }, '28일소셜')).toBe(false);
  });

  it('keeps every multi-keyword term required', () => {
    const event = {
      title: 'DJ 쓴귤 | 해피홀 금요 소셜',
      description: '8월 28일 금햎 DJ 안내',
      start_date: '2026-08-28',
      category: 'social',
    };

    expect(eventMatchesSearch(event, '28일쓴귤')).toBe(true);
    expect(eventMatchesSearch(event, '28일메이저')).toBe(false);
  });

  it('uses stored date and category for compact date-category searches', () => {
    const event = {
      title: 'DJ 쓴귤 | 해피홀 금요 소셜',
      description: '8월 28일 금햎, 29일 정모 휴무, 무료 라인 강습 없음',
      start_date: '2026-08-28',
      category: 'social',
    };

    expect(eventMatchesSearch(event, '28일소셜')).toBe(true);
    expect(eventMatchesSearch(event, '29일소셜')).toBe(false);
    expect(eventMatchesSearch(event, '28일강습')).toBe(false);
  });
});
