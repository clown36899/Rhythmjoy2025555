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
  seed = 42,
  onDataLoaded,
}: FullEventCalendarProps) {
  const { t } = useTranslation();
  const [events, setEvents] = useState<AppEvent[]>([]);
  const [socialSchedules, setSocialSchedules] = useState<any[]>([]);
  const [showRegistrationModal, setShowRegistrationModal] = useState(false);
  const [yearRangeBase, setYearRangeBase] = useState(new Date().getFullYear());

  // React Query 통합: 수동 fetch 대신 훅 사용
  const { data: calendarData, refetch: refetchCalendarData, isLoading } = useCalendarEventsQuery(currentMonth);

  // 쿼리 데이터와 연동
  useEffect(() => {
    if (calendarData) {
      setEvents(calendarData.events);
      setSocialSchedules(calendarData.socialSchedules);
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
    // 화면 높이에 맞춰서 최소 높이 분배 (이벤트 없을 때 꽉 차게)
    // 단, 30px보다는 작아지지 않도록 함
    if (!calendarHeightPx) return 30;

    // 약간의 여유분(헤더 등)을 고려해 보정값 -10 정도
    return Math.max(30, (calendarHeightPx - 10) / getActualWeeksCount(monthDate));
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
        category: schedule.v2_category || 'social', // v2_category가 없으면 기본값 'social' (파티/소셜)
        image_micro: schedule.image_micro,
        image_thumbnail: schedule.image_thumbnail,
        image_medium: schedule.image_medium,
        source: 'social_schedules' as const,
        location: schedule.place_name || '',
        venue_id: schedule.venue_id ? String(schedule.venue_id) : null,
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

  // 월이 변경되거나 탭이 변경될 때 스크롤을 최상단으로 이동 (즉시 애니메이션 없이)
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

          if (newHeight > 0) {
            setContainerHeight(newHeight);
          }
        }
      }
    };

    updateHeight();

    // Also update on window resize
    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
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
    refetchCalendarData();
  }, [refetchCalendarData]);

  // [Pure Fix] 데이터 로딩 완료 및 레이아웃(높이)이 DOM에 실제 반영된 시점 감지
  useLayoutEffect(() => {
    // 1. 로딩이 끝났고
    // 2. 데이터가 있으며
    // 3. 실제 측정된 높이가 0보다 클 때 (레이아웃 완료)
    if (onDataLoaded && !isLoading && calendarData && containerHeight && containerHeight > 0) {
      // 브라우저가 이번 레이아웃을 완전히 마친 직후에 실행하기 위해 단일 RAF 사용
      requestAnimationFrame(() => {
        onDataLoaded();
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
          id={todayFlag ? 'calendar-today-cell' : undefined}
          onClick={(e) => handleFullscreenDateClick(day, e)}
          className={`calendar-cell-fullscreen ${todayFlag ? 'is-today' : ''} ${isLastRow ? 'is-last-row' : ''}`}
          style={{
            '--cell-min-height': `${getCellHeight(monthDate)}px`,
          } as any}
        >
          {/* 헤더: 날짜 숫자 */}
          <div className="calendar-cell-fullscreen-header">
            <span
              onClick={(e) => handleDateNumberClick(e, day)}
              className={`calendar-date-number-fullscreen ${todayFlag
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
                  {todayFlag ? t('today') : t(`weekdays.${['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][day.getDay()]}`)}
                </span>
                {/* User defined short forms for each language */}
                <span className="fixed-part ko" translate="no">
                  {(() => { const days = ['일', '월', '화', '수', '목', '금', '토']; return todayFlag ? '오늘' : days[day.getDay()]; })()}
                </span>
                <span className="fixed-part en" translate="no">
                  {(() => { const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']; return todayFlag ? 'Today' : days[day.getDay()]; })()}
                </span>
              </span>
            </span>
          </div>

          {/* 바디: 이벤트 리스트 */}
          <div className="calendar-cell-fullscreen-body">
            {(() => {
              // 랜덤 정렬 시드 기반 헬퍼
              const seededRandom = (s: number) => {
                const mask = 0xffffffff;
                let m_w = (123456789 + s) & mask;
                let m_z = (987654321 - s) & mask;
                return () => {
                  m_z = (36969 * (m_z & 65535) + (m_z >> 16)) & mask;
                  m_w = (18000 * (m_w & 65535) + (m_w >> 16)) & mask;
                  const result = ((m_z << 16) + (m_w & 65535)) >>> 0;
                  return result / 4294967296;
                };
              };

              // 각 날짜별 + 세션 시드 조합하여 고유하지만 세션 내에서는 고정된 시드 생성
              const daySeed = day.getTime() + seed;
              const randomHelper = seededRandom(daySeed);

              // [Fix] 기간이 긴 일정을 우선순위로 두고, 나머지는 안정적인 랜덤 가중치로 정렬
              return dayEvents
                .map(event => {
                  const start = new Date(event.start_date || event.date || '').getTime();
                  const end = new Date(event.end_date || event.date || '').getTime();
                  return {
                    event,
                    weight: randomHelper(),
                    duration: end - start
                  };
                })
                .sort((a, b) => {
                  if (b.duration !== a.duration) return b.duration - a.duration;
                  return a.weight - b.weight;
                })
                .map(({ event }) => {
                  const categoryColor = getEventColor(event.id);
                  const thumbnailUrl = event.image_thumbnail || event.image_micro || event.image_medium;

                  const eStart = (event.start_date || event.date || '').substring(0, 10);
                  const eEnd = (event.end_date || event.date || '').substring(0, 10);
                  const currDate = dateString;

                  const isContinueLeft = eStart < currDate;
                  const isContinueRight = eEnd > currDate;

                  return (
                    <div
                      key={event.id}
                      className={`calendar-fullscreen-event-card ${isContinueLeft ? 'calendar-event-continue-left' : ''} ${isContinueRight ? 'calendar-event-continue-right' : ''}`}
                      data-event-id={event.id}
                      role="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onEventClick) onEventClick(event);
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
                        <div className="calendar-fullscreen-title">
                          {event.title}
                        </div>
                      </div>
                    </div>
                  );
                });
            })()}
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
          <div className="calendar-flex-1 calendar-overflow-y-auto">{renderYearView()}</div>
        ) : (
          <div
            className="calendar-carousel-container calendar-mode-fullscreen"
            style={{
              '--container-height': containerHeight ? `${containerHeight}px` : 'auto',
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
                const days = idx === 0 ? prevDays : idx === 1 ? currentDays : nextDays;
                return (
                  <div
                    key={`${month.getFullYear()}-${month.getMonth()}`}
                    className="calendar-month-slide"
                    data-active-month={idx === 1}
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
