import {
  type DanceActivity,
  type DanceGenreFamily,
  type DanceScope,
  type RecruitmentKind,
  ensureRecruitmentTags,
  getDanceActivityLabel,
  getDanceFamilyLabel,
  getDanceGenreLabel,
  getDanceScopeLabel,
  getDanceTagLabel,
  inferDanceTaxonomy,
  resolveRecruitmentKind,
} from '../../../../utils/danceTaxonomy';
import {
  getVenueMapUrl,
  matchVenueRecord,
  normalizeVenueName,
  toMapSafeVenueName,
  type VenueLike,
} from '../../../../utils/venueNormalization';

type EventType = '소셜' | '파티/행사' | '강습';

export interface VenueRecord extends VenueLike {
  id: string;
  name: string;
  address: string | null;
  map_url?: string | null;
}

export interface MappedIngestorEvent {
  category: 'social' | 'event' | 'class' | 'club';
  genre: string;
  dance_scope: DanceScope;
  activity_type: DanceActivity;
  dance_tags: string[];
  group_id: number | null;
  location: string;
  address: string;
  venue_id: string | null;
  venue_name: string | null;
  location_link: string | null;
  time: string;
}

interface ScrapedLike {
  keyword?: string;
  source_url?: string;
  extracted_text?: string;
  structured_data?: {
    title?: string;
    category?: string | null;
    genre?: string | null;
    event_type?: EventType | null;
    dance_scope?: DanceScope | null;
    activity_type?: DanceActivity | null;
    genre_family?: DanceGenreFamily | null;
    dance_genre?: string | null;
    dance_genre_label?: string | null;
    subgenre?: string | null;
    tags?: string[] | null;
    location?: string;
    address?: string;
    venue_id?: string | number | null;
    venue_name?: string | null;
    location_link?: string | null;
    times?: string[];
  };
}

const SITE_GENRES_BY_CATEGORY = {
  social: ['소셜', '졸공'],
  event: ['워크샵', '파티', '대회', '라이브밴드', '기타'],
  class: ['린디합', '솔로재즈', '발보아', '블루스', '팀원모집', '기타'],
  club: ['정규강습', '린디합', '솔로재즈', '발보아', '블루스', '팀원모집', '기타'],
} as const;

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

function getRecruitmentSearchText(event: ScrapedLike): string {
  const sd = event.structured_data || {};
  return [
    sd.title,
    sd.event_type,
    sd.dance_scope,
    sd.dance_genre,
    sd.dance_genre_label,
    sd.subgenre,
    sd.location,
    event.keyword,
    event.source_url,
    event.extracted_text,
    ...(Array.isArray(sd.tags) ? sd.tags : []),
  ].filter(Boolean).join(' ');
}

export function getIngestorRecruitmentKind(event: ScrapedLike): RecruitmentKind | null {
  return resolveRecruitmentKind(getRecruitmentSearchText(event));
}

export function detectIngestorActivity(event: ScrapedLike): DanceActivity {
  const recruitmentKind = getIngestorRecruitmentKind(event);
  if (recruitmentKind) return 'recruit';

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
  const recruitmentKind = getIngestorRecruitmentKind(event);
  const existing = event.structured_data?.tags;
  const baseTags = Array.isArray(existing) && existing.length > 0
    ? existing.filter(Boolean)
    : inferDanceTaxonomy(event).tags;
  return ensureRecruitmentTags(baseTags, recruitmentKind);
}

export function getIngestorTagLabel(tag: string): string {
  return getDanceTagLabel(tag);
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
    event.structured_data?.location || '',
    event.structured_data?.venue_name || '',
    sourceVenueHint(event.source_url, event.keyword),
    event.keyword || '',
  ].filter(Boolean);

  return matchVenueRecord({
    venue_id: event.structured_data?.venue_id,
    location: event.structured_data?.location,
    venue_name: event.structured_data?.venue_name,
    address: event.structured_data?.address,
    candidates: rawCandidates,
  }, venues) as VenueRecord | null;
}

function normalizeSiteCategory(value?: string | null): MappedIngestorEvent['category'] | '' {
  const category = String(value || '').trim().toLowerCase();
  if (category === 'regular') return 'class';
  if (category === 'club') return 'club';
  if (category === 'class' || category === 'lesson') return 'class';
  if (category === 'social' || category === 'group') return 'social';
  if (category === 'event' || category === 'party') return 'event';
  return '';
}

function getIngestorSiteCategory(event: ScrapedLike, activity: DanceActivity): MappedIngestorEvent['category'] {
  const sd = event.structured_data || {};
  const explicit = normalizeSiteCategory(sd.category);
  if (explicit) return explicit;

  const eventType = String(sd.event_type || '').trim();
  if (/소셜/i.test(eventType)) return 'social';
  if (/강습|수업|클래스/i.test(eventType)) return 'class';
  if (/동호회|크루|팀/i.test(eventType)) return 'club';
  if (/행사|파티|대회|공연/i.test(eventType)) return 'event';

  const text = getRecruitmentSearchText(event);
  if (/졸\s*공|졸업\s*(?:공연|파티)|graduation/i.test(text)) return 'social';
  if (activity === 'social') return 'social';
  if (activity === 'class') return 'class';
  if (activity === 'recruit') {
    return /팀원\s*모집|팀\s*모집|크루\s*모집|멤버\s*모집|team\s*recruit|crew\s*recruit/i.test(text)
      ? 'class'
      : 'event';
  }
  return 'event';
}

