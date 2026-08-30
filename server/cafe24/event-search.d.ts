export type SearchableEvent = Record<string, unknown> & {
  title?: unknown;
  description?: unknown;
  location?: unknown;
  venue_name?: unknown;
  category?: unknown;
  activity_type?: unknown;
  event_type?: unknown;
  date?: unknown;
  start_date?: unknown;
  end_date?: unknown;
  event_dates?: unknown;
};

export function normalizeSearchText(value: unknown): string;
export function getEventSearchTerms(value: unknown): string[];
export function getEventSearchTermKind(value: unknown): 'text' | 'date' | 'category';
export function getEventSearchValues(event: SearchableEvent): unknown[];
export function searchValuesMatch(values: unknown[], query: unknown): boolean;
export function eventMatchesSearch(event: SearchableEvent, query: unknown): boolean;
