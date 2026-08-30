const SEARCH_SEPARATOR_RE = /[\s\-_/·.,()[\]{}|:;!?%+&'"“”‘’]+/gu;
const EVENT_SEARCH_KEYWORD_RE = /(소셜|행사|강습|동호회|파티|워크숍|워크샵|클래스|모집)/gu;
const KOREAN_DATE_PART_RE = /(\d{1,4}\s*(?:년|월|일))/gu;
const HANGUL_LATIN_BOUNDARY_RE = /([가-힣ㄱ-ㅎㅏ-ㅣ])([a-z])/gu;
const LATIN_HANGUL_BOUNDARY_RE = /([a-z])([가-힣ㄱ-ㅎㅏ-ㅣ])/gu;

const CATEGORY_SEARCH_LABELS = {
  social: ['소셜'],
  event: ['행사'],
  class: ['강습', '클래스'],
  regular: ['강습', '정규강습'],
  club: ['동호회'],
  club_lesson: ['동호회', '강습'],
  club_regular: ['동호회', '정규강습'],
  recruit: ['모집'],
};
const STRUCTURED_CATEGORY_TERMS = new Set(['소셜', '행사', '강습', '클래스', '동호회', '모집']);
const STRUCTURED_DATE_TERM_RE = /^\d{1,4}(?:년|월|일)$/u;

export function normalizeSearchText(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase('ko-KR')
    .replace(SEARCH_SEPARATOR_RE, '');
}

export function getEventSearchTerms(value) {
  const normalized = String(value ?? '').normalize('NFKC').toLocaleLowerCase('ko-KR');
  const separated = normalized
    .replace(KOREAN_DATE_PART_RE, ' $1 ')
    .replace(EVENT_SEARCH_KEYWORD_RE, ' $1 ')
    .replace(HANGUL_LATIN_BOUNDARY_RE, '$1 $2')
    .replace(LATIN_HANGUL_BOUNDARY_RE, '$1 $2');

  return [...new Set(
    separated
      .split(SEARCH_SEPARATOR_RE)
      .map(normalizeSearchText)
      .filter(Boolean),
  )];
}

export function getEventSearchTermKind(term) {
  const normalized = normalizeSearchText(term);
  if (STRUCTURED_DATE_TERM_RE.test(normalized)) return 'date';
  if (STRUCTURED_CATEGORY_TERMS.has(normalized)) return 'category';
  return 'text';
}

function dateSearchAliases(value) {
  const match = String(value ?? '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})/u);
  if (!match) return [];

  const [, year, monthText, dayText] = match;
  const month = Number(monthText);
  const day = Number(dayText);
  if (!month || month > 12 || !day || day > 31) return [];

  return [
    `${year}년 ${month}월 ${day}일`,
    `${month}월 ${day}일`,
    `${day}일`,
    `${month}/${day}`,
    `${month}.${day}`,
  ];
}

function categorySearchAliases(event) {
  const values = [event?.category, event?.activity_type, event?.event_type]
    .map((value) => String(value ?? '').trim().toLocaleLowerCase('ko-KR'))
    .filter(Boolean);
  const labels = values.flatMap((value) => CATEGORY_SEARCH_LABELS[value] || []);
  return [...new Set([...values, ...labels])];
}

function eventTextSearchValues(event) {
  return [event?.title, event?.description, event?.location, event?.venue_name]
    .filter((value) => value !== null && value !== undefined && String(value).trim() !== '');
}

function eventDateSearchValues(event) {
  const eventDates = Array.isArray(event?.event_dates) ? event.event_dates : [];
  return [event?.start_date, event?.date, event?.end_date, ...eventDates]
    .flatMap(dateSearchAliases);
}

export function getEventSearchValues(event) {
  return [
    ...eventTextSearchValues(event),
    ...eventDateSearchValues(event),
    ...categorySearchAliases(event),
  ];
}

export function searchValuesMatch(values, query) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return false;

  const normalizedValues = values.map(normalizeSearchText).filter(Boolean);
  if (normalizedValues.join('').includes(normalizedQuery)) return true;

  const terms = getEventSearchTerms(query);
  return terms.length > 1
    && terms.every((term) => normalizedValues.some((value) => value.includes(term)));
}

export function eventMatchesSearch(event, query) {
  const terms = getEventSearchTerms(query);
  const termKinds = terms.map(getEventSearchTermKind);
  const isDateCategoryQuery = termKinds.includes('date') && termKinds.includes('category');

  if (isDateCategoryQuery) {
    const valuesByKind = {
      text: eventTextSearchValues(event).map(normalizeSearchText),
      date: eventDateSearchValues(event).map(normalizeSearchText),
      category: categorySearchAliases(event).map(normalizeSearchText),
    };
    return terms.every((term, index) => (
      valuesByKind[termKinds[index]].some((value) => value.includes(term))
    ));
  }

  return searchValuesMatch(getEventSearchValues(event), query);
}
