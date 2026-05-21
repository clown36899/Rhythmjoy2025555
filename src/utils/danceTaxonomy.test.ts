import { describe, expect, it } from 'vitest';
import {
  buildDanceGenreOptions,
  resolveDanceGenreInput,
  suggestDanceGenres,
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
