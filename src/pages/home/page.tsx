import { useState, useEffect, useRef, useCallback } from "react";
import EventCalendar from "./components/EventCalendar";
import EventList from "./components/EventList";
import Header from "./components/Header";
import Hero from "./components/Hero";
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
          .gte("date", todayString)
          .order("date", { ascending: true });

        if (events && events.length > 0) {
          const images = events.map((event) => event.image).filter(Boolean);
          setBillboardImages(images);
          setBillboardEvents(events);

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
    <div className="min-h-screen bg-gray-900">
      {/* Fixed Header for all screens */}
      <div className="fixed top-0 left-0 right-0 z-10 bg-gray-800 border-b border-gray-700">
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

      {/* Desktop Layout */}
      <div className="hidden lg:block pt-16">
        <Hero />
        <div className="container mx-auto px-4 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <EventCalendar
              selectedDate={selectedDate}
              onDateSelect={handleDateSelect}
              onMonthChange={handleMonthChange}
              currentMonth={currentMonth}
              onEventsUpdate={handleEventsUpdate}
              viewMode={viewMode}
            />
            <EventList
              selectedDate={selectedDate}
              selectedCategory={selectedCategory}
              onCategoryChange={handleCategoryChange}
              currentMonth={currentMonth}
              refreshTrigger={refreshTrigger}
              isAdminMode={isAdminMode}
              viewMode={viewMode}
            />
          </div>
        </div>
      </div>

      {/* Mobile Layout - Fixed Header and Calendar, Scrollable Events and Footer */}
      <div className="lg:hidden">
        <div className="h-screen flex flex-col">
          {/* Fixed Calendar Section */}
          <div
            ref={calendarRef}
            className="fixed top-16 left-0 right-0 z-[9] bg-gray-900 border-b border-black"
          >
            <EventCalendar
              selectedDate={selectedDate}
              onDateSelect={handleDateSelect}
              onMonthChange={handleMonthChange}
              showHeader={false}
              currentMonth={currentMonth}
              onEventsUpdate={handleEventsUpdate}
              viewMode={viewMode}
            />
          </div>

          {/* Scrollable Content Area - Events and Footer */}
          <div
            className="flex-1 overflow-y-auto"
            style={{ paddingTop: `calc(3rem + ${calendarHeight}px + 55px)` }}
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
              />
            </div>
            <Footer />
          </div>
        </div>
      </div>

      {/* Desktop Footer */}
      <div className="hidden lg:block">
        <Footer />
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
