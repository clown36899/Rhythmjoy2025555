import { describe, expect, it } from 'vitest';
import {
  normalizeRegularSocialExceptionPayload,
  normalizeRegularSocialRulePayload,
} from './external-regular-socials-api.js';

describe('external regular social API payloads', () => {
  it('normalizes a weekly social rule', () => {
    expect(normalizeRegularSocialRulePayload({
      external_id: 'friday-social',
      title: '금요 소셜',
      weekday: 5,
      time: '20:00',
      location: '샘플홀',
      source_url: 'https://partner.example/socials/friday',
    })).toMatchObject({
      externalId: 'friday-social',
      weekday: 5,
      active: true,
      sourceId: 'friday-social',
    });
  });

  it('accepts a dated DJ override', () => {
    expect(normalizeRegularSocialExceptionPayload({
      external_id: 'dj-20260807',
      date: '2026-08-07',
      type: 'override',
      dj_name: '메이저',
    })).toMatchObject({
      date: '2026-08-07',
      type: 'override',
      djName: '메이저',
    });
  });

  it('rejects an empty override and invalid weekday', () => {
    expect(() => normalizeRegularSocialExceptionPayload({
      external_id: 'empty',
      date: '2026-08-07',
      type: 'override',
    })).toThrow(/override/);
    expect(() => normalizeRegularSocialRulePayload({
      external_id: 'bad',
      title: '잘못된 규칙',
      weekday: 7,
      location: '샘플홀',
      source_url: 'https://partner.example/bad',
    })).toThrow(/weekday/);
  });
});
