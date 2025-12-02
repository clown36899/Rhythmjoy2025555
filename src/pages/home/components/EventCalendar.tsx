import { useState, useEffect, useMemo } from "react";
import { supabase } from "../../../lib/supabase";
import type { Event } from "../../../lib/supabase";
import EventRegistrationModal from "../../../components/EventRegistrationModal";
import "../../../styles/components/EventCalendar.css";

interface EventCalendarProps {
  selectedDate: Date | null;
  onDateSelect: (date: Date | null, hasEvents?: boolean) => void;
  onMonthChange?: (month: Date) => void;
  showHeader?: boolean;
  currentMonth?: Date;
  onEventsUpdate?: (createdDate?: Date) => void;
  viewMode?: "month" | "year";
  onViewModeChange?: (mode: "month" | "year") => void;
  hoveredEventId?: number | null;
  isAdminMode?: boolean;
  dragOffset?: number;
  isAnimating?: boolean;
  calendarHeightPx?: number;
  calendarMode?: "collapsed" | "expanded" | "fullscreen";
  selectedCategory?: string;
}

export default function EventCalendar({
  selectedDate,
  onDateSelect,
  onMonthChange,
  showHeader = true,
  currentMonth: externalCurrentMonth,
  onEventsUpdate,
  viewMode = "month",
  onViewModeChange: _onViewModeChange,
  hoveredEventId,
  dragOffset: externalDragOffset = 0,
  isAnimating: externalIsAnimating = false,
  calendarHeightPx,
  calendarMode = "expanded",
  selectedCategory = "all",
}: EventCalendarProps) {
  const [internalCurrentMonth, setInternalCurrentMonth] = useState(new Date());
  const [showMonthDropdown, setShowMonthDropdown] = useState(false);
  const [events, setEvents] = useState<Event[]>([]);
  const [showRegistrationModal, setShowRegistrationModal] = useState(false);
  const [yearRangeBase, setYearRangeBase] = useState(new Date().getFullYear());

  // 전체화면 모드인지 시각적으로 판단 (애니메이션 중에도 색상을 미리 적용하기 위함)
  // calendarMode가 'fullscreen'이거나, 달력 높이가 300px을 초과하면 전체화면으로 간주
  const isFullscreen = calendarMode === 'fullscreen' || (calendarHeightPx && calendarHeightPx > 300);

  // 외부에서 전달된 currentMonth가 있으면 사용, 없으면 내부 상태 사용
  const currentMonth = externalCurrentMonth || internalCurrentMonth;

  // 달력 셀 높이 계산 (전체 높이에서 헤더 높이를 빼고 6행으로 나눔)
  const cellHeight = calendarHeightPx
    ? Math.max(30, (calendarHeightPx - 16) / 6) // 헤더 16px 제외, 최소 30px
    : 50; // 기본 높이 50px

  // 날짜 폰트 크기 계산 (작게 고정)
  const dateFontSize = 13; // 고정 크기로 작게
  const eventCountFontSize = Math.max(7, Math.min(10, cellHeight * 0.15)); // 작은 폰트

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

  // 현재 달의 이벤트별 색상 맵 생성 (전체화면 모드용)
  const eventColorMap = useMemo(() => {
    if (!isFullscreen) {
      return new Map<number, string>();
    }

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
  }, [filteredEvents, currentMonth, isFullscreen]);

  // 이벤트 색상 가져오기 함수
  const getEventColor = (eventId: number, category: string) => {
    if (!isFullscreen) {
      // 일반 모드: 카테고리별 색상
      return category === 'class' ? 'cal-bg-green-500' : 'cal-bg-blue-500';
    }

    // 전체화면 모드: 맵에서 색상 가져오기
    return eventColorMap.get(eventId) || 'cal-bg-gray-500';
  };

  // 외부 currentMonth가 변경되면 내부 상태도 업데이트
  useEffect(() => {
    if (externalCurrentMonth) {
      setInternalCurrentMonth(externalCurrentMonth);
    }
  }, [externalCurrentMonth]);

  // 현재 월/뷰모드 변경 시 이벤트 발생 (MobileShell의 카운트 업데이트용)
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('calendarMonthChanged', {
      detail: {
        year: currentMonth.getFullYear(),
        month: currentMonth.getMonth(),
        viewMode
      }
    }));
  }, [currentMonth, viewMode]);

  // currentMonth가 변경될 때 년도 범위 업데이트 (범위를 벗어난 경우에만)
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
    const handleEventDeleted = () => {
      fetchEvents();
    };

    window.addEventListener("eventDeleted", handleEventDeleted);

    return () => {
      window.removeEventListener("eventDeleted", handleEventDeleted);
    };
  }, []);

  const fetchEvents = async () => {
    try {
      const { data, error } = await supabase
        .from("events")
        .select("*")
        .order("start_date", { ascending: true, nullsFirst: false })
        .order("date", { ascending: true, nullsFirst: false });

      if (error) {
        console.error("Error fetching events:", error);
      } else {
        setEvents(data || []);
      }
    } catch (error) {
      console.error("Error:", error);
    }
  };

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

    // Always show 6 rows (42 cells)
    const remainingCells = 42 - days.length;

    // Add days from next month
    for (let i = 1; i <= remainingCells; i++) {
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
      // 특정 날짜 모드: event_dates 배열이 있으면 우선 사용
      if (event.event_dates && event.event_dates.length > 0) {
        return event.event_dates.includes(dateString);
      }

      // 연속 기간 모드: 기존 로직
      const startDate = event.start_date || event.date || "";
      const endDate = event.end_date || event.date || "";

      return (
        startDate && endDate && dateString >= startDate && dateString <= endDate
      );
    });
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  // 월 단위로 멀티데이 이벤트의 레인과 색상 할당
  const eventLaneMap = useMemo(() => {
    const map = new Map<number, { lane: number; color: string }>();

    // 현재 월의 멀티데이 이벤트만 필터링
    // 특정 날짜 모드(event_dates)는 불연속적이므로 레인 할당 제외
    const multiDayEvents = filteredEvents.filter((event) => {
      // 특정 날짜 모드는 개별 박스로 표시 (레인 할당 안 함)
      if (event.event_dates && event.event_dates.length > 0) {
        return false;
      }

      // 연속 기간 모드: start_date와 end_date가 다르면 멀티데이
      const startDate = event.start_date || event.date || "";
      const endDate = event.end_date || event.date || "";
      return startDate !== endDate;
    });

    // 시작 날짜 기준으로 정렬
    const sortedEvents = [...multiDayEvents].sort((a, b) => {
      const dateA = a.start_date || a.date || "";
      const dateB = b.start_date || b.date || "";
      return dateA.localeCompare(dateB);
    });

    // 레인 할당: 겹치지 않는 이벤트는 같은 레인 사용 가능 (최대 3개 레인)
    const lanes: Array<{ endDate: string; eventId: number }> = [];

    sortedEvents.forEach((event) => {
      const startDate = event.start_date || event.date || "";
      const endDate = event.end_date || event.date || "";

      // 사용 가능한 레인 찾기 (종료된 레인 재사용)
      let assignedLane = -1;
      for (let i = 0; i < Math.min(lanes.length, 3); i++) {
        if (lanes[i].endDate < startDate) {
          assignedLane = i;
          lanes[i] = { endDate, eventId: event.id };
          break;
        }
      }

      // 사용 가능한 레인이 없고 레인이 3개 미만이면 새 레인 추가
      if (assignedLane === -1 && lanes.length < 3) {
        assignedLane = lanes.length;
        lanes.push({ endDate, eventId: event.id });
      }

      // 레인을 할당받지 못한 경우 (3개 모두 사용 중) 처리하지 않음
      if (assignedLane === -1) return;

      // 색상 할당
      let colorBg: string;
      if (isFullscreen) {
        // 전체화면 모드: 이벤트 ID 기반 고유 색상
        colorBg = getEventColor(event.id, event.category);
      } else {
        // 일반 모드: 카테고리와 레인에 따라 색상 결정
        if (event.category === "class") {
          // 강습: 보라색 계열
          colorBg =
            assignedLane === 0
              ? "cal-bg-purple-500"
              : assignedLane === 1
                ? "cal-bg-purple-600"
                : "cal-bg-purple-400";
        } else {
          // 행사: 파란색 계열
          colorBg =
            assignedLane === 0
              ? "cal-bg-blue-500"
              : assignedLane === 1
                ? "cal-bg-blue-600"
                : "cal-bg-blue-400";
        }
      }

      map.set(event.id, { lane: assignedLane, color: colorBg });
    });

    return map;
  }, [filteredEvents, currentMonth, isFullscreen]);

  const navigateMonth = (direction: "prev" | "next") => {
    if (externalIsAnimating) return;

    const newMonth = new Date(currentMonth);
    if (viewMode === "year") {
      // 연간 보기: 년 단위로 이동
      if (direction === "prev") {
        newMonth.setFullYear(currentMonth.getFullYear() - 1);
      } else {
        newMonth.setFullYear(currentMonth.getFullYear() + 1);
      }
    } else {
      // 월간 보기: 월 단위로 이동 (날짜 오버플로우 방지)
      newMonth.setDate(1); // 먼저 1일로 설정하여 오버플로우 방지
      if (direction === "prev") {
        newMonth.setMonth(currentMonth.getMonth() - 1);
      } else {
        newMonth.setMonth(currentMonth.getMonth() + 1);
      }
    }

    setInternalCurrentMonth(newMonth);
    onMonthChange?.(newMonth);
    onDateSelect(null);
  };

  const navigateToMonth = (monthIndex: number) => {
    const newMonth = new Date(currentMonth);
    newMonth.setDate(1); // 날짜 오버플로우 방지
    newMonth.setMonth(monthIndex);

    setInternalCurrentMonth(newMonth);
    onMonthChange?.(newMonth);
    setShowMonthDropdown(false);
  };

  const toggleMonthDropdown = () => {
    setShowMonthDropdown(!showMonthDropdown);
  };

  const handleDateClick = (date: Date, clickEvent?: PointerEvent) => {
    console.log(`[Calendar] handleDateClick triggered for ${date.toDateString()}`);
    // 전체화면 모드일 때는 모달을 띄우는 이벤트 발생
    if (calendarMode === "fullscreen") {
      const clickPosition = clickEvent
        ? { x: clickEvent.clientX, y: clickEvent.clientY }
        : undefined;

      window.dispatchEvent(
        new CustomEvent("fullscreenDateClick", {
          detail: { date, clickPosition },
        })
      );
      return;
    }

    // 이미 선택된 날짜를 다시 클릭
    if (selectedDate && date.toDateString() === selectedDate.toDateString()) {
      console.log('[Calendar] Date already selected. Deselecting.');
      // 두 번째 클릭: 선택 해제 (전체 일정 보이기)
      onDateSelect(null);
      return;
    } else {
      console.log('[Calendar] Selecting new date.');
      // 새로운 날짜 선택 - 이벤트 유무 확인
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      const dateString = `${year}-${month}-${day}`;

      const hasEvents = events.some((event) => {
        // event_dates 배열로 정의된 이벤트 체크
        if (event.event_dates && event.event_dates.length > 0) {
          return event.event_dates.includes(dateString);
        }
        // start_date/end_date 범위로 정의된 이벤트 체크
        const startDate = event.start_date || event.date;
        const endDate = event.end_date || event.date;
        return (
          startDate &&
          endDate &&
          dateString >= startDate &&
          dateString <= endDate
        );
      });

      // 이벤트 유무 정보와 함께 날짜 전달
      onDateSelect(date, hasEvents);

      // 모바일에서 스크롤을 최상단으로 이동 (이벤트가 있을 때만)
      if (hasEvents && window.innerWidth < 1024) {
        // 이벤트 리스트 영역으로 스크롤 (헤더와 달력 아래)
        const scrollableArea = document.querySelector(
          ".cal-flex-1.cal-overflow-y-auto",
        );
        if (scrollableArea) {
          scrollableArea.scrollTo({
            top: 0,
            behavior: "smooth",
          });
        }
      }
    }
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

  const monthNames = [
    "1월",
    "2월",
    "3월",
    "4월",
    "5월",
    "6월",
    "7월",
    "8월",
    "9월",
    "10월",
    "11월",
    "12월",
  ];

  // 주 레벨 장기일정 제목 오버레이 렌더링
  const renderMultiDayTitlesOverlay = (days: Date[], monthDate: Date) => {
    if (cellHeight <= 55) return null; // 셀이 작으면 제목 표시 안 함

    const titleSegments: Array<{
      eventId: number;
      title: string;
      lane: number;
      weekRow: number;
      startCol: number;
      span: number;
      color: string;
      isFaded: boolean;
      isHovered: boolean;
    }> = [];

    // 각 주(0-5)에 대해 처리
    for (let weekRow = 0; weekRow < 6; weekRow++) {
      const weekStart = weekRow * 7;
      const weekEnd = Math.min(weekStart + 7, days.length);
      const weekDays = days.slice(weekStart, weekEnd);

      // 이 주에서 시작하는 장기일정 찾기
      const processedEvents = new Set<number>();

      for (let dayIndex = 0; dayIndex < weekDays.length; dayIndex++) {
        const day = weekDays[dayIndex];
        const year = day.getFullYear();
        const month = String(day.getMonth() + 1).padStart(2, "0");
        const dayNum = String(day.getDate()).padStart(2, "0");
        const dateString = `${year}-${month}-${dayNum}`;

        const dayEvents = getEventsForDate(day);
        const multiDayEvents = dayEvents.filter((event) => {
          if (event.event_dates && event.event_dates.length > 0) return false;
          const startDate = event.start_date || event.date || "";
          const endDate = event.end_date || event.date || "";
          return startDate !== endDate;
        });

        multiDayEvents.forEach((event) => {
          const laneInfo = eventLaneMap.get(event.id);
          if (!laneInfo || laneInfo.lane >= 3 || processedEvents.has(event.id)) return;

          const startDate = event.start_date || event.date || "";
          const endDate = event.end_date || event.date || "";
          const isStart = dateString === startDate;

          // 이 주에서 시작하는 이벤트만 처리
          if (!isStart) return;

          processedEvents.add(event.id);

          // 이 주에서 이벤트가 차지하는 칸 수 계산
          let span = 1;
          for (let j = dayIndex + 1; j < weekDays.length; j++) {
            const checkDay = weekDays[j];
            const checkYear = checkDay.getFullYear();
            const checkMonth = String(checkDay.getMonth() + 1).padStart(2, "0");
            const checkDayNum = String(checkDay.getDate()).padStart(2, "0");
            const checkDateString = `${checkYear}-${checkMonth}-${checkDayNum}`;

            if (checkDateString <= endDate) {
              span++;
            } else {
              break;
            }
          }

          const selectedDateEventIds = selectedDate
            ? new Set(
              getEventsForDate(selectedDate)
                .filter((e) => {
                  if (e.event_dates && e.event_dates.length > 0) return false;
                  const sd = e.start_date || e.date || "";
                  const ed = e.end_date || e.date || "";
                  return sd !== ed;
                })
                .map((e) => e.id),
            )
            : null;

          const isFaded = selectedDateEventIds !== null && !selectedDateEventIds.has(event.id);
          const isHovered = viewMode === "month" && hoveredEventId === event.id;

          titleSegments.push({
            eventId: event.id,
            title: event.title || '',
            lane: laneInfo.lane,
            weekRow,
            startCol: dayIndex,
            span,
            color: laneInfo.color,
            isFaded,
            isHovered,
          });
        });
      }
    }

    return (
      <div
        className="cal-absolute cal-inset-0 cal-pointer-events-none"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gridTemplateRows: 'repeat(6, 1fr)',
        }}
      >
        {titleSegments.map((segment, idx) => {
          const barHeight = segment.isHovered ? 20 : 14;
          const laneOffset = segment.lane * (barHeight + 2); // 레인별 간격

          return (
            <div
              key={`${segment.eventId}-${segment.weekRow}-${idx}`}
              className="cal-flex cal-items-center"
              style={{
                gridColumn: `${segment.startCol + 1} / span ${segment.span}`,
                gridRow: segment.weekRow + 1,
                alignSelf: 'end',
                marginBottom: `${laneOffset}px`,
                height: `${barHeight}px`,
                paddingLeft: '6px',
                paddingRight: '6px',
                opacity: segment.isFaded ? 0.2 : segment.isHovered ? 1 : 0.8,
                zIndex: segment.isHovered ? 30 : 20,
                overflow: 'hidden',
                transition: 'all 0.2s',
              }}
            >
              <span
                className="cal-text-10px cal-font-medium cal-text-white cal-truncate"
                style={{
                  lineHeight: `${barHeight}px`,
                }}
              >
                {segment.title}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  // 달력 렌더링 함수
  const renderCalendarGrid = (days: Date[], monthDate: Date) => {
    return days.map((day, index) => {

      const dayEvents = getEventsForDate(day);
      const todayFlag = isToday(day);

      const year = day.getFullYear();
      const month = String(day.getMonth() + 1).padStart(2, "0");
      const dayNum = String(day.getDate()).padStart(2, "0");
      const dateString = `${year}-${month}-${dayNum}`;

      // 연속 이벤트와 단일 이벤트 분리
      const multiDayEvents = dayEvents.filter((event) => {
        // 특정 날짜 모드는 단일 이벤트로 처리
        if (event.event_dates && event.event_dates.length > 0) {
          return false;
        }

        const startDate = event.start_date || event.date || "";
        const endDate = event.end_date || event.date || "";
        return startDate !== endDate;
      });

      const singleDayEvents = dayEvents.filter((event) => {
        // 특정 날짜 모드는 단일 이벤트로 처리
        if (event.event_dates && event.event_dates.length > 0) {
          return true;
        }

        const startDate = event.start_date || event.date || "";
        const endDate = event.end_date || event.date || "";
        return startDate === endDate;
      });

      // 선택된 날짜에 속한 이벤트 ID 목록
      const selectedDateEventIds = selectedDate
        ? new Set(
          getEventsForDate(selectedDate)
            .filter((event) => {
              // 특정 날짜 모드는 제외
              if (event.event_dates && event.event_dates.length > 0) {
                return false;
              }

              const startDate = event.start_date || event.date || "";
              const endDate = event.end_date || event.date || "";
              return startDate !== endDate;
            })
            .map((event) => event.id),
        )
        : null;

      // 연속 이벤트 바 정보 계산 (레인 맵 기반, 최대 3개 레인)
      const eventBarsMap = new Map<
        number,
        {
          eventId: number;
          isStart: boolean;
          isEnd: boolean;
          categoryColor: string;
          isFaded: boolean;
        }
      >();

      multiDayEvents.forEach((event) => {
        const laneInfo = eventLaneMap.get(event.id);
        if (!laneInfo || laneInfo.lane >= 3) return; // 최대 3개 레인만

        const startDate = event.start_date || event.date || "";
        const endDate = event.end_date || event.date || "";
        const isStart = dateString === startDate;
        const isEnd = dateString === endDate;

        // 선택된 날짜가 있고 해당 이벤트가 선택된 날짜에 속하지 않으면 흐리게
        const isFaded =
          selectedDateEventIds !== null && !selectedDateEventIds.has(event.id);

        eventBarsMap.set(laneInfo.lane, {
          eventId: event.id,
          isStart,
          isEnd,
          categoryColor: laneInfo.color,
          isFaded,
        });
      });

      // 레인 0, 1, 2를 순서대로 배열로 변환 (빈 레인은 null)
      const eventBarsData = [0, 1, 2].map((lane) => {
        const bar = eventBarsMap.get(lane);
        return bar || null;
      });

      // 현재 달이 아닌 날짜인지 확인
      const isOtherMonth = day.getMonth() !== monthDate.getMonth();
      const isSelected = selectedDate && day.toDateString() === selectedDate.toDateString();

      // 배경색 결정
      let bgColor = undefined;
      if (isOtherMonth) {
        bgColor = '#252525';
      } else if (isSelected) {
        bgColor = '#2563eb'; // blue-600
      }

      return (
        <div
          key={`${monthDate.getMonth()}-${index}`}
          data-calendar-date={dateString}
          className={`calendar-day-cell cal-relative no-select cal-transition-all cal-duration-300 ${!isOtherMonth && !isSelected ? 'cal-hover-bg-gray-700' : ''
            }`}
          style={{ backgroundColor: bgColor, minWidth: 0 }}
          onClick={(e) => handleDateClick(day, e.nativeEvent as PointerEvent)}
        >
          <div
            className={`cal-w-full cal-h-full cal-cursor-pointer cal-relative cal-overflow-visible no-select ${isSelected ? "cal-text-white cal-z-10" : "cal-text-gray-300"
              }`}
          >
            {/* 날짜 숫자 - 왼쪽 위로 완전히 붙임 */}
            <span
              className={`cal-absolute cal-font-bold cal-z-30 no-select ${todayFlag
                ? "cal-flex cal-items-center cal-justify-center cal-rounded-full cal-bg-blue-500 cal-text-white"
                : ""
                } ${calendarMode === 'fullscreen' ? 'cal-top-px cal-left-0.5' : 'cal-top-1 cal-left-2'}`}
              style={{
                opacity: isOtherMonth ? 0.15 : undefined,
                fontSize: calendarMode === 'fullscreen' ? (todayFlag ? '9px' : '10px') : (todayFlag ? '11px' : `${dateFontSize}px`),
                width: todayFlag ? (calendarMode === 'fullscreen' ? '16px' : '22px') : undefined,
                height: todayFlag ? (calendarMode === 'fullscreen' ? '16px' : '22px') : undefined,
              }}
            >
              {day.getDate()}
            </span>

            {/* 단일 이벤트 표시 - 크기에 따라 숫자 또는 바 */}
            {singleDayEvents.length > 0 &&
              (() => {
                // 호버된 이벤트가 이 날짜의 단일 이벤트인지 확인
                const isHoveredSingle =
                  viewMode === "month" &&
                  hoveredEventId !== null &&
                  singleDayEvents.some((e) => e.id === hoveredEventId);

                // 셀 높이가 크면 바로 표시, 작으면 숫자로 표시
                const showAsBars = cellHeight > 55;

                if (!showAsBars) {
                  // 작을 때: 숫자로 표시 (기존 방식)
                  return (
                    <span
                      className={`cal-absolute cal-top-0.5 cal-right-0.5 cal-rounded-full cal-px-1 cal-flex cal-items-center cal-justify-center cal-font-medium cal-transition-all cal-duration-200 cal-z-30 no-select ${isHoveredSingle
                        ? "cal-bg-blue-500 cal-text-white cal-scale-110"
                        : "cal-bg-gray-600 cal-text-gray-300"
                        }`}
                      style={{
                        fontSize: `${eventCountFontSize}px`,
                        minWidth: `${eventCountFontSize * 1.7}px`,
                        height: `${eventCountFontSize * 1.7}px`,
                      }}
                    >
                      +{singleDayEvents.length}
                    </span>
                  );
                } else {
                  // 클 때: 바 형태로 표시 (아래 별도 렌더링)
                  return null;
                }
              })()}
          </div>

          {/* 단일 이벤트 바 표시 - 셀이 클 때만 */}
          {(cellHeight > 55 || calendarMode === 'fullscreen') && singleDayEvents.length > 0 && (
            <div
              className={`${calendarMode === 'fullscreen' ? 'cal-relative cal-mt-6 cal-mx-0.5' : 'cal-absolute cal-flex cal-flex-col cal-gap-0.5 cal-pointer-events-none cal-left-1 cal-right-1'}`}
              style={{
                top: calendarMode === 'fullscreen' ? 'auto' : '28px',
                pointerEvents: calendarMode === 'fullscreen' ? 'auto' : 'none'
              }}
            >
              {(calendarMode === 'fullscreen'
                ? singleDayEvents
                : singleDayEvents.slice(0, Math.floor((cellHeight - 30) / 16))
              ).map((event) => {
                const categoryColor = getEventColor(event.id, event.category);
                const isHovered = viewMode === "month" && hoveredEventId === event.id;

                if (calendarMode === 'fullscreen') {
                  return (
                    <div
                      key={event.id}
                      className="cal-flex cal-flex-col cal-gap-1 cal-bg-gray-800 cal-rounded cal-p-1 cal-mb-1 cal-cursor-pointer cal-hover-bg-gray-700"
                      onClick={(e) => {
                        e.stopPropagation();
                        // 이벤트 클릭 처리 (상세 모달 등)
                        window.dispatchEvent(
                          new CustomEvent("eventSelected", { detail: event })
                        );
                      }}
                    >
                      {/* 이미지 (있으면 표시) */}
                      {event.image ? (
                        <div className="cal-w-full cal-aspect-square cal-rounded cal-overflow-hidden cal-bg-gray-700" style={{ maxWidth: '6rem', margin: '0 auto' }}>
                          <img src={event.image} alt="" className="cal-w-full cal-h-full cal-object-cover" />
                        </div>
                      ) : (
                        <div className={`cal-w-full cal-aspect-square cal-rounded cal-flex cal-items-center cal-justify-center ${categoryColor} cal-text-white cal-text-xs`} style={{ maxWidth: '6rem', margin: '0 auto' }}>
                          {event.title.charAt(0)}
                        </div>
                      )}

                      {/* 제목 */}
                      <div className="cal-w-full">
                        <div className="cal-text-10px cal-text-white cal-font-medium cal-truncate cal-text-center">
                          {event.title}
                        </div>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={event.id}
                    className={`cal-rounded-full cal-text-10px cal-font-medium cal-truncate cal-transition-all cal-duration-200 ${categoryColor} ${isHovered ? 'cal-opacity-100 cal-scale-105' : 'cal-opacity-80'
                      } cal-px-1.5`}
                    style={{
                      height: '14px',
                      lineHeight: '14px',
                      color: 'white'
                    }}
                  >
                    {event.title}
                  </div>
                );
              })}
            </div>
          )}

          {/* 멀티데이 이벤트 바 표시 - 날짜 칸 하단에 겹쳐서 배치 (전체화면 모드에서는 제외) */}
          {calendarMode !== 'fullscreen' && eventBarsData.some((bar) => bar !== null) && (
            <div className="cal-absolute cal-bottom-0 cal-left-0 cal-right-0 cal-h-5 cal-pointer-events-none">
              {eventBarsData.map((bar, i) => {
                const isHovered =
                  viewMode === "month" &&
                  hoveredEventId !== null &&
                  bar?.eventId === hoveredEventId;

                if (!bar) return null;

                return (
                  <div
                    key={i}
                    className={`cal-absolute cal-bottom-0 cal-left-0 cal-right-0 cal-transition-all cal-duration-200 ${bar.categoryColor
                      } ${bar.isStart && bar.isEnd
                        ? "cal-rounded-full"
                        : bar.isStart
                          ? "cal-rounded-l-full"
                          : bar.isEnd
                            ? "cal-rounded-r-full"
                            : ""
                      } ${bar.isFaded
                        ? "cal-opacity-20 cal-h-1.5 cal-z-0"
                        : isHovered
                          ? "cal-opacity-100 cal-h-5 cal-z-10"
                          : cellHeight > 55
                            ? "cal-opacity-80 cal-h-3.5 cal-z-0"
                            : "cal-opacity-60 cal-h-1.5 cal-z-0"
                      }`}
                    style={{
                      paddingLeft: (bar.isStart || (bar.isStart && bar.isEnd)) ? '6px' : '0',
                      paddingRight: (bar.isEnd && !bar.isStart) ? '6px' : '0'
                    }}
                    data-event-id={bar.eventId}
                    data-lane={i}
                  />
                );
              })}
            </div>
          )}
        </div>
      );
    });
  };

  // 연간 보기용 년도 리스트 렌더링
  const renderYearView = () => {
    const years = Array.from({ length: 11 }, (_, i) => yearRangeBase - 5 + i); // yearRangeBase ±5년
    const selectedYear = currentMonth.getFullYear();

    return (
      <div className="cal-p-2">
        <div className="cal-grid cal-grid-cols-3 cal-gap-2">
          {years.map((year) => {
            const isSelected = selectedYear === year;

            return (
              <button
                key={year}
                onClick={() => {
                  // 선택한 년도의 1월 1일로 설정
                  const newDate = new Date(year, 0, 1);

                  setInternalCurrentMonth(newDate);

                  if (onMonthChange) {
                    onMonthChange(newDate);
                  }

                  onDateSelect(null);
                  // viewMode는 "year"로 유지되어 해당 년도의 모든 이벤트 표시
                }}
                className={`cal-py-2 cal-px-3 cal-rounded-lg cal-text-sm cal-font-bold cal-transition-all cal-cursor-pointer ${isSelected
                  ? "cal-bg-blue-600 cal-text-white"
                  : "cal-bg-gray-700 cal-text-gray-300 cal-hover-bg-gray-600 cal-hover-text-white"
                  }`}
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
      <div
        data-calendar
        className="cal-rounded-none cal-p-0 cal-flex cal-flex-col no-select"
        style={{ backgroundColor: "var(--calendar-bg-color)" }}
      >
        {/* Desktop Header */}
        {showHeader && (
          <div className="cal-hidden cal-items-center cal-justify-between cal-mb-6">
            <h2 className="cal-text-2xl cal-font-bold cal-text-white">
              {viewMode === "year" ? (
                `${currentMonth.getFullYear()}년`
              ) : (
                <>
                  {currentMonth.getFullYear()}년{" "}
                  <div className="cal-relative cal-inline-block">
                    <button
                      onClick={toggleMonthDropdown}
                      className="cal-hover-text-blue-400 cal-transition-colors cal-cursor-pointer cal-flex cal-items-center cal-space-x-1"
                    >
                      <span>{monthNames[currentMonth.getMonth()]}</span>
                      <i
                        className={`ri-arrow-down-s-line cal-transition-transform ${showMonthDropdown ? "cal-rotate-180" : ""}`}
                      ></i>
                    </button>

                    {showMonthDropdown && (
                      <div className="cal-absolute cal-top-full cal-left-0 cal-mt-2 cal-bg-gray-700 cal-rounded-lg cal-shadow-lg cal-z-10 cal-min-w-120">
                        {monthNames.map((month, index) => (
                          <button
                            key={index}
                            onClick={() => navigateToMonth(index)}
                            className={`cal-w-full cal-text-left cal-px-4 cal-py-2 cal-hover-bg-gray-600 cal-transition-colors cal-cursor-pointer cal-first-rounded-t-lg cal-last-rounded-b-lg ${index === currentMonth.getMonth()
                              ? "cal-bg-blue-600 cal-text-white"
                              : "cal-text-gray-300"
                              }`}
                          >
                            {month}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </h2>
            <div className="cal-flex cal-space-x-2">
              <button
                onClick={() => navigateMonth("prev")}
                className="cal-p-2 cal-text-gray-400 cal-hover-text-white cal-transition-colors cal-cursor-pointer"
              >
                <i className="ri-arrow-left-s-line cal-text-xl"></i>
              </button>
              <button
                onClick={() => navigateMonth("next")}
                className="cal-p-2 cal-text-gray-400 cal-hover-text-white cal-transition-colors cal-cursor-pointer"
              >
                <i className="ri-arrow-right-s-line cal-text-xl"></i>
              </button>
            </div>
          </div>
        )}
        {viewMode === "year" ? (
          // 연간 보기
          <div className="cal-flex-1 cal-overflow-y-auto">{renderYearView()}</div>
        ) : (
          // 월간 보기
          <>
            {/* Days of week header */}
            <div className="no-select">
              <div className="cal-grid cal-grid-cols-7 cal-gap-0 cal-h-4 calendar-grid-container">
                {["일", "월", "화", "수", "목", "금", "토"].map((day, index) => (
                  <div
                    key={day}
                    className="calendar-day-header cal-text-center cal-text-gray-400 cal-font-semibold cal-py-0 cal-text-9px cal-flex cal-items-center cal-justify-center no-select"
                    style={{ color: index === 0 ? 'rgb(190, 0, 0)' : undefined }}
                  >
                    {day}
                  </div>
                ))}
              </div>
            </div>

            {/* Calendar grid - 3개 달력 캐러셀 */}
            <div className={`cal-flex-1 ${calendarMode === 'fullscreen' ? 'cal-overflow-y-auto cal-pb-40' : 'cal-overflow-hidden'}`}>
              <div
                className="cal-flex"
                style={{
                  transform: `translateX(calc(-100% + ${externalDragOffset}px))`,
                  transition: externalIsAnimating
                    ? "transform 0.25s ease-out"
                    : "none",
                  height: calendarMode === 'fullscreen' ? 'auto' : '100%',
                  minHeight: '100%'
                }}
              >
                {/* 이전 달 */}
                <div
                  key={`${prevMonth.getFullYear()}-${prevMonth.getMonth()}`}
                  className="cal-pb-0 cal-flex-shrink-0 cal-relative"
                  style={{ width: "100%" }}
                >
                  <div
                    className="cal-grid cal-grid-cols-7 cal-gap-0 calendar-grid-container"
                    style={{
                      gridAutoRows: calendarMode === 'fullscreen'
                        ? 'minmax(40px, auto)'
                        : `max(30px, calc((var(--live-calendar-height, ${calendarHeightPx || 300}px) - 16px) / 6))`,
                      '--calendar-cell-height': `max(30px, calc((var(--live-calendar-height, ${calendarHeightPx || 300}px) - 16px) / 6))`
                    } as React.CSSProperties}
                  >
                    {renderCalendarGrid(prevDays, prevMonth)}
                    {calendarMode === 'fullscreen' && <div className="cal-h-20 cal-w-full cal-col-span-7"></div>}
                  </div>
                  {calendarMode !== 'fullscreen' && renderMultiDayTitlesOverlay(prevDays, prevMonth)}
                </div>

                {/* 현재 달 */}
                <div
                  key={`${currentMonth.getFullYear()}-${currentMonth.getMonth()}`}
                  className="cal-pb-0 cal-flex-shrink-0 cal-relative"
                  style={{ width: "100%" }}
                >
                  <div
                    className="cal-grid cal-grid-cols-7 cal-gap-0 calendar-grid-container"
                    style={{
                      gridAutoRows: calendarMode === 'fullscreen'
                        ? 'minmax(40px, auto)'
                        : `max(30px, calc((var(--live-calendar-height, ${calendarHeightPx || 300}px) - 16px) / 6))`,
                      '--calendar-cell-height': `max(30px, calc((var(--live-calendar-height, ${calendarHeightPx || 300}px) - 16px) / 6))`
                    } as React.CSSProperties}
                  >
                    {renderCalendarGrid(currentDays, currentMonth)}
                    {calendarMode === 'fullscreen' && <div className="cal-h-20 cal-w-full cal-col-span-7"></div>}
                  </div>
                  {calendarMode !== 'fullscreen' && renderMultiDayTitlesOverlay(currentDays, currentMonth)}
                </div>

                {/* 다음 달 */}
                <div
                  key={`${nextMonth.getFullYear()}-${nextMonth.getMonth()}`}
                  className="cal-pb-0 cal-flex-shrink-0 cal-relative"
                  style={{ width: "100%" }}
                >
                  <div
                    className="cal-grid cal-grid-cols-7 cal-gap-0 calendar-grid-container"
                    style={{
                      gridAutoRows: calendarMode === 'fullscreen'
                        ? 'minmax(40px, auto)'
                        : `max(30px, calc((var(--live-calendar-height, ${calendarHeightPx || 300}px) - 16px) / 6))`,
                      '--calendar-cell-height': `max(30px, calc((var(--live-calendar-height, ${calendarHeightPx || 300}px) - 16px) / 6))`
                    } as React.CSSProperties}
                  >
                    {renderCalendarGrid(nextDays, nextMonth)}
                    {calendarMode === 'fullscreen' && <div className="cal-h-20 cal-w-full cal-col-span-7"></div>}
                  </div>
                  {calendarMode !== 'fullscreen' && renderMultiDayTitlesOverlay(nextDays, nextMonth)}
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* 이벤트 등록 모달 */}
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
}
