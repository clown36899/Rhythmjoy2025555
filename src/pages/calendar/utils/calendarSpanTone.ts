const hashCalendarSpanToneKey = (toneKey: string) => {
  let hash = 2166136261;

  for (let index = 0; index < toneKey.length; index += 1) {
    hash ^= toneKey.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
};

export const getCalendarSpanToneColor = (toneKey: string | number) => {
  const hash = hashCalendarSpanToneKey(String(toneKey));
  const hue = hash % 360;
  const saturation = 48 + ((hash >>> 8) % 11);
  const lightness = 34 + ((hash >>> 16) % 7);

  return `hsl(${hue} ${saturation}% ${lightness}% / 0.95)`;
};
