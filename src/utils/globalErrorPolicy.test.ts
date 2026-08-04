import { describe, expect, it } from 'vitest';
import { isNonFatalClientRuntimeError } from './globalErrorPolicy';

describe('isNonFatalClientRuntimeError', () => {
  it.each([
    'Failed to fetch',
    'NetworkError when attempting to fetch resource.',
    'Network request failed',
    'The Internet connection appears to be offline.',
    'Load failed',
  ])('treats a resume-time network failure as non-fatal: %s', (message) => {
    expect(isNonFatalClientRuntimeError(message)).toBe(true);
  });

  it('treats a stale IndexedDB version race as non-fatal', () => {
    expect(isNonFatalClientRuntimeError(
      'The requested version (1) is less than the existing version (2).',
    )).toBe(true);
  });

  it('keeps deploy chunk failures on the reload path', () => {
    expect(isNonFatalClientRuntimeError(
      'Failed to fetch dynamically imported module: /assets/page-old.js',
    )).toBe(false);
  });

  it('does not hide ordinary application errors', () => {
    expect(isNonFatalClientRuntimeError('Cannot read properties of undefined')).toBe(false);
  });
});
