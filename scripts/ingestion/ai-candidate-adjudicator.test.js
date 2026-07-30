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
      'AI evidence does not explicitly identify activity social',
    ]));
  });

  it('requires an explicit class marker for class registration', () => {
    const classCandidate = {
      extracted_text: '8월 3일 해피홀 네오스윙 입문 강습',
      structured_data: {
        title: '네오스윙 입문 강습',
        date: '2026-08-03',
        activity_type: 'class',
        venue_name: '해피홀',
      },
    };
    expect(validateAiAdjudication(classCandidate, {
      decision: 'register',
      confidence: 0.99,
      event_date: '2026-08-03',
      activity_type: 'class',
      venue: '해피홀',
      djs: [],
      evidence_quotes: ['8월 3일', '해피홀', '입문 강습'],
    }).ok).toBe(true);
  });

  it('accepts the canonical Social Club venue when the post spells it 쏘셜클럽', () => {
    const socialClubCandidate = {
      extracted_text: '[Balboa in Social club] 날짜 : 7월 29일 (매주 수요일) 장소 : 쏘셜클럽 D J : 멍군',
      structured_data: {
        title: '[Balboa in Social club]',
        date: '2026-07-29',
        activity_type: 'social',
        venue_name: '소셜클럽',
        djs: ['멍군'],
      },
    };
    expect(validateAiAdjudication(socialClubCandidate, {
      decision: 'register',
      confidence: 0.99,
      event_date: '2026-07-29',
      activity_type: 'social',
      venue: '쏘셜클럽',
      djs: ['멍군'],
      evidence_quotes: ['Balboa in Social club', '날짜 : 7월 29일', '장소 : 쏘셜클럽', 'D J : 멍군'],
    }).ok).toBe(true);
  });

  it('accepts fixed venue evidence from a verified single-venue official source', () => {
    const scandalCandidate = {
      source_url: 'https://cafe.naver.com/f-e/cafes/14933600/articles/102575',
      extracted_text: '2026.07.30 스윙스캔들 목요소셜 DJ 테일',
      structured_data: {
        title: '스윙스캔들 목요 소셜',
        date: '2026-07-30',
        activity_type: 'social',
        venue_name: '사보이볼룸',
        venue_provenance: 'source_registry',
        djs: ['테일'],
      },
    };
    expect(validateAiAdjudication(scandalCandidate, {
      decision: 'register',
      confidence: 0.99,
      event_date: '2026-07-30',
      activity_type: 'social',
      venue: '사보이볼룸',
      djs: ['테일'],
      evidence_quotes: [
        '2026.07.30',
        '스윙스캔들 목요소셜',
        'DJ 테일',
        '검증된 공식 수집원 고정 장소: 사보이볼룸',
      ],
    }).ok).toBe(true);
  });

  it('does not use registry venue evidence for a multi-venue explicit source', () => {
    const multiVenueCandidate = {
      source_url: 'https://cafe.naver.com/f-e/cafes/10026855/articles/53903',
      extracted_text: '2026.08.01 스윙프렌즈 토요소셜 DJ 테스트',
      structured_data: {
        title: '스윙프렌즈 토요 소셜',
        date: '2026-08-01',
        activity_type: 'social',
        venue_name: '스윙타임',
        venue_provenance: 'source_registry',
        djs: ['테스트'],
      },
    };
    const result = validateAiAdjudication(multiVenueCandidate, {
      decision: 'register',
      confidence: 0.99,
      event_date: '2026-08-01',
      activity_type: 'social',
      venue: '스윙타임',
      djs: ['테스트'],
      evidence_quotes: ['2026.08.01', '스윙프렌즈 토요소셜', 'DJ 테스트'],
    });
    expect(result.ok).toBe(false);
    expect(result.reasons).toContain('AI evidence does not explicitly contain the candidate venue');
  });
});
