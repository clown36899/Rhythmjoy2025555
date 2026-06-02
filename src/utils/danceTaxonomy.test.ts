import { describe, expect, it } from 'vitest';
import {
  buildDanceGenreOptions,
  getDanceCollectionScopeExclusionReason,
  resolveDanceGenreInput,
  suggestDanceGenres,
  inferDanceTaxonomy,
} from './danceTaxonomy';

describe('danceTaxonomy manual genre resolution', () => {
  it('resolves a close Korean typo to the canonical genre', () => {
    const resolved = resolveDanceGenreInput('텡고');

    expect(resolved.key).toBe('tango');
    expect(resolved.label).toBe('탱고');
    expect(resolved.scope).toBe('tango');
    expect(resolved.matchType).toBe('preset');
  });

  it('surfaces the canonical genre as the first autocomplete suggestion', () => {
    const [first] = suggestDanceGenres('텡고');

    expect(first?.key).toBe('tango');
    expect(first?.label).toBe('탱고');
  });

  it('keeps custom genres scoped so they can be reused from existing event data', () => {
    const options = buildDanceGenreOptions(['보깅']);
    const resolved = resolveDanceGenreInput('보깅', {
      options,
      fallbackScope: 'street',
    });

    expect(resolved.label).toBe('보깅');
    expect(resolved.scope).toBe('street');
    expect(resolved.matchType).toBe('existing');
  });
});

describe('danceTaxonomy advanced inference and tags', () => {
  it('infers tango genre and scope for custom tango venues without explicit word "tango"', () => {
    const result = inferDanceTaxonomy({ extracted_text: '오늘 루미노소 밀롱가에서 만나요' });
    expect(result.dance_genre).toBe('tango');
    expect(result.dance_scope).toBe('tango');
    expect(result.genre_family).toBe('partner');
  });

  it('infers salsa/bachata for specific latin bars like 홍턴 or 보니따', () => {
    const resultSalsa = inferDanceTaxonomy({ extracted_text: '금요 홍턴 소셜 파티' });
    // Since 홍턴 matches both salsa and bachata patterns, it will match the first one in genreRules (salsa).
    expect(resultSalsa.dance_genre).toBe('salsa');
    expect(resultSalsa.dance_scope).toBe('salsa');
  });

  it('tags street battle and session correctly', () => {
    const result = inferDanceTaxonomy({ extracted_text: '왁킹 배틀 세션 WAACK ALL 라인업 공개' });
    expect(result.tags).toContain('battle');
    expect(result.tags).toContain('session');
  });

  it('allows generic street/open-style battle collection candidates', () => {
    const reason = getDanceCollectionScopeExclusionReason({
      genre_family: 'street',
      dance_genre: 'street',
      genre_family_label: '스트릿',
      dance_genre_label: '스트릿',
    });

    expect(reason).toBeNull();
  });

  it('tags academy regular classes correctly', () => {
    const result = inferDanceTaxonomy({ extracted_text: '원밀리언 5월 정규 시간표 및 월정액 안내' });
    expect(result.tags).toContain('academy_regular');
  });
});
