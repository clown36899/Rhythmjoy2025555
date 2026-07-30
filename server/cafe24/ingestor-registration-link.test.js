import { describe, expect, it } from 'vitest';
import {
  buildCollectedScrapedEventRow,
  canReprocessCollectedAutomaticCandidate,
  canReopenGeneratedRegularSocialDuplicate,
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

  it('reopens only an AI-verified duplicate of a generated regular social', () => {
    const existing = {
      status: 'duplicate',
      structured_data: {
        _duplicate: { target: 'events', existingId: 'regular-social:socialclub-wed:2026-07-29' },
      },
    };
    const corrected = {
      auto_registration: { ready: true, ai_verified: true, ai_confidence: 0.99 },
      structured_data: { activity_type: 'social' },
    };
    expect(canReopenGeneratedRegularSocialDuplicate(existing, corrected)).toBe(true);
    expect(canReopenGeneratedRegularSocialDuplicate({ status: 'duplicate' }, corrected)).toBe(true);
    expect(canReopenGeneratedRegularSocialDuplicate(existing, {
      ...corrected,
      auto_registration: { ...corrected.auto_registration, ai_confidence: 0.97 },
    })).toBe(false);
    expect(canReopenGeneratedRegularSocialDuplicate({
      ...existing,
      structured_data: { _duplicate: { target: 'events', existingId: 'manual-event-1' } },
    }, corrected)).toBe(false);
  });

  it('reprocesses a corrected automatic candidate only when it already links to the same event source and date', () => {
    const existing = {
      id: '7cd2d516eace25d8',
      status: 'collected',
      is_collected: true,
      registered_event_id: 'event-scandal-thu',
      source_url: 'https://cafe.naver.com/f-e/cafes/14933600/articles/102575',
      structured_data: { date: '2026-07-30' },
    };
    const corrected = {
      id: '7cd2d516eace25d8',
      source_url: 'https://cafe.naver.com/f-e/cafes/14933600/articles/102575',
      source_id: 'swingscandal-cafe',
      poster_url: 'https://example.com/scandal.jpg',
      extracted_text: '2026.07.30 스윙스캔들 목요소셜 DJ 테일',
      auto_registration: {
        ready: true,
        mode: 'shadow',
        source_id: 'swingscandal-cafe',
        ai_verified: true,
        ai_confidence: 0.99,
      },
      structured_data: {
        title: '스윙스캔들 목요소셜',
        date: '2026-07-30',
        activity_type: 'social',
        venue_name: '사보이볼룸',
        venue_provenance: 'source_registry',
        djs: ['테일'],
        ai_evidence_quotes: [
          '2026.07.30',
          '스윙스캔들 목요소셜',
          'DJ 테일',
          '검증된 공식 수집원 고정 장소: 사보이볼룸',
        ],
      },
    };

    expect(canReprocessCollectedAutomaticCandidate(existing, corrected)).toBe(true);
    expect(canReprocessCollectedAutomaticCandidate(
      existing,
      { ...corrected, source_url: 'https://cafe.naver.com/f-e/cafes/14933600/articles/other' },
    )).toBe(false);
    expect(canReprocessCollectedAutomaticCandidate(
      existing,
      { ...corrected, structured_data: { ...corrected.structured_data, date: '2026-08-01' } },
    )).toBe(false);
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
      title: 'DJ 뉴야 | 경성홀 수요 소셜 DJ 뉴야',
      date: '2026-07-29',
      start_date: '2026-07-29',
      end_date: '2026-07-29',
      category: 'social',
      location: '경성홀',
    });
    expect(validation.eventData).not.toHaveProperty('time');
  });

  it('accepts fixed venue evidence for the official Swing Scandal source', () => {
    const validation = validateAutomaticRegistrationCandidate({
      id: '7cd2d516eace25d8',
      status: 'pending',
      source_id: 'swingscandal-cafe',
      poster_url: 'https://example.com/scandal.jpg',
      extracted_text: '2026.07.30 스윙스캔들 목요소셜 DJ 테일',
      auto_registration: {
        ready: true,
        mode: 'shadow',
        source_id: 'swingscandal-cafe',
        ai_verified: true,
        ai_confidence: 0.99,
      },
      structured_data: {
        title: '스윙스캔들 목요소셜',
        date: '2026-07-30',
        activity_type: 'social',
        venue_name: '사보이볼룸',
        venue_provenance: 'source_registry',
        djs: ['테일'],
        ai_evidence_quotes: [
          '2026.07.30',
          '스윙스캔들 목요소셜',
          'DJ 테일',
          '검증된 공식 수집원 고정 장소: 사보이볼룸',
        ],
      },
    });

    expect(validation.ok).toBe(true);
    expect(validation.eventData).toMatchObject({
      title: 'DJ 테일 | 스윙스캔들 목요소셜',
      date: '2026-07-30',
      location: '사보이볼룸',
    });
    expect(validation.eventData).not.toHaveProperty('time');
  });

  it('accepts Swing Town and Swing Friends fixed venues plus an explicit Happy Hall override', () => {
    const buildCandidate = ({
      sourceId,
      sourceUrl,
      date,
      venue,
      venueProvenance,
      trustedVenue,
    }) => ({
      source_id: sourceId,
      source_url: sourceUrl,
      poster_url: 'https://example.com/poster.jpg',
      extracted_text: `${date} 소셜 DJ 테스트${venueProvenance === 'source_text' ? ` 장소 ${venue}` : ''}`,
      auto_registration: {
        ready: true,
        mode: 'shadow',
        source_id: sourceId,
        ai_verified: true,
        ai_confidence: 0.99,
      },
      structured_data: {
        title: `${sourceId} 소셜`,
        date,
        activity_type: 'social',
        venue_name: venue,
        venue_provenance: venueProvenance,
        djs: ['테스트'],
        ai_evidence_quotes: [
          date,
          '소셜',
          'DJ 테스트',
          venueProvenance === 'source_registry'
            ? `검증된 공식 수집원 고정 장소: ${trustedVenue}`
            : `장소 ${venue}`,
        ],
      },
    });

    expect(validateAutomaticRegistrationCandidate(buildCandidate({
      sourceId: 'swingtown-cafe',
      sourceUrl: 'https://cafe.naver.com/f-e/cafes/10342583/articles/1',
      date: '2026-08-04',
      venue: '봉천살롱',
      venueProvenance: 'source_registry',
      trustedVenue: '봉천살롱',
    })).ok).toBe(true);

    expect(validateAutomaticRegistrationCandidate(buildCandidate({
      sourceId: 'swingfriends-cafe',
      sourceUrl: 'https://cafe.naver.com/f-e/cafes/10026855/articles/1',
      date: '2026-08-05',
      venue: '스윙타임',
      venueProvenance: 'source_registry',
      trustedVenue: '스윙타임',
    })).ok).toBe(true);

    expect(validateAutomaticRegistrationCandidate(buildCandidate({
      sourceId: 'swingfriends-cafe',
      sourceUrl: 'https://cafe.naver.com/f-e/cafes/10026855/articles/2',
      date: '2026-08-08',
      venue: '해피홀',
      venueProvenance: 'source_text',
      trustedVenue: '스윙타임',
    })).ok).toBe(true);
  });

  it('blocks unproved sources, missing DJs, and every time field', () => {
    const validation = validateAutomaticRegistrationCandidate({
      id: 'candidate-unsafe',
      status: 'pending',
      source_id: 'happyhall2004',
      poster_url: 'https://example.com/poster.jpg',
      auto_registration: {
        ready: true,
        mode: 'shadow',
        source_id: 'happyhall2004',
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

  it('allows Social Club only on Wednesday', () => {
    const base = {
      id: 'social-club-candidate',
      status: 'pending',
      source_id: 'sosyalclub_swing',
      poster_url: 'https://example.com/social-club.jpg',
      extracted_text: '7월 29일 소셜클럽 수요 소셜 DJ 아드리안',
      auto_registration: {
        ready: true,
        mode: 'shadow',
        source_id: 'sosyalclub_swing',
        ai_verified: true,
        ai_confidence: 0.99,
      },
      structured_data: {
        title: 'Balboa in Social Club',
        date: '2026-07-29',
        activity_type: 'social',
        venue_name: '소셜클럽',
        venue_provenance: 'source_text',
        djs: ['아드리안'],
        ai_evidence_quotes: ['7월 29일', '소셜클럽 수요 소셜', 'DJ 아드리안'],
      },
    };
    expect(validateAutomaticRegistrationCandidate(base).ok).toBe(true);
    const wrongWeekday = structuredClone(base);
    wrongWeekday.structured_data.date = '2026-07-30';
    wrongWeekday.extracted_text = '7월 30일 소셜클럽 목요 소셜 DJ 아드리안';
    wrongWeekday.structured_data.ai_evidence_quotes = ['7월 30일', '소셜클럽 목요 소셜', 'DJ 아드리안'];
    expect(validateAutomaticRegistrationCandidate(wrongWeekday).reasons)
      .toContain('candidate weekday is not server-enrolled for source');
  });

  it('blocks a group name used instead of the configured fixed venue', () => {
    const validation = validateAutomaticRegistrationCandidate({
      id: 'swingtown-bad-venue',
      status: 'pending',
      source_id: 'swingtown-cafe',
      poster_url: 'https://example.com/swingtown.jpg',
      extracted_text: '8월 1일 스윙타운 토요 소셜 DJ 루비',
      auto_registration: {
        ready: true,
        mode: 'shadow',
        source_id: 'swingtown-cafe',
        ai_verified: true,
        ai_confidence: 0.99,
      },
      structured_data: {
        title: '스윙타운 토요 소셜',
        date: '2026-08-01',
        activity_type: 'social',
        venue_name: '스윙타운',
        venue_provenance: 'source_registry',
        djs: ['루비'],
        ai_evidence_quotes: ['8월 1일', '스윙타운 토요 소셜', 'DJ 루비'],
      },
    });
    expect(validation.ok).toBe(false);
    expect(validation.reasons).toContain('source registry venue disagrees with configured fixed venue');
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
