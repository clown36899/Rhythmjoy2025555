import { useState, useEffect, useMemo } from "react";
import { supabase } from "../../../lib/supabase";
import type { Event } from "../../../lib/supabase";
import EventRegistrationModal from "../../../components/EventRegistrationModal";

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
}: EventCalendarProps) {
  const [internalCurrentMonth, setInternalCurrentMonth] = useState(new Date());
  const [showMonthDropdown, setShowMonthDropdown] = useState(false);
  const [events, setEvents] = useState<Event[]>([]);
  const [showRegistrationModal, setShowRegistrationModal] = useState(false);
  const [yearRangeBase, setYearRangeBase] = useState(new Date().getFullYear());

  // 외부에서 전달된 currentMonth가 있으면 사용, 없으면 내부 상태 사용
  const currentMonth = externalCurrentMonth || internalCurrentMonth;

  // 달력 셀 높이 계산 (전체 높이에서 헤더 높이를 빼고 6행으로 나눔)
  const cellHeight = calendarHeightPx 
    ? Math.max(30, (calendarHeightPx - 16) / 6) // 헤더 16px 제외, 최소 30px
    : 50; // 기본 높이 50px

  // 날짜 폰트 크기 계산 (작게 고정)
  const dateFontSize = 13; // 고정 크기로 작게
  const eventCountFontSize = Math.max(7, Math.min(10, cellHeight * 0.15)); // 작은 폰트

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

    return events.filter((event) => {
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
    const multiDayEvents = events.filter((event) => {
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

      // 색상 할당: 카테고리에 따라 색상 결정
      let colorBg: string;
      if (event.category === "class") {
        // 강습: 보라색 계열
        colorBg =
          assignedLane === 0
            ? "bg-purple-500"
            : assignedLane === 1
              ? "bg-purple-600"
              : "bg-purple-400";
      } else {
        // 행사: 파란색 계열
        colorBg =
          assignedLane === 0
            ? "bg-blue-500"
            : assignedLane === 1
              ? "bg-blue-600"
              : "bg-blue-400";
      }

      map.set(event.id, { lane: assignedLane, color: colorBg });
    });

    return map;
  }, [events, currentMonth]);

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
      // 두 번째 클릭: 선택 해제 (전체 일정 보이기)
      onDateSelect(null);
      return;
    } else {
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
          ".flex-1.overflow-y-auto",
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
          className={`calendar-day-cell relative no-select transition-all duration-300 ${
            !isOtherMonth && !isSelected ? 'hover:bg-gray-700' : ''
          }`}
          style={{ backgroundColor: bgColor }}
        >
          <div
            onPointerDown={(e) => {
              // 터치/마우스 시작 시 타이머 설정
              const startTime = Date.now();
              const startX = e.clientX;
              const startY = e.clientY;

              const handlePointerUp = (upEvent: PointerEvent) => {
                const endTime = Date.now();
                const endX = upEvent.clientX;
                const endY = upEvent.clientY;
                const duration = endTime - startTime;
                const distance = Math.sqrt(
                  Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2),
                );

                // 200ms 이내이고 10px 이내 이동만 클릭으로 간주
                if (duration < 200 && distance < 10) {
                  handleDateClick(day, upEvent);
                }

                window.removeEventListener("pointerup", handlePointerUp);
              };

              window.addEventListener("pointerup", handlePointerUp);
            }}
            className={`w-full h-full cursor-pointer relative overflow-visible no-select ${
              isSelected ? "text-white z-10" : "text-gray-300"
            }`}
          >
            {/* 날짜 숫자 - 왼쪽 위로 완전히 붙임 */}
            <span 
              className={`absolute font-bold z-30 no-select ${
                todayFlag 
                  ? "flex items-center justify-center rounded-full bg-blue-500 text-white" 
                  : ""
              } ${calendarMode === 'fullscreen' ? 'top-0 left-0.5' : 'top-1 left-2'}`}
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
                      className={`absolute top-0.5 right-0.5 rounded-full px-1 flex items-center justify-center font-medium transition-all duration-200 z-30 no-select ${
                        isHoveredSingle
                          ? "bg-blue-500 text-white transform scale-110"
                          : "bg-gray-600 text-gray-300"
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
          {cellHeight > 55 && singleDayEvents.length > 0 && (
            <div 
              className={`absolute flex flex-col gap-0.5 pointer-events-none ${
                calendarMode === 'fullscreen' ? 'left-0.5 right-0.5' : 'left-1 right-1'
              }`} 
              style={{ top: calendarMode === 'fullscreen' ? '16px' : '28px' }}
            >
              {singleDayEvents.slice(0, Math.floor((cellHeight - (calendarMode === 'fullscreen' ? 18 : 30)) / 16)).map((event) => {
                const categoryColor = event.category === 'class' ? 'bg-green-500' : 'bg-blue-500';
                const isHovered = viewMode === "month" && hoveredEventId === event.id;
                
                return (
                  <div
                    key={event.id}
                    className={`rounded-full text-[10px] font-medium truncate transition-all duration-200 ${categoryColor} ${
                      isHovered ? 'opacity-100 scale-105' : 'opacity-80'
                    } ${calendarMode === 'fullscreen' ? 'px-1' : 'px-1.5'}`}
                    style={{ 
                      height: calendarMode === 'fullscreen' ? '13px' : '14px',
                      lineHeight: calendarMode === 'fullscreen' ? '13px' : '14px',
                      color: 'white'
                    }}
                  >
                    {event.title}
                  </div>
                );
              })}
            </div>
          )}

          {/* 멀티데이 이벤트 바 표시 - 날짜 칸 하단에 겹쳐서 배치 */}
          {eventBarsData.some((bar) => bar !== null) && (
            <div className="absolute bottom-0 left-0 right-0 h-5 pointer-events-none">
              {eventBarsData.map((bar, i) => {
                // 호버된 이벤트인지 확인 (월간 보기일 때만)
                const isHovered =
                  viewMode === "month" &&
                  hoveredEventId !== null &&
                  bar?.eventId === hoveredEventId;

                if (!bar) return null;

                // 셀이 클 때는 제목 표시
                const showTitle = cellHeight > 55 && bar.isStart;
                const event = showTitle ? multiDayEvents.find(e => e.id === bar.eventId) : null;

                return (
                  <div
                    key={i}
                    className={`absolute bottom-0 left-0 right-0 transition-all duration-200 overflow-hidden flex items-center px-1.5 ${
                      bar.categoryColor
                    } ${
                      bar.isStart && bar.isEnd
                        ? "rounded-full"
                        : bar.isStart
                          ? "rounded-l-full"
                          : bar.isEnd
                            ? "rounded-r-full"
                            : ""
                    } ${
                      bar.isFaded
                        ? "opacity-20 h-1.5 z-0"
                        : isHovered
                          ? "opacity-100 h-5 z-10"
                          : cellHeight > 55
                            ? "opacity-80 h-3.5 z-0"
                            : "opacity-60 h-1.5 z-0"
                    }`}
                  >
                    {showTitle && event && (
                      <span className="text-[10px] font-medium truncate text-white">
                        {event.title}
                      </span>
                    )}
                  </div>
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
      <div className="p-2">
        <div className="grid grid-cols-3 gap-2">
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
                className={`py-2 px-3 rounded-lg text-sm font-bold transition-all cursor-pointer ${
                  isSelected
                    ? "bg-blue-600 text-white"
                    : "bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white"
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
        className="rounded-none p-0 flex flex-col no-select"
        style={{ backgroundColor: "var(--calendar-bg-color)" }}
      >
        {/* Desktop Header */}
        {showHeader && (
          <div className="hidden items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-white">
              {viewMode === "year" ? (
                `${currentMonth.getFullYear()}년`
              ) : (
                <>
                  {currentMonth.getFullYear()}년{" "}
                  <div className="relative inline-block">
                    <button
                      onClick={toggleMonthDropdown}
                      className="hover:text-blue-400 transition-colors cursor-pointer flex items-center space-x-1"
                    >
                      <span>{monthNames[currentMonth.getMonth()]}</span>
                      <i
                        className={`ri-arrow-down-s-line transition-transform ${showMonthDropdown ? "rotate-180" : ""}`}
                      ></i>
                    </button>

                    {showMonthDropdown && (
                      <div className="absolute top-full left-0 mt-2 bg-gray-700 rounded-lg shadow-lg z-10 min-w-[120px]">
                        {monthNames.map((month, index) => (
                          <button
                            key={index}
                            onClick={() => navigateToMonth(index)}
                            className={`w-full text-left px-4 py-2 hover:bg-gray-600 transition-colors cursor-pointer first:rounded-t-lg last:rounded-b-lg ${
                              index === currentMonth.getMonth()
                                ? "bg-blue-600 text-white"
                                : "text-gray-300"
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
            <div className="flex space-x-2">
              <button
                onClick={() => navigateMonth("prev")}
                className="p-2 text-gray-400 hover:text-white transition-colors cursor-pointer"
              >
                <i className="ri-arrow-left-s-line text-xl"></i>
              </button>
              <button
                onClick={() => navigateMonth("next")}
                className="p-2 text-gray-400 hover:text-white transition-colors cursor-pointer"
              >
                <i className="ri-arrow-right-s-line text-xl"></i>
              </button>
            </div>
          </div>
        )}
        {viewMode === "year" ? (
          // 연간 보기
          <div className="flex-1 overflow-y-auto">{renderYearView()}</div>
        ) : (
          // 월간 보기
          <>
            {/* Days of week header */}
            <div className="no-select">
              <div className="grid grid-cols-7 gap-0 h-4 calendar-grid-container">
                {["일", "월", "화", "수", "목", "금", "토"].map((day, index) => (
                  <div
                    key={day}
                    className="calendar-day-header text-center text-gray-400 font-semibold py-0 text-[9px] flex items-center justify-center no-select"
                    style={{ color: index === 0 ? 'rgb(190, 0, 0)' : undefined }}
                  >
                    {day}
                  </div>
                ))}
              </div>
            </div>

            {/* Calendar grid - 3개 달력 캐러셀 */}
            <div className="overflow-hidden flex-1">
              <div
                className="flex"
                style={{
                  transform: `translateX(calc(-100% + ${externalDragOffset}px))`,
                  transition: externalIsAnimating
                    ? "transform 0.3s ease-out"
                    : "none",
                }}
              >
                {/* 이전 달 */}
                <div
                  key={`${prevMonth.getFullYear()}-${prevMonth.getMonth()}`}
                  className="pb-0 flex-shrink-0"
                  style={{ width: "100%" }}
                >
                  <div 
                    className="grid grid-cols-7 gap-0 calendar-grid-container"
                    style={{ 
                      gridAutoRows: `max(30px, calc((var(--live-calendar-height, ${calendarHeightPx || 300}px) - 16px) / 6))`,
                      '--calendar-cell-height': `max(30px, calc((var(--live-calendar-height, ${calendarHeightPx || 300}px) - 16px) / 6))`
                    } as React.CSSProperties}
                  >
                    {renderCalendarGrid(prevDays, prevMonth)}
                  </div>
                </div>

                {/* 현재 달 */}
                <div
                  key={`${currentMonth.getFullYear()}-${currentMonth.getMonth()}`}
                  className="pb-0 flex-shrink-0"
                  style={{ width: "100%" }}
                >
                  <div 
                    className="grid grid-cols-7 gap-0 calendar-grid-container"
                    style={{ 
                      gridAutoRows: `max(30px, calc((var(--live-calendar-height, ${calendarHeightPx || 300}px) - 16px) / 6))`,
                      '--calendar-cell-height': `max(30px, calc((var(--live-calendar-height, ${calendarHeightPx || 300}px) - 16px) / 6))`
                    } as React.CSSProperties}
                  >
                    {renderCalendarGrid(currentDays, currentMonth)}
                  </div>
                </div>

                {/* 다음 달 */}
                <div
                  key={`${nextMonth.getFullYear()}-${nextMonth.getMonth()}`}
                  className="pb-0 flex-shrink-0"
                  style={{ width: "100%" }}
                >
                  <div 
                    className="grid grid-cols-7 gap-0 calendar-grid-container"
                    style={{ 
                      gridAutoRows: `max(30px, calc((var(--live-calendar-height, ${calendarHeightPx || 300}px) - 16px) / 6))`,
                      '--calendar-cell-height': `max(30px, calc((var(--live-calendar-height, ${calendarHeightPx || 300}px) - 16px) / 6))`
                    } as React.CSSProperties}
                  >
                    {renderCalendarGrid(nextDays, nextMonth)}
                  </div>
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
