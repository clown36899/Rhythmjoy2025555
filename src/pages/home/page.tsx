import { useState, useEffect, useRef, useCallback } from "react";
import EventCalendar from "./components/EventCalendar";
import EventList from "./components/EventList";
import Header from "./components/Header";
import Footer from "./components/Footer";
import FullscreenBillboard from "../../components/FullscreenBillboard";
import AdminBillboardModal from "./components/AdminBillboardModal";
import { supabase } from "../../lib/supabase";
import { useBillboardSettings } from "../../hooks/useBillboardSettings";

export default function HomePage() {
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [calendarHeight, setCalendarHeight] = useState(240); // 기본 높이
  const calendarRef = useRef<HTMLDivElement>(null);
  const [viewMode, setViewMode] = useState<"month" | "year">("month");
  const [savedMonth, setSavedMonth] = useState<Date | null>(null);
  const [hoveredEventId, setHoveredEventId] = useState<number | null>(null);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [showSortModal, setShowSortModal] = useState(false);
  const [sortBy, setSortBy] = useState<"random" | "time" | "title" | "newest">("random");
  
  const [billboardImages, setBillboardImages] = useState<string[]>([]);
  const [billboardEvents, setBillboardEvents] = useState<any[]>([]);
  const [isBillboardOpen, setIsBillboardOpen] = useState(false);
  const [isBillboardSettingsOpen, setIsBillboardSettingsOpen] = useState(false);
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  const { settings, updateSettings, resetSettings } = useBillboardSettings();

  // 달력 높이 측정
  useEffect(() => {
    const measureCalendarHeight = () => {
      if (calendarRef.current) {
        const height = calendarRef.current.offsetHeight;
        setCalendarHeight(height);
      }
    };

    // 초기 측정
    measureCalendarHeight();

    // ResizeObserver로 달력 크기 변화 감지
    const resizeObserver = new ResizeObserver(() => {
      measureCalendarHeight();
    });

    if (calendarRef.current) {
      resizeObserver.observe(calendarRef.current);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, [currentMonth]);

  // 비활동 타이머 초기화 함수
  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
    }

    // 광고판이 비활성화되어 있거나, 열려있거나, 타이머가 0이면 설정 안 함
    if (!settings.enabled || isBillboardOpen || settings.inactivityTimeout === 0) return;

    // 설정된 시간 후 광고판 자동 열기
    inactivityTimerRef.current = setTimeout(() => {
      if (billboardImages.length > 0) {
        setIsBillboardOpen(true);
      }
    }, settings.inactivityTimeout);
  }, [settings.enabled, settings.inactivityTimeout, isBillboardOpen, billboardImages.length]);

  // 사용자 활동 감지 및 비활동 타이머
  useEffect(() => {
    const activityEvents = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];

    const handleUserActivity = () => {
      resetInactivityTimer();
    };

    // 초기 타이머 시작
    resetInactivityTimer();

    // 이벤트 리스너 등록
    activityEvents.forEach(event => {
      window.addEventListener(event, handleUserActivity);
    });

    return () => {
      // cleanup
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
      activityEvents.forEach(event => {
        window.removeEventListener(event, handleUserActivity);
      });
    };
  }, [resetInactivityTimer]);

  // 광고판 이미지 로드 및 자동 표시
  useEffect(() => {
    const loadBillboardImages = async () => {
      // 광고판이 비활성화되어 있으면 로드하지 않음
      if (!settings.enabled) {
        setBillboardImages([]);
        setBillboardEvents([]);
        return;
      }

      try {
        const today = new Date();
        const todayString = today.toISOString().split('T')[0];

        const { data: events } = await supabase
          .from("events")
          .select("*")
          .not("image", "is", null)
          .neq("image", "")
          .order("date", { ascending: true });

        if (events && events.length > 0) {
          const filteredEvents = events.filter((event) => {
            if (!event.image) return false;
            
            const endDate = event.end_date || event.start_date || event.date;
            if (!endDate) return false;
            
            return endDate >= todayString;
          });

          const images = filteredEvents.map((event) => event.image).filter(Boolean);
          setBillboardImages(images);
          setBillboardEvents(filteredEvents);

          // 자동 열기 설정이 켜져있을 때만 자동으로 표시
          if (settings.autoOpenOnLoad) {
            const todayStr = today.toDateString();
            const dismissedDate = localStorage.getItem("billboardDismissedDate");
            
            if (dismissedDate !== todayStr && images.length > 0) {
              setIsBillboardOpen(true);
            }
          }
        }
      } catch (error) {
        console.error("Error loading billboard images:", error);
      }
    };

    loadBillboardImages();
  }, [settings.enabled, settings.autoOpenOnLoad]);

  const handleBillboardClose = () => {
    setIsBillboardOpen(false);
    const today = new Date().toDateString();
    localStorage.setItem("billboardDismissedDate", today);
  };

  const handleBillboardOpen = () => {
    setIsBillboardOpen(true);
  };

  const handleBillboardSettingsOpen = () => {
    setIsBillboardSettingsOpen(true);
  };

  const handleBillboardSettingsClose = () => {
    setIsBillboardSettingsOpen(false);
  };

  const handleBillboardEventClick = (event: any) => {
    setIsBillboardOpen(false);
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("eventSelected", { detail: event })
      );
    }
  };

  const handleDateSelect = async (date: Date | null) => {
    setSelectedDate(date);

    // 날짜가 선택되었을 때 해당 날짜의 모든 이벤트 카테고리를 감지
    if (date) {
      try {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        const selectedDateString = `${year}-${month}-${day}`;

        // 모든 이벤트를 가져와서 클라이언트에서 날짜 범위 필터링
        const { data: allEvents } = await supabase
          .from("events")
          .select("category, start_date, end_date, date")
          .order("created_at", { ascending: true });

        // 날짜 범위를 고려한 필터링
        const events = allEvents?.filter((event: any) => {
          const startDate = event.start_date || event.date;
          const endDate = event.end_date || event.date;
          return selectedDateString >= startDate && selectedDateString <= endDate;
        }) || [];

        if (events && events.length > 0) {
          // 해당 날짜의 모든 고유 카테고리 추출
          const uniqueCategories = [
            ...new Set(events.map((event) => event.category)),
          ];

          // 카테고리가 1개만 있으면 그 카테고리 선택
          if (uniqueCategories.length === 1) {
            setSelectedCategory(uniqueCategories[0]);
          } else {
            // 2개 이상 있으면 "all"로 설정 (모든 카테고리 표시)
            setSelectedCategory("all");
          }
        } else {
          // 이벤트가 없으면 "all" 카테고리로 설정
          setSelectedCategory("all");
        }
      } catch (error) {
        console.error("Error fetching events for date:", error);
        setSelectedCategory("all");
      }
    }
  };

  const handleMonthChange = (month: Date) => {
    setCurrentMonth(month);
    // 달 이동 시 날짜만 리셋 (카테고리는 유지)
    setSelectedDate(null);
  };

  const handleEventsUpdate = async (createdDate?: Date) => {
    setRefreshTrigger((prev) => prev + 1);
    
    // 이벤트 등록 후 날짜가 전달되었을 때, 그 날짜를 선택 (handleDateSelect가 자동으로 카테고리 감지)
    if (createdDate) {
      await handleDateSelect(createdDate);
    }
  };

  const handleAdminModeToggle = (adminMode: boolean) => {
    setIsAdminMode(adminMode);
  };

  const handleCategoryChange = (category: string) => {
    setSelectedCategory(category);
    // "모든 이벤트"를 클릭했을 때 선택된 날짜 초기화
    if (category === "all") {
      setSelectedDate(null);
    }
  };

  const getSortIcon = () => {
    switch (sortBy) {
      case "random":
        return "ri-shuffle-line";
      case "time":
        return "ri-time-line";
      case "title":
        return "ri-sort-alphabet-asc";
      case "newest":
        return "ri-calendar-line";
      default:
        return "ri-shuffle-line";
    }
  };

  const getSortLabel = () => {
    switch (sortBy) {
      case "random":
        return "랜덤";
      case "time":
        return "시간";
      case "title":
        return "제목";
      case "newest":
        return "최신";
      default:
        return "랜덤";
    }
  };

  const handleViewModeChange = (mode: "month" | "year") => {
    if (mode === "year") {
      // 년 보기로 전환: 현재 월 저장
      setSavedMonth(new Date(currentMonth));
    } else if (mode === "month" && savedMonth) {
      // 월 보기로 복귀: 저장된 월 복원
      setCurrentMonth(new Date(savedMonth));
    }
    setViewMode(mode);
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--page-bg-color)' }}>
      {/* Fixed Header for all screens */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-full max-w-[650px] z-10 border-b border-gray-700" style={{ backgroundColor: 'var(--header-bg-color)' }}>
        <Header
          currentMonth={currentMonth}
          onNavigateMonth={(direction) => {
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
            setCurrentMonth(newMonth);
            // 달 이동 시 날짜만 리셋 (카테고리는 유지)
            setSelectedDate(null);
          }}
          onDateChange={(newMonth) => {
            setCurrentMonth(newMonth);
            // 날짜 변경 시 날짜만 리셋 (카테고리는 유지)
            setSelectedDate(null);
          }}
          onAdminModeToggle={handleAdminModeToggle}
          onBillboardOpen={handleBillboardOpen}
          onBillboardSettingsOpen={handleBillboardSettingsOpen}
          viewMode={viewMode}
          onViewModeChange={handleViewModeChange}
        />
      </div>

      {/* Mobile Layout - Fixed Header and Calendar, Scrollable Events and Footer */}
      <div>
        <div className="h-screen flex flex-col">
          {/* Fixed Calendar Section */}
          <div
            ref={calendarRef}
            className="fixed top-16 left-1/2 -translate-x-1/2 w-full max-w-[650px] z-[9] border-b border-black"
            style={{ backgroundColor: 'var(--calendar-bg-color)' }}
          >
            <EventCalendar
              selectedDate={selectedDate}
              onDateSelect={handleDateSelect}
              onMonthChange={handleMonthChange}
              showHeader={false}
              currentMonth={currentMonth}
              onEventsUpdate={handleEventsUpdate}
              viewMode={viewMode}
              hoveredEventId={hoveredEventId}
            />
            
            {/* Category Filter Panel - Fixed below calendar */}
            <div className="flex items-center gap-2 p-2 border-t border-gray-700">
              <div className="flex gap-2 flex-1 overflow-x-auto">
                <button
                  onClick={() => setSelectedCategory("all")}
                  className={`flex items-center space-x-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    selectedCategory === "all"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                  }`}
                >
                  <i className="ri-calendar-line text-xs"></i>
                  <span>
                    {currentMonth
                      ? viewMode === "year"
                        ? `${currentMonth.getFullYear()} 전체`
                        : `${currentMonth.getMonth() + 1}월 전체`
                      : "모든 이벤트"}
                  </span>
                </button>
                <button
                  onClick={() => setSelectedCategory("class")}
                  className={`flex items-center space-x-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    selectedCategory === "class"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                  }`}
                >
                  <i className="ri-book-line text-xs"></i>
                  <span>강습</span>
                </button>
                <button
                  onClick={() => setSelectedCategory("event")}
                  className={`flex items-center space-x-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    selectedCategory === "event"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                  }`}
                >
                  <i className="ri-calendar-event-line text-xs"></i>
                  <span>행사</span>
                </button>
                <button
                  onClick={() => setSelectedCategory("practice")}
                  className={`flex items-center space-x-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    selectedCategory === "practice"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                  }`}
                >
                  <i className="ri-home-4-line text-xs"></i>
                  <span>연습실</span>
                </button>
              </div>
              
              {/* 정렬 버튼 */}
              <button
                onClick={() => setShowSortModal(true)}
                className="flex flex-col items-center justify-center px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white rounded-lg transition-colors cursor-pointer flex-shrink-0"
              >
                <i className={`${getSortIcon()} text-sm`}></i>
                <span className="text-[9px] mt-0.5">{getSortLabel()}</span>
              </button>

              {/* 검색 버튼 */}
              <button
                onClick={() => setShowSearchModal(true)}
                className="flex items-center justify-center w-8 h-8 bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white rounded-lg transition-colors cursor-pointer flex-shrink-0"
              >
                <i className="ri-search-line text-sm"></i>
              </button>
            </div>
          </div>

          {/* Scrollable Content Area - Events and Footer */}
          <div
            className="flex-1 overflow-y-auto"
            style={{ paddingTop: `calc(3rem + ${calendarHeight}px + 95px)` }}
          >
            <div className="-mt-10">
              <EventList
                selectedDate={selectedDate}
                selectedCategory={selectedCategory}
                onCategoryChange={handleCategoryChange}
                currentMonth={currentMonth}
                refreshTrigger={refreshTrigger}
                isAdminMode={isAdminMode}
                viewMode={viewMode}
                onEventHover={setHoveredEventId}
                showSearchModal={showSearchModal}
                setShowSearchModal={setShowSearchModal}
                showSortModal={showSortModal}
                setShowSortModal={setShowSortModal}
                sortBy={sortBy}
                setSortBy={setSortBy}
              />
            </div>
            <Footer />
          </div>
        </div>
      </div>

      {/* Fullscreen Billboard */}
      {settings.enabled && (
        <FullscreenBillboard
          images={billboardImages}
          events={billboardEvents}
          isOpen={isBillboardOpen}
          onClose={handleBillboardClose}
          onEventClick={handleBillboardEventClick}
          autoSlideInterval={settings.autoSlideInterval}
          transitionDuration={settings.transitionDuration}
        />
      )}

      {/* Admin Billboard Settings Modal */}
      <AdminBillboardModal
        isOpen={isBillboardSettingsOpen}
        onClose={handleBillboardSettingsClose}
        settings={settings}
        onUpdateSettings={updateSettings}
        onResetSettings={resetSettings}
      />
    </div>
  );
}
