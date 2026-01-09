import { useState, useEffect, useCallback, memo, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { CSSProperties } from "react";
import { supabase } from "../../../lib/supabase";
import type { Event as AppEvent } from "../../../lib/supabase";
import EventRegistrationModal from "../../../components/EventRegistrationModal";
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
  tabFilter?: 'all' | 'social-events' | 'classes';
}

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
}: FullEventCalendarProps) {
  const { t } = useTranslation();
  const [events, setEvents] = useState<AppEvent[]>([]);
  const [socialSchedules, setSocialSchedules] = useState<any[]>([]);
  const [showRegistrationModal, setShowRegistrationModal] = useState(false);
  const [yearRangeBase, setYearRangeBase] = useState(new Date().getFullYear());
  // const { defaultThumbnailClass, defaultThumbnailEvent } = useDefaultThumbnail(); // Removed unused hook

  // Internal state for swipe gestures
  const [internalDragOffset, _setInternalDragOffset] = useState(0);
  const [internalIsAnimating, _setInternalIsAnimating] = useState(false);

  // Use external props if provided, otherwise use internal state
  const effectiveDragOffset = dragOffset !== undefined ? dragOffset : internalDragOffset;
  const effectiveIsAnimating = isAnimating !== undefined ? isAnimating : internalIsAnimating;

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

  // 달력 셀 높이 계산 함수 (각 달마다 개별 계산)
  const getCellHeight = (monthDate: Date) => {
    if (!calendarHeightPx) return 100;
    return Math.max(30, (calendarHeightPx - 16) / getActualWeeksCount(monthDate));
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
        id: schedule.id + 10000000,
        title: schedule.title,
        date: schedule.date,
        start_date: schedule.date,
        end_date: schedule.date,
        event_dates: schedule.date ? [schedule.date] : [],
        category: schedule.v2_category || 'club', // v2_category 사용, 기본값 'club'
        image_micro: schedule.image_micro,
        image_thumbnail: schedule.image_thumbnail,
        image_medium: schedule.image_medium,
        source: 'social_schedules' as const,
        location: schedule.place_name || '',
        venue_id: schedule.venue_id ? String(schedule.venue_id) : null,
      })) as any[];

    let combined: any[] = [];

    if (tabFilter === 'all') {
      combined = [...categoryFilteredEvents, ...socialEvents];
    } else if (tabFilter === 'social-events') {
      // 소셜&행사: 강습 관련 카테고리(class, regular, club)를 모두 제외
      const nonClassEvents = categoryFilteredEvents.filter(event =>
        event.category !== 'class' && event.category !== 'regular' && event.category !== 'club'
      );
      const nonClassSocialEvents = socialEvents.filter(event =>
        event.category !== 'class' && event.category !== 'regular' && event.category !== 'club'
      );
      combined = [...nonClassEvents, ...nonClassSocialEvents];
    } else if (tabFilter === 'classes') {
      // 강습: 강습 관련 카테고리(class, regular, club)를 모두 포함
      const classEvents = categoryFilteredEvents.filter(event =>
        event.category === 'class' || event.category === 'regular' || event.category === 'club'
      );
      const classSocialEvents = socialEvents.filter(event =>
        event.category === 'class' || event.category === 'regular' || event.category === 'club'
      );
      combined = [...classEvents, ...classSocialEvents];
    }

    return combined as AppEvent[];
  }, [categoryFilteredEvents, socialSchedules, tabFilter]);

  // 현재 달의 이벤트별 색상 맵 생성
  const eventColorMap = useMemo(() => {
    const colors = [
      'cal-bg-red-500', 'cal-bg-orange-500', 'cal-bg-amber-500', 'cal-bg-yellow-500',
      'cal-bg-lime-500', 'cal-bg-green-500', 'cal-bg-emerald-500', 'cal-bg-teal-500',
      'cal-bg-cyan-500', 'cal-bg-sky-500', 'cal-bg-blue-500', 'cal-bg-indigo-500',
      'cal-bg-violet-500', 'cal-bg-purple-500', 'cal-bg-fuchsia-500', 'cal-bg-pink-500',
      'cal-bg-rose-500', 'cal-bg-red-600', 'cal-bg-orange-600', 'cal-bg-amber-600',
      'cal-bg-yellow-600', 'cal-bg-lime-600', 'cal-bg-green-600', 'cal-bg-emerald-600',
      'cal-bg-teal-600', 'cal-bg-cyan-600', 'cal-bg-sky-600', 'cal-bg-indigo-600',
      'cal-bg-violet-600', 'cal-bg-purple-600', 'cal-bg-fuchsia-600', 'cal-bg-pink-600'
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
    return eventColorMap.get(eventId) || 'cal-bg-gray-500';
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

  // currentMonth가 변경될 때 년도 범위 업데이트
  useEffect(() => {
    const newYear = currentMonth.getFullYear();
    if (newYear < yearRangeBase - 5 || newYear > yearRangeBase + 5) {
      setYearRangeBase(newYear);
    }
  }, [currentMonth, yearRangeBase]);

  // 이벤트 데이터 로드
  useEffect(() => {
    fetchEvents();
  }, [currentMonth]);

  // 이벤트 삭제 감지를 위한 이벤트 리스너 추가
  useEffect(() => {
    const handleEventDeleted = () => fetchEvents();
    const handleEventChanged = () => fetchEvents();

    window.addEventListener("eventDeleted", handleEventDeleted);
    window.addEventListener("eventUpdated", handleEventChanged);
    window.addEventListener("eventCreated", handleEventChanged);

    return () => {
      window.removeEventListener("eventDeleted", handleEventDeleted);
    };
  }, []);

  const fetchEvents = useCallback(async () => {
    try {
      const startOfRange = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1);
      const endOfRange = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 2, 0);
      const startDateStr = startOfRange.toISOString().split('T')[0];
      const endDateStr = endOfRange.toISOString().split('T')[0];
      const columns = "id,title,date,start_date,end_date,event_dates,category,image_micro";

      // Fetch V2 events
      const eventsPromise = supabase
        .from("events")
        .select(columns)
        .or(`and(start_date.gte.${startDateStr},start_date.lte.${endDateStr}),and(end_date.gte.${startDateStr},end_date.lte.${endDateStr}),and(date.gte.${startDateStr},date.lte.${endDateStr})`)
        .order("start_date", { ascending: true, nullsFirst: false })
        .order("date", { ascending: true, nullsFirst: false });

      // Fetch social schedules (excluding regular schedules with day_of_week)
      const socialSchedulesPromise = supabase
        .from("social_schedules")
        .select("id,title,date,image_micro,image_thumbnail,image_medium,day_of_week,place_name,venue_id,v2_category")
        .gte("date", startDateStr)
        .lte("date", endDateStr)
        .order("date", { ascending: true });

      const [eventsResult, socialResult] = await Promise.all([eventsPromise, socialSchedulesPromise]);

      if (eventsResult.error) {
        console.error("Error fetching events:", eventsResult.error);
      } else {
        // console.log("📅 [FullEventCalendar] Fetched events:", eventsResult.data?.length);
        setEvents((eventsResult.data || []) as AppEvent[]);
      }

      if (socialResult.error) {
        console.error("Error fetching social schedules:", socialResult.error);
      } else {
        // console.log("📅 [FullEventCalendar] Fetched social schedules:", socialResult.data?.length);
        setSocialSchedules(socialResult.data || []);
      }
    } catch (error) {
      console.error("Error:", error);
    }
  }, [currentMonth]);

  // 하이라이트된 이벤트로 스크롤
  useEffect(() => {
    if (highlightedEventId) {
      setTimeout(() => {
        const eventCard = document.querySelector(`[data-event-id="${highlightedEventId}"]`);

        if (eventCard) {
          // Try simple scrollIntoView first
          eventCard.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
            inline: 'nearest'
          });
        }
      }, 300);
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

  const getEventsForDate = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const dateString = `${year}-${month}-${day}`;

    return filteredEvents.filter((event) => {
      // 특정 날짜 모드
      if (event.event_dates && event.event_dates.length > 0) {
        // 강습(class, regular, club)은 개별 선택된 날짜 중 첫 번째 날짜에만 표시
        const isClass = event.category && (event.category.toLowerCase() === 'class' || event.category === 'regular' || event.category === 'club');

        if (isClass) {
          // event_dates 배열을 정렬하여 첫 번째(가장 이른) 날짜만 사용
          const sortedDates = [...event.event_dates].sort();
          const firstDate = sortedDates[0];
          return dateString === firstDate;
        }
        // 행사(event) 등 나머지는 등록된 모든 날짜 표시
        return event.event_dates.some((d: string) => d.startsWith(dateString));
      }
      // 연속 기간 모드
      const startDate = (event.start_date || event.date || "").substring(0, 10);
      const endDate = (event.end_date || event.date || "").substring(0, 10);
      return (
        startDate && endDate && dateString >= startDate && dateString <= endDate
      );
    });
  };

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

  // 전체화면 모드 그리드 렌더링
  const renderFullscreenGrid = (days: Date[], monthDate: Date) => {
    return days.map((day, index) => {
      const year = day.getFullYear();
      const month = String(day.getMonth() + 1).padStart(2, "0");
      const dayNum = String(day.getDate()).padStart(2, "0");
      const dateString = `${year}-${month}-${dayNum}`;
      const todayFlag = isToday(day);
      const isLastRow = index >= days.length - 7;
      const dayEvents = getEventsForDate(day);

      return (
        <div
          key={dateString}
          onClick={(e) => handleFullscreenDateClick(day, e)}
          className="calendar-cell-fullscreen"
          style={{
            minHeight: `${getCellHeight(monthDate)}px`,
            height: '100%',
            paddingBottom: isLastRow ? 'calc(60px + env(safe-area-inset-bottom))' : undefined
          }}
        >
          {/* 헤더: 날짜 숫자 */}
          <div className="calendar-cell-fullscreen-header">
            <span
              className={`calendar-date-number-fullscreen ${todayFlag
                ? "calendar-date-number-today"
                : day.getDay() === 0
                  ? "calendar-date-sunday"
                  : day.getDay() === 6
                    ? "calendar-date-saturday"
                    : ""
                }`}
            >
              <span style={{ marginRight: '2px' }}>{day.getDate()}</span>
              <div className="weekday-wrapper" style={{ fontSize: '10px', fontWeight: 'normal' }}>
                <span className="translated-part">
                  {todayFlag ? t('today') : t(`weekdays.${['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][day.getDay()]}`)}
                </span>
                {/* User defined short forms for each language */}
                <span className="fixed-part ko" translate="no">
                  {(() => { const days = ['일', '월', '화', '수', '목', '금', '토']; return todayFlag ? '오늘' : days[day.getDay()]; })()}
                </span>
                <span className="fixed-part en" translate="no">
                  {(() => { const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']; return todayFlag ? 'Today' : days[day.getDay()]; })()}
                </span>
              </div>
            </span>
          </div>

          {/* 바디: 이벤트 리스트 */}
          <div className="calendar-cell-fullscreen-body">
            {dayEvents.map((event) => {
              const categoryColor = getEventColor(event.id);
              // 사용자 요청: 전체 달력은 무조건 마이크로 이미지만 사용 (큰 이미지 로딩 방지)
              // image_micro가 없으면 아예 이미지를 표시하지 않음 (placeholder 사용)
              const thumbnailUrl = event.image_micro;



              return (
                <div
                  key={event.id}
                  className="calendar-fullscreen-event-card"
                  data-event-id={event.id}
                  role="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onEventClick) onEventClick(event);
                  }}
                >
                  <div style={{ position: 'relative', width: '100%' }}>
                    {thumbnailUrl ? (
                      <div className={`calendar-fullscreen-image-container ${highlightedEventId === event.id ? 'calendar-event-highlighted' : ''}`}>
                        <img
                          src={thumbnailUrl}
                          alt=""
                          className="calendar-fullscreen-image"
                          loading="lazy"
                          decoding="async"
                        />
                      </div>
                    ) : (
                      <div className={`calendar-fullscreen-placeholder ${categoryColor} ${highlightedEventId === event.id ? 'calendar-event-highlighted' : ''}`}>
                        <span style={{ fontSize: '10px', color: 'white', fontWeight: 'bold' }}>
                          {event.title.charAt(0)}
                        </span>
                      </div>
                    )}

                    {/* 시퀀스 배지 숨김 처리 */}
                    {/* {dateIndex >= 0 && (
                      <div className="calendar-event-sequence-badge">
                        {dateIndex + 1}주차
                      </div>
                    )} */}
                  </div>

                  <div className="calendar-fullscreen-title-container">
                    <div className="calendar-fullscreen-title">
                      {event.title}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
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
          <div className="cal-flex-1 cal-overflow-y-auto">{renderYearView()}</div>
        ) : (
          <div className={`calendar-carousel-container calendar-mode-fullscreen`}>
            <div
              className="calendar-carousel-track"
              style={{
                width: '300%',
                display: 'flex',
                transform: `translateX(calc(-33.3333% + ${effectiveDragOffset}px))`,
                transition: effectiveIsAnimating ? "transform 0.3s ease-out" : "none",
                height: '100%',
                minHeight: '100%'
              }}
            >
              {[prevMonth, currentMonth, nextMonth].map((month, idx) => {
                const days = idx === 0 ? prevDays : idx === 1 ? currentDays : nextDays;
                return (
                  <div
                    key={`${month.getFullYear()}-${month.getMonth()}`}
                    className="calendar-month-slide"
                    style={{ width: "33.3333%" }}
                    data-active-month={idx === 1}
                  >
                    <div
                      className="calendar-grid-container"
                      style={{
                        gridTemplateRows: `repeat(${getActualWeeksCount(month)}, auto)`,
                        minHeight: '100%',
                      } as CSSProperties}
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
    </>
  );
});
