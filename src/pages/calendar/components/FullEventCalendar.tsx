import { useState, useEffect, useCallback, memo, useMemo } from "react";
import type { CSSProperties } from "react";
import { supabase } from "../../../lib/supabase";
import type { Event as AppEvent } from "../../../lib/supabase";
import EventRegistrationModal from "../../../components/EventRegistrationModal";
import "../styles/FullEventCalendar.css";
import { getEventThumbnail } from "../../../utils/getEventThumbnail";
import { useDefaultThumbnail } from "../../../hooks/useDefaultThumbnail";

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
  highlightedEventId?: number | null;
  hoveredEventId?: number | null;
}

export default memo(function FullEventCalendar({
  currentMonth,
  selectedDate,
  onDateSelect,
  onMonthChange,
  onEventsUpdate,
  viewMode,
  onViewModeChange,
  calendarHeightPx,
  dragOffset,
  isAnimating,
  onEventClick,
  isAdminMode = false,
  selectedCategory = "all",
  highlightedEventId = null,
}: FullEventCalendarProps) {
  const [events, setEvents] = useState<AppEvent[]>([]);
  const [showRegistrationModal, setShowRegistrationModal] = useState(false);
  const [yearRangeBase, setYearRangeBase] = useState(new Date().getFullYear());
  const { defaultThumbnailClass, defaultThumbnailEvent } = useDefaultThumbnail();

  // Internal state for swipe gestures
  const [internalDragOffset, setInternalDragOffset] = useState(0);
  const [internalIsAnimating, setInternalIsAnimating] = useState(false);

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

  // 카테고리에 따라 이벤트 필터링
  const filteredEvents = useMemo(() => {
    if (!selectedCategory || selectedCategory === 'all') {
      return events;
    }
    if (selectedCategory === 'none') {
      return [];
    }
    return events.filter(event => event.category === selectedCategory);
  }, [events, selectedCategory]);

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

    const map = new Map<number, string>();
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
    currentMonthEvents.sort((a, b) => a.id - b.id);

    // 각 이벤트에 순차적으로 다른 색상 할당
    currentMonthEvents.forEach((event, index) => {
      map.set(event.id, colors[index % colors.length]);
    });

    return map;
  }, [filteredEvents, currentMonth]);

  // 이벤트 색상 가져오기 함수
  const getEventColor = (eventId: number) => {
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
      window.removeEventListener("eventUpdated", handleEventChanged);
      window.removeEventListener("eventCreated", handleEventChanged);
    };
  }, []);

  const fetchEvents = useCallback(async () => {
    try {
      const startOfRange = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1);
      const endOfRange = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 2, 0);
      const startDateStr = startOfRange.toISOString().split('T')[0];
      const endDateStr = endOfRange.toISOString().split('T')[0];
      const columns = "id,title,date,start_date,end_date,event_dates,time,location,location_link,category,price,image,image_thumbnail,image_medium,image_full,video_url,description,organizer,organizer_name,organizer_phone,contact,capacity,registered,link1,link2,link3,link_name1,link_name2,link_name3,password,created_at,updated_at,show_title_on_billboard,genre,storage_path";

      const { data, error } = await supabase
        .from("events")
        .select(columns)
        .or(`and(start_date.gte.${startDateStr},start_date.lte.${endDateStr}),and(end_date.gte.${startDateStr},end_date.lte.${endDateStr}),and(date.gte.${startDateStr},date.lte.${endDateStr})`)
        .order("start_date", { ascending: true, nullsFirst: false })
        .order("date", { ascending: true, nullsFirst: false });

      if (error) {
        console.error("Error fetching events:", error);
      } else {
        setEvents((data || []) as AppEvent[]);
      }
    } catch (error) {
      console.error("Error:", error);
    }
  }, [currentMonth]);

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
      const isOtherMonth = day.getMonth() !== monthDate.getMonth();
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
              className={`calendar-date-number-fullscreen ${todayFlag ? "calendar-date-number-today" : ""}`}
              style={{
                opacity: isOtherMonth ? 0.3 : 1,
                color: isOtherMonth ? '#6b7280' : '#e5e7eb',
                fontSize: '12px',
                fontWeight: 700,
                width: todayFlag ? '20px' : undefined,
                height: todayFlag ? '20px' : undefined,
              }}
            >
              <span style={{ marginRight: '2px' }}>{day.getDate()}</span>
              <span style={{ fontSize: '10px', fontWeight: 'normal', opacity: 0.8 }}>
                {["일", "월", "화", "수", "목", "금", "토"][day.getDay()]}
              </span>
            </span>
          </div>

          {/* 바디: 이벤트 리스트 */}
          <div className="calendar-cell-fullscreen-body">
            {dayEvents.map((event) => {
              const categoryColor = getEventColor(event.id);
              const thumbnailUrl = getEventThumbnail(event, defaultThumbnailClass, defaultThumbnailEvent);

              let dateIndex = -1;
              if (event.event_dates && event.event_dates.length > 1) {
                dateIndex = event.event_dates.findIndex(d => d.startsWith(dateString));
              }

              return (
                <div
                  key={event.id}
                  className="calendar-fullscreen-event-card"
                  data-event-id={event.id}
                  role="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    console.log('Event clicked (prop):', event.id, event.title);
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

                    {dateIndex >= 0 && (
                      <div className="calendar-event-sequence-badge">
                        {dateIndex + 1}주차
                      </div>
                    )}
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
