import { useState, useEffect } from "react";
import { supabase } from "../../../lib/supabase";
import type { Event } from "../../../lib/supabase";
import EventRegistrationModal from "../../../components/EventRegistrationModal";

interface EventCalendarProps {
  selectedDate: Date | null;
  onDateSelect: (date: Date | null) => void;
  onMonthChange?: (month: Date) => void;
  showHeader?: boolean;
  currentMonth?: Date;
  onEventsUpdate?: () => void;
}

export default function EventCalendar({
  selectedDate,
  onDateSelect,
  onMonthChange,
  showHeader = true,
  currentMonth: externalCurrentMonth,
  onEventsUpdate,
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

  // 외부에서 전달된 currentMonth가 있으면 사용, 없으면 내부 상태 사용
  const currentMonth = externalCurrentMonth || internalCurrentMonth;

  // 외부 currentMonth가 변경되면 내부 상태도 업데이트
  useEffect(() => {
    if (externalCurrentMonth) {
      setInternalCurrentMonth(externalCurrentMonth);
    }
  }, [externalCurrentMonth]);

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
        .order("date", { ascending: true });

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

  const getEventCount = (date: Date) => {
    // 로컬 시간대를 유지하여 날짜 문자열 생성
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const dateString = `${year}-${month}-${day}`;

    return events.filter((event) => event.date === dateString).length;
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const navigateMonth = (direction: "prev" | "next") => {
    if (isAnimating) return;

    const newMonth = new Date(currentMonth);
    if (direction === "prev") {
      newMonth.setMonth(currentMonth.getMonth() - 1);
    } else {
      newMonth.setMonth(currentMonth.getMonth() + 1);
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

  const handleEventCreated = () => {
    fetchEvents();
    onEventsUpdate?.();
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
      const eventCount = day ? getEventCount(day) : 0;
      const todayFlag = day ? isToday(day) : false;
      return (
        <div key={`${monthDate.getMonth()}-${index}`} className="h-7 lg:aspect-square p-0 lg:p-0">
          {day && (
            <button
              onClick={() => handleDateClick(day)}
              className={`w-full h-full flex flex-col items-center justify-center text-[13px] lg:text-sm rounded lg:rounded-lg transition-all duration-300 cursor-pointer relative overflow-hidden ${
                selectedDate &&
                day.toDateString() === selectedDate.toDateString()
                  ? "bg-blue-600 text-white transform scale-105"
                  : "text-gray-300 hover:bg-gray-700"
              }`}
            >
              {/* 날짜 숫자 */}
              <span className="font-bold relative z-10">
                {day.getDate()}
              </span>

              {/* 오늘 표시 */}
              {todayFlag && (
                <div className="relative z-10 flex items-center justify-center mt-0.5">
                  <div className="text-blue-400 text-[8px] lg:text-[16px] font-black leading-none">
                    오늘
                  </div>
                </div>
              )}

              {/* 이벤트 개수 표시 - 파란 점으로만 표시 */}
              {eventCount > 0 && (
                <div
                  className={`flex items-center justify-center relative z-10 ${todayFlag ? "mt-0" : "mt-0.5 lg:mt-1"}`}
                >
                  {eventCount <= 3 ? (
                    <div className="flex space-x-0.5">
                      {Array.from({
                        length: Math.min(eventCount, 3),
                      }).map((_, i) => (
                        <div
                          key={i}
                          className="w-1 h-1 lg:w-1.5 lg:h-1.5 rounded-full bg-blue-400"
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="bg-blue-400 text-white text-[4px] lg:text-[8px] rounded-full w-2.5 h-2.5 lg:w-4 lg:h-4 flex items-center justify-center font-bold leading-none">
                      {eventCount}
                    </div>
                  )}
                </div>
              )}
            </button>
          )}
        </div>
      );
    });
  };

  return (
    <>
      <div className="bg-gray-800 rounded-none lg:rounded-lg p-0 lg:p-6 h-full flex flex-col">
        {/* Desktop Header */}
        {showHeader && (
          <div className="hidden lg:flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-white">
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
              transition: isDragging ? 'none' : 'transform 0.3s ease-out'
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
