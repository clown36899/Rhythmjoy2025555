import { useState, useEffect, useCallback, memo, useMemo, useRef, useLayoutEffect } from "react";
import { useTranslation } from "react-i18next";
import type { Event as AppEvent } from "../../../lib/supabase";
import { useCalendarEventsQuery } from "../../../hooks/queries/useCalendarEventsQuery";
import EventRegistrationModal from "../../../components/EventRegistrationModal";
import DateEventsModal from "./DateEventsModal";
import "../styles/FullEventCalendar.css";
// import { getEventThumbnail } from "../../../utils/getEventThumbnail"; // Removed unused import
// import { useDefaultThumbnail } from "../../../hooks/useDefaultThumbnail"; // Removed unused import

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
  onEventClick: (event: AppEvent) => void;
  onEventsUpdate?: (createdDate?: Date) => void;
  isAdminMode?: boolean;
  selectedCategory?: string;
  highlightedEventId?: number | string | null;
  hoveredEventId?: number | string | null;
  tabFilter?: 'all' | 'social-events' | 'classes' | 'overseas';
  seed?: number;
  onDataLoaded?: () => void;
  // 부모로부터 전달받는 데이터 프롭스 추가
  calendarData?: any;
  isLoading?: boolean;
  refetchCalendarData?: () => void;
}

