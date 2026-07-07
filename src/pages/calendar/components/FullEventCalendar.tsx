import { useState, useEffect, useCallback, memo, useMemo, useRef, useLayoutEffect } from "react";
import { useTranslation } from "react-i18next";
import type { Event as AppEvent } from "../../../lib/cafe24Client";
import { useCalendarEventsQuery } from "../../../hooks/queries/useCalendarEventsQuery";
import EventRegistrationModal from "../../../components/EventRegistrationModal";
import DateEventsModal from "./DateEventsModal";
import type { DanceScope } from "../../../utils/danceTaxonomy";
import { getLightweightEventImage } from "../../../utils/getEventThumbnail";
import {
  getCalendarDateKey,
  getCalendarEventDateKeys,
  getCalendarTodayDateKey,
} from "../../../utils/calendarEventVisibility";
import {
  CALENDAR_SOCIAL_MIN_FONT_SIZE,
  CALENDAR_SPAN_TITLE_FONT_SIZE,
  getCalendarLayoutCssVars,
  getCalendarLayoutMetrics,
} from "../utils/calendarLayoutMetrics";
import {
  isCalendarClassLikeCategory,
  isCalendarSocialLikeEvent,
  normalizeCalendarEventKindPart,
} from "../utils/calendarEventKind";
import "../styles/FullEventCalendar.css";
// import { useDefaultThumbnail } from "../../../hooks/useDefaultThumbnail"; // Removed unused import

const FULL_EVENT_CALENDAR_DEBUG = import.meta.env.VITE_FULL_EVENT_CALENDAR_DEBUG === 'true';
const debugFullEventCalendar = (...args: unknown[]) => {
  if (FULL_EVENT_CALENDAR_DEBUG) console.debug(...args);
};

const getSafeRect = (element: Element | null | undefined) => {
  if (!element || !element.isConnected) return null;
  try {
    return element.getBoundingClientRect();
  } catch {
    return null;
  }
};

const parseDateKey = (value: any) => {
  const key = getCalendarDateKey(value);
  if (!key) return null;
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
};

const DAY_MS = 24 * 60 * 60 * 1000;

type CalendarSpanItem = {
  key: string;
  representativeEvent: AppEvent;
  eventIds: Array<number | string>;
  title: string;
  category: string;
  startDate: string;
  endDate: string;
  durationDays: number;
};

type CalendarSpanBuildResult = {
  spanItems: CalendarSpanItem[];
  hiddenEventDateKeys: Set<string>;
};

const getDateKeyFromValue = (value?: string | Date | null) => getCalendarDateKey(value || null) || "";

const eventDatePairKey = (eventId: number | string, dateKey: string) => `${eventId}|${dateKey}`;

const dateKeyToUtcTime = (dateKey: string) => {
  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day) return NaN;
  return Date.UTC(year, month - 1, day);
};

const diffDateDays = (startDate: string, endDate: string) => {
  const startTime = dateKeyToUtcTime(startDate);
  const endTime = dateKeyToUtcTime(endDate);
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) return 0;
  return Math.round((endTime - startTime) / DAY_MS);
};

const addDateDays = (dateKey: string, days: number) => {
  const time = dateKeyToUtcTime(dateKey);
  if (!Number.isFinite(time)) return "";
  return getCalendarDateKey(new Date(time + days * DAY_MS)) || "";
};

const getDateKeysInRange = (startDate: string, endDate: string) => {
  const length = Math.max(1, diffDateDays(startDate, endDate) + 1);
  return Array.from({ length }, (_, index) => addDateDays(startDate, index)).filter(Boolean);
};

const splitConsecutiveDateRuns = (dateKeys: string[]) => {
  const uniqueDates = Array.from(new Set(dateKeys.filter(Boolean))).sort();
  const runs: string[][] = [];
  let currentRun: string[] = [];

  uniqueDates.forEach((dateKey) => {
    const previousDate = currentRun[currentRun.length - 1];
    if (!previousDate || diffDateDays(previousDate, dateKey) === 1) {
      currentRun.push(dateKey);
      return;
    }

    runs.push(currentRun);
    currentRun = [dateKey];
  });

  if (currentRun.length > 0) runs.push(currentRun);
  return runs;
};

const normalizeCalendarGroupPart = normalizeCalendarEventKindPart;

const isCalendarSocialEvent = (event: AppEvent) => {
  return isCalendarSocialLikeEvent(event as any);
};

const isCalendarEventSeriesGroupable = (event: AppEvent) => (
  normalizeCalendarGroupPart(event.category) === "event" && !isCalendarSocialEvent(event)
);

const getCalendarSeriesKey = (event: AppEvent) => {
  if (!isCalendarEventSeriesGroupable(event)) return "";

  const title = normalizeCalendarGroupPart(event.title);
  if (!title) return "";

  const place = normalizeCalendarGroupPart(event.location || event.venue_name || event.place_name);
  const image = normalizeCalendarGroupPart(
    event.image || event.image_thumbnail || event.image_medium || event.image_full || event.storage_path,
  );
  const organizer = normalizeCalendarGroupPart(event.organizer_name || event.organizer);

  return [title, place, image || organizer].join("|");
};

const compareCalendarSpanItems = (a: CalendarSpanItem, b: CalendarSpanItem) => {
  const startDateCompare = a.startDate.localeCompare(b.startDate);
  if (startDateCompare !== 0) return startDateCompare;

  const durationCompare = b.durationDays - a.durationDays;
  if (durationCompare !== 0) return durationCompare;

  const titleCompare = a.title.localeCompare(b.title, "ko");
  if (titleCompare !== 0) return titleCompare;

  return a.key.localeCompare(b.key);
};

const isDateInCalendarSpan = (span: CalendarSpanItem, dateKey: string) => (
  span.startDate <= dateKey && dateKey <= span.endDate
);

const getCalendarEventToneClass = (event: AppEvent) => {
  const category = String(event.category || '').toLowerCase();
  return isCalendarClassLikeCategory(category)
    ? 'calendar-event-tone-blue'
    : category === 'social'
      ? 'calendar-event-tone-green'
      : category === 'club'
        ? 'calendar-event-tone-violet'
        : 'calendar-event-tone-amber';
};

