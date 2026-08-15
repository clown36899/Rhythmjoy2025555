import { describe, expect, it } from 'vitest';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  extractSocialScheduleWithAi,
  shouldPersistBenefitAiOutcome,
  validateAiAdjudication,
  validateAiSocialExtraction,
  validateBenefitAiReview,
} from './ai-candidate-adjudicator.mjs';

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

describe('benefit candidate persistence policy', () => {
  it('keeps deterministic benefit candidates unless AI returns a grounded rejection', () => {
    expect(shouldPersistBenefitAiOutcome('approved')).toBe(true);
    expect(shouldPersistBenefitAiOutcome('review')).toBe(true);
    expect(shouldPersistBenefitAiOutcome('rejected')).toBe(false);
    expect(shouldPersistBenefitAiOutcome('unavailable')).toBe(true);
    expect(shouldPersistBenefitAiOutcome('error')).toBe(true);
  });
});

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

  it('accepts the verified Swing Friends default venue', () => {
    const defaultVenueCandidate = {
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
    const result = validateAiAdjudication(defaultVenueCandidate, {
      decision: 'register',
      confidence: 0.99,
      event_date: '2026-08-01',
      activity_type: 'social',
      venue: '스윙타임',
      djs: ['테스트'],
      evidence_quotes: [
        '2026.08.01',
        '스윙프렌즈 토요소셜',
        'DJ 테스트',
        '검증된 공식 수집원 고정 장소: 스윙타임',
      ],
    });
    expect(result.ok).toBe(true);
  });

  it('uses an explicitly named Happy Hall instead of the Swing Friends default venue', () => {
    const happyHallCandidate = {
      source_url: 'https://cafe.naver.com/f-e/cafes/10026855/articles/53904',
      extracted_text: '2026.08.08 스윙프렌즈 토요소셜 장소 해피홀 DJ 테스트',
      structured_data: {
        title: '스윙프렌즈 토요 소셜',
        date: '2026-08-08',
        activity_type: 'social',
        venue_name: '해피홀',
        venue_provenance: 'source_text',
        djs: ['테스트'],
      },
    };
    const result = validateAiAdjudication(happyHallCandidate, {
      decision: 'register',
      confidence: 0.99,
      event_date: '2026-08-08',
      activity_type: 'social',
      venue: '해피홀',
      djs: ['테스트'],
      evidence_quotes: ['2026.08.08', '스윙프렌즈 토요소셜', '장소 해피홀', 'DJ 테스트'],
    });
    expect(result.ok).toBe(true);
  });

  it('normalizes Naver member metadata before comparing the AI DJ', () => {
    const candidate = {
      source_url: 'https://cafe.naver.com/f-e/cafes/14933600/articles/102575',
      extracted_text: '2026.07.30 스윙스캔들 목요소셜 DJ 57F 밍밍 테일',
      structured_data: {
        title: '스윙스캔들 목요 소셜',
        date: '2026-07-30',
        activity_type: 'social',
        venue_name: '사보이볼룸',
        venue_provenance: 'source_registry',
        djs: ['테일'],
      },
    };
    const result = validateAiAdjudication(candidate, {
      decision: 'register',
      confidence: 0.99,
      event_date: '2026-07-30',
      activity_type: 'social',
      venue: '사보이볼룸',
      djs: ['57F 밍밍 테일'],
      evidence_quotes: [
        '2026.07.30',
        '스윙스캔들 목요소셜',
        'DJ 57F 밍밍 테일',
        '검증된 공식 수집원 고정 장소: 사보이볼룸',
      ],
    });
    expect(result.ok).toBe(true);
  });
});

