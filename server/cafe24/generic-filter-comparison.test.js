import { describe, expect, it } from 'vitest';
import {
  comparableGenericFilterPair,
  comparableGenericFilterValue,
} from './generic-filter-comparison.js';

describe('generic API filter comparison', () => {
  it('compares absolute timestamps as instants across timezone offsets', () => {
    const rowAtKstMidnight = comparableGenericFilterValue('2026-08-10T15:00:00.000Z');
    const kstStart = comparableGenericFilterValue('2026-08-11T00:00:00+09:00');
    const previousUtcMidnight = comparableGenericFilterValue('2026-08-10T00:00:00.000Z');

    expect(rowAtKstMidnight).toBe(kstStart);
    expect(previousUtcMidnight).toBeLessThan(kstStart);
  });

  it('keeps date-only values as calendar strings', () => {
    expect(comparableGenericFilterValue('2026-08-11')).toBe('2026-08-11');
    expect(
      comparableGenericFilterValue('2026-08-11') > comparableGenericFilterValue('2026-08-10'),
    ).toBe(true);
  });

  it('does not reinterpret timezone-less or invalid strings', () => {
    expect(comparableGenericFilterValue('2026-08-11 00:00:00')).toBe('2026-08-11 00:00:00');
    expect(comparableGenericFilterValue('not-a-date')).toBe('not-a-date');
    expect(comparableGenericFilterPair('2026-08-11 00:00:00', '2026-08-11T00:00:00+09:00'))
      .toEqual(['2026-08-11 00:00:00', '2026-08-11T00:00:00+09:00']);
  });
});