const cleanCalendarDisplayText = (value?: string | null) => (
  value?.trim().replace(/\s+/g, " ") || ""
);

const getCalendarSocialDjText = (event: AppEvent) => {
  const rawDjs = (event as any).structured_data?.djs
    ?? (event as any).djs
    ?? (event as any).dj_names
    ?? (event as any).dj_name;

  const djs = Array.isArray(rawDjs)
    ? rawDjs
    : typeof rawDjs === "string"
      ? rawDjs.split(/[,/·ㆍ&]+/)
      : [];
  const cleanDjs = djs
    .map((dj) => cleanCalendarDisplayText(String(dj)).replace(/^DJ\s*/i, ""))
    .filter(Boolean);

  if (cleanDjs.length > 0) return cleanDjs.join(", ");

  const title = cleanCalendarDisplayText(event.title);
  const match = title.match(/(?:^|[\s|·ㆍ•([{-])DJ\s*([^|•)\]}{}\n\r]+?)(?=\s*(?:[|•)\]}{}]|소셜|공지|$))/i)
    || title.match(/DJ\s*([^|•)\]}{}\n\r]+?)(?=\s*(?:[|•)\]}{}]|소셜|공지|$))/i)
    || title.match(/디제이\s*([^|•)\]}{}\n\r]+?)(?=\s*(?:[|•)\]}{}]|소셜|공지|$))/i);
  const name = cleanCalendarDisplayText(match?.[1])
    .replace(/^DJ\s*/i, "")
    .replace(/\s*(월요|화요|수요|목요|금요|토요|일요)\s*$/g, "");

  return name || "";
};

const getCalendarSocialBadgeLabel = (event: AppEvent) => {
  const genre = cleanCalendarDisplayText(event.genre);
  return genre.includes("졸공") ? "졸공" : "소셜";
};

