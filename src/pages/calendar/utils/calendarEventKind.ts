import { getGraduationEventMetadata } from '../../../utils/graduationEvent.mjs';
import { findSourceById, findSourceForCandidate } from '../../../../scripts/ingestion/collection-registry.mjs';

export type CalendarEventKindInput = {
  id?: string | number | null;
  title?: string | null;
  description?: string | null;
  category?: string | null;
  activity_type?: string | null;
  event_type?: string | null;
  genre?: string | null;
  group_id?: string | number | null;
  extracted_text?: string | null;
  structured_data?: {
    title?: string | null;
    description?: string | null;
    event_type?: string | null;
    exception_type?: string | null;
    category?: string | null;
    genre?: string | null;
    djs?: unknown;
  } | null;
  djs?: unknown;
  dj_names?: unknown;
  dj_name?: unknown;
  link1?: string | null;
  organizer?: string | null;
  organizer_name?: string | null;
  automation?: {
    generated_by?: string | null;
    source_id?: string | null;
    exception_id?: string | null;
    exception_type?: string | null;
  } | null;
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

const isCalendarSocialClosureEvent = (event: CalendarEventKindInput) => {
  const values = [
    event.automation?.exception_type,
    event.structured_data?.exception_type,
    event.structured_data?.event_type,
    event.event_type,
    event.genre,
  ].map((value) => normalizeCalendarEventKindPart(value));

  return values.some((value) => (
    value === 'closure'
    || value === 'recurring_closure'
    || /^(?:소셜\s*)?(?:휴무|휴관|휴업)$/.test(value)
  ));
};

export const getCalendarSocialSpecialLabel = (event: CalendarEventKindInput) => {
  if (isCalendarSocialClosureEvent(event)) return '휴무';
  return getCalendarGraduationDisplayText(event);
};

export const normalizeCalendarSocialDjs = (rawDjs: unknown): string[] => {
  const djs = Array.isArray(rawDjs)
    ? rawDjs
    : typeof rawDjs === 'string'
      ? rawDjs.split(/[,/·ㆍ&]+/)
      : [];
  return djs
    .map((dj) => cleanCalendarDisplayText(String(dj)).replace(/^DJ\s*/i, '').trim())
    .filter((dj) => Boolean(dj) && !isUndeterminedCalendarDj(dj));
};

export const getCalendarSocialDjText = (event: CalendarEventKindInput) => {
  const cleanDjs = normalizeCalendarSocialDjs(event.structured_data?.djs
    ?? event.djs
    ?? event.dj_names
    ?? event.dj_name);
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
  const specialLabel = getCalendarSocialSpecialLabel(event);
  if (specialLabel) return specialLabel;

  const djText = getCalendarSocialDjText(event);
  if (isCalendarRegularSocialGuide(event)) return '정규 요일';
  return djText ? `DJ ${djText}` : isCalendarSocialLikeEvent(event) ? '소셜' : '';
};

// A generated slot is a recurring-day guide, not proof of that day's operation.
// Existing closure/official overrides remain explicit records.
export const isCalendarRegularSocialGuide = (event: CalendarEventKindInput) => (
  isCalendarSocialLikeEvent(event)
  && (event.automation?.generated_by === 'regular-social-rolling-v1'
    || String(event.id || '').startsWith('regular-social:'))
  && !event.automation?.exception_id
  && !event.automation?.exception_type
  && !getCalendarSocialSpecialLabel(event)
  && !getCalendarSocialDjText(event)
);

const safeCalendarSourceUrl = (value?: string | null) => {
  try {
    const url = new URL(value || '');
    return ['https:', 'http:'].includes(url.protocol) ? url : null;
  } catch { return null; }
};

export const getCalendarSocialSourceInfo = (event: CalendarEventKindInput) => {
  const original = safeCalendarSourceUrl(event.link1);
  const sourceId = event.automation?.source_id || event.organizer_name || event.organizer || '';
  const source = findSourceForCandidate({ sourceId, url: original?.href || '' })
    || (isCalendarRegularSocialGuide(event) ? findSourceById(event.automation?.source_id || '') : null);
  const official = safeCalendarSourceUrl(source?.url);
  const samePage = original && official
    && original.hostname.replace(/^www\./, '') === official.hostname.replace(/^www\./, '')
    && original.pathname.replace(/\/+$/, '') === official.pathname.replace(/\/+$/, '');
  return {
    originalUrl: original && !samePage ? original.href : null,
    officialUrl: official?.href || null,
    sourceName: source?.name || '',
  };
};
