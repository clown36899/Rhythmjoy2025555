import {
  type DanceActivity,
  type DanceGenreFamily,
  type DanceScope,
  getDanceActivityLabel,
  getDanceFamilyLabel,
  getDanceGenreLabel,
  getDanceScopeLabel,
  getDanceTagLabel,
  inferDanceTaxonomy,
} from '../../../../utils/danceTaxonomy';

type EventType = '소셜' | '파티/행사' | '강습';

export interface VenueRecord {
  id: string;
  name: string;
  address: string | null;
}

export interface MappedIngestorEvent {
  category: 'social' | 'event' | 'class';
  genre: string;
  dance_scope: DanceScope;
  dance_genre: string;
  activity_type: DanceActivity;
  dance_tags: string[];
  group_id: number | null;
  location: string;
  address: string;
  venue_id: string | null;
  venue_name: string | null;
  time: string;
}

interface ScrapedLike {
  keyword?: string;
  source_url?: string;
  extracted_text?: string;
  structured_data?: {
    title?: string;
    event_type?: EventType | null;
    dance_scope?: DanceScope | null;
    activity_type?: DanceActivity | null;
    genre_family?: DanceGenreFamily | null;
    dance_genre?: string | null;
    dance_genre_label?: string | null;
    tags?: string[] | null;
    location?: string;
    address?: string;
    venue_id?: string | number | null;
    times?: string[];
  };
}

const SOURCE_VENUE_ALIASES: Array<[RegExp, string]> = [
  [/instagram\.com\/happyhall2004/i, '해피홀'],
  [/instagram\.com\/swingtimebar/i, '스윙타임'],
  [/instagram\.com\/fiesta_swingdance/i, '피에스타'],
  [/instagram\.com\/bongcheonsalon/i, '봉천살롱'],
  [/instagram\.com\/bebopbar_swing/i, '비밥바'],
  [/instagram\.com\/luna_swingbar/i, '루나'],
  [/instagram\.com\/inthemood_sillim/i, '인더무드'],
  [/instagram\.com\/dialogue_swing/i, 'Dialogue'],
  [/instagram\.com\/243_swingbar/i, '243'],
  [/instagram\.com\/asurajang_swing/i, '아수라장'],
  [/instagram\.com\/sosyalclub_swing/i, '쏘셜클럽'],
  [/instagram\.com\/swingit_seoul/i, '스윙잇'],
  [/instagram\.com\/spa_swingdance/i, '스파'],
  [/instagram\.com\/lq_studio_swing/i, 'LQ'],
  [/instagram\.com\/tamnahall/i, '탐나홀'],
  [/instagram\.com\/kpdancehall/i, 'KP댄스홀'],
  [/instagram\.com\/stepupdance_swing/i, '스탭업댄스'],
  [/instagram\.com\/kyungsunghall/i, '경성홀'],
];

export function detectEventType(event: ScrapedLike): EventType {
  const activity = detectIngestorActivity(event);
  if (activity === 'class') return '강습';
  if (activity === 'social') return '소셜';
  if (activity === 'recruit') return '파티/행사';

  const explicit = event.structured_data?.event_type;
  if (explicit) return explicit;

  const text = `${event.structured_data?.title || ''} ${event.extracted_text || ''} ${event.keyword || ''}`.toLowerCase();
  if (/수업|강습|레슨|lesson|workshop|워크샵|class|초급|중급|입문/.test(text)) return '강습';
  if (/소셜|social|dj/.test(text)) return '소셜';
  return '파티/행사';
}

export function detectIngestorActivity(event: ScrapedLike): DanceActivity {
  const explicit = event.structured_data?.activity_type;
  if (explicit && ['class', 'social', 'event', 'recruit'].includes(explicit)) return explicit;
  return inferDanceTaxonomy(event).activity_type;
}

export function getIngestorActivityLabel(event: ScrapedLike): string {
  return getDanceActivityLabel(detectIngestorActivity(event));
}

export function getIngestorGenreMeta(event: ScrapedLike) {
  const inferred = inferDanceTaxonomy(event);
  const family = event.structured_data?.genre_family || inferred.genre_family;
  const genre = event.structured_data?.dance_genre || inferred.dance_genre;
  const scope = event.structured_data?.dance_scope || inferred.dance_scope;
  return {
    scope,
    scopeLabel: getDanceScopeLabel(scope),
    family,
    familyLabel: getDanceFamilyLabel(family),
    genre,
    genreLabel: getDanceGenreLabel(genre),
  };
}