describe('AI social extraction grounding', () => {
  const sourceText = `■ 스윙타임빠 (8월 15,16일) 토,일 소셜 공지
- 토요일
DJ '이정' PM 8:15~10:15
- 일요일
1부 DJ '캐롤' PM 7:30~9:00
■ 타임빠소셜 안내`;

  it('accepts independently grounded sessions from a compact date heading', () => {
    const result = validateAiSocialExtraction({ sourceText, today: '2026-08-14' }, {
      decision: 'extract',
      confidence: 0.99,
      events: [
        {
          title: '스윙타임 토요 소셜',
          event_date: '2026-08-15',
          venue: '스윙타임',
          djs: ['이정'],
          evidence_quotes: ['스윙타임빠', '8월 15,16일', '토,일 소셜', "DJ '이정'"],
        },
        {
          title: '스윙타임 일요 소셜',
          event_date: '2026-08-16',
          venue: '스윙타임',
          djs: ['캐롤'],
          evidence_quotes: ['스윙타임빠', '8월 15,16일', '토,일 소셜', "DJ '캐롤'"],
        },
      ],
      reasons: [],
    }, { today: '2026-08-14' });

    expect(result.ok).toBe(true);
    expect(result.events.map(({ event_date, djs }) => ({ event_date, djs }))).toEqual([
      { event_date: '2026-08-15', djs: ['이정'] },
      { event_date: '2026-08-16', djs: ['캐롤'] },
    ]);
  });

  it('blocks a partial extraction when syntax-derived dates remain unexamined', () => {
    const result = validateAiSocialExtraction({
      sourceText,
      dateHints: ['2026-08-15', '2026-08-16'],
      today: '2026-08-14',
    }, {
      decision: 'extract',
      confidence: 0.99,
      events: [{
        title: '스윙타임 토요 소셜',
        event_date: '2026-08-15',
        venue: '스윙타임',
        djs: ['이정'],
        evidence_quotes: ['스윙타임빠', '8월 15,16일', '토,일 소셜', "DJ '이정'"],
      }],
      reasons: [],
    }, { today: '2026-08-14' });

    expect(result.ok).toBe(false);
    expect(result.reasons).toContain('AI omitted collector date hints: 2026-08-16');
  });

  it('rejects an AI session whose DJ quote is absent from the source', () => {
    const result = validateAiSocialExtraction({ sourceText, today: '2026-08-14' }, {
      decision: 'extract',
      confidence: 0.99,
      events: [{
        title: '스윙타임 토요 소셜',
        event_date: '2026-08-15',
        venue: '스윙타임',
        djs: ['환각DJ'],
        evidence_quotes: ['스윙타임빠', '8월 15,16일', '토,일 소셜', 'DJ 환각DJ'],
      }],
      reasons: [],
    }, { today: '2026-08-14' });

    expect(result.ok).toBe(false);
    expect(result.reasons.join(' ')).toContain('exact substring');
  });

  it('accepts poster-only fields only when an original image was attached', () => {
    const imageDataUrl = `data:image/png;base64,${Buffer.alloc(1200, 1).toString('base64')}`;
    const extraction = {
      decision: 'extract',
      confidence: 0.99,
      poster_text: '8월 15일 토정모 DJ 감자',
      events: [{
        title: '해피홀 토요 정모',
        event_date: '2026-08-15',
        venue: '해피홀',
        djs: ['감자'],
        poster_image_index: 1,
        evidence_quotes: [
          '8월 15일',
          '토정모',
          'DJ 감자',
          '검증된 공식 수집원 고정 장소: 해피홀',
        ],
      }],
      reasons: [],
    };

    expect(validateAiSocialExtraction({
      sourceText: '토요일 정모 안내',
      sourceVenue: '해피홀',
      imageDataUrls: [imageDataUrl],
      today: '2026-08-14',
    }, extraction, { today: '2026-08-14' }).ok).toBe(true);

    const withoutImage = validateAiSocialExtraction({
      sourceText: '토요일 정모 안내',
      sourceVenue: '해피홀',
      today: '2026-08-14',
    }, extraction, { today: '2026-08-14' });
    expect(withoutImage.ok).toBe(false);
    expect(withoutImage.reasons).toContain('AI poster text was returned without an attached source image');

    const missingPosterIndex = validateAiSocialExtraction({
      sourceText: '토요일 정모 안내',
      sourceVenue: '해피홀',
      imageDataUrls: [imageDataUrl],
      today: '2026-08-14',
    }, {
      ...extraction,
      events: extraction.events.map((event) => ({ ...event, poster_image_index: 0 })),
    }, { today: '2026-08-14' });
    expect(missingPosterIndex.ok).toBe(false);
    expect(missingPosterIndex.reasons.join(' ')).toContain('poster evidence requires its source image index');
  });

  it('treats HAPPY HALL on an official poster as the canonical 해피홀 venue', () => {
    const imageDataUrl = `data:image/jpeg;base64,${Buffer.alloc(1200, 3).toString('base64')}`;
    const result = validateAiSocialExtraction({
      sourceText: '★8/14(금햎+광복의리듬 ) /15일 토정모 안내★',
      sourceVenue: '해피홀',
      imageDataUrls: [imageDataUrl],
      dateHints: ['2026-08-15'],
      today: '2026-08-14',
    }, {
      decision: 'extract',
      confidence: 0.99,
      poster_text: '2026.08.15. HAPPY HALL SATURDAY SWING FRIENDS DJ 유광',
      events: [{
        title: '해피홀 토요 정모',
        event_date: '2026-08-15',
        venue: '해피홀',
        djs: ['유광'],
        poster_image_index: 1,
        evidence_quotes: [
          '★8/14(금햎+광복의리듬 ) /15일 토정모 안내★',
          '2026.08.15.',
          'HAPPY HALL',
          'DJ 유광',
        ],
      }],
      reasons: [],
    }, { today: '2026-08-14' });

    expect(result.ok).toBe(true);
    expect(result.events[0].poster_image_index).toBe(1);
  });

  it('permits an explicitly announced DJ-less social only with an attached official poster', () => {
    const imageDataUrl = `data:image/png;base64,${Buffer.alloc(1200, 2).toString('base64')}`;
    const sourceText = '★8/14(금햎+광복의리듬 ) /15일 토정모 안내★';
    const result = validateAiSocialExtraction({
      sourceText,
      sourceVenue: '해피홀',
      imageDataUrls: [imageDataUrl],
      today: '2026-08-14',
    }, {
      decision: 'extract',
      confidence: 0.99,
      poster_text: '',
      events: [{
        title: '해피홀 토요 정모',
        event_date: '2026-08-15',
        venue: '해피홀',
        djs: [],
        evidence_quotes: [sourceText, '토정모', '검증된 공식 수집원 고정 장소: 해피홀'],
      }],
      reasons: [],
    }, { today: '2026-08-14' });

    expect(result.ok).toBe(true);
    expect(result.events[0].djs).toEqual([]);
  });

  it('rechecks only an omitted date and combines the independently grounded sessions', async () => {
    const workDir = await mkdtemp(path.join(tmpdir(), 'rhythmjoy-ai-social-test-'));
    const fakeCodex = path.join(workDir, 'fake-codex.cjs');
    const broadExtraction = {
      decision: 'extract',
      confidence: 0.99,
      poster_text: '',
      events: [{
        title: '스윙타임 토요 소셜',
        event_date: '2026-08-15',
        venue: '스윙타임',
        djs: ['이정'],
        poster_image_index: 0,
        evidence_quotes: ['8월 15일', '스윙타임 소셜', 'DJ 이정'],
      }],
      reasons: [],
    };
    const focusedExtraction = {
      decision: 'extract',
      confidence: 0.99,
      poster_text: '',
      events: [{
        title: '스윙타임 일요 소셜',
        event_date: '2026-08-16',
        venue: '스윙타임',
        djs: ['캐롤'],
        poster_image_index: 0,
        evidence_quotes: ['8월 16일', '스윙타임 소셜', 'DJ 캐롤'],
      }],
      reasons: [],
    };
    const fakeCodexSource = `#!/usr/bin/env node
const fs = require('node:fs');
let prompt = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { prompt += chunk; });
process.stdin.on('end', () => {
  const args = process.argv.slice(2);
  const outputPath = args[args.indexOf('--output-last-message') + 1];
  const focused = prompt.includes('FOCUS_DATE_HINTS:\\n2026-08-16');
  fs.writeFileSync(outputPath, JSON.stringify(focused ? ${JSON.stringify(focusedExtraction)} : ${JSON.stringify(broadExtraction)}));
});
`;

    try {
      await writeFile(fakeCodex, fakeCodexSource, 'utf8');
      await chmod(fakeCodex, 0o755);
      const result = await extractSocialScheduleWithAi({
        sourceName: '스윙타임',
        sourceText: [
          '스윙타임 8월 15,16일 소셜 공지',
          '8월 15일 스윙타임 소셜 DJ 이정',
          '8월 16일 스윙타임 소셜 DJ 캐롤',
        ].join('\n'),
        dateHints: ['2026-08-15', '2026-08-16'],
        today: '2026-08-14',
      }, {
        codexPath: fakeCodex,
        today: '2026-08-14',
        timeoutMs: 10_000,
      });

      expect(result.approved).toBe(true);
      expect(result.events.map((event) => [event.event_date, event.djs[0]])).toEqual([
        ['2026-08-15', '이정'],
        ['2026-08-16', '캐롤'],
      ]);
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  });
});

describe('AI benefit candidate review', () => {
  const currentPassCandidate = {
    extracted_text: '스윙타임빠 수요일 타임빠 정기권(7,8,9월)을 판매합니다.\n3개월 단위(14주:7월1일~9월30일)로 가격은 6만원입니다.\n기간내 수요일 소셜 입장을 할 수 있습니다.',
    structured_data: {
      title: '스윙타임빠 수요일 타임빠 정기권(7,8,9월)을 판매합니다.',
      date: '2026-06-30',
      source_post_date: '2026-06-30',
      benefit_eligible: true,
      benefit_kind: 'season_pass',
      category: 'social',
      activity_type: 'sale',
      venue_name: '스윙타임',
    },
  };

  it('approves a grounded, currently valid social pass without granting auto-registration', () => {
    const result = validateBenefitAiReview(currentPassCandidate, {
      decision: 'accept',
      confidence: 0.99,
      benefit_kind: 'season_pass',
      category: 'social',
      activity_type: 'sale',
      active_on_today: true,
      validity_end_date: '2026-09-30',
      title: '스윙타임빠 수요일 타임빠 정기권(7,8,9월)을 판매합니다.',
      venue: '스윙타임',
      evidence_quotes: [
        '스윙타임빠 수요일 타임빠 정기권(7,8,9월)을 판매합니다.',
        '3개월 단위(14주:7월1일~9월30일)로 가격은 6만원입니다.',
        '기간내 수요일 소셜 입장을 할 수 있습니다.',
      ],
      reasons: [],
    }, { today: '2026-08-03' });

    expect(result.outcome).toBe('approved');
    expect(result.ok).toBe(true);
  });

  it('rejects an explicitly expired old pass with grounded evidence', () => {
    const expiredCandidate = {
      ...currentPassCandidate,
      extracted_text: '스윙타임빠 정기권(4,5월)을 판매합니다.\n2개월 단위(9주:4월8일~6월7일)입니다.',
    };
    const result = validateBenefitAiReview(expiredCandidate, {
      decision: 'reject',
      confidence: 0.99,
      benefit_kind: 'season_pass',
      category: 'social',
      activity_type: 'sale',
      active_on_today: false,
      validity_end_date: '2026-06-07',
      title: '스윙타임빠 정기권(4,5월)을 판매합니다.',
      venue: '스윙타임',
      evidence_quotes: [
        '스윙타임빠 정기권(4,5월)을 판매합니다.',
        '2개월 단위(9주:4월8일~6월7일)입니다.',
      ],
      reasons: ['이용 기간이 종료됨'],
    }, { today: '2026-08-03' });

    expect(result.outcome).toBe('rejected');
    expect(result.ok).toBe(false);
    expect(result.reasons).toContain('AI found expired benefit validity: 2026-06-07 < 2026-08-03');
  });

  it('keeps a category disagreement for manual review instead of silently rewriting it', () => {
    const result = validateBenefitAiReview(currentPassCandidate, {
      decision: 'accept',
      confidence: 0.99,
      benefit_kind: 'season_pass',
      category: 'event',
      activity_type: 'sale',
      active_on_today: true,
      validity_end_date: '2026-09-30',
      title: '스윙타임빠 수요일 타임빠 정기권(7,8,9월)을 판매합니다.',
      venue: '스윙타임',
      evidence_quotes: [
        '스윙타임빠 수요일 타임빠 정기권(7,8,9월)을 판매합니다.',
        '3개월 단위(14주:7월1일~9월30일)로 가격은 6만원입니다.',
      ],
      reasons: [],
    }, { today: '2026-08-03' });

    expect(result.outcome).toBe('review');
    expect(result.reasons).toContain('AI category disagrees with collector category');
  });
});
