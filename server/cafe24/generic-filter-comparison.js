const ABSOLUTE_ISO_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/i;

function absoluteTimestampMs(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (!ABSOLUTE_ISO_TIMESTAMP_RE.test(normalized)) return null;

  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Convert generic API filter operands into values with stable ordering.
 *
 * Date-only strings intentionally remain lexical calendar values. Absolute
 * ISO timestamps, however, are compared as instants so `Z` rows and `+09:00`
 * report boundaries describe the same timeline.
 */
export function comparableGenericFilterValue(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 1 : 0;

  const timestampMs = absoluteTimestampMs(value);
  if (timestampMs !== null) return timestampMs;
  return String(value);
}

export function comparableGenericFilterPair(actual, expected) {
  const actualTimestampMs = absoluteTimestampMs(actual);
  const expectedTimestampMs = absoluteTimestampMs(expected);
  if (actualTimestampMs !== null && expectedTimestampMs !== null) {
    return [actualTimestampMs, expectedTimestampMs];
  }

  const scalar = (value) => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'number') return value;
    if (typeof value === 'boolean') return value ? 1 : 0;
    return String(value);
  };
  return [scalar(actual), scalar(expected)];
}
