import { describe, expect, it } from 'vitest';
import { preferOfficialApiEvents } from './official-event-priority.js';

const official = {
  id: 'official',
  date: '2026-08-07',
  title: '금요 소셜',
  venue_name: '샘플홀',
  category: 'social',
  external_source: { partner_id: 'partner', external_id: 'friday-social' },
};

describe('official event presentation priority', () => {
  it('hides an earlier collected social with a different DJ title', () => {
    const collected = {
      id: 'collected',
      date: '2026-08-07',
      title: '금요 소셜 DJ 메이저',
      location: '샘플홀',
      category: 'social',
    };
    expect(preferOfficialApiEvents([collected, official])).toEqual([official]);
  });

  it('keeps unrelated events and same-venue classes', () => {
    const classEvent = {
      id: 'class',
      date: '2026-08-07',
      title: '린디합 초급',
      location: '샘플홀',
      category: 'class',
    };
    expect(preferOfficialApiEvents([classEvent, official])).toEqual([classEvent, official]);
  });
});
