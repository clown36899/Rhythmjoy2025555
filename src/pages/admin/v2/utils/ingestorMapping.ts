type EventType = '소셜' | '파티/행사' | '강습';

export interface VenueRecord {
  id: string;
  name: string;
  address: string | null;
}

export interface MappedIngestorEvent {
  category: 'social' | 'event' | 'class';
  genre: string;
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
  const explicit = event.structured_data?.event_type;
  if (explicit) return explicit;

  const text = `${event.structured_data?.title || ''} ${event.extracted_text || ''} ${event.keyword || ''}`.toLowerCase();
  if (/수업|강습|레슨|lesson|workshop|워크샵|class|초급|중급|입문/.test(text)) return '강습';
  if (/소셜|social|dj/.test(text)) return '소셜';
  return '파티/행사';
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
  const eventType = detectEventType(event);
  const matchedVenue = matchVenue(event, venues);
  const sd = event.structured_data || {};

  const category = eventType === '강습' ? 'class' : eventType === '소셜' ? 'social' : 'event';
  const genre = eventType === '강습' ? '강습' : eventType === '소셜' ? '소셜' : '파티';
  const location = matchedVenue?.name || sd.location || sourceVenueHint(event.source_url, event.keyword) || '';
  const address = sd.address || matchedVenue?.address || '';

  return {
    category,
    genre,
    group_id: category === 'social' ? 2 : null,
    location,
    address,
    venue_id: matchedVenue?.id || (sd.venue_id ? String(sd.venue_id) : null),
    venue_name: matchedVenue?.name || location || null,
    time: sd.times?.[0]?.split(/[~-]/)[0]?.trim() || '',
  };
}
