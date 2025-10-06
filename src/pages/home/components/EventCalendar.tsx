import { useState, useEffect, useMemo } from "react";
import { supabase } from "../../../lib/supabase";
import type { Event } from "../../../lib/supabase";
import EventRegistrationModal from "../../../components/EventRegistrationModal";
import { getEventColor } from "../../../utils/eventColors";

interface EventCalendarProps {
  selectedDate: Date | null;
  onDateSelect: (date: Date | null) => void;
  onMonthChange?: (month: Date) => void;
  showHeader?: boolean;
  currentMonth?: Date;
  onEventsUpdate?: (createdDate?: Date) => void;
  viewMode?: "month" | "year";
  hoveredEventId?: number | null;
}

export default function EventCalendar({
  selectedDate,
  onDateSelect,
  onMonthChange,
  showHeader = true,
  currentMonth: externalCurrentMonth,
  onEventsUpdate,
  viewMode = "month",
  hoveredEventId,
}: EventCalendarProps) {
  const [internalCurrentMonth, setInternalCurrentMonth] = useState(new Date());
  const [showMonthDropdown, setShowMonthDropdown] = useState(false);
  const [events, setEvents] = useState<Event[]>([]);
  const [showRegistrationModal, setShowRegistrationModal] = useState(false);
  const [clickedDate, setClickedDate] = useState<Date | null>(null);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [yearRangeBase, setYearRangeBase] = useState(new Date().getFullYear());

  // 외부에서 전달된 currentMonth가 있으면 사용, 없으면 내부 상태 사용
  const currentMonth = externalCurrentMonth || internalCurrentMonth;

  // 외부 currentMonth가 변경되면 내부 상태도 업데이트
  useEffect(() => {
    if (externalCurrentMonth) {
      setInternalCurrentMonth(externalCurrentMonth);
    }
  }, [externalCurrentMonth]);

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

    // Add empty cells for days before the first day of the month
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }

    // Add days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(new Date(year, month, day));
    }

    return days;
  };

  const getEventsForDate = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const dateString = `${year}-${month}-${day}`;

    return events.filter((event) => {
      const startDate = event.start_date || event.date || '';
      const endDate = event.end_date || event.date || '';
      
      return startDate && endDate && dateString >= startDate && dateString <= endDate;
    });
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  // 월 단위로 멀티데이 이벤트의 레인과 색상 할당
  const eventLaneMap = useMemo(() => {
    const map = new Map<number, { lane: number; color: string }>();
    const usedColors = new Set<string>();
    
    // 현재 월의 멀티데이 이벤트만 필터링
    const multiDayEvents = events.filter((event) => {
      const startDate = event.start_date || event.date || '';
      const endDate = event.end_date || event.date || '';
      return startDate !== endDate;
    });
    
    // 시작 날짜 기준으로 정렬
    const sortedEvents = [...multiDayEvents].sort((a, b) => {
      const dateA = a.start_date || a.date || '';
      const dateB = b.start_date || b.date || '';
      return dateA.localeCompare(dateB);
    });
    
    // 레인 할당: 겹치지 않는 이벤트는 같은 레인 사용 가능 (최대 3개 레인)
    const lanes: Array<{ endDate: string; eventId: number }> = [];
    
    sortedEvents.forEach((event) => {
      const startDate = event.start_date || event.date || '';
      const endDate = event.end_date || event.date || '';
      
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
      
      // 색상 할당: 이미 사용된 색상 피하기
      let colorIndex = 0;
      let eventColorObj = getEventColor(event.id);
      let colorBg = eventColorObj.bg;
      
      // 충돌 시 다음 색상 시도
      while (usedColors.has(colorBg) && colorIndex < 100) {
        colorIndex++;
        eventColorObj = getEventColor(event.id + colorIndex * 1000);
        colorBg = eventColorObj.bg;
      }
      
      usedColors.add(colorBg);
      map.set(event.id, { lane: assignedLane, color: colorBg });
    });
    
    return map;
  }, [events, currentMonth]);

  const navigateMonth = (direction: "prev" | "next") => {
    if (isAnimating) return;

    const newMonth = new Date(currentMonth);
    if (viewMode === "year") {
      // 연간 보기: 년 단위로 이동
      if (direction === "prev") {
        newMonth.setFullYear(currentMonth.getFullYear() - 1);
      } else {
        newMonth.setFullYear(currentMonth.getFullYear() + 1);
      }
    } else {
      // 월간 보기: 월 단위로 이동
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
    newMonth.setMonth(monthIndex);

    setInternalCurrentMonth(newMonth);
    onMonthChange?.(newMonth);
    setShowMonthDropdown(false);
  };

  const toggleMonthDropdown = () => {
    setShowMonthDropdown(!showMonthDropdown);
  };

  const handleDateClick = (date: Date) => {
    // 이미 선택된 날짜를 다시 클릭하면 이벤트 등록 모달 열기
    if (selectedDate && date.toDateString() === selectedDate.toDateString()) {
      setClickedDate(date);
      setShowRegistrationModal(true);
    } else {
      // 새로운 날짜 선택
      onDateSelect(date);

      // 모바일에서 스크롤을 최상단으로 이동
      if (window.innerWidth < 1024) {
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

  // 스와이프 감지를 위한 최소 거리 (픽셀)
  const minSwipeDistance = 50;

  const onTouchStart = (e: React.TouchEvent) => {
    if (isAnimating) return;
    setTouchStart(e.targetTouches[0].clientX);
    setIsDragging(true);
    setDragOffset(0);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || touchStart === null) return;
    
    const currentTouch = e.targetTouches[0].clientX;
    const diff = currentTouch - touchStart;
    
    // 드래그 오프셋 업데이트 (실시간 반응)
    setDragOffset(diff);
  };

  const onTouchEnd = () => {
    if (!isDragging || touchStart === null) return;
    
    setIsDragging(false);
    
    const distance = dragOffset;
    const threshold = minSwipeDistance;
    
    // 충분히 드래그했는지 확인
    if (Math.abs(distance) > threshold) {
      setIsAnimating(true);
      
      // 화면 너비를 가져오기
      const screenWidth = window.innerWidth;
      
      // 왼쪽으로 드래그 = 다음 달 (음수)
      // 오른쪽으로 드래그 = 이전 달 (양수)
      const direction = distance < 0 ? 'next' : 'prev';
      const targetOffset = distance < 0 ? -screenWidth : screenWidth;
      
      // 1단계: 슬라이드 애니메이션 완료 (화면 끝까지 이동)
      setDragOffset(targetOffset);
      
      // 2단계: 애니메이션 완료 후 달 변경
      setTimeout(() => {
        navigateMonth(direction);
        
        // 3단계: 즉시 드래그 오프셋 리셋 (새로운 현재 달이 중앙에)
        setDragOffset(0);
        setIsAnimating(false);
        setTouchStart(null);
      }, 300);
    } else {
      // 임계값 미달 - 원위치로 스냅백
      setDragOffset(0);
      setTouchStart(null);
    }
  };

  // 이전 달, 현재 달, 다음 달의 날짜들을 생성
  const prevMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1);
  const nextMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
  
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
  const renderCalendarGrid = (days: (Date | null)[], monthDate: Date) => {
    return days.map((day, index) => {
      if (!day) {
        return <div key={`${monthDate.getMonth()}-${index}`} className="h-7 lg:aspect-square p-0 lg:p-0"></div>;
      }

      const dayEvents = getEventsForDate(day);
      const todayFlag = isToday(day);

      const year = day.getFullYear();
      const month = String(day.getMonth() + 1).padStart(2, "0");
      const dayNum = String(day.getDate()).padStart(2, "0");
      const dateString = `${year}-${month}-${dayNum}`;

      // 연속 이벤트와 단일 이벤트 분리
      const multiDayEvents = dayEvents.filter((event) => {
        const startDate = event.start_date || event.date || '';
        const endDate = event.end_date || event.date || '';
        return startDate !== endDate;
      });

      const singleDayEvents = dayEvents.filter((event) => {
        const startDate = event.start_date || event.date || '';
        const endDate = event.end_date || event.date || '';
        return startDate === endDate;
      });

      // 선택된 날짜에 속한 이벤트 ID 목록
      const selectedDateEventIds = selectedDate ? new Set(
        getEventsForDate(selectedDate)
          .filter((event) => {
            const startDate = event.start_date || event.date || '';
            const endDate = event.end_date || event.date || '';
            return startDate !== endDate;
          })
          .map(event => event.id)
      ) : null;

      // 연속 이벤트 바 정보 계산 (레인 맵 기반, 최대 3개 레인)
      const eventBarsMap = new Map<number, { isStart: boolean; isEnd: boolean; categoryColor: string; isFaded: boolean }>();
      
      multiDayEvents.forEach((event) => {
        const laneInfo = eventLaneMap.get(event.id);
        if (!laneInfo || laneInfo.lane >= 3) return; // 최대 3개 레인만
        
        const startDate = event.start_date || event.date || '';
        const endDate = event.end_date || event.date || '';
        const isStart = dateString === startDate;
        const isEnd = dateString === endDate;
        
        // 선택된 날짜가 있고 해당 이벤트가 선택된 날짜에 속하지 않으면 흐리게
        const isFaded = selectedDateEventIds !== null && !selectedDateEventIds.has(event.id);
        
        eventBarsMap.set(laneInfo.lane, {
          isStart,
          isEnd,
          categoryColor: laneInfo.color,
          isFaded,
        });
      });
      
      // 레인 0, 1, 2를 순서대로 배열로 변환 (빈 레인은 null)
      const eventBarsData = [0, 1, 2].map(lane => {
        const bar = eventBarsMap.get(lane);
        return bar || null;
      });

      return (
        <div key={`${monthDate.getMonth()}-${index}`} className="h-7 lg:aspect-square p-0 lg:p-0 relative">
          <button
            onClick={() => handleDateClick(day)}
            className={`w-full h-full flex flex-col items-center justify-center text-[13px] lg:text-sm rounded lg:rounded-lg transition-all duration-300 cursor-pointer relative overflow-visible ${
              selectedDate &&
              day.toDateString() === selectedDate.toDateString()
                ? "bg-blue-600 text-white transform scale-105 z-10"
                : "text-gray-300 hover:bg-gray-700"
            }`}
          >
            {/* 날짜 숫자 */}
            <div className="flex items-center gap-1 relative z-10">
              <span className="font-bold">
                {day.getDate()}
              </span>
              {/* 단일 이벤트 개수 표시 */}
              {singleDayEvents.length > 0 && (
                <span className="text-[8px] lg:text-[10px] bg-gray-600 text-gray-300 rounded px-1 font-medium">
                  +{singleDayEvents.length}
                </span>
              )}
            </div>

            {/* 오늘 표시 */}
            {todayFlag && (
              <div className="relative z-10 flex items-center justify-center mt-0.5">
                <div className="text-blue-400 text-[8px] lg:text-[16px] font-black leading-none">
                  오늘
                </div>
              </div>
            )}
          </button>

          {/* 이벤트 바 표시 - 버튼 아래에 절대 위치 */}
          {eventBarsData.some(bar => bar !== null) && (
            <div className="absolute bottom-0 left-0 right-0 flex flex-col gap-0.5 pb-0.5 pointer-events-none z-20">
              {eventBarsData.map((bar, i) => (
                <div
                  key={i}
                  className={`h-0.5 lg:h-1 w-full ${
                    bar 
                      ? `${bar.categoryColor} ${
                          bar.isStart ? 'rounded-l-full' :
                          bar.isEnd ? 'rounded-r-full' : ''
                        } ${bar.isFaded ? 'opacity-30' : ''}`
                      : 'bg-transparent'
                  }`}
                />
              ))}
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
      <div className="p-2 lg:p-4">
        <div className="grid grid-cols-3 lg:grid-cols-4 gap-2">
          {years.map((year) => {
            const isSelected = selectedYear === year;
            
            return (
              <button
                key={year}
                onClick={() => {
                  const newDate = new Date(year, 0, 1);
                  setInternalCurrentMonth(newDate);
                  onMonthChange?.(newDate);
                  onDateSelect(null);
                }}
                className={`py-2 lg:py-3 px-3 lg:px-4 rounded-lg text-sm lg:text-base font-bold transition-all cursor-pointer ${
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
      <div className="bg-gray-800 rounded-none lg:rounded-lg p-0 lg:p-6 h-full flex flex-col">
        {/* Desktop Header */}
        {showHeader && (
          <div className="hidden lg:flex items-center justify-between mb-6">
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
          <div className="flex-1 overflow-y-auto">
            {renderYearView()}
          </div>
        ) : (
          // 월간 보기
          <>
            {/* 이벤트 등록 안내 - 모바일과 데스크톱 모두 표시 */}
            <div className="lg:mt-4 p-1 lg:p-2 bg-gray-700 rounded-none">
              <p className="text-gray-300 text-[10px] lg:text-sm text-center">
                <i className="ri-information-line mr-1 lg:mr-2"></i>
                날짜를 두번 클릭하면 이벤트를 등록할 수 있습니다
              </p>
            </div>
            {/* Days of week header */}
            <div className="grid grid-cols-7 gap-0 lg:gap-1 mb-0 lg:mb-4 px-1 lg:px-0 h-4 lg:h-auto pt-2 lg:pt-0">
              {["일", "월", "화", "수", "목", "금", "토"].map((day) => (
                <div
                  key={day}
                  className="text-center text-gray-400 font-semibold py-0 lg:py-2 text-[9px] lg:text-sm flex items-center justify-center"
                >
                  {day}
                </div>
              ))}
            </div>

            {/* Calendar grid - 3개 달력 캐러셀 */}
            <div className="overflow-hidden flex-1">
              <div 
                className="flex"
                style={{
                  transform: `translateX(calc(-100% + ${dragOffset}px))`,
                  transition: isDragging ? 'none' : isAnimating ? 'transform 0.3s ease-out' : 'none'
                }}
                onTouchStart={onTouchStart}
                onTouchMove={onTouchMove}
                onTouchEnd={onTouchEnd}
              >
                {/* 이전 달 */}
                <div className="grid grid-cols-7 gap-0 lg:gap-1 px-1 lg:px-0 pb-2 lg:pb-0 flex-shrink-0" style={{ width: '100%' }}>
                  {renderCalendarGrid(prevDays, prevMonth)}
                </div>
                
                {/* 현재 달 */}
                <div className="grid grid-cols-7 gap-0 lg:gap-1 px-1 lg:px-0 pb-2 lg:pb-0 flex-shrink-0" style={{ width: '100%' }}>
                  {renderCalendarGrid(currentDays, currentMonth)}
                </div>
                
                {/* 다음 달 */}
                <div className="grid grid-cols-7 gap-0 lg:gap-1 px-1 lg:px-0 pb-2 lg:pb-0 flex-shrink-0" style={{ width: '100%' }}>
                  {renderCalendarGrid(nextDays, nextMonth)}
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* 이벤트 등록 모달 */}
      {showRegistrationModal && clickedDate && (
        <EventRegistrationModal
          isOpen={showRegistrationModal}
          onClose={() => setShowRegistrationModal(false)}
          selectedDate={clickedDate}
          onEventCreated={handleEventCreated}
        />
      )}
    </>
  );
}