// [Performance Fix] 개별 날짜 셀을 위한 메모이제이션된 컴포넌트
const CalendarCell = memo(({
  day,
  isToday,
  isLastRow,
  cellHeight,
  events,
  highlightedEventId,
  getEventColor,
  onDateClick,
  onDateNumberClick,
  onEventClick,
  t // translations
}: {
  day: Date;
  isToday: boolean;
  isLastRow: boolean;
  cellHeight: number;
  events: AppEvent[];
  highlightedEventId: number | string | null;
  getEventColor: (id: number | string) => string;
  onDateClick: (date: Date, e?: React.MouseEvent) => void;
  onDateNumberClick: (e: React.MouseEvent, date: Date) => void;
  onEventClick: (event: AppEvent) => void;
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

  const year = day.getFullYear();
  const month = String(day.getMonth() + 1).padStart(2, "0");
  const dayNum = String(day.getDate()).padStart(2, "0");
  const dateString = `${year}-${month}-${dayNum}`;

  return (
    <div
      data-date={dateString}
      id={isToday ? 'calendar-today-cell' : undefined}
      onClick={(e) => onDateClick(day, e)}
      className={`calendar-cell-fullscreen ${isToday ? 'is-today' : ''} ${isLastRow ? 'is-last-row' : ''}`}
      style={{ '--cell-min-height': `${cellHeight}px` } as any}
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
              {isToday ? t('today') : t(`weekdays.${['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][day.getDay()]}`)}
            </span>
            <span className="fixed-part ko" translate="no">
              {(() => { const days = ['일', '월', '화', '수', '목', '금', '토']; return isToday ? '오늘' : days[day.getDay()]; })()}
            </span>
            <span className="fixed-part en" translate="no">
              {(() => { const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']; return isToday ? 'Today' : days[day.getDay()]; })()}
            </span>
          </span>
        </span>
      </div>

      <div className="calendar-cell-fullscreen-body">
        {shouldRenderEvents ? (
          events.map((event) => {
            const categoryColor = getEventColor(event.id);
            const thumbnailUrl = event.image_thumbnail || event.image_micro || event.image_medium;
            const isSocialEvent = event.is_social_integrated || event.category === 'social' || String(event.id).startsWith('social-');
            const locationText = isSocialEvent ? (event.place_name || event.location || '') : '';

            const eStart = (event.start_date || event.date || '').substring(0, 10);
            const eEnd = (event.end_date || event.date || '').substring(0, 10);

            const isContinueLeft = eStart < dateString;
            const isContinueRight = eEnd > dateString;

            return (
              <div
                key={event.id}
                className={`calendar-fullscreen-event-card ${isContinueLeft ? 'calendar-event-continue-left' : ''} ${isContinueRight ? 'calendar-event-continue-right' : ''}`}
                data-event-id={event.id}
                role="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onEventClick(event);
                }}
              >
                <div className="calendar-fullscreen-card-inner">
                  {thumbnailUrl ? (
                    <div className={`calendar-fullscreen-image-container ${highlightedEventId === event.id ? 'calendar-event-highlighted' : ''}`}>
                      <img
                        src={thumbnailUrl}
                        alt=""
                        className="calendar-fullscreen-image"
                        loading="lazy"
                        decoding="async"
                        draggable="false"
                      />
                      {locationText && (
                        <span className="calendar-fullscreen-location-overlay">
                          {locationText}
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className={`calendar-fullscreen-placeholder ${categoryColor} ${highlightedEventId === event.id ? 'calendar-event-highlighted' : ''}`}>
                      <span className="calendar-placeholder-text">
                        {event.title.charAt(0)}
                      </span>
                    </div>
                  )}
                </div>
                <div className="calendar-fullscreen-title-container">
                  <div className="calendar-fullscreen-title">{event.title}</div>
                </div>
              </div>
            );
          })
        ) : (
          /* [Skeleton One-shot Fix] 렌더링 전 높이 확보용 스켈레톤 */
          events.map((event) => (
            <div
              key={`skeleton-${event.id}`}
              className="calendar-fullscreen-event-card skeleton"
              style={{ opacity: 0 }} /* 공간만 차지하도록 */
            >
              <div className="calendar-fullscreen-card-inner">
                <div className="calendar-fullscreen-image-container" />
              </div>
              <div className="calendar-fullscreen-title-container">
                <div className="calendar-fullscreen-title">&nbsp;</div>
              </div>
            </div>
          ))
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
  seed = 42,
  onDataLoaded,
  calendarData,
  isLoading,
  refetchCalendarData,
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

  // Dynamic Height State
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState<number | undefined>(undefined);

  // 실제 필요한 주 수 계산 (전체 달력 모드용)
  const getActualWeeksCount = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startingDayOfWeek = firstDay.getDay();
    const daysInMonth = lastDay.getDate();
    const totalDays = startingDayOfWeek + daysInMonth;
    return Math.ceil(totalDays / 7);
  };

  // 달력 셀 높이 계산 함수
  // 이전 로직: 화면 높이에 맞춰서 늘림 -> 문제: 이벤트가 적어도 강제로 늘어남
  // 수정 로직: 최소 높이만 보장하고 컨텐츠에 맞게 늘어나도록 함 (30px은 기본 헤더/날짜 높이)
  const getCellHeight = (monthDate: Date) => {
    // [Fix] Page.tsx의 수학적 스크롤 계산과 100% 일치하도록 보정
    // 이벤트가 없으면 불필요하게 늘리지 않고 최소 높이(30px)만 유지
    return 30;
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
    // 소셜 스케줄을 이벤트 형식으로 변환 (정규 스케줄 제외)
    const socialEvents = socialSchedules
      .filter(schedule => schedule.day_of_week === null || schedule.day_of_week === undefined)
      .map(schedule => ({
        ...schedule, // events 테이블의 모든 필드 유지
        source: 'events' as const, // 원본 소스는 이제 events 테이블임
        location: schedule.place_name || schedule.location || '',
      })) as any[];

    let combined: any[] = [];

    if (tabFilter === 'overseas') {
      // 국외: scope가 'overseas'인 것만 포함
      const overseasEvents = events.filter(event => event.scope === 'overseas');
      // socialSchedules는 기본적으로 국내라고 가정하므로 제외하거나, 추후 scope 추가 시 로직 변경
      // 현재는 events 테이블의 scope만 활용
      combined = [...overseasEvents];
    } else {
      // 그 외 탭(전체, 소셜, 강습): 국외 행사 제외 (scope !== 'overseas')
      // 사용자가 "글로벌 행사는 거기서만 표시하게"라고 했으므로 여기서 제외함
      const domesticEvents = categoryFilteredEvents.filter(e => e.scope !== 'overseas');

      // socialSchedules는 scope 필드가 없거나 domestic으로 간주
      // (만약 social_schedules에도 scope가 있다면 여기서 필터링 필요)

      if (tabFilter === 'all') {
        combined = [...domesticEvents, ...socialEvents];
      } else if (tabFilter === 'social-events') {
        const nonClassEvents = domesticEvents.filter(event =>
          event.category !== 'class' && event.category !== 'regular' && event.category !== 'club'
        );
        const nonClassSocialEvents = socialEvents.filter(event =>
          event.category !== 'class' && event.category !== 'regular' && event.category !== 'club'
        );
        combined = [...nonClassEvents, ...nonClassSocialEvents];
      } else if (tabFilter === 'classes') {
        const classEvents = domesticEvents.filter(event =>
          event.category === 'class' || event.category === 'regular' || event.category === 'club'
        );
        const classSocialEvents = socialEvents.filter(event =>
          event.category === 'class' || event.category === 'regular' || event.category === 'club'
        );
        combined = [...classEvents, ...classSocialEvents];
      }
    }

    return combined as AppEvent[];
  }, [categoryFilteredEvents, socialSchedules, tabFilter, events]);

  // 현재 달의 이벤트별 색상 맵 생성
  const eventColorMap = useMemo(() => {
    const colors = [
      'calendar-bg-red-500', 'calendar-bg-orange-500', 'calendar-bg-amber-500', 'calendar-bg-yellow-500',
      'calendar-bg-lime-500', 'calendar-bg-green-500', 'calendar-bg-emerald-500', 'calendar-bg-teal-500',
      'calendar-bg-cyan-500', 'calendar-bg-sky-500', 'calendar-bg-blue-500', 'calendar-bg-indigo-500',
      'calendar-bg-violet-500', 'calendar-bg-purple-500', 'calendar-bg-fuchsia-500', 'calendar-bg-pink-500',
      'calendar-bg-rose-500', 'calendar-bg-red-600', 'calendar-bg-orange-600', 'calendar-bg-amber-600',
      'calendar-bg-yellow-600', 'calendar-bg-lime-600', 'calendar-bg-green-600', 'calendar-bg-emerald-600',
      'calendar-bg-teal-600', 'calendar-bg-cyan-600', 'calendar-bg-sky-600', 'calendar-bg-indigo-600',
      'calendar-bg-violet-600', 'calendar-bg-purple-600', 'calendar-bg-fuchsia-600', 'calendar-bg-pink-600'
    ];

    const map = new Map<number | string, string>();
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;

    // 현재 달에 표시되는 모든 이벤트 수집
    const currentMonthEvents = filteredEvents.filter(event => {
      // event_dates 배열 체크
      if (event.event_dates && event.event_dates.length > 0) {
        return event.event_dates.some(dateStr => dateStr.startsWith(monthStr));
      }

      // start_date/end_date 체크
      const startDate = event.start_date || event.date || '';
      const endDate = event.end_date || event.date || '';

      if (!startDate || !endDate) return false;

      const monthStart = `${monthStr}-01`;
      const monthEnd = `${monthStr}-31`;

      return (startDate <= monthEnd && endDate >= monthStart);
    });

    // ID 순으로 정렬하여 일관성 유지
    currentMonthEvents.sort((a, b) => String(a.id).localeCompare(String(b.id)));

    // 각 이벤트에 순차적으로 다른 색상 할당
    currentMonthEvents.forEach((event, index) => {
      map.set(event.id, colors[index % colors.length]);
    });

    return map;
  }, [filteredEvents, currentMonth]);

  // 이벤트 색상 가져오기 함수
  const getEventColor = (eventId: number | string) => {
    return eventColorMap.get(eventId) || 'calendar-bg-gray-500';
  };

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
    const handleEventDeleted = () => refetchCalendarData();
    const handleEventChanged = () => refetchCalendarData();

    window.addEventListener("eventDeleted", handleEventDeleted);
    window.addEventListener("eventUpdated", handleEventChanged);
    window.addEventListener("eventCreated", handleEventChanged);

    return () => {
      window.removeEventListener("eventDeleted", handleEventDeleted);
      window.removeEventListener("eventUpdated", handleEventChanged);
      window.removeEventListener("eventCreated", handleEventChanged);
    };
  }, [refetchCalendarData]);

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
        if (eventCard) {
          eventCard.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
            inline: 'nearest'
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
    const startingDayOfWeek = firstDay.getDay();

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
    const lastDayOfWeek = lastDay.getDay();
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
        const sortedDates = [...event.event_dates].sort();
        const isClass = event.category && ['class', 'regular', 'club'].includes(event.category.toLowerCase());

        event.event_dates.forEach(d => {
          const dateStr = d.substring(0, 10);
          // 강습은 첫 번째 날짜에만 표시하도록 원본 로직 유지
          if (isClass && dateStr !== sortedDates[0].substring(0, 10)) return;

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
          let curr = new Date(startStr);
          const end = new Date(endStr);
          // 안전을 위해 최대 365일 제한
          let limit = 0;
          while (curr <= end && limit < 365) {
            const dateStr = curr.toISOString().split('T')[0];
            if (!map[dateStr]) map[dateStr] = [];
            map[dateStr].push(event);
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
          const s = new Date(e.start_date || e.date || '').getTime();
          const e_time = new Date(e.end_date || e.date || '').getTime();
          return e_time - s;
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
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const dateString = `${year}-${month}-${day}`;
    return eventsByDate[dateString] || [];
  }, [eventsByDate]);

  const isToday = (date: Date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const handleFullscreenDateClick = (date: Date, clickEvent?: React.MouseEvent) => {
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
    if (dayEvents && dayEvents.length > 0) {
      // 선택된 날짜 업데이트 (필요한 경우)
      onDateSelect(date);
      setModalEvents(dayEvents);
      setShowDateModal(true);
    }
  };

  // 전체화면 모드 그리드 렌더링
  const renderFullscreenGrid = (days: Date[], monthDate: Date) => {
    const cellHeight = getCellHeight(monthDate);

    return days.map((day, index) => {
      const isLastRow = index >= days.length - 7;
      const dayEvents = getEventsForDate(day);

      return (
        <CalendarCell
          key={day.toISOString()}
          day={day}
          isToday={isToday(day)}
          isLastRow={isLastRow}
          cellHeight={cellHeight}
          events={dayEvents}
          highlightedEventId={highlightedEventId}
          getEventColor={getEventColor}
          onDateClick={handleFullscreenDateClick}
          onDateNumberClick={handleDateNumberClick}
          onEventClick={onEventClick}
          t={t}
        />
      );
    });
  };

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
      <div data-calendar className="calendar-main-container">
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

                // [Optimization] 지연 렌더링 구현 (초기 부하 분산)
                // 현재 달이 아닌 슬라이드는 마운트 직후 약간의 지연 시간을 두고 렌더링을 허용함
                const [shouldRender, setShouldRender] = useState(isCurrentMonth);

                useEffect(() => {
                  if (!isCurrentMonth) {
                    const timer = setTimeout(() => setShouldRender(true), 300);
                    return () => clearTimeout(timer);
                  }
                }, [isCurrentMonth]);

                if (!shouldRender) {
                  return <div key={`${month.getFullYear()}-${month.getMonth()}`} className="calendar-month-slide" />;
                }

                const days = idx === 0 ? prevDays : idx === 1 ? currentDays : nextDays;
                return (
                  <div
                    key={`${month.getFullYear()}-${month.getMonth()}`}
                    className="calendar-month-slide"
                    data-active-month={isCurrentMonth}
                  >
                    <div
                      className="calendar-grid-container"
                      style={{
                        '--weeks-count': getActualWeeksCount(month),
                      } as any}
                    >
                      {renderFullscreenGrid(days, month)}
                    </div>
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
          if (onEventClick) onEventClick(event);
        }}
      />
    </>
  );
});