function normalizeSiteGenreValue(value?: string | null): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const compact = raw.replace(/\s+/g, '').toLowerCase();
  if (/졸공|졸업공연|졸업파티|graduation/.test(compact)) return '졸공';
  if (/소셜|social|밀롱가|프랙티카/.test(compact)) return '소셜';
  if (/정규강습|정규수업|정규반/.test(compact)) return '정규강습';
  if (/린디합|lindyhop/.test(compact)) return '린디합';
  if (/솔로재즈|solojazz/.test(compact)) return '솔로재즈';
  if (/발보아|balboa/.test(compact)) return '발보아';
  if (/블루스|blues?/.test(compact)) return '블루스';
  if (/팀원모집|팀모집|크루모집|멤버모집|teamrecruit|crewrecruit/.test(compact)) return '팀원모집';
  if (/워크샵|워크숍|workshop/.test(compact)) return '워크샵';
  if (/라이브밴드|라이브|liveband/.test(compact)) return '라이브밴드';
  if (/대회|배틀|competition|battle|cup|finals/.test(compact)) return '대회';
  if (/파티|party|night/.test(compact)) return '파티';
  if (/기타|other|etc/.test(compact)) return '기타';
  return raw;
}

function pickAllowedSiteGenre(values: Array<string | null | undefined>, category: MappedIngestorEvent['category']): string {
  const allowed = SITE_GENRES_BY_CATEGORY[category];
  for (const value of values) {
    const parts = String(value || '').split(/[,/·ㆍ|]+/).map((part) => part.trim()).filter(Boolean);
    for (const part of parts) {
      const normalized = normalizeSiteGenreValue(part);
      if ((allowed as readonly string[]).includes(normalized)) return normalized;
    }
  }
  return '';
}

function buildSiteGenre(event: ScrapedLike, category: MappedIngestorEvent['category']): string {
  const sd = event.structured_data || {};
  const explicit = pickAllowedSiteGenre([sd.genre, sd.subgenre, sd.dance_genre_label, sd.dance_genre], category);
  if (explicit) return explicit;

  const text = getRecruitmentSearchText(event);
  if (category === 'social') {
    return /졸\s*공|졸업\s*(?:공연|파티)|graduation/i.test(text) ? '졸공' : '소셜';
  }

  if (category === 'class' || category === 'club') {
    if (/팀원\s*모집|팀\s*모집|크루\s*모집|멤버\s*모집|team\s*recruit|crew\s*recruit/i.test(text)) return '팀원모집';
    if (category === 'club' && /정규\s*(?:강습|수업|반)|regular\s*(?:class|lesson)/i.test(text)) return '정규강습';
    if (/린디\s*합|lindy\s*hop/i.test(text)) return '린디합';
    if (/솔로\s*재즈|solo\s*jazz/i.test(text)) return '솔로재즈';
    if (/발보아|balboa/i.test(text)) return '발보아';
    if (/블루스|blues?/i.test(text)) return '블루스';
    return '기타';
  }

  if (/대회|배틀|competition|battle|cup|finals/i.test(text)) return '대회';
  if (/라이브\s*밴드|live\s*band/i.test(text)) return '라이브밴드';
  if (/파티|party|night/i.test(text)) return '파티';
  if (/워크샵|워크숍|특강|workshop/i.test(text)) return '워크샵';
  return '기타';
}

export function mapIngestorEvent(event: ScrapedLike, venues: VenueRecord[]): MappedIngestorEvent {
  const taxonomy = inferDanceTaxonomy(event);
  const recruitmentKind = getIngestorRecruitmentKind(event);
  const activity = detectIngestorActivity(event);
  const matchedVenue = matchVenue(event, venues);
  const sd = event.structured_data || {};

  const category = getIngestorSiteCategory(event, activity);
  const genre = buildSiteGenre(event, category);
  const location = toMapSafeVenueName(matchedVenue?.name || sd.location || sourceVenueHint(event.source_url, event.keyword) || '');
  const address = matchedVenue?.address || sd.address || '';
  const locationLink = sd.location_link || getVenueMapUrl(matchedVenue);

  return {
    category,
    genre,
    dance_scope: taxonomy.dance_scope,
    activity_type: activity,
    dance_tags: getIngestorTags(event),
    group_id: category === 'social' ? 2 : null,
    location,
    address,
    venue_id: matchedVenue?.id || (sd.venue_id ? String(sd.venue_id) : null),
    venue_name: location || null,
    location_link: locationLink || null,
    time: sd.times?.[0]?.split(/[~-]/)[0]?.trim() || '',
  };
}

export { normalizeVenueName, toMapSafeVenueName };
