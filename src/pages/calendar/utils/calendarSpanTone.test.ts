import { describe, expect, it } from 'vitest';
import {
  CALENDAR_SPAN_TONE_CLASSES,
  getCalendarSpanToneClass,
} from './calendarSpanTone';

describe('calendar span tones', () => {
  it('keeps the same event color when month-specific ordering changes', () => {
    const toneKey = 'event:24731';

    expect(getCalendarSpanToneClass(toneKey)).toBe(getCalendarSpanToneClass(toneKey));
    expect(getCalendarSpanToneClass(toneKey)).toBe(
      CALENDAR_SPAN_TONE_CLASSES[24731 % CALENDAR_SPAN_TONE_CLASSES.length],
    );
  });

  it('keeps a grouped series color stable from its identity instead of its date range', () => {
    const seriesToneKey = 'series:weekly camp|seoul|organizer';

    expect(getCalendarSpanToneClass(seriesToneKey)).toBe(getCalendarSpanToneClass(seriesToneKey));
    expect(CALENDAR_SPAN_TONE_CLASSES).toContain(getCalendarSpanToneClass(seriesToneKey));
  });
});
