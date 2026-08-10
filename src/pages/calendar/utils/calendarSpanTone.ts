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

const hashCalendarSpanToneKey = (toneKey: string) => {
  let hash = 2166136261;

  for (let index = 0; index < toneKey.length; index += 1) {
    hash ^= toneKey.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
};

export const getCalendarSpanToneClass = (toneKey: string | number) => {
  const normalizedKey = String(toneKey);
  const eventIdMatch = normalizedKey.match(/^event:(\d+)$/);
  const stableNumber = eventIdMatch ? Number(eventIdMatch[1]) : hashCalendarSpanToneKey(normalizedKey);
  const paletteIndex = stableNumber % CALENDAR_SPAN_TONE_CLASSES.length;
  return CALENDAR_SPAN_TONE_CLASSES[paletteIndex];
};
