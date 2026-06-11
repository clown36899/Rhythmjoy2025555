import type { QueryClient, QueryKey } from '@tanstack/react-query';
import type { Event as AppEvent } from '../lib/cafe24Client';

type EventRecord = Partial<AppEvent> & Record<string, unknown>;

type NormalizedMutation = {
  id: string | number | null;
  event: EventRecord | null;
};

const dateOnly = (value: unknown) => String(value || '').slice(0, 10);

export function normalizeEventId(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const withoutSocial = raw.replace(/^social-/, '');
  const numeric = Number(withoutSocial);
  if (Number.isFinite(numeric) && numeric >= 10000000) {
    return String(numeric - 10000000);
  }
  return withoutSocial;
}

export function sameEventId(a: unknown, b: unknown) {
  const normalizedA = normalizeEventId(a);
  const normalizedB = normalizeEventId(b);
  return Boolean(normalizedA && normalizedB && normalizedA === normalizedB);
}

function isEventLike(value: unknown): value is EventRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return 'id' in record || 'title' in record || 'date' in record || 'start_date' in record || 'end_date' in record;
}

export function getEventMutation(detail: unknown): NormalizedMutation {
  if (typeof detail === 'string' || typeof detail === 'number') {
    return { id: detail, event: null };
  }

  if (!detail || typeof detail !== 'object') {
    return { id: null, event: null };
  }

  const record = detail as Record<string, unknown>;
  const nestedEvent = isEventLike(record.event) ? record.event : null;
  const directEvent = isEventLike(record) && !nestedEvent ? (record as EventRecord) : null;
  const event = nestedEvent || directEvent;
  const id = record.id ?? record.eventId ?? record.deletedId ?? event?.id ?? null;

  return { id: id as string | number | null, event };
}

function preserveSyntheticId<T extends { id?: unknown }>(previous: T, next: EventRecord) {
  const previousId = previous.id;
  if (previousId !== undefined && previousId !== null && sameEventId(previousId, next.id)) {
    return { ...previous, ...next, id: previousId } as T;
  }
  return { ...previous, ...next } as T;
}

export function mergeEventIntoArray<T extends { id?: unknown }>(
  items: T[],
  detail: unknown,
  options: { insertIfMissing?: boolean } = {},
) {
  const { id, event } = getEventMutation(detail);
  if (!event) return items;

  const targetId = id ?? event.id ?? null;
  let matched = false;
  const nextItems = items.map((item) => {
    if (!sameEventId(item.id, targetId) && !sameEventId(item.id, event.id)) return item;
    matched = true;
    return preserveSyntheticId(item, event);
  });

  if (!matched && options.insertIfMissing && event.id !== undefined && event.id !== null) {
    return [event as T, ...nextItems];
  }

  return matched ? nextItems : items;
}

export function removeEventFromArray<T extends { id?: unknown }>(items: T[], detail: unknown) {
  const { id } = getEventMutation(detail);
  if (id === null || id === undefined) return items;
  return items.filter((item) => !sameEventId(item.id, id));
}

export function eventOverlapsDate(event: EventRecord, date: string) {
  if (!date) return true;
  const eventDates = Array.isArray(event.event_dates) ? event.event_dates.map(dateOnly).filter(Boolean) : [];
  if (eventDates.length) return eventDates.includes(date);

  const startDate = dateOnly(event.start_date || event.date);
  const endDate = dateOnly(event.end_date || event.start_date || event.date);
  return Boolean(startDate && endDate && date >= startDate && date <= endDate);
}

function eventOverlapsRange(event: EventRecord, startDate: string | null, endDate: string | null) {
  if (!startDate || !endDate) return true;
  const eventDates = Array.isArray(event.event_dates) ? event.event_dates.map(dateOnly).filter(Boolean) : [];
  if (eventDates.length) return eventDates.some((date) => date >= startDate && date <= endDate);

  const eventStart = dateOnly(event.start_date || event.date);
  const eventEnd = dateOnly(event.end_date || event.start_date || event.date);
  return Boolean(eventStart && eventEnd && eventStart <= endDate && eventEnd >= startDate);
}

function extractDateRangeFromKey(queryKey: QueryKey) {
  const dates = queryKey
    .map((part) => (typeof part === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(part) ? part : null))
    .filter(Boolean) as string[];
  if (dates.length < 2) return { startDate: null, endDate: null };
  return { startDate: dates[dates.length - 2], endDate: dates[dates.length - 1] };
}

function patchEventListData(oldData: unknown, detail: unknown, action: 'created' | 'updated' | 'deleted') {
  if (Array.isArray(oldData)) {
    if (action === 'deleted') return removeEventFromArray(oldData, detail);
    return mergeEventIntoArray(oldData, detail, { insertIfMissing: action === 'created' });
  }

  if (!oldData || typeof oldData !== 'object') return oldData;
  const record = oldData as { events?: EventRecord[]; socialSchedules?: EventRecord[] };
  if (!Array.isArray(record.events) && !Array.isArray(record.socialSchedules)) return oldData;

  return {
    ...record,
    ...(Array.isArray(record.events)
      ? { events: action === 'deleted' ? removeEventFromArray(record.events, detail) : mergeEventIntoArray(record.events, detail, { insertIfMissing: action === 'created' }) }
      : {}),
    ...(Array.isArray(record.socialSchedules)
      ? { socialSchedules: action === 'deleted' ? removeEventFromArray(record.socialSchedules, detail) : mergeEventIntoArray(record.socialSchedules, detail, { insertIfMissing: action === 'created' }) }
      : {}),
  };
}

export function applyEventMutationToQueryCache(
  queryClient: QueryClient,
  detail: unknown,
  action: 'created' | 'updated' | 'deleted',
) {
  queryClient.setQueriesData({ queryKey: ['events'] }, (oldData) => patchEventListData(oldData, detail, action));
  queryClient.setQueriesData({ queryKey: ['list-view-events'] }, (oldData) => patchEventListData(oldData, detail, action));

  queryClient.getQueryCache().findAll({ queryKey: ['calendar-events'] }).forEach((query) => {
    const { startDate, endDate } = extractDateRangeFromKey(query.queryKey);
    queryClient.setQueryData(query.queryKey, (oldData: unknown) => {
      if (action === 'deleted') return patchEventListData(oldData, detail, action);

      const { event } = getEventMutation(detail);
      if (!event) return oldData;
      const inRange = eventOverlapsRange(event, startDate, endDate);

      if (Array.isArray(oldData)) {
        const hasExisting = oldData.some((item) => sameEventId((item as EventRecord).id, event.id));
        if (hasExisting && !inRange) return removeEventFromArray(oldData as EventRecord[], detail);
        return mergeEventIntoArray(oldData as EventRecord[], detail, { insertIfMissing: action === 'created' && inRange });
      }

      if (!oldData || typeof oldData !== 'object') return oldData;
      const record = oldData as { events?: EventRecord[]; socialSchedules?: EventRecord[] };
      if (!Array.isArray(record.events) && !Array.isArray(record.socialSchedules)) return oldData;

      const patchArray = (items: EventRecord[]) => {
        const hasExisting = items.some((item) => sameEventId(item.id, event.id));
        if (hasExisting && !inRange) return removeEventFromArray(items, detail);
        return mergeEventIntoArray(items, detail, { insertIfMissing: action === 'created' && inRange });
      };

      return {
        ...record,
        ...(Array.isArray(record.events) ? { events: patchArray(record.events) } : {}),
        ...(Array.isArray(record.socialSchedules) ? { socialSchedules: patchArray(record.socialSchedules) } : {}),
      };
    });
  });
}
