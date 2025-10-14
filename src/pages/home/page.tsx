import { useState, useEffect, useRef, useCallback } from "react";
import EventCalendar from "./components/EventCalendar";
import EventList from "./components/EventList";
import PracticeRoomList from "./components/PracticeRoomList";
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
  const [sortBy, setSortBy] = useState<"random" | "time" | "title" | "newest">(
    "random",
  );
  const [highlightEvent, setHighlightEvent] = useState<{
    id: number;
    nonce: number;
  } | null>(null);
  const [isCalendarCollapsed, setIsCalendarCollapsed] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const [billboardImages, setBillboardImages] = useState<string[]>([]);
  const [billboardEvents, setBillboardEvents] = useState<any[]>([]);
  const [isBillboardOpen, setIsBillboardOpen] = useState(false);
  const [isBillboardSettingsOpen, setIsBillboardSettingsOpen] = useState(false);
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);

  const { settings, updateSettings, resetSettings } = useBillboardSettings();

  // 검색 취소 시 전체 모드로 리셋
  useEffect(() => {
    if (!searchTerm) {
      // 검색 취소: 전체 모드로 리셋
      setSelectedCategory("all");
    }
  }, [searchTerm]);

  // 검색 시작 시 호출되는 콜백
  const handleSearchStart = () => {
    // 전체 모드로 전환
    setSelectedCategory("all");
  };

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
    if (
      !settings.enabled ||
      isBillboardOpen ||
      settings.inactivityTimeout === 0
    )
      return;

    // 설정된 시간 후 광고판 자동 열기
    inactivityTimerRef.current = setTimeout(() => {
      if (billboardImages.length > 0) {
        setIsBillboardOpen(true);
      }
    }, settings.inactivityTimeout);
  }, [
    settings.enabled,
    settings.inactivityTimeout,
    isBillboardOpen,
    billboardImages.length,
  ]);

  // 사용자 활동 감지 및 비활동 타이머
  useEffect(() => {
    const activityEvents = [
      "mousemove",
      "mousedown",
      "keydown",
      "touchstart",
      "scroll",
    ];

    const handleUserActivity = () => {
      resetInactivityTimer();
    };

    // 초기 타이머 시작
    resetInactivityTimer();

    // 이벤트 리스너 등록
    activityEvents.forEach((event) => {
      window.addEventListener(event, handleUserActivity);
    });

    return () => {
      // cleanup
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
      activityEvents.forEach((event) => {
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
        const todayString = today.toISOString().split("T")[0];

        const { data: events } = await supabase
          .from("events")
          .select("*")
          .order("date", { ascending: true });

        if (events && events.length > 0) {
          const filteredEvents = events.filter((event) => {
            // 이미지가 있는지 확인 (image_full 또는 image)
            if (!event.image_full && !event.image) return false;

            const endDate = event.end_date || event.start_date || event.date;
            if (!endDate) return false;

            return endDate >= todayString;
          });

          const images = filteredEvents
            .map((event) => event.image_full || event.image)
            .filter(Boolean);
          setBillboardImages(images);
          setBillboardEvents(filteredEvents);

          // 자동 열기 설정이 켜져있을 때만 자동으로 표시
          if (settings.autoOpenOnLoad) {
            const todayStr = today.toDateString();
            const dismissedDate = localStorage.getItem(
              "billboardDismissedDate",
            );

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

    if (event && event.id) {
      // 이벤트 날짜로 달력 이동
      const eventDate = event.start_date || event.date;
      if (eventDate) {
        const date = new Date(eventDate);
        setCurrentMonth(date);
      }

      // 약간의 딜레이 후 하이라이트 (달력이 먼저 렌더링되도록)
      setTimeout(() => {
        setHighlightEvent({ id: event.id, nonce: Date.now() });
      }, 100);
    }
  };

  const handleHighlightComplete = () => {
    setHighlightEvent(null);
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
        const events =
          allEvents?.filter((event: any) => {
            const startDate = event.start_date || event.date;
            const endDate = event.end_date || event.date;
            return (
              selectedDateString >= startDate && selectedDateString <= endDate
            );
          }) || [];

        if (events && events.length > 0) {
          // 해당 날짜의 모든 고l�� 카테고리 추출
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
    // 달 이동 시 날짜 리셋하고 이벤트 리스트 표시
    setSelectedDate(null);
    setSelectedCategory("all");
    // 달력 펼치기
    setIsCalendarCollapsed(false);
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
    // "전체" 버튼만 검색 취소, 강습/행사는 검색 결과 내 필터링
    if (category === "all" && searchTerm) {
      setSearchTerm("");
    }
    setSelectedCategory(category);
    // "모든 이벤트"를 클릭했을 때 선택된 날짜 초기화
    if (category === "all") {
      setSelectedDate(null);
    }
    // 연습실 외 다른 카테고리 선택 시 달력 펼치기
    if (category !== "practice") {
      setIsCalendarCollapsed(false);
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

  // 카테고리 버튼이 활성화되어야 하는지 확인하는 함수
  const isCategoryActive = (categoryId: string) => {
    // 날짜가 선택되었고 selectedCategory가 "all"일 때
    if (selectedDate && selectedCategory === "all") {
      // "모든 이벤트" 버튼은 비활성화
      if (categoryId === "all") {
        return false;
      }
      // 강습/행사 버튼은 활성화 (날짜에 이벤트가 있으면 클릭 가능하도록)
      if (categoryId === "class" || categoryId === "event") {
        return true;
      }
    }

    // 그 외의 경우는 현재 선택된 카테고리인지 확인
    return selectedCategory === categoryId;
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
    // 뷰 모드 변경 시 이벤트 리스트 표시
    setSelectedCategory("all");
    // 달력 펼치기
    setIsCalendarCollapsed(false);
  };

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: "var(--page-bg-color)" }}
    >
      {/* Fixed Header for all screens */}
      <div
        className="fixed top-0 left-1/2 -translate-x-1/2 w-full max-w-[650px] z-10 border-b border-[#22262a]"
        style={{ backgroundColor: "var(--header-bg-color)" }}
      >
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
            // 달 이동 시 날짜 리셋하고 이벤트 리스트 표시
            setSelectedDate(null);
            setSelectedCategory("all");
            // 달력 펼치기
            setIsCalendarCollapsed(false);
          }}
          onDateChange={(newMonth) => {
            setCurrentMonth(newMonth);
            // 날짜 변경 시 날짜 리셋하고 이벤트 리스트 표시
            setSelectedDate(null);
            setSelectedCategory("all");
            // 달력 펼치기
            setIsCalendarCollapsed(false);
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
          {/* Fixed Calendar and Category Section */}
          <div
            ref={calendarRef}
            data-category-panel
            className="fixed top-16 left-1/2 -translate-x-1/2 w-full max-w-[650px] z-[9]"
            style={{ backgroundColor: "var(--calendar-bg-color)" }}
          >
            {/* Calendar - Collapsible */}
            <div
              className="transition-all duration-300 ease-in-out overflow-hidden border-b border-[#22262a]"
              style={{
                maxHeight: isCalendarCollapsed ? '0px' : '2000px',
              }}
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
            </div>

            {/* Category Filter Panel - Always visible */}
            <div className="flex items-center gap-2 p-2 border-t border-b border-x-0 border-t-[#22262a] border-b-black">
              <div className="flex gap-2 flex-1 overflow-x-auto">
                <button
                  onClick={() => handleCategoryChange("all")}
                  className={`flex items-center px-2 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    searchTerm
                      ? "bg-gray-700/50 text-gray-400 border border-gray-600/50"
                      : isCategoryActive("all")
                        ? "bg-blue-600 text-white"
                        : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                  }`}
                >
                  <span>
                    {currentMonth
                      ? viewMode === "year"
                        ? `${currentMonth.getFullYear()} 전체`
                        : `${currentMonth.getMonth() + 1}월 전체`
                      : "모든 이벤트"}
                  </span>
                </button>
                <button
                  onClick={() => handleCategoryChange("class")}
                  className={`flex items-center px-2 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    searchTerm
                      ? isCategoryActive("class")
                        ? "bg-purple-600/50 text-purple-200 border border-purple-500/30"
                        : "bg-gray-700/50 text-gray-400 border border-gray-600/50"
                      : isCategoryActive("class")
                        ? "bg-purple-600 text-white"
                        : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                  }`}
                >
                  <span>강습</span>
                </button>
                <button
                  onClick={() => handleCategoryChange("event")}
                  className={`flex items-center px-2 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    searchTerm
                      ? isCategoryActive("event")
                        ? "bg-blue-600/50 text-blue-200 border border-blue-500/30"
                        : "bg-gray-700/50 text-gray-400 border border-gray-600/50"
                      : isCategoryActive("event")
                        ? "bg-blue-600 text-white"
                        : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                  }`}
                >
                  <span>행사</span>
                </button>
                <button
                  onClick={() => {
                    setSelectedCategory("practice");
                    setIsCalendarCollapsed(true);
                  }}
                  className={`flex items-center px-2 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    isCategoryActive("practice")
                      ? "bg-blue-600 text-white"
                      : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                  }`}
                >
                  <span>연습실</span>
                </button>
              </div>

              {/* 정렬 버튼 */}
              <button
                onClick={() => setShowSortModal(true)}
                className="flex items-center justify-center h-6 gap-1 px-2
                           bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white
                           rounded-lg transition-colors cursor-pointer flex-shrink-0"
              >
                <i
                  className={`${getSortIcon()} text-sm leading-none align-middle`}
                ></i>
                <span className="text-xs leading-none align-middle">
                  {getSortLabel()}
                </span>
              </button>

              {/* 검색 버튼 */}
              <button
                onClick={() => setShowSearchModal(true)}
                className="flex items-center justify-center h-6 w-8
                           bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white
                           rounded-lg transition-colors cursor-pointer flex-shrink-0"
                aria-label="검색"
              >
                <i className="ri-search-line text-sm leading-none align-middle"></i>
              </button>
            </div>
          </div>

          {/* Scrollable Content Area - Events/Practice Rooms and Footer */}
          <div
            className="flex-1 overflow-y-auto"
            style={{ paddingTop: `calc(0rem + ${calendarHeight}px + 95px)` }}
          >
            <div className="-mt-10">
              {selectedCategory === "practice" ? (
                <PracticeRoomList 
                  isAdminMode={isAdminMode}
                  showSearchModal={showSearchModal}
                  setShowSearchModal={setShowSearchModal}
                  showSortModal={showSortModal}
                  setShowSortModal={setShowSortModal}
                  sortBy={sortBy}
                  setSortBy={setSortBy}
                />
              ) : (
                <EventList
                  selectedDate={selectedDate}
                  selectedCategory={selectedCategory}
                  currentMonth={currentMonth}
                  refreshTrigger={refreshTrigger}
                  isAdminMode={isAdminMode}
                  viewMode={viewMode}
                  onEventHover={setHoveredEventId}
                  searchTerm={searchTerm}
                  setSearchTerm={setSearchTerm}
                  onSearchStart={handleSearchStart}
                  showSearchModal={showSearchModal}
                  setShowSearchModal={setShowSearchModal}
                  showSortModal={showSortModal}
                  setShowSortModal={setShowSortModal}
                  sortBy={sortBy}
                  setSortBy={setSortBy}
                  highlightEvent={highlightEvent}
                  onHighlightComplete={handleHighlightComplete}
                />
              )}
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
