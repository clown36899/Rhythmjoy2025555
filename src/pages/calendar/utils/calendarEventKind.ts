import { getGraduationEventMetadata } from '../../../utils/graduationEvent.mjs';

export type CalendarEventKindInput = {
  id?: string | number | null;
  title?: string | null;
  description?: string | null;
  category?: string | null;
  activity_type?: string | null;
  genre?: string | null;
  group_id?: string | number | null;
  extracted_text?: string | null;
  structured_data?: {
    title?: string | null;
    description?: string | null;
    event_type?: string | null;
    category?: string | null;
    genre?: string | null;
    djs?: unknown;
  } | null;
  djs?: unknown;
  dj_names?: unknown;
  dj_name?: unknown;
};

export const normalizeCalendarEventKindPart = (value?: string | null) => (
  value?.trim().replace(/\s+/g, " ").toLowerCase() || ""
);

export const isCalendarClassLikeCategory = (category?: string | null) => {
  const normalized = normalizeCalendarEventKindPart(category);
  return (
    normalized === "class" ||
    normalized === "regular" ||
    normalized === "club" ||
    normalized === "club_lesson" ||
    normalized === "club_regular"
  );
};

export const isCalendarSocialLikeEvent = (event: CalendarEventKindInput) => {
  const category = normalizeCalendarEventKindPart(event.category);
  const activityType = normalizeCalendarEventKindPart(event.activity_type);
  const genre = normalizeCalendarEventKindPart(event.genre);

  if (isCalendarClassLikeCategory(category)) return false;
  if (category === "social") return true;
  if (activityType === "class") return false;
  if (activityType === "social") return true;

  return (
    genre.includes("소셜") ||
    genre.includes("졸공") ||
    genre.includes("social") ||
    Boolean(event.group_id) ||
    String(event.id || "").startsWith("social-")
  );
};

export const cleanCalendarDisplayText = (value?: string | null) => (
  value?.trim().replace(/\s+/g, ' ') || ''
);

const isUndeterminedCalendarDj = (value: string) => (
  /^(?:DJ\s*)?미정$/i.test(cleanCalendarDisplayText(value))
);

const getCalendarGraduationDisplayText = (event: CalendarEventKindInput) => {
  const graduation = getGraduationEventMetadata({
    ...event,
    extracted_text: [
      event.extracted_text,
      event.description,
      event.structured_data?.description,
    ].filter(Boolean).join('\n'),
  });
  return graduation ? '졸공' : '';
};

const getCalendarSocialDjText = (event: CalendarEventKindInput) => {
  const rawDjs = event.structured_data?.djs
    ?? event.djs
    ?? event.dj_names
    ?? event.dj_name;
  const djs = Array.isArray(rawDjs)
    ? rawDjs
    : typeof rawDjs === 'string'
      ? rawDjs.split(/[,/·ㆍ&]+/)
      : [];
  const cleanDjs = djs
    .map((dj) => cleanCalendarDisplayText(String(dj)).replace(/^DJ\s*/i, ''))
    .filter((dj) => Boolean(dj) && !isUndeterminedCalendarDj(dj));

  if (cleanDjs.length > 0) return cleanDjs.join(', ');

  const title = cleanCalendarDisplayText(event.title);
  const match = title.match(/(?:^|[\s|·ㆍ•([{-])DJ\s*([^|•)\]}{}\n\r]+?)(?=\s*(?:[|•)\]}{}]|소셜|공지|$))/i)
    || title.match(/DJ\s*([^|•)\]}{}\n\r]+?)(?=\s*(?:[|•)\]}{}]|소셜|공지|$))/i)
    || title.match(/디제이\s*([^|•)\]}{}\n\r]+?)(?=\s*(?:[|•)\]}{}]|소셜|공지|$))/i);
  const name = cleanCalendarDisplayText(match?.[1])
    .replace(/^DJ\s*/i, '')
    .replace(/\s*(월요|화요|수요|목요|금요|토요|일요)\s*$/g, '');

  return name && !isUndeterminedCalendarDj(name) ? name : '';
};

export const getCalendarSocialDisplayText = (event: CalendarEventKindInput) => {
  const graduationText = getCalendarGraduationDisplayText(event);
  if (graduationText) return graduationText;

  const djText = getCalendarSocialDjText(event);
  return djText ? `DJ ${djText}` : '';
};
