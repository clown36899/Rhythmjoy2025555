import { describe, expect, it } from 'vitest';
import {
  findGeneratedRegularSocialReplacements,
  planRegularSocialReconciliation,
} from './regular-social-reconciler.js';

const rule = { id: 'sample-fri', title: '샘플 금요 소셜', weekday: 5, time: '19:30', location: '샘플홀', sourceId: 'sample' };

describe('regular social reconciliation', () => {
  it('materializes only matching weekdays inside the rolling window', () => {
    const plan = planRegularSocialReconciliation({
      events: [],
      rules: [rule],
      today: '2026-07-26',
      horizonDays: 14,
    });
    expect(plan.creates.map((event) => event.date)).toEqual(['2026-07-31', '2026-08-07']);
    expect(plan.creates[0]).toMatchObject({
      dj_name: '미정',
      image: '',
      image_full: '',
      address: '샘플홀',
    });
  });

  it('lets an explicit collected social replace the generated default', () => {
    const generated = {
      id: 'regular-social:sample-fri:2026-07-31',
      date: '2026-07-31',
      title: rule.title,
      location: rule.location,
      automation: { generated_by: 'regular-social-rolling-v1' },
    };
    const plan = planRegularSocialReconciliation({
      events: [
        generated,
        { id: 'actual', date: '2026-07-31', title: 'DJ 메이저 샘플 소셜', location: '샘플홀', category: 'social' },
      ],
      rules: [rule],
      today: '2026-07-26',
      horizonDays: 7,
    });
    expect(plan.creates).toHaveLength(0);
    expect(plan.removes).toEqual([generated]);
  });

  it('finds the generated occurrence immediately from a collected source keyword', () => {
    const generated = {
      id: 'regular-social:swingtown-tue:2026-07-28',
      date: '2026-07-28',
      title: '스윙타운 화요 소셜',
      location: '봉천살롱',
      automation: { generated_by: 'regular-social-rolling-v1' },
    };
    const replacements = findGeneratedRegularSocialReplacements(
      [generated],
      {
        id: 'actual',
        date: '2026-07-28',
        title: '스윙타운 DJ 미우',
        location: '',
        category: 'social',
      },
      { keyword: '스윙타운' },
    );
    expect(replacements).toEqual([generated]);
  });

  it('classifies a generated duplicate target as a replaceable placeholder', () => {
    const generated = {
      id: 'regular-social:scandal-sat:2026-08-22',
      date: '2026-08-22',
      title: '스윙스캔들 토요 소셜',
      location: '사보이볼룸',
      category: 'social',
      automation: { generated_by: 'regular-social-rolling-v1' },
    };
    const replacements = findGeneratedRegularSocialReplacements(
      [generated],
      {
        date: '2026-08-22',
        title: '사보이볼룸 토요 소셜',
        location: '사보이볼룸',
        category: 'social',
      },
      { source_id: 'swingscandal-cafe' },
    );

    expect(replacements).toEqual([generated]);
  });

  it('does not replace another venue or a different date', () => {
    const generated = {
      id: 'regular-social:swingtime-wed:2026-07-29',
      date: '2026-07-29',
      title: '스윙타임 수요 소셜',
      location: '스윙타임',
      automation: { generated_by: 'regular-social-rolling-v1' },
    };
    expect(findGeneratedRegularSocialReplacements(
      [generated],
      {
        date: '2026-07-28',
        title: '스윙타운 DJ 미우',
        category: 'social',
      },
      { keyword: '스윙타운' },
    )).toEqual([]);
  });

  it('materializes a linked closure occurrence when a closure exception was collected', () => {
    const generated = {
      id: 'regular-social:sample-fri:2026-07-31',
      date: '2026-07-31',
      title: rule.title,
      location: rule.location,
      automation: { generated_by: 'regular-social-rolling-v1' },
    };
    const plan = planRegularSocialReconciliation({
      events: [generated],
      scrapedEvents: [{
        id: 'sample-closure-20260731',
        source_id: 'sample',
        source_url: 'https://example.com/social-closure',
        exception_type: 'closure',
        evidence: '7월 31일 금요 소셜은 내부 일정으로 휴무입니다.',
        structured_data: {
          date: '2026-07-31',
          title: '샘플 금요 소셜 휴무',
          location: '샘플홀',
        },
      }],
      rules: [rule],
      today: '2026-07-26',
      horizonDays: 7,
    });
    expect(plan.removes).toEqual([generated]);
    expect(plan.creates).toHaveLength(1);
    expect(plan.creates[0]).toMatchObject({
      id: generated.id,
      title: '샘플 금요 소셜 휴무',
      time: '',
      location: '샘플홀',
      dj_name: '휴무',
      genre: '휴무',
      link1: 'https://example.com/social-closure',
      link_name1: '휴무 공지',
      description: '7월 31일 금요 소셜은 내부 일정으로 휴무입니다.',
      automation: {
        generated_by: 'regular-social-rolling-v1',
        exception_id: 'sample-closure-20260731',
        exception_type: 'closure',
      },
    });
  });

  it('retains the same linked closure occurrence on reconciliation retry', () => {
    const scrapedEvents = [{
      id: 'sample-closure-20260731',
      source_id: 'sample',
      source_url: 'https://example.com/social-closure',
      exception_type: 'closure',
      evidence: '금요 소셜 휴무 공지',
      structured_data: { date: '2026-07-31', title: '샘플 금요 소셜 휴무' },
    }];
    const first = planRegularSocialReconciliation({
      events: [],
      scrapedEvents,
      rules: [rule],
      today: '2026-07-26',
      horizonDays: 7,
    });
    const second = planRegularSocialReconciliation({
      events: first.creates,
      scrapedEvents,
      rules: [rule],
      today: '2026-07-26',
      horizonDays: 7,
    });

    expect(second.creates).toHaveLength(0);
    expect(second.removes).toHaveLength(0);
    expect(second.retained).toEqual(first.creates);
  });

  it('keeps an explicit social instead of adding a conflicting closure occurrence', () => {
    const generated = {
      id: 'regular-social:sample-fri:2026-07-31',
      date: '2026-07-31',
      title: rule.title,
      location: rule.location,
      automation: { generated_by: 'regular-social-rolling-v1' },
    };
    const explicit = {
      id: 'actual',
      date: '2026-07-31',
      title: 'DJ 메이저 샘플 소셜',
      location: '샘플홀',
      category: 'social',
    };
    const plan = planRegularSocialReconciliation({
      events: [generated, explicit],
      scrapedEvents: [{
        id: 'stale-closure',
        source_id: 'sample',
        source_url: 'https://example.com/stale-closure',
        exception_type: 'closure',
        structured_data: { date: '2026-07-31' },
      }],
      rules: [rule],
      today: '2026-07-26',
      horizonDays: 7,
    });

    expect(plan.creates).toHaveLength(0);
    expect(plan.removes).toEqual([generated]);
  });

  it('uses an official recurring rule instead of the matching static fallback', () => {
    const plan = planRegularSocialReconciliation({
      events: [],
      rules: [rule],
      officialRules: [{
        ...rule,
        id: 'api:partner:friday',
        title: '공식 샘플 소셜',
        time: '20:00',
        officialApi: true,
      }],
      today: '2026-07-26',
      horizonDays: 7,
    });
    expect(plan.creates).toHaveLength(1);
    expect(plan.creates[0]).toMatchObject({
      id: 'regular-social:api:partner:friday:2026-07-31',
      title: '공식 샘플 소셜',
      time: '20:00',
    });
  });

  it('applies a dated DJ override without creating a duplicate event', () => {
    const officialRule = { ...rule, id: 'api:partner:friday', officialApi: true };
    const plan = planRegularSocialReconciliation({
      events: [],
      rules: [],
      officialRules: [officialRule],
      officialExceptions: [{
        ruleId: officialRule.id,
        externalId: 'dj-20260731',
        date: '2026-07-31',
        type: 'override',
        djName: '메이저',
      }],
      today: '2026-07-26',
      horizonDays: 7,
    });
    expect(plan.creates).toHaveLength(1);
    expect(plan.creates[0]).toMatchObject({
      dj_name: '메이저',
      description: 'DJ 메이저',
    });
  });

  it('materializes an official closure with its announcement link', () => {
    const officialRule = {
      ...rule,
      id: 'api:partner:friday',
      officialApi: true,
      sourceUrl: 'https://example.com/regular-social',
    };
    const plan = planRegularSocialReconciliation({
      events: [],
      rules: [],
      officialRules: [officialRule],
      officialExceptions: [{
        ruleId: officialRule.id,
        externalId: 'closed-20260731',
        date: '2026-07-31',
        type: 'closure',
        sourceUrl: 'https://example.com/closed-20260731',
        description: '내부 일정으로 휴무합니다.',
      }],
      today: '2026-07-26',
      horizonDays: 7,
    });

    expect(plan.creates).toHaveLength(1);
    expect(plan.creates[0]).toMatchObject({
      title: '샘플 금요 소셜 휴무',
      dj_name: '휴무',
      genre: '휴무',
      link1: 'https://example.com/closed-20260731',
      link_name1: '휴무 공지',
      description: '내부 일정으로 휴무합니다.',
      automation: {
        exception_id: 'closed-20260731',
        exception_type: 'closure',
      },
    });
  });

  it('removes a borrowed poster from an existing default occurrence', () => {
    const generated = {
      id: 'regular-social:sample-fri:2026-07-31',
      date: '2026-07-31',
      title: rule.title,
      time: rule.time,
      location: rule.location,
      image: '/uploads/old-dj-poster.webp',
      dj_name: '',
      automation: { generated_by: 'regular-social-rolling-v1' },
    };
    const plan = planRegularSocialReconciliation({
      events: [generated],
      rules: [rule],
      today: '2026-07-26',
      horizonDays: 7,
    });
    expect(plan.removes).toEqual([generated]);
    expect(plan.creates[0]).toMatchObject({
      id: generated.id,
      image: '',
      dj_name: '미정',
    });
  });

  it('removes a materialized event after its recurring rule is deleted', () => {
    const stale = {
      id: 'regular-social:api:partner:deleted:2026-07-31',
      date: '2026-07-31',
      title: '삭제된 규칙',
      location: '삭제홀',
      automation: { generated_by: 'regular-social-rolling-v1' },
    };
    const plan = planRegularSocialReconciliation({
      events: [stale],
      rules: [],
      officialRules: [],
      today: '2026-07-26',
      horizonDays: 7,
    });
    expect(plan.removes).toEqual([stale]);
  });
});
