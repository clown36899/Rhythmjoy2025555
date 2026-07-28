import { describe, expect, it } from 'vitest';
import {
  buildCollectedScrapedEventRow,
  hasRegisteredEventLink,
  validateAutomaticRegistrationCandidate,
} from './function-api.js';

describe('ingestor registration linkage', () => {
  it('marks a candidate collected only with its persisted event id', () => {
    const row = buildCollectedScrapedEventRow({
      scrapedEvent: { id: 'candidate-1', status: 'pending', structured_data: { date: '2026-08-01' } },
      scrapedEventPatch: { poster_url: '/uploads/poster.webp' },
      structuredData: { date: '2026-08-01', title: '검증 행사' },
      registeredEvent: { id: 'event-1' },
      now: '2026-07-28T02:00:00.000Z',
    });

    expect(row).toMatchObject({
      id: 'candidate-1',
      status: 'collected',
      is_collected: true,
      registered_event_id: 'event-1',
      registered_at: '2026-07-28T02:00:00.000Z',
      updated_at: '2026-07-28T02:00:00.000Z',
      poster_url: '/uploads/poster.webp',
      structured_data: {
        date: '2026-08-01',
        title: '검증 행사',
        registered_event_id: 'event-1',
      },
    });
  });

  it('recognizes only persisted registration links as completion evidence', () => {
    expect(hasRegisteredEventLink({ registered_event_id: 'event-1' })).toBe(true);
    expect(hasRegisteredEventLink({ structured_data: { registered_event_id: 'event-2' } })).toBe(true);
    expect(hasRegisteredEventLink({ status: 'collected', is_collected: true })).toBe(false);
  });

  it('allows a date-only, grounded candidate from an enrolled source', () => {
    const validation = validateAutomaticRegistrationCandidate({
      id: 'candidate-safe',
      status: 'pending',
      source_id: 'kyungsunghall',
      poster_url: 'https://example.com/poster.jpg',
      extracted_text: '7월 29일 경성홀 수요 소셜 DJ 뉴야',
      auto_registration: {
        ready: true,
        mode: 'shadow',
        source_id: 'kyungsunghall',
        ai_verified: true,
        ai_confidence: 0.98,
      },
      structured_data: {
        title: '경성홀 수요 소셜 DJ 뉴야',
        date: '2026-07-29',
        activity_type: 'social',
        event_type: '소셜',
        venue_name: '경성홀',
        venue_provenance: 'source_text',
        djs: ['뉴야'],
        ai_evidence_quotes: ['7월 29일', '경성홀 수요 소셜', 'DJ 뉴야'],
      },
    });

    expect(validation.ok).toBe(true);
    expect(validation.eventData).toMatchObject({
      date: '2026-07-29',
      start_date: '2026-07-29',
      end_date: '2026-07-29',
      category: 'social',
      location: '경성홀',
    });
    expect(validation.eventData).not.toHaveProperty('time');
  });

  it('blocks unproved sources, missing DJs, and every time field', () => {
    const validation = validateAutomaticRegistrationCandidate({
      id: 'candidate-unsafe',
      status: 'pending',
      source_id: 'swingtown-cafe',
      poster_url: 'https://example.com/poster.jpg',
      auto_registration: {
        ready: true,
        mode: 'shadow',
        source_id: 'swingtown-cafe',
      },
      structured_data: {
        title: '스윙타운 소셜',
        date: '2026-07-29',
        activity_type: 'social',
        venue_name: '스윙타임',
        times: ['20:00'],
      },
    });

    expect(validation.ok).toBe(false);
    expect(validation.reasons).toEqual(expect.arrayContaining([
      'source/activity is not server-enrolled',
      'social requires a DJ',
      'time fields are not accepted',
    ]));
  });

  it('never auto-registers a duplicate candidate', () => {
    const validation = validateAutomaticRegistrationCandidate({
      id: 'candidate-duplicate',
      status: 'duplicate',
      source_id: 'swingscandal-cafe',
      poster_url: 'https://example.com/poster.jpg',
      auto_registration: {
        ready: true,
        mode: 'shadow',
        source_id: 'swingscandal-cafe',
      },
      structured_data: {
        title: '스윙스캔들 토요 소셜 DJ 고즈',
        date: '2026-08-01',
        activity_type: 'social',
        venue_name: '사보이볼룸',
        djs: ['고즈'],
      },
    });

    expect(validation.ok).toBe(false);
    expect(validation.reasons).toContain('candidate is not pending');
  });
});
