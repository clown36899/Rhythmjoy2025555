import { describe, expect, it } from 'vitest';
import {
  buildCollectedScrapedEventRow,
  buildDuplicateScrapedEventRow,
  canReprocessCollectedAutomaticCandidate,
  canReopenGeneratedRegularSocialDuplicate,
  findBlockingAutomaticRegistrationDuplicate,
  findOperationalDuplicateForScrapedItem,
  hasRegisteredEventLink,
  isHighConfidenceSocialDuplicate,
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

  it('marks a remediated candidate duplicate without leaving a stale registration link', () => {
    const duplicate = {
      target: 'events',
      existingId: 'event-official',
      reason: '같은 날짜·장소·활동·DJ의 소셜',
    };
    const row = buildDuplicateScrapedEventRow({
      scrapedEvent: {
        id: 'candidate-cafe',
        status: 'collected',
        is_collected: true,
        registered_event_id: 'event-removed',
        registered_at: '2026-08-12T00:00:08.000Z',
        structured_data: {
          date: '2026-08-12',
          registered_event_id: 'event-removed',
        },
      },
      duplicate,
      now: '2026-08-12T03:00:00.000Z',
    });

    expect(row).toMatchObject({
      id: 'candidate-cafe',
      status: 'duplicate',
      is_collected: false,
      updated_at: '2026-08-12T03:00:00.000Z',
      structured_data: {
        date: '2026-08-12',
        _duplicate: duplicate,
      },
    });
    expect(row).not.toHaveProperty('registered_event_id');
    expect(row).not.toHaveProperty('registered_at');
    expect(row.structured_data).not.toHaveProperty('registered_event_id');
  });

  it('blocks the same social discovered from different sources when date, venue, activity, and DJ match', () => {
    const officialEvent = {
      id: 'event-swingtime-instagram',
      title: 'DJ 뉴야 | 스윙타임 수요 소셜',
      start_date: '2026-08-12',
      end_date: '2026-08-12',
      category: 'social',
      location: '스윙타임',
      link1: 'https://www.instagram.com/swingtimebar/p/official',
    };
    const cafeCandidate = {
      id: 'candidate-swingfriends-cafe',
      source_url: 'https://cafe.naver.com/f-e/cafes/10026855/articles/56120',
      structured_data: {
        title: 'DJ 뉴야 | 스윙프렌즈 카페 수요 소셜',
        date: '2026-08-12',
        activity_type: 'social',
        venue_name: '스윙타임',
        djs: ['뉴야'],
      },
    };

    expect(isHighConfidenceSocialDuplicate(officialEvent, cafeCandidate)).toBe(true);
    const duplicate = {
      target: 'events',
      existingId: 'event-swingtime-instagram',
      existingTitle: 'DJ 뉴야 | 스윙타임 수요 소셜',
      existingDate: '2026-08-12',
      existingSourceUrl: 'https://www.instagram.com/swingtimebar/p/official',
      reason: '같은 날짜·장소·활동·DJ의 소셜',
    };
    expect(findOperationalDuplicateForScrapedItem(cafeCandidate, [officialEvent])).toEqual(duplicate);
    expect(findBlockingAutomaticRegistrationDuplicate(cafeCandidate, [officialEvent])).toEqual(duplicate);
  });

  it('does not merge socials when the DJ differs or is unknown', () => {
    const baseEvent = {
      id: 'event-swingtime',
      title: 'DJ 뉴야 | 스윙타임 수요 소셜',
      start_date: '2026-08-12',
      category: 'social',
      location: '스윙타임',
      link1: 'https://www.instagram.com/swingtimebar/p/official',
    };
    const candidate = {
      source_url: 'https://cafe.naver.com/f-e/cafes/10026855/articles/other',
      structured_data: {
        title: '별도 수요 소셜',
        date: '2026-08-12',
        activity_type: 'social',
        venue_name: '스윙타임',
        djs: ['초리'],
      },
    };

    expect(isHighConfidenceSocialDuplicate(baseEvent, candidate)).toBe(false);
    expect(findOperationalDuplicateForScrapedItem(candidate, [baseEvent])).toBe(null);
    expect(isHighConfidenceSocialDuplicate(
      { ...baseEvent, title: '스윙타임 수요 소셜', dj_name: '미정' },
      { ...candidate, structured_data: { ...candidate.structured_data, djs: ['미정'] } },
    )).toBe(false);
  });

  it('normalizes DJ lineup order without weakening date or activity boundaries', () => {
    const event = {
      id: 'event-duo',
      title: 'DJ 뉴야, 초리 | 스윙타임 수요 소셜',
      start_date: '2026-08-12',
      category: 'social',
      venue_name: '스윙타임바',
    };
    const candidate = {
      structured_data: {
        title: '스윙프렌즈 수요 소셜',
        date: '2026-08-12',
        activity_type: 'social',
        venue_name: '스윙타임',
        djs: ['초리', '뉴야'],
      },
    };

    expect(isHighConfidenceSocialDuplicate(event, candidate)).toBe(true);
    expect(isHighConfidenceSocialDuplicate(event, {
      ...candidate,
      structured_data: { ...candidate.structured_data, date: '2026-08-13' },
    })).toBe(false);
    expect(isHighConfidenceSocialDuplicate(
      { ...event, category: 'event' },
      candidate,
    )).toBe(false);
  });

  it('uses explicit occurrence dates instead of treating every date inside a range as the same social', () => {
    const recurringEvent = {
      id: 'event-recurring',
      title: 'DJ 뉴야 | 스윙타임 토요 소셜',
      date: '2026-08-01',
      start_date: '2026-08-01',
      end_date: '2026-08-22',
      event_dates: ['2026-08-01', '2026-08-08', '2026-08-22'],
      category: 'social',
      location: '스윙타임',
    };
    const candidate = {
      structured_data: {
        title: 'DJ 뉴야 | 스윙프렌즈 소셜',
        date: '2026-08-15',
        activity_type: 'social',
        venue_name: '스윙타임',
        djs: ['뉴야'],
      },
    };

    expect(isHighConfidenceSocialDuplicate(recurringEvent, candidate)).toBe(false);
    expect(isHighConfidenceSocialDuplicate(recurringEvent, {
      ...candidate,
      structured_data: { ...candidate.structured_data, date: '2026-08-08' },
    })).toBe(true);
  });

  it('reopens a generated regular social only after the full automatic gate passes', () => {
    const existing = {
      status: 'duplicate',
      structured_data: {
        _duplicate: { target: 'events', existingId: 'regular-social:socialclub-wed:2026-07-29' },
      },
    };
    const corrected = {
      source_id: 'kyungsunghall',
      extracted_text: '7월 29일 경성홀 수요 소셜 DJ 뉴야',
      auto_registration: { ready: true, mode: 'shadow', source_id: 'kyungsunghall' },
      structured_data: {
        title: '경성홀 수요 소셜',
        date: '2026-07-29',
        activity_type: 'social',
        venue_name: '경성홀',
        venue_provenance: 'source_registry',
        djs: ['뉴야'],
        evidence_scope: 'date_scoped_social',
      },
    };
    expect(canReopenGeneratedRegularSocialDuplicate(existing, corrected)).toBe(true);
    expect(canReopenGeneratedRegularSocialDuplicate({ status: 'duplicate' }, corrected)).toBe(true);
    expect(canReopenGeneratedRegularSocialDuplicate(existing, {
      ...corrected,
      structured_data: { ...corrected.structured_data, djs: [] },
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

  it('recovers one legacy collected candidate through one exact operational source/date match', () => {
    const existing = {
      id: 'legacy-swingtown',
      status: 'collected',
      is_collected: true,
      source_url: 'https://cafe.naver.com/f-e/cafes/10342583/articles/156592',
      structured_data: { date: '2026-08-01' },
    };
    const corrected = {
      id: 'legacy-swingtown',
      source_id: 'swingtown-cafe',
      source_url: existing.source_url,
      poster_url: 'https://example.com/swingtown.jpg',
      extracted_text: '2026.08.01 스윙타운 소셜 DJ 사복',
      auto_registration: {
        ready: true,
        mode: 'shadow',
        source_id: 'swingtown-cafe',
        ai_verified: true,
        ai_confidence: 0.99,
      },
      structured_data: {
        title: '스윙타운 토요소셜',
        date: '2026-08-01',
        activity_type: 'social',
        venue_name: '봉천살롱',
        venue_provenance: 'source_registry',
        djs: ['사복'],
        ai_evidence_quotes: [
          '2026.08.01',
          '스윙타운 소셜',
          'DJ 사복',
          '검증된 공식 수집원 고정 장소: 봉천살롱',
        ],
      },
    };
    const exactEvent = {
      id: 'event-swingtown',
      date: '2026-08-01',
      link1: existing.source_url,
    };

    expect(canReprocessCollectedAutomaticCandidate(existing, corrected, [exactEvent])).toBe(true);
    expect(canReprocessCollectedAutomaticCandidate(existing, corrected, [])).toBe(false);
    expect(canReprocessCollectedAutomaticCandidate(existing, corrected, [exactEvent, {
      ...exactEvent,
      id: 'event-swingtown-duplicate',
    }])).toBe(false);
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
      },
      structured_data: {
        title: '경성홀 수요 소셜 DJ 뉴야',
        date: '2026-07-29',
        activity_type: 'social',
        event_type: '소셜',
        venue_name: '경성홀',
        venue_provenance: 'source_text',
        djs: ['뉴야'],
        evidence_scope: 'date_scoped_social',
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

  it('blocks a benefit-search discovery even when its original account is auto-enrolled', () => {
    const validation = validateAutomaticRegistrationCandidate({
      id: 'candidate-benefit-search',
      status: 'pending',
      source_id: 'swing_friends',
      discovery_source_id: 'benefit-search-swingfriends-pass',
      discovery_source_type: 'benefit_search',
      poster_url: 'https://example.com/pass.jpg',
      extracted_text: '2026.08.01 스윙프렌즈 정기권 판매 스윙타임',
      auto_registration: {
        ready: true,
        mode: 'shadow',
        source_id: 'swing_friends',
        ai_verified: true,
        ai_confidence: 0.99,
      },
      structured_data: {
        title: '스윙프렌즈 8월 정기권 판매',
        date: '2026-08-01',
        activity_type: 'sale',
        venue_name: '스윙타임',
        venue_provenance: 'source_text',
        ai_evidence_quotes: ['2026.08.01', '스윙프렌즈 정기권 판매', '스윙타임'],
      },
    });

    expect(validation.ok).toBe(false);
    expect(validation.reasons).toContain('benefit search candidates require manual approval');
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

  it('accepts an image-less Swingtime social when date and DJ evidence are grounded', () => {
    const validation = validateAutomaticRegistrationCandidate({
      id: 'swingtime-no-image',
      status: 'pending',
      source_id: 'swingtimebar',
      extracted_text: '8월 2일 일요일 소셜 DJ 훔머',
      auto_registration: {
        ready: true,
        mode: 'shadow',
        source_id: 'swingtimebar',
        ai_verified: true,
        ai_confidence: 0.99,
      },
      structured_data: {
        title: '스윙타임 일요 소셜',
        date: '2026-08-02',
        activity_type: 'social',
        venue_name: '스윙타임',
        venue_provenance: 'source_registry',
        djs: ['훔머'],
        ai_evidence_quotes: [
          '8월 2일',
          '일요일 소셜',
          'DJ 훔머',
          '검증된 공식 수집원 고정 장소: 스윙타임',
        ],
      },
    });

    expect(validation.ok).toBe(true);
    expect(validation.eventData).toMatchObject({
      title: 'DJ 훔머 | 스윙타임 일요 소셜',
      date: '2026-08-02',
      location: '스윙타임',
      image: null,
    });
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