const estimateCalendarSocialTextUnits = (value: string) => (
  Array.from(cleanCalendarDisplayText(value)).reduce((sum, char) => {
    if (/\s/.test(char)) return sum + 0.32;
    if (/[A-Za-z0-9]/.test(char)) return sum + 0.56;
    if (/[()[\]{}.,:;|/\\\-_'"]/u.test(char)) return sum + 0.38;
    return sum + 1;
  }, 0)
);

const getCalendarSocialFitFontSize = (value: string, maxSize: number, minSize: number) => {
  const units = estimateCalendarSocialTextUnits(value);
  if (units <= 0) return maxSize;

  const targetWidth = 48;
  const fittedSize = targetWidth / units;
  return Math.max(minSize, Math.min(maxSize, fittedSize));
};

const getCalendarSocialTextStyle = (locationText: string, djText: string) => ({
  '--calendar-social-place-font-size': `${getCalendarSocialFitFontSize(locationText, CALENDAR_SPAN_TITLE_FONT_SIZE, CALENDAR_SOCIAL_MIN_FONT_SIZE).toFixed(2)}px`,
  '--calendar-social-dj-font-size': `${getCalendarSocialFitFontSize(djText, CALENDAR_SPAN_TITLE_FONT_SIZE, CALENDAR_SOCIAL_MIN_FONT_SIZE).toFixed(2)}px`,
} as React.CSSProperties);

interface FullEventCalendarProps {
  currentMonth: Date;
  selectedDate: Date | null;
  onDateSelect: (date: Date | null) => void;
  onMonthChange: (date: Date) => void;
  viewMode: "month" | "year";
  onViewModeChange: (mode: "month" | "year") => void;
  calendarHeightPx: number;
  dragOffset?: number;
  isAnimating?: boolean;
  onEventClick: (event: AppEvent, date: Date, dayEvents: AppEvent[]) => void;
  onEventsUpdate?: (createdDate?: Date) => void;
  isAdminMode?: boolean;
  selectedCategory?: string;
  highlightedEventId?: number | string | null;
  hoveredEventId?: number | string | null;
  tabFilter?: 'all' | 'social-events' | 'classes' | 'overseas';
  danceScope?: DanceScope | string;
  seed?: number;
  onDataLoaded?: () => void;
  // 부모로부터 전달받는 데이터 프롭스 추가
  calendarData?: any;
  isLoading?: boolean;
  refetchCalendarData?: () => void;
  isMapView?: boolean;
  onDateClickWithEvents?: (date: Date, events: AppEvent[]) => void;
}

// [Performance Fix] 개별 날짜 셀을 위한 메모이제이션된 컴포넌트
const CalendarCell = memo(({
  day,
  isToday,
  isLastRow,
  isOutsideMonth,
  cellHeight,
  gridColumn,
  gridRow,
  events,
  hiddenEventDateKeys,
  reservedSpanLanes,
  highlightedEventId,
  onDateClick,
  onDateNumberClick,
  onEventClick,
  t // translations
}: {
  day: Date;
  isToday: boolean;
  isLastRow: boolean;
  isOutsideMonth: boolean;
  cellHeight: number;
  gridColumn: number;
  gridRow: number;
  events: AppEvent[];
  hiddenEventDateKeys: Set<string>;
  reservedSpanLanes: number;
  highlightedEventId: number | string | null;
  onDateClick: (date: Date, e?: React.MouseEvent) => void;
  onDateNumberClick: (e: React.MouseEvent, date: Date) => void;
  onEventClick: (event: AppEvent, date: Date, dayEvents: AppEvent[]) => void;
  t: any;
}) => {
  const [shouldRenderEvents, setShouldRenderEvents] = useState(false);

  // [Performance] 초기 42개 셀이 마운트될 때 이벤트 카드까지 한꺼번에 그리면 메인 스레드가 마비됨.
  // 셀의 골격만 먼저 렌더링하고, 이벤트 카드는 다음 틱에 나눠서 렌더링하여 'Long Task' 방지.
  useEffect(() => {
    // requestIdleCallback이 지원되면 사용, 아니면 setTimeout으로 분산
    if ('requestIdleCallback' in window) {
      const handle = (window as any).requestIdleCallback(() => setShouldRenderEvents(true), { timeout: 200 });
      return () => (window as any).cancelIdleCallback(handle);
    } else {
      const timer = setTimeout(() => setShouldRenderEvents(true), 50);
      return () => clearTimeout(timer);
    }
  }, []);

  const dateString = getCalendarDateKey(day) || "";
  const visibleEvents = events.filter((event) => !hiddenEventDateKeys.has(eventDatePairKey(event.id, dateString)));
  const socialEvents = visibleEvents.filter(isCalendarSocialEvent);
  const nonSocialEvents = visibleEvents.filter((event) => !isCalendarSocialEvent(event));

  const renderEventCard = (event: AppEvent) => {
    const thumbnailUrl = getLightweightEventImage(event, ['image_micro', 'image_thumbnail', 'image_medium'])
      || event.image
      || event.image_full;
    const desktopThumbnailUrl = getLightweightEventImage(event, ['image_thumbnail', 'image_medium', 'image_micro'])
      || thumbnailUrl;
    const isSocialEvent = isCalendarSocialEvent(event);
    const locationText = event.venue_name || event.place_name || event.location || '';
    const toneClass = getCalendarEventToneClass(event);
    const isLessonEvent = isCalendarClassLikeCategory(event.category);
    const socialDjText = isSocialEvent ? getCalendarSocialDjText(event) : "";
    const socialDjDisplayText = isSocialEvent && socialDjText ? `DJ ${socialDjText}` : "";
    const socialBadgeLabel = isSocialEvent ? getCalendarSocialBadgeLabel(event) : "";
    const socialTextStyle = isSocialEvent
      ? getCalendarSocialTextStyle(locationText || "장소 미정", socialDjDisplayText)
      : undefined;

    const eStart = (event.start_date || event.date || '').substring(0, 10);
    const eEnd = (event.end_date || event.date || '').substring(0, 10);

    const isContinueLeft = eStart < dateString;
    const isContinueRight = eEnd > dateString;

    return (
      <div
        key={event.id}
        className={`calendar-fullscreen-event-card ${toneClass} ${isSocialEvent ? 'calendar-social-text-card' : ''} ${isContinueLeft ? 'calendar-event-continue-left' : ''} ${isContinueRight ? 'calendar-event-continue-right' : ''}`}
        data-event-id={event.id}
        role="button"
        onClick={(e) => {
          e.stopPropagation();
          onEventClick(event, day, events);
        }}
      >
        {isSocialEvent ? (
          <>
            <span className="calendar-social-badge" aria-hidden="true">{socialBadgeLabel}</span>
            <div
              className={`calendar-social-text-card-body ${highlightedEventId === event.id ? 'calendar-event-highlighted' : ''}`}
              style={socialTextStyle}
            >
              <div className="calendar-social-place">{locationText || "장소 미정"}</div>
              <div className="calendar-social-dj">
                {socialDjDisplayText}
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="calendar-fullscreen-card-inner">
              {thumbnailUrl ? (
                <div className={`calendar-fullscreen-image-container ${highlightedEventId === event.id ? 'calendar-event-highlighted' : ''}`}>
                  <picture>
                    {desktopThumbnailUrl && (
                      <source media="(min-width: 1024px)" srcSet={desktopThumbnailUrl} />
                    )}
                    <img
                      src={thumbnailUrl}
                      alt=""
                      className="calendar-fullscreen-image"
                      loading="lazy"
                      decoding="async"
                      draggable={false}
                    />
                  </picture>
                  {locationText && (
                    <span className="calendar-fullscreen-location-overlay">
                      {locationText}
                    </span>
                  )}
                </div>
              ) : (
                <div className={`calendar-fullscreen-placeholder ${toneClass} ${highlightedEventId === event.id ? 'calendar-event-highlighted' : ''}`}>
                  <span className="calendar-placeholder-text">
                    {event.title.charAt(0)}
                  </span>
                </div>
              )}
            </div>
            <div className={`calendar-fullscreen-title-container ${isLessonEvent ? 'is-lesson' : ''}`}>
              <div className="calendar-fullscreen-title">{event.title}</div>
              {locationText && (
                <div className="calendar-fullscreen-place">{locationText}</div>
              )}
            </div>
          </>
        )}
      </div>
    );
  };

  const renderEventSkeleton = (event: AppEvent) => {
    const isSocialSkeleton = isCalendarSocialEvent(event);
    return (
      <div
        key={`skeleton-${event.id}`}
        className={`calendar-fullscreen-event-card skeleton ${isSocialSkeleton ? 'calendar-social-text-card' : ''}`}
        style={{ opacity: 0 }} /* 공간만 차지하도록 */
      >
        {isSocialSkeleton ? (
          <div className="calendar-social-text-card-body" />
        ) : (
          <>
            <div className="calendar-fullscreen-card-inner">
              <div className="calendar-fullscreen-image-container" />
            </div>
            <div className="calendar-fullscreen-title-container">
              <div className="calendar-fullscreen-title">&nbsp;</div>
            </div>
          </>
        )}
      </div>
    );
  };

  const renderSocialSection = (items: AppEvent[], isSkeleton = false) => {
    if (items.length === 0) return null;

    return (
      <div
        className={`calendar-social-section ${isSkeleton ? 'skeleton' : ''}`}
        style={isSkeleton ? { opacity: 0 } : undefined}
        aria-label="소셜 일정"
      >
        <div className="calendar-social-section-header" aria-hidden="true">
          <span>소셜</span>
          {items.length > 1 && <span className="calendar-social-section-count">{items.length}</span>}
        </div>
        <div className="calendar-social-section-list">
          {items.map(isSkeleton ? renderEventSkeleton : renderEventCard)}
        </div>
      </div>
    );
  };

  return (
    <div
      data-date={dateString}
      id={isToday ? 'calendar-today-cell' : undefined}
      onClick={(e) => onDateClick(day, e)}
      className={`calendar-cell-fullscreen ${isToday ? 'is-today' : ''} ${isLastRow ? 'is-last-row' : ''} ${isOutsideMonth ? 'is-outside-month' : ''}`}
      style={{
        '--cell-min-height': `${cellHeight}px`,
        gridColumn,
        gridRow,
      } as any}
    >
      <div className="calendar-cell-fullscreen-header">
        <span
          onClick={(e) => onDateNumberClick(e, day)}
          className={`calendar-date-number-fullscreen ${isToday
            ? "calendar-date-number-today"
            : day.getDay() === 0
              ? "calendar-date-sunday"
              : day.getDay() === 6
                ? "calendar-date-saturday"
                : ""
            } cursor-pointer`}
        >
          <span className="calendar-date-digit">{day.getDate()}</span>
          <span className="weekday-wrapper">
            <span className="translated-part">
              {t(`weekdays.${['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][day.getDay()]}`)}
            </span>
            <span className="fixed-part ko" translate="no">
              {(() => { const days = ['일', '월', '화', '수', '목', '금', '토']; return days[day.getDay()]; })()}
            </span>
            <span className="fixed-part en" translate="no">
              {(() => { const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']; return days[day.getDay()]; })()}
            </span>
          </span>
        </span>
        {events.length > 0 && (
          <span className="calendar-day-count">{events.length}</span>
        )}
      </div>

      <div
        className="calendar-cell-fullscreen-body"
        style={{
          paddingTop: reservedSpanLanes > 0 ? `${reservedSpanLanes * 20 + 8}px` : undefined,
        }}
      >
        {shouldRenderEvents ? (
          <>
            {renderSocialSection(socialEvents)}
            {nonSocialEvents.map(renderEventCard)}
          </>
        ) : (
          /* [Skeleton One-shot Fix] 렌더링 전 높이 확보용 스켈레톤 */
          /* Keep social/event skeleton thumbnails aligned with the 16:9 card media ratio. */
          <>
            {renderSocialSection(socialEvents, true)}
            {nonSocialEvents.map(renderEventSkeleton)}
          </>
        )}
      </div>
    </div>
  );
});

export default memo(function FullEventCalendar({
  currentMonth,
  selectedDate,
  onDateSelect,
  onMonthChange,
  onEventsUpdate,
  viewMode,
  onViewModeChange: _onViewModeChange,
  calendarHeightPx,
  dragOffset,
  isAnimating,
  onEventClick,
  isAdminMode: _isAdminMode = false,
  selectedCategory = "all",
  highlightedEventId = null,
  tabFilter = 'all',
  danceScope: _danceScope = 'swing',
  seed = 42,
  onDataLoaded,
  calendarData,
  isLoading,
  refetchCalendarData,
  isMapView = false,
  onDateClickWithEvents,
}: FullEventCalendarProps) {
  const { t } = useTranslation();
  const [events, setEvents] = useState<AppEvent[]>([]);
  const [socialSchedules, setSocialSchedules] = useState<any[]>([]);
  const [showRegistrationModal, setShowRegistrationModal] = useState(false);
  const [yearRangeBase, setYearRangeBase] = useState(new Date().getFullYear());

  // React Query 통합: 부모(Page.tsx)에서 관리하도록 변경됨.

  // 쿼리 데이터와 연동 (부모로부터 받은 데이터 사용)
  useEffect(() => {
    if (calendarData) {
      setEvents(calendarData.events || []);
      setSocialSchedules(calendarData.socialSchedules || []);
      if (onEventsUpdate) onEventsUpdate();
    }
  }, [calendarData, onEventsUpdate]);

  // Date Events Modal state
  const [showDateModal, setShowDateModal] = useState(false);
  const [modalEvents, setModalEvents] = useState<AppEvent[]>([]);

  // const { defaultThumbnailClass, defaultThumbnailEvent } = useDefaultThumbnail(); // Removed unused hook

  // Internal state for swipe gestures
  const [internalDragOffset, _setInternalDragOffset] = useState(0);
  const [internalIsAnimating, _setInternalIsAnimating] = useState(false);

  // Use external props if provided, otherwise use internal state
  const effectiveDragOffset = dragOffset !== undefined ? dragOffset : internalDragOffset;
  const effectiveIsAnimating = isAnimating !== undefined ? isAnimating : internalIsAnimating;
  const viewportWidth = typeof document !== "undefined" ? document.documentElement.clientWidth : 390;
  const layoutMetrics = getCalendarLayoutMetrics(viewportWidth);
  const layoutCssVars = getCalendarLayoutCssVars(viewportWidth);

  // Dynamic Height State
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState<number | undefined>(undefined);

  // 실제 필요한 주 수 계산 (전체 달력 모드용)
  const getActualWeeksCount = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startingDayOfWeek = (firstDay.getDay() + 6) % 7;
    const daysInMonth = lastDay.getDate();
    const totalDays = startingDayOfWeek + daysInMonth;
    return Math.ceil(totalDays / 7);
  };

  // 달력 셀 높이 계산 함수
  // 이전 로직: 화면 높이에 맞춰서 늘림 -> 문제: 이벤트가 적어도 강제로 늘어남
  // 수정 로직: 최소 높이만 보장하고 컨텐츠에 맞게 늘어나도록 함 (30px은 기본 헤더/날짜 높이)
  const getCellHeight = (_monthDate: Date) => {
    return layoutMetrics.minCellHeight;
  };

  // 카테고리에 따라 이벤트 필터링 (기존 로직 유지)
  const categoryFilteredEvents = useMemo(() => {
    if (!selectedCategory || selectedCategory === 'all') {
      return events;
    }
    if (selectedCategory === 'none') {
      return [];
    }
    return events.filter(event => event.category === selectedCategory);
  }, [events, selectedCategory]);

  // 탭 필터에 따라 이벤트와 소셜 스케줄 결합 및 필터링
  const filteredEvents = useMemo(() => {
    const socialEvents = socialSchedules
      .map(schedule => ({
        ...schedule, // events 테이블의 모든 필드 유지
        source: 'events' as const, // 원본 소스는 이제 events 테이블임
        location: schedule.place_name || schedule.location || '',
      })) as any[];

    let combined: any[] = [];

    // domesticEvents 필터 제거: 모든 이벤트를 카테고리별로 필터링
    const allCategoryFilteredEvents = categoryFilteredEvents;

    if (tabFilter === 'all') {
      combined = [...allCategoryFilteredEvents, ...socialEvents];
    } else if (tabFilter === 'social-events') {
      const nonClassEvents = allCategoryFilteredEvents.filter(event =>
        event.category !== 'class' && event.category !== 'regular' && event.category !== 'club'
      );
      const nonClassSocialEvents = socialEvents.filter(event =>
        event.category !== 'class' && event.category !== 'regular' && event.category !== 'club'
      );
      combined = [...nonClassEvents, ...nonClassSocialEvents];
    } else if (tabFilter === 'classes') {
      const classEvents = allCategoryFilteredEvents.filter(event =>
        event.category === 'class' || event.category === 'regular' || event.category === 'club'
      );
      const classSocialEvents = socialEvents.filter(event =>
        event.category === 'class' || event.category === 'regular' || event.category === 'club'
      );
      combined = [...classEvents, ...classSocialEvents];
    }

    return combined as AppEvent[];

    return combined as AppEvent[];
  }, [categoryFilteredEvents, socialSchedules, tabFilter, events]);

  const { spanItems: calendarSpanItems, hiddenEventDateKeys } = useMemo<CalendarSpanBuildResult>(() => {
    const spanItems: CalendarSpanItem[] = [];
    const hiddenDateKeys = new Set<string>();
    const singleDayEventsBySeries = new Map<string, Array<{ dateKey: string; event: AppEvent }>>();

    filteredEvents.forEach((event) => {
      const eventDateKeys = getCalendarEventDateKeys(event);

      if (event.event_dates && eventDateKeys.length > 0) {
        if (!isCalendarEventSeriesGroupable(event)) return;

        splitConsecutiveDateRuns(eventDateKeys).forEach((dateRun) => {
          if (dateRun.length < 2) return;

          const startDate = dateRun[0];
          const endDate = dateRun[dateRun.length - 1];

          spanItems.push({
            key: `event-dates:${event.id}:${startDate}:${endDate}`,
            representativeEvent: event,
            eventIds: [event.id],
            title: event.title || "",
            category: event.category,
            startDate,
            endDate,
            durationDays: dateRun.length,
          });

          dateRun.forEach((dateKey) => {
            hiddenDateKeys.add(eventDatePairKey(event.id, dateKey));
          });
        });
        return;
      }

      const startDate = getDateKeyFromValue(event.start_date || event.date);
      const endDate = getDateKeyFromValue(event.end_date || event.date || event.start_date);
      if (!startDate || !endDate || startDate !== endDate) return;

      const seriesKey = getCalendarSeriesKey(event);
      if (!seriesKey) return;

      const seriesEvents = singleDayEventsBySeries.get(seriesKey) || [];
      seriesEvents.push({ dateKey: startDate, event });
      singleDayEventsBySeries.set(seriesKey, seriesEvents);
    });

    singleDayEventsBySeries.forEach((seriesEvents, seriesKey) => {
      const eventByDate = new Map<string, AppEvent>();

      seriesEvents
        .sort((a, b) => {
          const dateCompare = a.dateKey.localeCompare(b.dateKey);
          if (dateCompare !== 0) return dateCompare;
          return String(a.event.id).localeCompare(String(b.event.id));
        })
        .forEach(({ dateKey, event }) => {
          if (!eventByDate.has(dateKey)) eventByDate.set(dateKey, event);
        });

      splitConsecutiveDateRuns(Array.from(eventByDate.keys())).forEach((dateRun) => {
        if (dateRun.length < 2) return;

        const runEvents = dateRun
          .map((dateKey) => eventByDate.get(dateKey))
          .filter((event): event is AppEvent => Boolean(event));
        const representativeEvent = runEvents[0];
        if (!representativeEvent) return;

        const startDate = dateRun[0];
        const endDate = dateRun[dateRun.length - 1];

        spanItems.push({
          key: `series:${seriesKey}:${startDate}:${endDate}`,
          representativeEvent,
          eventIds: runEvents.map((event) => event.id),
          title: representativeEvent.title || "",
          category: representativeEvent.category,
          startDate,
          endDate,
          durationDays: dateRun.length,
        });

        runEvents.forEach((event, index) => {
          hiddenDateKeys.add(eventDatePairKey(event.id, dateRun[index]));
        });
      });
    });

    return {
      spanItems: spanItems.sort(compareCalendarSpanItems),
      hiddenEventDateKeys: hiddenDateKeys,
    };
  }, [filteredEvents]);

  const calendarSpanLaneMap = useMemo(() => {
    const map = new Map<string, { lane: number; toneClass: string }>();
    const lanes: Array<{ endDate: string; spanKey: string }> = [];

    calendarSpanItems.forEach((span) => {
      let assignedLane = -1;

      for (let i = 0; i < Math.min(lanes.length, 3); i++) {
        if (lanes[i].endDate < span.startDate) {
          assignedLane = i;
          lanes[i] = { endDate: span.endDate, spanKey: span.key };
          break;
        }
      }

      if (assignedLane === -1 && lanes.length < 3) {
        assignedLane = lanes.length;
        lanes.push({ endDate: span.endDate, spanKey: span.key });
      }

      if (assignedLane === -1) return;

      map.set(span.key, {
        lane: assignedLane,
        toneClass: getCalendarEventToneClass(span.representativeEvent),
      });
    });

    return map;
  }, [calendarSpanItems]);

  // 현재 월/뷰모드 변경 시 이벤트 발생
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('calendarMonthChanged', {
      detail: {
        year: currentMonth.getFullYear(),
        month: currentMonth.getMonth(),
        viewMode
      }
    }));
  }, [currentMonth, viewMode]);

  // 월이 변경되거나 탭이 변경될 때 스크롤 처리
  useEffect(() => {
    // [Debug] 스크롤 문제 원인 파악을 위해 임시 비활성화
    // window.scrollTo({ top: 0, behavior: 'auto' });
  }, [currentMonth, tabFilter]);

  // currentMonth가 변경될 때 년도 범위 업데이트
  useEffect(() => {
    const newYear = currentMonth.getFullYear();
    if (newYear < yearRangeBase - 5 || newYear > yearRangeBase + 5) {
      setYearRangeBase(newYear);
    }
  }, [currentMonth, yearRangeBase]);

  // 이벤트 데이터 로드 (React Query가 처리하므로 불필요한 useEffect 제거)

  // Height measurement effect
  useLayoutEffect(() => {
    const updateHeight = () => {
      if (containerRef.current) {
        // Find the active slide (index 1)
        const activeSlide = containerRef.current.querySelector('[data-active-month="true"]');
        if (activeSlide) {
          const gridContainer = activeSlide.querySelector('.calendar-grid-container');
          // Prefer grid height, fallback to slide height
          const newHeight = gridContainer ? gridContainer.scrollHeight : activeSlide.scrollHeight;

          // console.log(`📊 [Height Update] New: ${newHeight}, Old: ${containerHeight}`);
          if (newHeight > 200) { // 최소한의 유효한 높이 확인
            setContainerHeight(newHeight);
          }
        }
      }
    };

    // 데이터 변경 직후와 약간의 시간을 두고 두 번 측정 (레이아웃 시프트 대응)
    updateHeight();
    const timer = setTimeout(updateHeight, 100);

    window.addEventListener('resize', updateHeight);
    return () => {
      window.removeEventListener('resize', updateHeight);
      clearTimeout(timer);
    };
  }, [currentMonth, events, socialSchedules, filteredEvents, viewMode]);

  // 이벤트 삭제 감지를 위한 이벤트 리스너 추가
  useEffect(() => {
    // [Performance Fix] 이미 queryClient.invalidateQueries()로 인해 
    // 부모 측에서 캐시 무효화 및 refetch가 발생하므로 여기서 중복 호출하지 않습니다.
    // 중복 호출은 심각한 Re-rendering 폭주를 초래합니다.
    const handleEventDeleted = () => { /* refetchCalendarData(); */ };
    const handleEventChanged = () => { /* refetchCalendarData(); */ };

    window.addEventListener("eventDeleted", handleEventDeleted);
    window.addEventListener("eventUpdated", handleEventChanged);
    window.addEventListener("eventCreated", handleEventChanged);

    return () => {
      window.removeEventListener("eventDeleted", handleEventDeleted);
      window.removeEventListener("eventUpdated", handleEventChanged);
      window.removeEventListener("eventCreated", handleEventChanged);
    };
  }, [/* refetchCalendarData */]);

  const fetchEvents = useCallback(() => {
    if (refetchCalendarData) refetchCalendarData();
  }, [refetchCalendarData]);

  // [Pure Fix] 데이터 로딩 완료 및 레이아웃(높이)이 DOM에 실제 반영된 시점 감지
  useLayoutEffect(() => {
    // 1. 로딩이 끝났고
    // 2. 데이터가 있으며
    // 3. 실제 측정된 높이가 0보다 클 때 (레이아웃 완료)
    if (!isLoading && calendarData && containerHeight && containerHeight > 0) {
      // 브라우저가 이번 레이아웃을 완전히 마친 직후에 실행
      requestAnimationFrame(() => {
        if (onDataLoaded) {
          onDataLoaded();
        }
      });
    }
  }, [isLoading, !!calendarData, containerHeight, onDataLoaded]);

  // 하이라이트된 이벤트로 스크롤 (setTimeout 대신 RAF 사용 검토 가능하나 일단 유지/최적화)
  useEffect(() => {
    if (highlightedEventId) {
      requestAnimationFrame(() => {
        const eventCard = document.querySelector(`[data-event-id="${highlightedEventId}"]`);
        if (eventCard && eventCard.isConnected) {
          // Custom scroll logic to center the element reliably
          const elementRect = getSafeRect(eventCard);
          if (!elementRect) return;
          const absoluteElementTop = elementRect.top + window.scrollY;
          const middleOfScreen = window.innerHeight / 2;
          const scrollTarget = absoluteElementTop - middleOfScreen + (elementRect.height / 2);

          window.scrollTo({
            top: Math.max(0, scrollTarget),
            behavior: 'smooth'
          });
        }
      });
    }
  }, [highlightedEventId]);

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = (firstDay.getDay() + 6) % 7;

    const days = [];

    // Add days from previous month
    if (startingDayOfWeek > 0) {
      const prevMonthLastDay = new Date(year, month, 0).getDate();
      for (let i = startingDayOfWeek - 1; i >= 0; i--) {
        days.push(new Date(year, month - 1, prevMonthLastDay - i));
      }
    }

    // Add days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(new Date(year, month, day));
    }

    // 그 달의 마지막 날이 포함된 주까지만 표시
    const lastDayOfWeek = (lastDay.getDay() + 6) % 7;
    const daysToAdd = 6 - lastDayOfWeek;
    for (let i = 1; i <= daysToAdd; i++) {
      days.push(new Date(year, month + 1, i));
    }

    return days;
  };

  // [Performance Fix] 이벤트를 날짜별로 미리 인덱싱하여 렌더링 루프(42일 * N개 이벤트) 성능 최적화
  const eventsByDate = useMemo(() => {
    const map: Record<string, AppEvent[]> = {};

    filteredEvents.forEach(event => {
      // 1. 특정 날짜들 (event_dates) 기반 인덱싱
      if (event.event_dates && event.event_dates.length > 0) {
        getCalendarEventDateKeys(event).forEach(dateStr => {
          if (!map[dateStr]) map[dateStr] = [];
          map[dateStr].push(event);
        });
      }
      // 2. 기간 (start_date ~ end_date) 기반 인덱싱
      else {
        const startStr = (event.start_date || event.date || "").substring(0, 10);
        const endStr = (event.end_date || event.date || "").substring(0, 10);

        if (startStr && endStr) {
          // 성능을 위해 문자열 비교로 범위 내 날짜들 매핑 (현재 달 범위 내만)
          // 실제로는 렌더링 시점에 map[dateStr]을 조회하므로, 필요한 모든 날짜를 채워야 함
          const curr = parseDateKey(event.start_date || event.date);
          const end = parseDateKey(event.end_date || event.date);
          if (!curr || !end) return;
          // 안전을 위해 최대 365일 제한
          let limit = 0;
          while (curr <= end && limit < 365) {
            const dateStr = getCalendarDateKey(curr);
            if (dateStr) {
              if (!map[dateStr]) map[dateStr] = [];
              map[dateStr].push(event);
            }
            curr.setDate(curr.getDate() + 1);
            limit++;
          }
        }
      }
    });

    // 각 날짜별 이벤트 미리 정렬 (기간이 긴 순 -> 가중치(ID) 순)
    Object.keys(map).forEach(dateStr => {
      map[dateStr].sort((a, b) => {
        const getDur = (e: AppEvent) => {
          const start = parseDateKey(e.start_date || e.date);
          const end = parseDateKey(e.end_date || e.date);
          return (end?.getTime() || 0) - (start?.getTime() || 0);
        };
        const durA = getDur(a);
        const durB = getDur(b);
        if (durB !== durA) return durB - durA;
        return String(a.id).localeCompare(String(b.id)); // ID로 안정적인 정렬
      });
    });

    return map;
  }, [filteredEvents]);

  const getEventsForDate = useCallback((date: Date) => {
    const dateString = getCalendarDateKey(date);
    if (!dateString) return [];
    return eventsByDate[dateString] || [];
  }, [eventsByDate]);

  const isToday = (date: Date) => {
    return getCalendarDateKey(date) === getCalendarTodayDateKey();
  };

  const handleFullscreenDateClick = (date: Date, clickEvent?: React.MouseEvent) => {
    const dayEvents = getEventsForDate(date);

    if (isMapView && onDateClickWithEvents) {
      onDateClickWithEvents(date, dayEvents);
      return;
    }

    const clickPosition = clickEvent
      ? { x: clickEvent.clientX, y: clickEvent.clientY }
      : undefined;

    window.dispatchEvent(
      new CustomEvent("fullscreenDateClick", {
        detail: { date, clickPosition },
      })
    );
  };

  const handleEventCreated = (createdDate: Date) => {
    fetchEvents();
    onEventsUpdate?.(createdDate);
  };

  // 이전 달, 현재 달, 다음 달의 날짜들을 생성
  const prevMonth = new Date(
    currentMonth.getFullYear(),
    currentMonth.getMonth() - 1,
    1,
  );
  const nextMonth = new Date(
    currentMonth.getFullYear(),
    currentMonth.getMonth() + 1,
    1,
  );

  const prevDays = getDaysInMonth(prevMonth);
  const currentDays = getDaysInMonth(currentMonth);
  const nextDays = getDaysInMonth(nextMonth);

  // 날짜 숫자 클릭 핸들러
  const handleDateNumberClick = (e: React.MouseEvent, date: Date) => {
    e.stopPropagation(); // 부모 셀의 클릭 이벤트(전체화면 모드 등) 방지

    const dayEvents = getEventsForDate(date);
    debugFullEventCalendar(`[Calendar] Clicked Date: ${date.toISOString().split('T')[0]}, Events Count: ${dayEvents.length}, Map Mode: ${isMapView}`);

    // [New] 지도 뷰 모드일 경우 지도 모달 호출 (모든 이벤트 표시)
    if (isMapView && onDateClickWithEvents) {
      debugFullEventCalendar('[Calendar] Calling map modal with all events...');
      onDateClickWithEvents(date, dayEvents);
      return;
    }

    if (dayEvents && dayEvents.length > 0) {
      // 선택된 날짜 업데이트 (필요한 경우)
      onDateSelect(date);
      setModalEvents(dayEvents);
      setShowDateModal(true);
    }
  };

  const renderCalendarSpanOverlay = (days: Date[]) => {
    const weekCount = Math.ceil(days.length / 7);
    const titleSegments: Array<{
      spanKey: string;
      title: string;
      lane: number;
      weekRow: number;
      startCol: number;
      span: number;
      toneClass: string;
      representativeEvent: AppEvent;
      dateKey: string;
    }> = [];

    for (let weekRow = 0; weekRow < weekCount; weekRow++) {
      const weekStartIndex = weekRow * 7;
      const weekDays = days.slice(weekStartIndex, weekStartIndex + 7);
      const weekStartDate = getCalendarDateKey(weekDays[0]);
      const weekEndDate = getCalendarDateKey(weekDays[weekDays.length - 1]);
      if (!weekStartDate || !weekEndDate) continue;

      calendarSpanItems
        .filter((span) => span.endDate >= weekStartDate && span.startDate <= weekEndDate)
        .sort((a, b) => {
          const laneA = calendarSpanLaneMap.get(a.key)?.lane ?? 99;
          const laneB = calendarSpanLaneMap.get(b.key)?.lane ?? 99;
          if (laneA !== laneB) return laneA - laneB;
          return compareCalendarSpanItems(a, b);
        })
        .forEach((span) => {
          const laneInfo = calendarSpanLaneMap.get(span.key);
          if (!laneInfo || laneInfo.lane >= 3) return;

          const segmentStartDate = span.startDate > weekStartDate ? span.startDate : weekStartDate;
          const segmentEndDate = span.endDate < weekEndDate ? span.endDate : weekEndDate;
          const startCol = diffDateDays(weekStartDate, segmentStartDate);
          const segmentSpan = Math.max(1, diffDateDays(segmentStartDate, segmentEndDate) + 1);

          titleSegments.push({
            spanKey: span.key,
            title: span.title,
            lane: laneInfo.lane,
            weekRow,
            startCol,
            span: segmentSpan,
            toneClass: laneInfo.toneClass,
            representativeEvent: span.representativeEvent,
            dateKey: segmentStartDate,
          });
        });
    }

    if (titleSegments.length === 0) return null;

    return (
      <div className="calendar-overlay-container">
        {titleSegments.map((segment) => (
          <div
            key={`${segment.spanKey}-${segment.weekRow}`}
            className={`calendar-overlay-item ${segment.weekRow === 0 ? 'calendar-overlay-first-week' : ''} ${segment.toneClass}`}
            style={{
              gridColumn: `${segment.startCol + 1} / span ${segment.span}`,
              gridRow: segment.weekRow + 1,
              '--lane-offset': `${segment.lane * 20}px`,
            } as React.CSSProperties}
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              const segmentDate = parseDateKey(segment.dateKey) || parseDateKey(segment.representativeEvent.start_date || segment.representativeEvent.date) || new Date();
              onEventClick(segment.representativeEvent, segmentDate, getEventsForDate(segmentDate));
            }}
            onKeyDown={(e) => {
              if (e.key !== "Enter" && e.key !== " ") return;
              e.preventDefault();
              e.stopPropagation();
              const segmentDate = parseDateKey(segment.dateKey) || parseDateKey(segment.representativeEvent.start_date || segment.representativeEvent.date) || new Date();
              onEventClick(segment.representativeEvent, segmentDate, getEventsForDate(segmentDate));
            }}
          >
            <span className="calendar-overlay-title">{segment.title}</span>
          </div>
        ))}
      </div>
    );
  };

  // 전체화면 모드 그리드 렌더링
  const renderFullscreenGrid = (days: Date[], monthDate: Date) => {
    const cellHeight = getCellHeight(monthDate);

    return days.map((day, index) => {
      const isLastRow = index >= days.length - 7;
      const isOutsideMonth = day.getMonth() !== monthDate.getMonth();
      const dayEvents = getEventsForDate(day);
      const dateString = getCalendarDateKey(day) || "";
      const spanLanesForDate = calendarSpanItems
        .filter((span) => isDateInCalendarSpan(span, dateString))
        .map((span) => calendarSpanLaneMap.get(span.key)?.lane)
        .filter((lane): lane is number => typeof lane === "number" && lane < 3);
      const reservedSpanLanes = spanLanesForDate.length > 0 ? Math.max(...spanLanesForDate) + 1 : 0;

      return (
        <CalendarCell
          key={day.toISOString()}
          day={day}
          isToday={isToday(day)}
          isLastRow={isLastRow}
          isOutsideMonth={isOutsideMonth}
          cellHeight={cellHeight}
          gridColumn={(index % 7) + 1}
          gridRow={Math.floor(index / 7) + 1}
          events={dayEvents}
          hiddenEventDateKeys={hiddenEventDateKeys}
          reservedSpanLanes={reservedSpanLanes}
          highlightedEventId={highlightedEventId}
          onDateClick={handleFullscreenDateClick}
          onDateNumberClick={handleDateNumberClick}
          onEventClick={onEventClick}
          t={t}
        />
      );
    });
  };

  const weekdayLabels = ['월', '화', '수', '목', '금', '토', '일'];

  const renderYearView = () => {
    const years = Array.from({ length: 11 }, (_, i) => yearRangeBase - 5 + i);
    const selectedYear = currentMonth.getFullYear();

    return (
      <div className="calendar-year-view-container">
        <div className="calendar-year-grid">
          {years.map((year) => {
            const isSelected = selectedYear === year;
            return (
              <button
                key={year}
                onClick={() => {
                  const newDate = new Date(year, 0, 1);
                  if (onMonthChange) onMonthChange(newDate);
                  onDateSelect(null);
                }}
                className={`calendar-year-button ${isSelected ? "selected" : "default"}`}
              >
                {year}년
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <>
      <div data-calendar className="calendar-main-container" style={layoutCssVars as React.CSSProperties}>
        {viewMode === "year" ? (
          <div className="calendar-flex-1 calendar-overflow-y-auto">{renderYearView()}</div>
        ) : (
          <div
            className="calendar-carousel-container calendar-mode-fullscreen"
            style={{
              '--container-height': viewMode === 'month' ? (containerHeight ? `${containerHeight}px` : 'auto') : 'auto',
            } as any}
          >
            <div
              ref={containerRef}
              className={`calendar-carousel-track ${effectiveIsAnimating ? 'is-animating' : ''}`}
              style={{
                '--drag-offset': `${effectiveDragOffset}px`,
              } as any}
            >
              {[prevMonth, currentMonth, nextMonth].map((month, idx) => {
                const isCurrentMonth = idx === 1;
                const days = idx === 0 ? prevDays : idx === 1 ? currentDays : nextDays;

                // [Optimization] 애니메이션 중이 아닐 때 비활성 달은 렌더링하지 않음 (로딩 부하 감소)
                const shouldRenderContent = isCurrentMonth || effectiveIsAnimating;

                return (
                  <div
                    key={`${month.getFullYear()}-${month.getMonth()}`}
                    className="calendar-month-slide"
                    data-active-month={isCurrentMonth}
                    style={!isCurrentMonth && !effectiveIsAnimating ? { height: 0, overflow: 'hidden' } : {}}
                  >
                    {shouldRenderContent && (
                      <>
                        <div className="calendar-month-head" aria-hidden="true">
                          {weekdayLabels.map((dayLabel) => (
                            <span key={dayLabel}>{dayLabel}</span>
                          ))}
                        </div>
                        <div
                          className="calendar-grid-container"
                          style={{
                            '--weeks-count': getActualWeeksCount(month),
                          } as any}
                        >
                          {renderFullscreenGrid(days, month)}
                          {renderCalendarSpanOverlay(days)}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {showRegistrationModal && selectedDate && (
        <EventRegistrationModal
          isOpen={showRegistrationModal}
          onClose={() => setShowRegistrationModal(false)}
          selectedDate={selectedDate}
          onEventCreated={handleEventCreated}
        />
      )}

      {/* Date Events Modal */}
      <DateEventsModal
        isOpen={showDateModal}
        onClose={() => setShowDateModal(false)}
        date={selectedDate}
        events={modalEvents}
        onEventClick={(event) => {
          setShowDateModal(false);
          const clickedDate = selectedDate ?? new Date(event.start_date || event.date || Date.now());
          onEventClick(event, clickedDate, modalEvents);
        }}
      />
    </>
  );
});