export function getIngestorTags(event: ScrapedLike): string[] {
  const existing = event.structured_data?.tags;
  if (Array.isArray(existing) && existing.length > 0) return existing.filter(Boolean);
  return inferDanceTaxonomy(event).tags;
}

export function getIngestorTagLabel(tag: string): string {
  return getDanceTagLabel(tag);
}

export function normalizeVenueName(value: string): string {
  return value
    .replace(/\s+/g, '')
    .replace(/[()（）\-_.,]/g, '')
    .replace(/바$/i, '')
    .replace(/홀$/i, '')
    .toLowerCase();
}

export function normalizeEventText(value: string): string {
  return value
    .toLowerCase()
    .replace(/dj\s*/gi, '')
    .replace(/[^\w가-힣]/g, '');
}

export function titleLooksDuplicate(a: string, b: string): boolean {
  const left = normalizeEventText(a);
  const right = normalizeEventText(b);
  if (!left || !right) return false;
  if (left === right) return true;
  return left.length >= 5 && right.length >= 5 && (left.includes(right) || right.includes(left));
}

function sourceVenueHint(sourceUrl?: string, keyword?: string): string {
  const source = sourceUrl || '';
  const matched = SOURCE_VENUE_ALIASES.find(([pattern]) => pattern.test(source));
  if (matched) return matched[1];
  return keyword || '';
}

export function matchVenue(event: ScrapedLike, venues: VenueRecord[]): VenueRecord | null {
  const rawCandidates = [
    event.structured_data?.venue_id ? String(event.structured_data.venue_id) : '',
    event.structured_data?.location || '',
    sourceVenueHint(event.source_url, event.keyword),
    event.keyword || '',
  ].filter(Boolean);

  const idCandidate = rawCandidates[0];
  const byId = venues.find(v => String(v.id) === idCandidate);
  if (byId) return byId;

  const candidates = rawCandidates.map(normalizeVenueName).filter(Boolean);
  for (const candidate of candidates) {
    const exact = venues.find(v => normalizeVenueName(v.name) === candidate);
    if (exact) return exact;
  }

  for (const candidate of candidates) {
    const fuzzy = venues.find(v => {
      const venueName = normalizeVenueName(v.name);
      return candidate.length >= 2 && (venueName.includes(candidate) || candidate.includes(venueName));
    });
    if (fuzzy) return fuzzy;
  }

  return null;
}

export function mapIngestorEvent(event: ScrapedLike, venues: VenueRecord[]): MappedIngestorEvent {
  const taxonomy = inferDanceTaxonomy(event);
  const activity = detectIngestorActivity(event);
  const matchedVenue = matchVenue(event, venues);
  const sd = event.structured_data || {};

  const category = activity === 'class' ? 'class' : activity === 'social' ? 'social' : 'event';
  const tagLabels = getIngestorTags(event).map(getDanceTagLabel);
  const genreParts = [
    getDanceActivityLabel(activity),
    getDanceScopeLabel(taxonomy.dance_scope),
    sd.dance_genre_label || getDanceGenreLabel(sd.dance_genre || taxonomy.dance_genre),
    ...tagLabels,
  ].filter((item) => item && item !== '장르 미정');
  const genre = Array.from(new Set(genreParts)).join(', ');
  const location = matchedVenue?.name || sd.location || sourceVenueHint(event.source_url, event.keyword) || '';
  const address = sd.address || matchedVenue?.address || '';

  return {
    category,
    genre,
    dance_scope: taxonomy.dance_scope,
    dance_genre: sd.dance_genre || taxonomy.dance_genre,
    activity_type: activity,
    dance_tags: getIngestorTags(event),
    group_id: category === 'social' ? 2 : null,
    location,
    address,
    venue_id: matchedVenue?.id || (sd.venue_id ? String(sd.venue_id) : null),
    venue_name: matchedVenue?.name || location || null,
    time: sd.times?.[0]?.split(/[~-]/)[0]?.trim() || '',
  };
}
