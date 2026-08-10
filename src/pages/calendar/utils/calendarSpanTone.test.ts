import { describe, expect, it } from 'vitest';
import {
  CALENDAR_SPAN_TONE_CLASSES,
  getCalendarSpanToneClass,
} from './calendarSpanTone';

describe('calendar span tones', () => {
  it('gives consecutive schedules distinct colors across the full palette', () => {
    const assigned = CALENDAR_SPAN_TONE_CLASSES.map((_, index) => getCalendarSpanToneClass(index));

    expect(new Set(assigned).size).toBe(CALENDAR_SPAN_TONE_CLASSES.length);
  });

  it('keeps the palette deterministic when more schedules are present', () => {
    expect(getCalendarSpanToneClass(CALENDAR_SPAN_TONE_CLASSES.length))
      .toBe(getCalendarSpanToneClass(0));
    expect(getCalendarSpanToneClass(-1))
      .toBe(CALENDAR_SPAN_TONE_CLASSES[CALENDAR_SPAN_TONE_CLASSES.length - 1]);
  });
});
