import { describe, expect, it } from 'vitest';
import { findLiveDuplicate } from './ingestor-v3-api.js';

describe('official API event duplicate priority', () => {
  it('keeps the official social when a collected title or DJ differs', () => {
    const duplicate = findLiveDuplicate({
      event_date: '2026-08-07',
      title: '금요 소셜 DJ 메이저',
      venue_name: '샘플홀',
      category: 'social',
      source_url: 'https://collector.example/post/1',
    }, [{
      id: 'official',
      date: '2026-08-07',
      title: '금요 소셜',
      venue_name: '샘플홀',
      category: 'social',
      link1: 'https://partner.example/social/1',
      external_source: { partner_id: 'partner', external_id: 'friday-social' },
    }]);
    expect(duplicate).toMatchObject({
      existingId: 'official',
      confidenceScore: 1,
    });
  });

  it('does not collapse unrelated classes at the same venue and date', () => {
    const duplicate = findLiveDuplicate({
      event_date: '2026-08-07',
      title: '발보아 중급',
      venue_name: '샘플홀',
      category: 'class',
      source_url: 'https://collector.example/class/2',
    }, [{
      id: 'official-class',
      date: '2026-08-07',
      title: '린디합 초급',
      venue_name: '샘플홀',
      category: 'class',
      link1: 'https://partner.example/class/1',
      external_source: { partner_id: 'partner', external_id: 'lindy-class' },
    }]);
    expect(duplicate).toBeNull();
  });
});
