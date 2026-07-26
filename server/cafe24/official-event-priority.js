function normalizeText(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/seoul/g, '서울')
    .replace(/dj\s*/gi, '')
    .replace(/[^\p{L}\p{N}가-힣]/gu, '');
}

function datesOf(event = {}) {
  const dates = Array.isArray(event.event_dates) ? event.event_dates : [];
  return new Set([
    ...dates,
    event.date,
    event.start_date,
  ].map((value) => String(value || '').slice(0, 10)).filter(Boolean));
}

function sharesDate(left, right) {
  const leftDates = datesOf(left);
  return [...datesOf(right)].some((date) => leftDates.has(date));
}

function sourceUrl(event = {}) {
  return String(event.link1 || event.source_url || '').trim().replace(/\/+$/, '').toLowerCase();
}

function venue(event = {}) {
  return normalizeText(event.venue_name || event.location || event.address);
}

function sameVenue(left, right) {
  const a = venue(left);
  const b = venue(right);
  return Boolean(a && b && (a.includes(b) || b.includes(a)));
}

function category(event = {}) {
  return String(event.category || event.activity_type || '').toLowerCase();
}

function isSocial(event = {}) {
  return category(event) === 'social';
}

function titleSimilarity(left, right) {
  const a = normalizeText(left);
  const b = normalizeText(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.9;
  const grams = (value) => {
    const result = new Set();
    for (let index = 0; index < Math.max(1, value.length - 1); index += 1) {
      result.add(value.slice(index, index + 2));
    }
    return result;
  };
  const aGrams = grams(a);
  const bGrams = grams(b);
  const intersection = [...aGrams].filter((gram) => bGrams.has(gram)).length;
  return intersection / new Set([...aGrams, ...bGrams]).size;
}

export function isOfficialApiEvent(event = {}) {
  return Boolean(event.external_source?.partner_id && event.external_source?.external_id);
}

export function isDuplicateOfOfficial(candidate, official) {
  if (!isOfficialApiEvent(official) || !sharesDate(candidate, official)) return false;
  const candidateSource = sourceUrl(candidate);
  const officialSource = sourceUrl(official);
  if (candidateSource && officialSource && candidateSource === officialSource) return true;
  if (category(candidate) !== category(official) || !sameVenue(candidate, official)) return false;
  if (isSocial(candidate) && isSocial(official)) return true;
  return titleSimilarity(candidate.title, official.title) >= 0.88;
}

export function preferOfficialApiEvents(events = []) {
  const officialEvents = events.filter(isOfficialApiEvent);
  if (!officialEvents.length) return events;
  return events.filter((event) => (
    isOfficialApiEvent(event)
    || !officialEvents.some((official) => isDuplicateOfOfficial(event, official))
  ));
}
