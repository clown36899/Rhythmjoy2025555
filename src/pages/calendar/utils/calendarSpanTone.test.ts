import { describe, expect, it } from 'vitest';
import { getCalendarSpanToneColor } from './calendarSpanTone';

describe('calendar span tones', () => {
  it('keeps the same event color when month-specific ordering changes', () => {
    const toneKey = 'event:24731';

    expect(getCalendarSpanToneColor(toneKey)).toBe(getCalendarSpanToneColor(toneKey));
    expect(getCalendarSpanToneColor(toneKey)).toMatch(/^hsl\(\d+ \d+% \d+% \/ 0\.95\)$/);
  });

  it('derives different stable colors for different schedule identities', () => {
    const firstSeries = 'series:rockin festival|seoul|organizer-a';
    const secondSeries = 'series:bal and hop|seoul|organizer-b';

    expect(getCalendarSpanToneColor(firstSeries)).toBe(getCalendarSpanToneColor(firstSeries));
    expect(getCalendarSpanToneColor(firstSeries)).not.toBe(getCalendarSpanToneColor(secondSeries));
  });
});
