export interface VenueLike {
  id?: string | number | null;
  name?: string | null;
  address?: string | null;
  map_url?: string | null;
}

interface VenueMatchInput {
  venue_id?: string | number | null;
  location?: string | null;
  venue_name?: string | null;
  address?: string | null;
  candidates?: Array<string | null | undefined>;
}

export { toMapSafeVenueName, normalizeVenueName, matchVenueRecord, getVenueMapUrl, normalizeVenueStructuredData } from './venueNormalization.mjs';
