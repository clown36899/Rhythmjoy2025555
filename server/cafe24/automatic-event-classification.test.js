import { describe, expect, it } from 'vitest';
import { validateAutomaticRegistrationCandidate } from './function-api.js';

describe('automatic event classification guard', () => {
  it('rejects a competition that arrives mislabeled as a social because it has a DJ', () => {
    const validation = validateAutomaticRegistrationCandidate({
      id: 'competition-mislabeled-social',
      status: 'pending',
      source_id: 'swingfriends-cafe',
      source_url: 'https://cafe.naver.com/example/competition',
      poster_url: 'https://example.com/poster.jpg',
      extracted_text: '2026년 8월 17일 스윙타임 챔피언스컵 대회 DJ 해림',
      auto_registration: {
        ready: true,
        mode: 'shadow',
        source_id: 'swingfriends-cafe',
        ai_verified: true,
        ai_confidence: 0.99,
      },
      structured_data: {
        title: '챔피언스컵',
        date: '2026-08-17',
        activity_type: 'social',
        category: 'event',
        event_type: '대회',
        genre: '대회',
        venue_name: '스윙타임',
        venue_provenance: 'source_registry',
        djs: ['해림'],
        ai_evidence_quotes: ['2026년 8월 17일', '스윙타임', '챔피언스컵 대회', 'DJ 해림'],
      },
    });

    expect(validation.ok).toBe(false);
    expect(validation.reasons).toContain('event/competition cannot be auto-registered as social');
  });
});


describe('poster-optional automatic classes', () => {
  const candidate = {
    source_id: 'swingtown-lessons-cafe', status: 'pending',
    source_url: 'https://cafe.naver.com/f-e/cafes/10342583/articles/156749',
    poster_url: null,
    extracted_text: '2026년 9월 17일 린디합 강습. 장소 아지트 연습실.',
    auto_registration: { ready: true, mode: 'shadow', ai_verified: true, ai_confidence: 0.99 },
    structured_data: {
      title: '린디합 베이직 강습', date: '2026-09-17', activity_type: 'class',
      venue_name: '아지트 연습실', venue_provenance: 'source_text',
      ai_evidence_quotes: ['2026년 9월 17일 린디합 강습. 장소 아지트 연습실.'],
    },
  };
  it.each([null, 'https://example.com/original.jpg'])('accepts a verified class with poster %s', (poster_url) => {
    const result = validateAutomaticRegistrationCandidate({ ...candidate, poster_url });
    expect(result.reasons).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.eventData.image).toBe(poster_url);
  });
  it('still rejects unverified AI and unsupported source evidence', () => {
    expect(validateAutomaticRegistrationCandidate({ ...candidate, auto_registration: { ...candidate.auto_registration, ai_verified: false } }).ok).toBe(false);
    expect(validateAutomaticRegistrationCandidate({ ...candidate, extracted_text: '신청 안내' }).ok).toBe(false);
    expect(validateAutomaticRegistrationCandidate({ ...candidate, structured_data: { ...candidate.structured_data, venue_provenance: 'source_registry' } }).ok).toBe(false);
  });
  it('keeps the lesson board class-only', () => {
    expect(validateAutomaticRegistrationCandidate({ ...candidate, structured_data: { ...candidate.structured_data, activity_type: 'event' } }).reasons).toContain('source/activity is not server-enrolled');
  });
  it('still rejects already registered candidates', () => {
    expect(validateAutomaticRegistrationCandidate({ ...candidate, is_collected: true }).reasons).toContain('candidate is not pending');
  });
});
