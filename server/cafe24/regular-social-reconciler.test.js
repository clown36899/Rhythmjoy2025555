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

  it('suppresses a date when a closure exception was collected', () => {
    const plan = planRegularSocialReconciliation({
      events: [],
      scrapedEvents: [{
        source_id: 'sample',
        exception_type: 'closure',
        structured_data: { date: '2026-07-31' },
      }],
      rules: [rule],
      today: '2026-07-26',
      horizonDays: 7,
    });
    expect(plan.creates).toHaveLength(0);
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
