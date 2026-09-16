const REGION_SUFFIX_RE = /\s*[()（）]\s*(신촌|합정|선릉|사당|강남|강북|홍대|상수|망원|연남|서교|마포|신림|봉천|건대|성수|이태원|서울|부산|대구|인천|대전|광주|수원|분당|판교)\s*[()（）]\s*$/i;
const PAREN_CONTENT_RE = /\s*[()（）][^()（）]{1,12}[()（）]\s*$/;

const CANONICAL_VENUE_ALIASES = [
  [/^경성홀(?:신촌)?$/i, '경성홀'],
  [/^(?:해피홀|happyhall)(?:신촌)?$/i, '해피홀'],
  [/^(?:소셜클럽|쏘셜클럽|sosyalclub)(?:합정)?$/i, '소셜클럽'],
  [/^스윙타임(?:바|빠)?(?:선릉)?$/i, '스윙타임'],
  [/^인더무드(?:신림)?$/i, '인더무드신림'],
  [/^봉천살롱(?:봉천)?$/i, '봉천살롱'],
  [/^(?:사보이볼룸|사보이홀|사보이|savoyballroom(?:bar)?)(?:사당)?$/i, '사보이볼룸'],
  [/^스윙스캔들$/i, '사보이볼룸'],
];

function compactVenueText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[()（）\-_.,·]/g, '');
}

function stripTrailingQualifier(value) {
  return value
    .trim()
    .replace(REGION_SUFFIX_RE, '')
    .replace(PAREN_CONTENT_RE, '')
    .trim();
}

function canonicalVenueAlias(value) {
  const compact = compactVenueText(value);
  const matched = CANONICAL_VENUE_ALIASES.find(([pattern]) => pattern.test(compact));
  return matched?.[1] || null;
}

export function toMapSafeVenueName(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const stripped = stripTrailingQualifier(raw) || raw;
  return canonicalVenueAlias(stripped) || stripped;
}

export function normalizeVenueName(value) {
  const safe = toMapSafeVenueName(value);
  return compactVenueText(safe)
    .replace(/(?:바|홀)$/i, '');
}

function normalizeVenueAddress(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[()（）\-_.,·]/g, '');
}

function venueNameKeys(value) {
  const raw = String(value || '').trim();
  if (!raw) return [];
  const safe = toMapSafeVenueName(raw);
  const withoutQualifier = stripTrailingQualifier(raw);
  return Array.from(new Set([
    compactVenueText(raw),
    compactVenueText(safe),
    compactVenueText(withoutQualifier),
    normalizeVenueName(raw),
    normalizeVenueName(safe),
  ].filter(Boolean)));
}

export function matchVenueRecord(input, venues, { strict = false } = {}) {
  if (strict) venues = venues.filter((venue) => venue.is_active !== false);
  const venueId = input.venue_id ? String(input.venue_id) : '';
  if (venueId) {
    const byId = venues.find((venue) => venue.id && String(venue.id) === venueId);
    if (byId) return byId;
    if (strict) return null;
  }

  const addressKey = normalizeVenueAddress(input.address);
  if (addressKey.length >= 8) {
    const addressMatches = venues.filter((venue) => {
      const venueAddress = normalizeVenueAddress(venue.address);
      return venueAddress.length >= 8 && (venueAddress === addressKey || (!strict && (venueAddress.includes(addressKey) || addressKey.includes(venueAddress))));
    });
    if (strict && addressMatches.length > 1) return null;
    if (addressMatches.length) return addressMatches[0];
  }

  const candidateKeys = new Set(
    [
      input.location,
      input.venue_name,
      ...(input.candidates || []),
    ].flatMap(venueNameKeys),
  );
  if (candidateKeys.size === 0) return null;

  const nameMatches = venues.filter((venue) => venueNameKeys(venue.name).some((key) => candidateKeys.has(key)));
  if (strict) return nameMatches.length === 1 ? nameMatches[0] : null;
  if (nameMatches.length) return nameMatches[0];

  for (const candidate of candidateKeys) {
    if (candidate.length < 2) continue;
    const fuzzy = venues.find((venue) => {
      const venueKeys = venueNameKeys(venue.name);
      return venueKeys.some((key) => key.length >= 2 && (key.includes(candidate) || candidate.includes(key)));
    });
    if (fuzzy) return fuzzy;
  }

  return null;
}

export function getVenueMapUrl(venue) {
  const raw = String(venue?.map_url || '').trim();
  if (!raw) return '';
  if (!raw.startsWith('{')) return raw;
  try {
    const parsed = JSON.parse(raw);
    return parsed.kakao || parsed.naver || parsed.google || '';
  } catch {
    return '';
  }
}

export function normalizeVenueStructuredData(structuredData, venues = [], options = {}) {
  const matchedVenue = matchVenueRecord({
    venue_id: structuredData?.venue_id,
    location: structuredData?.location,
    venue_name: structuredData?.venue_name,
    address: structuredData?.address,
  }, venues, options);
  if (options.strict && !matchedVenue) return structuredData;

  const location = toMapSafeVenueName(matchedVenue?.name || structuredData?.location || structuredData?.venue_name || '');
  const address = matchedVenue?.address || structuredData?.address || '';
  const venueId = matchedVenue?.id || structuredData?.venue_id || null;
  const locationLink = structuredData?.location_link || getVenueMapUrl(matchedVenue);

  return {
    ...structuredData,
    ...(location ? { location, venue_name: location } : {}),
    ...(address ? { address } : {}),
    ...(venueId ? { venue_id: venueId } : {}),
    ...(locationLink ? { location_link: locationLink } : {}),
  };
}
