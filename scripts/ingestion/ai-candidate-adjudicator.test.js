import { describe, expect, it } from 'vitest';
import { validateAiAdjudication } from './ai-candidate-adjudicator.mjs';

const candidate = {
  extracted_text: '7월 29일 경성홀 수요 소셜 DJ 뉴야',
  structured_data: {
    title: '경성홀 수요 소셜 DJ 뉴야',
    date: '2026-07-29',
    activity_type: 'social',
    venue_name: '경성홀',
    djs: ['뉴야'],
  },
};

describe('AI candidate adjudication grounding', () => {
  it('approves only a 0.98+ agreement grounded in exact source text', () => {
    const result = validateAiAdjudication(candidate, {
      decision: 'register',
      confidence: 0.98,
      event_date: '2026-07-29',
      activity_type: 'social',
      venue: '경성홀',
      djs: ['뉴야'],
      evidence_quotes: ['7월 29일', '경성홀 수요 소셜', 'DJ 뉴야'],
      reasons: [],
    });

    expect(result.ok).toBe(true);
  });

  it('rejects a high confidence claim when its quote is hallucinated', () => {
    const result = validateAiAdjudication(candidate, {
      decision: 'register',
      confidence: 0.99,
      event_date: '2026-07-29',
      activity_type: 'social',
      venue: '경성홀',
      djs: ['뉴야'],
      evidence_quotes: ['저녁 8시부터 시작'],
      reasons: [],
    });

    expect(result.ok).toBe(false);
    expect(result.reasons).toContain('AI evidence is not an exact substring of source text');
  });

  it('rejects disagreement even when confidence is high', () => {
    const result = validateAiAdjudication(candidate, {
      decision: 'register',
      confidence: 0.99,
      event_date: '2026-07-30',
      activity_type: 'class',
      venue: '해피홀',
      djs: ['다른DJ'],
      evidence_quotes: ['7월 29일'],
      reasons: [],
    });

    expect(result.ok).toBe(false);
    expect(result.reasons).toEqual(expect.arrayContaining([
      'AI date disagrees with collector date',
      'AI activity disagrees with collector activity',
      'AI venue disagrees with collector venue',
      'AI DJ list disagrees with collector DJ list',
    ]));
  });

  it('rejects 0.97 confidence and incomplete field evidence', () => {
    const result = validateAiAdjudication(candidate, {
      decision: 'register',
      confidence: 0.97,
      event_date: '2026-07-29',
      activity_type: 'social',
      venue: '경성홀',
      djs: ['뉴야'],
      evidence_quotes: ['7월 29일'],
      reasons: [],
    });

    expect(result.ok).toBe(false);
    expect(result.reasons).toEqual(expect.arrayContaining([
      'AI confidence is below 0.98',
      'AI evidence does not explicitly contain the candidate venue',
      'AI evidence does not explicitly contain every candidate DJ',
      'AI evidence does not explicitly identify a social',
    ]));
  });
});
