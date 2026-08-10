export const CALENDAR_SPAN_TONE_CLASSES = [
  'calendar-span-tone-blue',
  'calendar-span-tone-emerald',
  'calendar-span-tone-amber',
  'calendar-span-tone-violet',
  'calendar-span-tone-rose',
  'calendar-span-tone-cyan',
  'calendar-span-tone-orange',
  'calendar-span-tone-indigo',
  'calendar-span-tone-lime',
  'calendar-span-tone-fuchsia',
] as const;

export const getCalendarSpanToneClass = (spanIndex: number) => {
  const paletteIndex = ((Math.trunc(spanIndex) % CALENDAR_SPAN_TONE_CLASSES.length)
    + CALENDAR_SPAN_TONE_CLASSES.length) % CALENDAR_SPAN_TONE_CLASSES.length;
  return CALENDAR_SPAN_TONE_CLASSES[paletteIndex];
};
