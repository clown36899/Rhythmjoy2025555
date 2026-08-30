import { describe, expect, it } from 'vitest';
import { buildWhere } from './events-api.js';

describe('Cafe24 event search SQL', () => {
  it('requires both terms for a compact day and category query', () => {
    const result = buildWhere({ cutoff: '2026-08-01', q: '28일소셜' });

    expect(result.sql).toContain('COALESCE(end_date, start_date, date_value) >= ?');
    expect(result.sql).toContain('DATE_FORMAT');
    expect(result.sql).toContain("THEN '소셜'");
    expect(result.sql).toContain(' AND ');
    expect(result.params).toEqual([
      '2026-08-01',
      '%28일%',
      '%소셜%',
    ]);
  });

  it('keeps a single compact keyword as one bounded parameter', () => {
    const result = buildWhere({ q: '해피홀 금요' });

    expect(result.params).toEqual(['%해피홀금요%', '%해피홀%', '%금요%']);
  });
});
