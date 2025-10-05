import { useState, useEffect, useRef } from "react";
import EventCalendar from "./components/EventCalendar";
import EventList from "./components/EventList";
import Header from "./components/Header";
import Hero from "./components/Hero";
import Footer from "./components/Footer";
import FullscreenBillboard from "../../components/FullscreenBillboard";
import { supabase } from "../../lib/supabase";

export default function HomePage() {
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [activeCategoriesForDate, setActiveCategoriesForDate] = useState<
    string[]
  >([]);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [calendarHeight, setCalendarHeight] = useState(240); // 기본 높이
  const calendarRef = useRef<HTMLDivElement>(null);
  
  const [billboardImages, setBillboardImages] = useState<string[]>([]);
  const [isBillboardOpen, setIsBillboardOpen] = useState(false);

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

  // 광고판 이미지 로드 및 자동 표시
  useEffect(() => {
    const loadBillboardImages = async () => {
      try {
        const { data: events } = await supabase
          .from("events")
          .select("image")
          .not("image", "is", null)
          .neq("image", "")
          .order("created_at", { ascending: false });

        if (events && events.length > 0) {
          const images = events.map((event) => event.image).filter(Boolean);
          setBillboardImages(images);

          const today = new Date().toDateString();
          const dismissedDate = localStorage.getItem("billboardDismissedDate");
          
          if (dismissedDate !== today && images.length > 0) {
            setIsBillboardOpen(true);
          }
        }
      } catch (error) {
        console.error("Error loading billboard images:", error);
      }
    };

    loadBillboardImages();
  }, []);

  const handleBillboardClose = () => {
    setIsBillboardOpen(false);
    const today = new Date().toDateString();
    localStorage.setItem("billboardDismissedDate", today);
  };

  const handleBillboardOpen = () => {
    setIsBillboardOpen(true);
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

        const { data: events } = await supabase
          .from("events")
          .select("category")
          .eq("date", selectedDateString)
          .order("created_at", { ascending: true });

        if (events && events.length > 0) {
          // 해당 날짜의 모든 고유 카테고리 추출
          const uniqueCategories = [
            ...new Set(events.map((event) => event.category)),
          ];
          setActiveCategoriesForDate(uniqueCategories);

          // 첫 번째 카테고리로 설정 (하지만 실제로는 모든 카테고리가 활성화됨)
          setSelectedCategory(uniqueCategories[0]);
        } else {
          // 이벤트가 없으면 빈 배열
          setActiveCategoriesForDate([]);
          setSelectedCategory("all");
        }
      } catch (error) {
        console.error("Error fetching events for date:", error);
        setActiveCategoriesForDate([]);
        setSelectedCategory("all");
      }
    } else {
      setActiveCategoriesForDate([]);
    }
  };

  const handleDateReset = () => {
    setSelectedDate(null);
    setActiveCategoriesForDate([]);
    setSelectedCategory("all"); // 카테고리도 "모든 이벤트"로 리셋
  };

  const handleMonthChange = (month: Date) => {
    setCurrentMonth(month);
    // 달 이동 시 날짜만 리셋 (카테고리는 유지)
    setSelectedDate(null);
    setActiveCategoriesForDate([]);
  };

  const handleEventsUpdate = () => {
    setRefreshTrigger((prev) => prev + 1);
  };

  const handleAdminModeToggle = (adminMode: boolean) => {
    setIsAdminMode(adminMode);
  };

  const handleCategoryChange = (category: string) => {
    setSelectedCategory(category);
    // "모든 이벤트"를 클릭했을 때 선택된 날짜 초기화
    if (category === "all") {
      setSelectedDate(null);
      setActiveCategoriesForDate([]);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Fixed Header for all screens */}
      <div className="fixed top-0 left-0 right-0 z-10 bg-gray-800 border-b border-gray-700">
        <Header
          currentMonth={currentMonth}
          onNavigateMonth={(direction) => {
            const newMonth = new Date(currentMonth);
            if (direction === "prev") {
              newMonth.setMonth(currentMonth.getMonth() - 1);
            } else {
              newMonth.setMonth(currentMonth.getMonth() + 1);
            }
            setCurrentMonth(newMonth);
            // 달 이동 시 날짜만 리셋 (카테고리는 유지)
            setSelectedDate(null);
            setActiveCategoriesForDate([]);
          }}
          onDateChange={(newMonth) => {
            setCurrentMonth(newMonth);
            // 날짜 변경 시 날짜만 리셋 (카테고리는 유지)
            setSelectedDate(null);
            setActiveCategoriesForDate([]);
          }}
          onDateReset={handleDateReset}
          onAdminModeToggle={handleAdminModeToggle}
          onBillboardOpen={handleBillboardOpen}
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
            />
            <EventList
              selectedDate={selectedDate}
              selectedCategory={selectedCategory}
              activeCategoriesForDate={activeCategoriesForDate}
              onCategoryChange={handleCategoryChange}
              currentMonth={currentMonth}
              refreshTrigger={refreshTrigger}
              isAdminMode={isAdminMode}
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
                activeCategoriesForDate={activeCategoriesForDate}
                onCategoryChange={handleCategoryChange}
                currentMonth={currentMonth}
                refreshTrigger={refreshTrigger}
                isAdminMode={isAdminMode}
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
      <FullscreenBillboard
        images={billboardImages}
        isOpen={isBillboardOpen}
        onClose={handleBillboardClose}
      />
    </div>
  );
}
