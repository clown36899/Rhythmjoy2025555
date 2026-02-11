import { useState, useEffect, useMemo, memo, useCallback } from "react";
import { supabase } from "../../../lib/supabase";
import type { Event } from "../../../lib/supabase";
import EventRegistrationModal from "../../../components/EventRegistrationModal";
import "../../../styles/components/EventCalendar.css";
import { getEventThumbnail } from "../../../utils/getEventThumbnail";
import { useDefaultThumbnail } from "../../../hooks/useDefaultThumbnail";

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
  isTransitioning?: boolean;
  highlightedEventId?: number | null;
}

export default memo(function EventCalendar({
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
  isTransitioning = false,
  highlightedEventId = null,
}: EventCalendarProps) {
  const [internalCurrentMonth, setInternalCurrentMonth] = useState(new Date());
  const [showMonthDropdown, setShowMonthDropdown] = useState(false);
  const [events, setEvents] = useState<Event[]>([]);
  const [showRegistrationModal, setShowRegistrationModal] = useState(false);
  const [yearRangeBase, setYearRangeBase] = useState(new Date().getFullYear());
  const { defaultThumbnailClass, defaultThumbnailEvent } = useDefaultThumbnail();

  // 전체화면 모드인지 시각적으로 판단 (애니메이션 중에도 색상을 미리 적용하기 위함)
  // calendarMode가 'fullscreen'이거나, 달력 높이가 300px을 초과하면 전체화면으로 간주
  const isFullscreen = calendarMode === 'fullscreen' || (calendarHeightPx && calendarHeightPx > 300);

  // 외부에서 전달된 currentMonth가 있으면 사용, 없으면 내부 상태 사용
  const currentMonth = externalCurrentMonth || internalCurrentMonth;

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

  // 달력 셀 높이 계산
  const cellHeight = calendarHeightPx
    ? calendarMode === 'fullscreen'
      ? Math.max(30, (calendarHeightPx - 16) / getActualWeeksCount(currentMonth)) // 실제 주 수로 나눔
      : Math.max(30, (calendarHeightPx - 16) / 6) // 일반 모드는 6행
    : 50; // 기본 높이 50px

  // 날짜 폰트 크기 계산 (작게 고정)
  const dateFontSize = 13; // 고정 크기로 작게
  // const eventCountFontSize = cellHeight < 60 ? '10px' : '12px';Math.min(10, cellHeight * 0.15)); // 작은 폰트

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
      'ECAL-event-bg-red-500', 'ECAL-event-bg-orange-500', 'ECAL-event-bg-amber-500', 'ECAL-event-bg-yellow-500',
      'ECAL-event-bg-lime-500', 'ECAL-event-bg-green-500', 'ECAL-event-bg-emerald-500', 'ECAL-event-bg-teal-500',
      'ECAL-event-bg-cyan-500', 'ECAL-event-bg-sky-500', 'ECAL-event-bg-blue-500', 'ECAL-event-bg-indigo-500',
      'ECAL-event-bg-violet-500', 'ECAL-event-bg-purple-500', 'ECAL-event-bg-fuchsia-500', 'ECAL-event-bg-pink-500',
      'ECAL-event-bg-rose-500', 'ECAL-event-bg-red-600', 'ECAL-event-bg-orange-600', 'ECAL-event-bg-amber-600',
      'ECAL-event-bg-yellow-600', 'ECAL-event-bg-lime-600', 'ECAL-event-bg-green-600', 'ECAL-event-bg-emerald-600',
      'ECAL-event-bg-teal-600', 'ECAL-event-bg-cyan-600', 'ECAL-event-bg-sky-600', 'ECAL-event-bg-indigo-600',
      'ECAL-event-bg-violet-600', 'ECAL-event-bg-purple-600', 'ECAL-event-bg-fuchsia-600', 'ECAL-event-bg-pink-600'
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
    currentMonthEvents.sort((a, b) => Number(a.id) - Number(b.id));

    // 각 이벤트에 순차적으로 다른 색상 할당
    currentMonthEvents.forEach((event, index) => {
      map.set(Number(event.id), colors[index % colors.length]);
    });

    return map;
  }, [filteredEvents, currentMonth, isFullscreen]);

  // 이벤트 색상 가져오기 함수
  const getEventColor = (eventId: number, category: string) => {
    if (!isFullscreen) {
      // 일반 모드: 카테고리별 색상
      return category === 'class' ? 'ECAL-event-bg-green-500' : 'ECAL-event-bg-blue-500';
    }

    // 전체화면 모드: 맵에서 색상 가져오기
    return eventColorMap.get(eventId) || 'ECAL-event-bg-gray-500';
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
      console.log('[EventCalendar] Event deleted, refreshing...');
      fetchEvents();
    };

    const handleEventChanged = () => {
      console.log('[EventCalendar] Event updated/created, refreshing...');
      fetchEvents();
    };

    window.addEventListener("eventDeleted", handleEventDeleted);
    window.addEventListener("eventUpdated", handleEventChanged);
    window.addEventListener("eventCreated", handleEventChanged);

    return () => {
      window.removeEventListener("eventDeleted", handleEventDeleted);
      window.removeEventListener("eventUpdated", handleEventChanged);
      window.removeEventListener("eventCreated", handleEventChanged);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchEvents = useCallback(async () => {
    try {
      // Calculate date range: ±1 month from current month
      const startOfRange = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1);
      const endOfRange = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 2, 0);
      const startDateStr = startOfRange.toISOString().split('T')[0];
      const endDateStr = endOfRange.toISOString().split('T')[0];

      // Fetch all necessary columns for complete event detail display
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
        setEvents((data || []) as Event[]);
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

    // 전체 달력 모드: 그 달의 마지막 날이 포함된 주까지만 표시
    // 일반 모드: 항상 6주(42셀) 표시
    if (calendarMode === 'fullscreen') {
      // 마지막 날의 요일을 확인하여 그 주를 채움
      const lastDayOfWeek = lastDay.getDay();
      const daysToAdd = 6 - lastDayOfWeek; // 토요일까지 채우기

      for (let i = 1; i <= daysToAdd; i++) {
        days.push(new Date(year, month + 1, i));
      }
    } else {
      // Always show 6 rows (42 cells) for normal mode
      const remainingCells = 42 - days.length;

      // Add days from next month
      for (let i = 1; i <= remainingCells; i++) {
        days.push(new Date(year, month + 1, i));
      }
    }

    return days;
  };

  const getEventsForDate = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const dateString = `${year}-${month}-${day}`;

    // 디버깅용 로그 (1일, 3일 등 특정 날짜에 대해서만 출력)
    if (day === "01" || day === "03") {
      // console.log(`[Calendar] getEventsForDate ${dateString}: checking ${filteredEvents.length} events`);
    }

    return filteredEvents.filter((event) => {
      // 특정 날짜 모드: event_dates 배열이 있으면 우선 사용
      if (event.event_dates && event.event_dates.length > 0) {
        // 강습(class)은 개별 선택된 날짜 중 첫 번째 날짜에만 표시
        const isClass = event.category && (event.category.toLowerCase() === 'class' || event.category === 'regular');

        if (isClass) {
          // event_dates 배열을 정렬하여 첫 번째(가장 이른) 날짜만 사용
          const sortedDates = [...event.event_dates].sort();
          const firstDate = sortedDates[0];
          return dateString === firstDate;
        }
        // 행사(event) 등 나머지는 등록된 모든 날짜 표시
        return event.event_dates.some((d: string) => d.startsWith(dateString));
      }

      // 연속 기간 모드: 기존 로직
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
      const dateComp = dateA.localeCompare(dateB);
      if (dateComp !== 0) return dateComp;
      return Number(a.id) - Number(b.id);
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
          lanes[i] = { endDate, eventId: Number(event.id) };
          break;
        }
      }

      // 사용 가능한 레인이 없고 레인이 3개 미만이면 새 레인 추가
      if (assignedLane === -1 && lanes.length < 3) {
        assignedLane = lanes.length;
        lanes.push({ endDate, eventId: Number(event.id) });
      }

      // 레인을 할당받지 못한 경우 (3개 모두 사용 중) 처리하지 않음
      if (assignedLane === -1) return;

      // 색상 할당
      let colorBg: string;
      if (isFullscreen) {
        // 전체화면 모드: 이벤트 ID 기반 고유 색상
        colorBg = getEventColor(Number(event.id), event.category);
      } else {
        // 일반 모드: 카테고리와 레인에 따라 색상 결정
        if (event.category === "class") {
          // 강습: 보라색 계열
          colorBg =
            assignedLane === 0
              ? "ECAL-event-bg-purple-500"
              : assignedLane === 1
                ? "ECAL-event-bg-purple-600"
                : "ECAL-event-bg-purple-400";
        } else {
          // 행사: 파란색 계열
          colorBg =
            assignedLane === 0
              ? "ECAL-event-bg-blue-500"
              : assignedLane === 1
                ? "ECAL-event-bg-blue-600"
                : "ECAL-event-bg-blue-400";
        }
      }

      map.set(Number(event.id), { lane: assignedLane, color: colorBg });
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

      console.log(`[Calendar] Fullscreen click on: ${date.toString()} (ISO: ${date.toISOString()})`);

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
          ".ECAL-grid-wrapper",
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
  const renderMultiDayTitlesOverlay = (days: Date[], _monthDate: Date) => {
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
          const laneInfo = eventLaneMap.get(Number(event.id));
          if (!laneInfo || laneInfo.lane >= 3 || processedEvents.has(Number(event.id))) return;

          const startDate = event.start_date || event.date || "";
          const endDate = event.end_date || event.date || "";
          const isStart = dateString === startDate;

          // 이 주에서 시작하는 이벤트만 처리
          if (!isStart) return;

          processedEvents.add(Number(event.id));

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
                .map((e) => Number(e.id)),
            )
            : null;

          const isFaded = selectedDateEventIds !== null && !selectedDateEventIds.has(Number(event.id));
          const isHovered = viewMode === "month" && hoveredEventId === Number(event.id);

          titleSegments.push({
            eventId: Number(event.id),
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
        className="ECAL-overlay-container"
      >
        {titleSegments.map((segment, idx) => {
          const barHeight = segment.isHovered ? 20 : 14;
          const laneOffset = segment.lane * (barHeight + 2); // 레인별 간격

          return (
            <div
              key={`${segment.eventId}-${segment.weekRow}-${idx}`}
              className="ECAL-overlay-item"
              style={{
                gridColumn: `${segment.startCol + 1} / span ${segment.span}`,
                gridRow: segment.weekRow + 1,
                '--lane-offset': `${laneOffset}px`,
                '--bar-height': `${barHeight}px`,
                opacity: segment.isFaded ? 0.2 : segment.isHovered ? 1 : 0.8,
                zIndex: segment.isHovered ? 30 : 20,
              } as React.CSSProperties}
            >
              <span
                className="ECAL-overlay-title"
                style={{
                  lineHeight: 'var(--bar-height)',
                } as React.CSSProperties}
              >
                {segment.title}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  // 전체화면 모드 그리드 렌더링
  const renderFullscreenGrid = (days: Date[], monthDate: Date) => {
    return days.map((day, index) => {
      const year = day.getFullYear();
      const month = String(day.getMonth() + 1).padStart(2, "0");
      const dayNum = String(day.getDate()).padStart(2, "0");
      const dateString = `${year}-${month}-${dayNum}`;
      const todayFlag = isToday(day);
      const isOtherMonth = day.getMonth() !== monthDate.getMonth();

      // Check if this is the last row (last 7 days in the grid)
      const isLastRow = index >= days.length - 7;

      // 해당 날짜의 모든 이벤트 가져오기 (필터링 없이)
      const dayEvents = getEventsForDate(day);

      return (
        <div
          key={dateString}
          onClick={(e) => handleDateClick(day, e.nativeEvent as PointerEvent)}
          className="ECAL-cell-fullscreen"
          style={{
            '--cell-height': `${cellHeight}px`,
            paddingBottom: isLastRow ? 'calc(60px + env(safe-area-inset-bottom))' : undefined
          } as React.CSSProperties}
        >
          {/* 헤더: 날짜 숫자 */}
          <div className="ECAL-cell-fullscreen-header">
            <span
              className={`ECAL-date-number-fullscreen ${todayFlag ? "ECAL-date-number-today" : ""}`}
              style={{
                opacity: isOtherMonth ? 0.3 : 1,
              }}
            >
              <span style={{ marginRight: '2px' }}>{day.getDate()}</span>
              <span style={{ fontSize: '10px', fontWeight: 'normal', opacity: 0.8 }}>
                {["일", "월", "화", "수", "목", "금", "토"][day.getDay()]}
              </span>
            </span>
          </div>

          {/* 바디: 이벤트 리스트 */}
          <div className="ECAL-cell-fullscreen-body">
            {dayEvents.map((event) => {
              const categoryColor = getEventColor(Number(event.id), event.category);
              const thumbnailUrl = getEventThumbnail(event, defaultThumbnailClass, defaultThumbnailEvent);

              // 개별 날짜 설정이 여러 개일 때 순번 계산
              let dateIndex = -1;
              if (event.event_dates && event.event_dates.length > 1) {
                dateIndex = event.event_dates.findIndex(d => d.startsWith(dateString));
              }

              return (
                <div
                  key={event.id}
                  className="ECAL-fullscreen-event-card"
                  data-event-id={event.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    window.dispatchEvent(
                      new CustomEvent("eventSelected", { detail: event })
                    );
                  }}
                >
                  {/* 이미지 컨테이너 (순번 배지 포함) */}
                  <div className="ECAL-fullscreen-image-wrapper">
                    {/* 이미지 (있으면 표시) */}
                    {thumbnailUrl ? (
                      <div className={`ECAL-fullscreen-image-container ${highlightedEventId === Number(event.id) ? 'ECAL-event-highlighted' : ''}`}>
                        <img
                          src={thumbnailUrl}
                          alt=""
                          className="ECAL-fullscreen-image"
                          loading="lazy"
                          decoding="async"
                        />
                      </div>
                    ) : (
                      <div className={`ECAL-fullscreen-placeholder ${categoryColor} ${highlightedEventId === Number(event.id) ? 'ECAL-event-highlighted' : ''}`}>
                        <span className="ECAL-category-badge-text">
                          {event.title.charAt(0)}
                        </span>
                      </div>
                    )}

                    {/* 순번 배지 - 개별 날짜가 여러 개일 때만 표시 */}
                    {dateIndex >= 0 && (
                      <div className="ECAL-event-sequence-badge">
                        {dateIndex + 1}주차
                      </div>
                    )}
                  </div>

                  {/* 제목 */}
                  <div className="ECAL-fullscreen-title-container">
                    <div className="ECAL-fullscreen-title">
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

  // 일반 모드 그리드 렌더링
  const renderNormalGrid = (days: Date[], monthDate: Date) => {
    return days.map((day) => {
      const dayEvents = getEventsForDate(day);
      const todayFlag = isToday(day);

      const year = day.getFullYear();
      const month = String(day.getMonth() + 1).padStart(2, "0");
      const dayNum = String(day.getDate()).padStart(2, "0");
      const dateString = `${year}-${month}-${dayNum}`;

      // 연속 이벤트와 단일 이벤트 분리
      const multiDayEvents = dayEvents.filter((event) => {
        if (event.event_dates && event.event_dates.length > 0) return false;
        const startDate = (event.start_date || event.date || "").substring(0, 10);
        const endDate = (event.end_date || event.date || "").substring(0, 10);
        return startDate !== endDate;
      });

      const singleDayEvents = dayEvents.filter((event) => {
        if (event.event_dates && event.event_dates.length > 0) return true;
        const startDate = (event.start_date || event.date || "").substring(0, 10);
        const endDate = (event.end_date || event.date || "").substring(0, 10);
        return startDate === endDate;
      });

      // 선택된 날짜에 속한 이벤트 ID 목록
      const selectedDateEventIds = selectedDate
        ? new Set(
          getEventsForDate(selectedDate)
            .filter((event) => {
              if (event.event_dates && event.event_dates.length > 0) return false;
              const startDate = (event.start_date || event.date || "").substring(0, 10);
              const endDate = (event.end_date || event.date || "").substring(0, 10);
              return startDate !== endDate;
            })
            .map((event) => Number(event.id)),
        )
        : null;

      // 연속 이벤트 바 정보 계산 (레인 맵 기반, 최대 3개 레인)
      const eventBarsMap = new Map<number, any>();

      multiDayEvents.forEach((event) => {
        const laneInfo = eventLaneMap.get(Number(event.id));
        if (!laneInfo || laneInfo.lane >= 3) return;

        const startDate = (event.start_date || event.date || "").substring(0, 10);
        const endDate = (event.end_date || event.date || "").substring(0, 10);
        const isStart = dateString === startDate;
        const isEnd = dateString === endDate;

        const isFaded = selectedDateEventIds !== null && !selectedDateEventIds.has(Number(event.id));

        eventBarsMap.set(laneInfo.lane, {
          eventId: Number(event.id),
          isStart,
          isEnd,
          categoryColor: laneInfo.color,
          isFaded,
        });
      });

      // 레인 0, 1, 2를 순서대로 배열로 변환
      const eventBarsData = [0, 1, 2].map((lane) => eventBarsMap.get(lane) || null);

      const isOtherMonth = day.getMonth() !== monthDate.getMonth();
      const isSelected = selectedDate && day.toDateString() === selectedDate.toDateString();

      let bgColor = undefined;
      if (isOtherMonth) {
        bgColor = '#252525';
      } else if (isSelected) {
        bgColor = '#2563eb'; // blue-600
      }

      return (
        <div
          key={dateString}
          onClick={(e) => handleDateClick(day, e.nativeEvent as PointerEvent)}
          className={`ECAL-cell-base ${!isOtherMonth && !isSelected ? 'ECAL-cell-hoverable' : ''}`}
          style={{
            minHeight: 'var(--ECAL-cell-height, 100px)',
            height: '100%',
            backgroundColor: bgColor
          }}
        >
          <div className={`ECAL-cell-content ${isSelected ? "ECAL-cell-selected" : "ECAL-cell-default"}`}>
            <span
              className={`ECAL-date-number ${todayFlag ? "ECAL-date-number-today" : ""}`}
              style={{
                opacity: isOtherMonth ? 0.15 : undefined,
                '--date-font-size': `${dateFontSize}px`,
              } as React.CSSProperties}
            >
              {day.getDate()}
            </span>

            {/* 단일 이벤트 표시 - 크기에 따라 숫자 또는 바 */}
            {singleDayEvents.length > 0 && (() => {
              const isHoveredSingle = viewMode === "month" && hoveredEventId !== null && singleDayEvents.some((e) => Number(e.id) === hoveredEventId);
              const showAsBars = cellHeight > 55;

              if (!showAsBars) {
                return (
                  <span className={`ECAL-event-count ${isHoveredSingle ? "ECAL-event-count-hovered" : "ECAL-event-count-default"}`}>
                    +{singleDayEvents.length}
                  </span>
                );
              } else {
                return null;
              }
            })()}
          </div>

          {/* 단일 이벤트 바 표시 - 셀이 클 때만 */}
          {cellHeight > 55 && singleDayEvents.length > 0 && (
            <div
              className="ECAL-event-container-normal"
            >
              {singleDayEvents.slice(0, Math.floor((cellHeight - 30) / 16)).map((event) => {
                const categoryColor = getEventColor(Number(event.id), event.category);
                const isHovered = viewMode === "month" && hoveredEventId === Number(event.id);
                return (
                  <div
                    key={event.id}
                    className={`ECAL-event-chip ${categoryColor} ${isHovered ? "hovered" : "default"}`}
                  >
                    {event.title}
                  </div>
                );
              })}
            </div>
          )}

          {/* 연속 이벤트 바 표시 (일반 모드에서만) */}
          {calendarMode !== 'fullscreen' && (
            <div className="ECAL-event-bar-container">
              {eventBarsData.map((bar, index) => {
                if (!bar) return null;
                const isHovered =
                  viewMode === "month" && hoveredEventId === bar.eventId;

                // 바 위치 계산 (아래에서부터 쌓임)
                const bottomOffset = index * 6 + 2; // 2px base + 6px per lane

                return (
                  <div
                    key={`${dateString}-bar-${index}`}
                    className={`ECAL-event-bar-segment ${bar.categoryColor} ${bar.isFaded ? "faded" : isHovered ? "hovered" : "default"
                      } ${bar.isStart ? "rounded-l" : ""} ${bar.isEnd ? "rounded-r" : ""
                      }`}
                    style={{
                      bottom: `${bottomOffset}px`,
                      left: bar.isStart ? "2px" : "0",
                      right: bar.isEnd ? "2px" : "0",
                    }}
                  />
                );
              })}
            </div>
          )}
        </div>
      );
    });
  };

  // 통합 렌더링 함수 (모드에 따라 분기)
  const renderCalendarGrid = (days: Date[], monthDate: Date) => {
    if (calendarMode === 'fullscreen') {
      return renderFullscreenGrid(days, monthDate);
    } else {
      return renderNormalGrid(days, monthDate);
    }
  };

  // 연간 보기용 년도 리스트 렌더링
  const renderYearView = () => {
    const years = Array.from({ length: 11 }, (_, i) => yearRangeBase - 5 + i); // yearRangeBase ±5년
    const selectedYear = currentMonth.getFullYear();

    return (
      <div className="ECAL-year-view-container">
        <div className="ECAL-year-grid">
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
                className={`ECAL-year-button ${isSelected ? "selected" : "default"}`}
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
        className="EventCalendar ECAL-main-container"

      >
        {/* Desktop Header */}
        {/* Desktop Header */}
        {showHeader && (
          <div className="ECAL-header">
            <h2 className="ECAL-header-title">
              {viewMode === "year" ? (
                `${currentMonth.getFullYear()}년`
              ) : (
                <>
                  {currentMonth.getFullYear()}년{" "}
                  <div className="ECAL-month-dropdown-wrapper">
                    <button
                      onClick={toggleMonthDropdown}
                      className="ECAL-nav-button"
                    >
                      <span>{monthNames[currentMonth.getMonth()]}</span>
                      <i
                        className={`ri-arrow-down-s-line ECAL-month-dropdown-icon ${showMonthDropdown ? "rotated" : ""}`}
                      ></i>
                    </button>

                    {showMonthDropdown && (
                      <div className="ECAL-month-dropdown">
                        {monthNames.map((month, index) => (
                          <button
                            key={index}
                            onClick={() => navigateToMonth(index)}
                            className={`ECAL-month-option ${index === currentMonth.getMonth()
                              ? "selected"
                              : "ECAL-text-secondary"
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
            <div className="ECAL-nav-group">
              <button
                onClick={() => navigateMonth("prev")}
                className="ECAL-nav-button"
              >
                <i className="ri-arrow-left-s-line ECAL-nav-icon"></i>
              </button>
              <button
                onClick={() => navigateMonth("next")}
                className="ECAL-nav-button"
              >
                <i className="ri-arrow-right-s-line ECAL-nav-icon"></i>
              </button>
            </div>
          </div>
        )}
        {
          viewMode === "year" ? (
            // 연간 보기
            <div className="ECAL-grid-wrapper">{renderYearView()}</div>
          ) : (
            // 월간 보기
            <>
              {/* Days of week header */}
              {/* Days of week header moved to parent component */}


              {/* Calendar grid - 3개 달력 캐러셀 */}
              <div className={`ECAL-carousel-container ${calendarMode === 'fullscreen' ? 'ECAL-mode-fullscreen' : 'ECAL-mode-normal'} ${isTransitioning ? 'ECAL-transitioning' : ''}`}>
                <div
                  className="ECAL-carousel-track"
                  style={{
                    '--drag-offset': `${externalDragOffset}px`,
                    transition: externalIsAnimating
                      ? "transform 0.3s ease-out"
                      : "none",
                  } as React.CSSProperties}
                >
                  {/* 이전 달 */}
                  <div
                    key={`${prevMonth.getFullYear()}-${prevMonth.getMonth()}`}
                    className="ECAL-month-slide"
                    style={{ width: "33.3333%" }}
                  >
                    <div
                      className="ECAL-grid-container"
                      style={{
                        gridTemplateRows: (calendarMode === 'fullscreen' && !isTransitioning)
                          ? `repeat(${getActualWeeksCount(prevMonth)}, auto)`
                          : (isTransitioning ? 'repeat(6, 1fr)' : 'repeat(6, calc(173px / 6))'),
                        gridAutoRows: undefined,
                        minHeight: '100%',
                      } as React.CSSProperties}
                    >
                      {isTransitioning ? renderFullscreenGrid(prevDays, prevMonth) : renderCalendarGrid(prevDays, prevMonth)}

                    </div>
                    {calendarMode !== 'fullscreen' && !isTransitioning && renderMultiDayTitlesOverlay(prevDays, prevMonth)}
                  </div>

                  {/* 현재 달 */}
                  <div
                    key={`${currentMonth.getFullYear()}-${currentMonth.getMonth()}`}
                    className="ECAL-month-slide"
                  >
                    <div
                      className="ECAL-grid-container"
                      style={{
                        gridTemplateRows: (calendarMode === 'fullscreen' && !isTransitioning)
                          ? `repeat(${getActualWeeksCount(currentMonth)}, auto)`
                          : (isTransitioning ? 'repeat(6, 1fr)' : 'repeat(6, calc(173px / 6))'),
                        gridAutoRows: undefined,
                        minHeight: '100%',
                      } as React.CSSProperties}
                    >
                      {isTransitioning ? renderFullscreenGrid(currentDays, currentMonth) : renderCalendarGrid(currentDays, currentMonth)}

                    </div>
                    {calendarMode !== 'fullscreen' && !isTransitioning && renderMultiDayTitlesOverlay(currentDays, currentMonth)}
                  </div>

                  {/* 다음 달 */}
                  <div
                    key={`${nextMonth.getFullYear()}-${nextMonth.getMonth()}`}
                    className="ECAL-month-slide"
                  >
                    <div
                      className="ECAL-grid-container"
                      style={{
                        gridTemplateRows: (calendarMode === 'fullscreen' && !isTransitioning)
                          ? `repeat(${getActualWeeksCount(nextMonth)}, auto)`
                          : (isTransitioning ? 'repeat(6, 1fr)' : 'repeat(6, calc(173px / 6))'),
                        gridAutoRows: undefined,
                        minHeight: '100%',
                        '': `calc(173px / 6)`
                      } as React.CSSProperties}
                    >
                      {isTransitioning ? renderFullscreenGrid(nextDays, nextMonth) : renderCalendarGrid(nextDays, nextMonth)}

                    </div>
                    {calendarMode !== 'fullscreen' && !isTransitioning && renderMultiDayTitlesOverlay(nextDays, nextMonth)}
                  </div>
                </div>
              </div>
            </>
          )
        }
      </div >

      {/* 이벤트 등록 모달 */}
      {
        showRegistrationModal && selectedDate && (
          <EventRegistrationModal
            isOpen={showRegistrationModal}
            onClose={() => setShowRegistrationModal(false)}
            selectedDate={selectedDate}
            onEventCreated={handleEventCreated}
          />
        )
      }
    </>
  );
});
