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
