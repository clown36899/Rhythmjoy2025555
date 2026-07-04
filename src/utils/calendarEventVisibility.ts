const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface CalendarVisibilityEvent {
  category?: string | null;
  date?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  event_dates?: Array<string | Date | null | undefined> | null;
}

const toLocalDateString = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export const getCalendarKstDateKey = (date: Date = new Date()): string => {
  const kstOffset = 9 * 60 * 60 * 1000;
  const kstDate = new Date(date.getTime() + kstOffset);
  const year = kstDate.getUTCFullYear();
  const month = String(kstDate.getUTCMonth() + 1).padStart(2, "0");
  const day = String(kstDate.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const getCalendarTodayDateKey = (): string => getCalendarKstDateKey();

export const getCalendarDateKey = (value: unknown): string | null => {
  if (!value) return null;

  if (typeof value === "string") {
    const datePart = value.slice(0, 10);
    if (DATE_ONLY_RE.test(datePart) && !value.includes("T")) return datePart;
  }

  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return toLocalDateString(date);
};

export const isCalendarStartOnlyEvent = (event: CalendarVisibilityEvent): boolean => {
  const category = String(event.category || "").toLowerCase();
  return category === "class" || category === "regular" || category === "club";
};

export const getCalendarEventDateKeys = (event: CalendarVisibilityEvent): string[] => {
  const rawDates = Array.isArray(event.event_dates) ? event.event_dates : [];
  const uniqueSortedDates = Array.from(
    new Set(rawDates.map(getCalendarDateKey).filter((dateKey): dateKey is string => Boolean(dateKey))),
  ).sort();

  if (uniqueSortedDates.length === 0) return [];
  if (isCalendarStartOnlyEvent(event)) return [uniqueSortedDates[0]];
  return uniqueSortedDates;
};

export const isEventShownOnCalendarDate = (
  event: CalendarVisibilityEvent,
  dateString: string,
): boolean => {
  const eventDateKeys = getCalendarEventDateKeys(event);
  if (eventDateKeys.length > 0) return eventDateKeys.includes(dateString);

  const startDate = getCalendarDateKey(event.start_date || event.date);
  const endDate = getCalendarDateKey(event.end_date || event.date || event.start_date);

  return Boolean(startDate && endDate && startDate <= dateString && dateString <= endDate);
};
