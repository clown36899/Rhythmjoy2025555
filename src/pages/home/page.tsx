import { useState, useEffect, useRef, useCallback, useMemo, forwardRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";



import EventCalendar from "./components/EventCalendar";
import EventList from "./components/EventList";
import Header from "./components/Header";
import Footer from "./components/Footer";
import FullscreenBillboard from "../../components/FullscreenBillboard";
import AdminBillboardModal from "./components/AdminBillboardModal";
import EventRegistrationModal from "../../components/EventRegistrationModal";
import FullscreenDateEventsModal from "../../components/FullscreenDateEventsModal";
import EventDetailModal from "./components/EventDetailModal";
import EventPasswordModal from "./components/EventPasswordModal";
import EventEditModal from "./components/EventEditModal";
import { registerLocale } from "react-datepicker";
import { ko } from "date-fns/locale/ko";
import "react-datepicker/dist/react-datepicker.css";

import { supabase } from "../../lib/supabase";
import type { Event as AppEvent } from "../../lib/supabase";
import { useBillboardSettings } from "../../hooks/useBillboardSettings";
import { useAuth } from "../../contexts/AuthContext";
import { useCalendarGesture } from "../../hooks/useCalendarGesture";
import "./page.css";

export default function HomePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const selectedCategory = searchParams.get("category") || "all";
  const { isAdmin } = useAuth();


  registerLocale("ko", ko);

  // ForwardRef 커스텀 입력 컴포넌트
  interface CustomInputProps {
    value?: string;
    onClick?: () => void;
  }

  const CustomDateInput = useMemo(() => forwardRef<HTMLButtonElement, CustomInputProps>(
    ({ value, onClick }, ref) => (
      <button
        type="button"
        ref={ref}
        onClick={onClick}
        className="home-date-btn"
      >
        {value || "날짜 선택"}
      </button>
    )
  ), []);
  CustomDateInput.displayName = "CustomDateInput";

  // --------------------------------------------------------------------------------
  // 1. UI 상수
  // --------------------------------------------------------------------------------
  // 모바일 바운스 방지
  useEffect(() => {
    document.documentElement.style.overscrollBehavior = 'none';
    document.body.style.overscrollBehavior = 'none';
    return () => {
      document.documentElement.style.overscrollBehavior = '';
      document.body.style.overscrollBehavior = '';
    };
  }, []);

  // 모바일 바운스 방지
  const navigateWithCategory = useCallback((cat?: string) => {
    if (!cat || cat === "all") navigate("/");
    else navigate(`/?category=${cat}`);
  }, [navigate]);

  // --------------------------------------------------------------------------------
  // 2. 상태 관리
  // --------------------------------------------------------------------------------
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [viewMode, setViewMode] = useState<"month" | "year">("month");
  const [headerHeight, setHeaderHeight] = useState(60);

  // 기타 상태
  const [adminType, setAdminType] = useState<"super" | "sub" | null>(null);
  const [billboardUserId, setBillboardUserId] = useState<string | null>(null);
  const [billboardUserName, setBillboardUserName] = useState<string>("");
  const [isAdminModeOverride, setIsAdminModeOverride] = useState(false);
  const effectiveIsAdmin = isAdmin || isAdminModeOverride;

  const [showRegistrationModal, setShowRegistrationModal] = useState(false);
  const [fromBanner, setFromBanner] = useState(false);
  const [bannerMonthBounds, setBannerMonthBounds] = useState<{ min: string; max: string } | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [savedMonth, setSavedMonth] = useState<Date | null>(null);
  const [hoveredEventId, setHoveredEventId] = useState<number | null>(null);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [showSortModal, setShowSortModal] = useState(false);
  const [sortBy, setSortBy] = useState<"random" | "time" | "title">("random");
  const [highlightEvent, setHighlightEvent] = useState<{ id: number; nonce: number } | null>(null);
  const [sharedEventId, setSharedEventId] = useState<number | null>(null);
  const [eventJustCreated, setEventJustCreated] = useState<number>(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [isRandomBlinking, setIsRandomBlinking] = useState(false);

  const [billboardImages, setBillboardImages] = useState<string[]>([]);
  const [billboardEvents, setBillboardEvents] = useState<any[]>([]);
  const [isBillboardOpen, setIsBillboardOpen] = useState(false);
  const [isBillboardSettingsOpen, setIsBillboardSettingsOpen] = useState(false);
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isEventListModalOpen, setIsEventListModalOpen] = useState(false);
  const [isFullscreenDateModalOpen, setIsFullscreenDateModalOpen] = useState(false);
  const [fullscreenSelectedDate, setFullscreenSelectedDate] = useState<Date | null>(null);
  const [fullscreenClickPosition, setFullscreenClickPosition] = useState<{ x: number; y: number } | undefined>(undefined);

  // --- EventList에서 이동된 상태들 ---
  const [selectedEvent, setSelectedEvent] = useState<AppEvent | null>(null);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [eventToEdit, setEventToEdit] = useState<AppEvent | null>(null);
  const [eventPassword, setEventPassword] = useState("");
  const [showEditModal, setShowEditModal] = useState(false);
  const [allGenres, setAllGenres] = useState<string[]>([]);

  // 장르 목록 로드 (자동완성용)
  useEffect(() => {
    const fetchGenres = async () => {
      const { data, error } = await supabase.from('events').select('genre');
      if (data && !error) {
        const uniqueGenres = [...new Set(data.map(item => item.genre).filter(g => g))] as string[];
        setAllGenres(uniqueGenres);
      }
    };
    fetchGenres();
  }, []);

  // Refs
  const calendarRef = useRef<HTMLDivElement>(null!);
  const calendarContentRef = useRef<HTMLDivElement>(null!);
  const containerRef = useRef<HTMLDivElement>(null!);
  const eventListElementRef = useRef<HTMLDivElement>(null!);
  const eventListSlideContainerRef = useRef<HTMLDivElement | null>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const calendarControlBarRef = useRef<HTMLDivElement>(null);
  const calendarCategoryButtonsRef = useRef<HTMLDivElement>(null);

  // 모달이 열렸을 때 배경 컨텐츠의 상호작용을 막기 위한 `inert` 속성 관리
  useEffect(() => {
    const isAnyModalOpen = isEventListModalOpen ||
      showSearchModal ||
      showSortModal ||
      showRegistrationModal ||
      isBillboardSettingsOpen ||
      isFullscreenDateModalOpen ||
      !!selectedEvent ||
      showEditModal ||
      showPasswordModal;

    const container = containerRef.current;
    if (container) {
      container.inert = isAnyModalOpen;
    }

    return () => {
      if (container) container.inert = false;
    };
  }, [isEventListModalOpen, showSearchModal, showSortModal, showRegistrationModal, isBillboardSettingsOpen, isFullscreenDateModalOpen, selectedEvent, showEditModal, showPasswordModal]);

  const handleHorizontalSwipe = (direction: 'next' | 'prev') => {
    setCurrentMonth((prev) => {
      const newM = new Date(prev);
      newM.setDate(1);
      if (viewMode === "year") {
        newM.setFullYear(prev.getFullYear() + (direction === 'next' ? 1 : -1));
      } else {
        newM.setMonth(prev.getMonth() + (direction === 'next' ? 1 : -1));
      }
      return newM;
    });
    setSelectedDate(null);
    setFromBanner(false);
    setBannerMonthBounds(null);
  };

  // --------------------------------------------------------------------------------
  // 4. 커스텀 훅: 달력 제스처 및 상태 관리
  // --------------------------------------------------------------------------------
  const {
    calendarMode,
    setCalendarMode,
    isDragging,
    liveCalendarHeight,
    dragOffset,
    setDragOffset,
    isAnimating,
    setIsAnimating,
    getTargetHeight,
    calculateFullscreenHeight,
  } = useCalendarGesture({
    headerHeight,
    containerRef,
    calendarRef,
    calendarContentRef,
    eventListElementRef,
    onHorizontalSwipe: handleHorizontalSwipe,
    isYearView: viewMode === 'year',
  });

  const isCurrentMonthVisible = (() => {
    const today = new Date();
    return currentMonth.getFullYear() === today.getFullYear() &&
      currentMonth.getMonth() === today.getMonth();
  })();

  // --------------------------------------------------------------------------------
  // 6. 핸들러 및 기타 로직
  // --------------------------------------------------------------------------------
  useEffect(() => { if (headerRef.current) setHeaderHeight(headerRef.current.offsetHeight); }, []);
  useEffect(() => { if (effectiveIsAdmin && !billboardUserId && adminType !== "super") setAdminType("super"); else if (!effectiveIsAdmin && !billboardUserId && adminType !== null) { setAdminType(null); setIsAdminModeOverride(false); } }, [effectiveIsAdmin, billboardUserId, adminType]);
  useEffect(() => { window.dispatchEvent(new CustomEvent("monthChanged", { detail: { month: currentMonth.toISOString() } })); }, [currentMonth]);
  useEffect(() => { window.dispatchEvent(new CustomEvent("viewModeChanged", { detail: { viewMode } })); }, [viewMode]);
  const [fromQR] = useState(() => { const p = new URLSearchParams(window.location.search); const s = p.get("from"); return s === "qr" || s === "edit"; });
  const { settings, updateSettings, resetSettings } = useBillboardSettings();

  const handleBillboardClose = () => { setIsBillboardOpen(false); localStorage.setItem("billboardDismissedDate", new Date().toDateString()); };
  const handleBillboardOpen = () => setIsBillboardOpen(true);
  const handleBillboardSettingsOpen = () => setIsBillboardSettingsOpen(true);
  const handleBillboardSettingsClose = () => setIsBillboardSettingsOpen(false);
  const handleBillboardEventClick = (event: any) => { setIsBillboardOpen(false); if (event && event.id) { const eventDate = event.start_date || event.date; if (eventDate) setCurrentMonth(new Date(eventDate)); setTimeout(() => setHighlightEvent({ id: event.id, nonce: Date.now() }), 100); } };
  const handleHighlightComplete = () => setHighlightEvent(null);
  const handleDateSelect = (date: Date | null, hasEvents?: boolean) => { setSelectedDate(date); if (date && hasEvents) navigateWithCategory("all"); };
  const handleMonthChange = (month: Date) => { setCurrentMonth(month); setSelectedDate(null); setFromBanner(false); setBannerMonthBounds(null); if (viewMode === "month") navigateWithCategory("all"); };
  const handleEventsUpdate = async (createdDate?: Date) => { if (createdDate) await handleDateSelect(createdDate); };
  const handleAdminModeToggle = (adminMode: boolean, type: "super" | "sub" | null = null, userId: string | null = null, userName: string = "") => { if (adminMode && type === "super" && !userId) setIsAdminModeOverride(true); else if (!adminMode) setIsAdminModeOverride(false); setAdminType(type ?? null); setBillboardUserId(userId ?? null); setBillboardUserName(userName ?? ""); };
  const getSortIcon = () => (sortBy === "random" ? "ri-shuffle-line" : sortBy === "time" ? "ri-time-line" : "ri-sort-alphabet-asc");
  const getSortLabel = () => (sortBy === "random" ? "랜덤" : sortBy === "time" ? "시간" : "제목");
  const handleViewModeChange = (mode: "month" | "year") => { if (mode === "year") setSavedMonth(new Date(currentMonth)); else if (mode === "month" && savedMonth) setCurrentMonth(new Date(savedMonth)); setViewMode(mode); };
  const handleSearchStart = () => navigateWithCategory("all");

  const handleDailyModalEventClick = (event: AppEvent) => {
    setIsFullscreenDateModalOpen(false);
    // 약간의 딜레이 후 상세 모달을 열어 애니메이션이 겹치지 않게 함
    setTimeout(() => {
      setSelectedEvent(event);
    }, 100);
  };

  const closeModal = () => {
    setSelectedEvent(null);
  };

  const handleEditClick = (event: AppEvent, e?: React.MouseEvent) => {
    e?.stopPropagation();

    if (effectiveIsAdmin) {
      setEventToEdit(event);
      setShowEditModal(true);
      setSelectedEvent(null);
    } else {
      setEventToEdit(event);
      setShowPasswordModal(true);
      setSelectedEvent(null);
    }
  };

  const deleteEvent = async (eventId: number, password: string | null = null) => {
    try {
      const { error } = await supabase.functions.invoke('delete-event', { body: { eventId, password } });
      if (error) throw error;
      alert("이벤트가 삭제되었습니다.");
      window.dispatchEvent(new CustomEvent("eventDeleted"));
      closeModal();
    } catch (error: any) {
      console.error("이벤트 삭제 중 오류 발생:", error);
      alert(`이벤트 삭제 중 오류가 발생했습니다: ${error.context?.error_description || error.message || '알 수 없는 오류'}`);
    }
  };

  const handleDeleteClick = (event: AppEvent, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (adminType === "super") {
      if (confirm("정말로 이 이벤트를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.")) {
        deleteEvent(event.id);
      }
      return;
    }
    const password = prompt("이벤트 삭제를 위한 비밀번호를 입력하세요:");
    if (password === null) return;
    if (password !== event.password) {
      alert("비밀번호가 올바르지 않습니다.");
      return;
    }
    if (confirm("정말로 이 이벤트를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.")) {
      deleteEvent(event.id, password);
    }
  };

  const handlePasswordSubmit = async () => {
    if (eventToEdit && eventPassword === eventToEdit.password) {
      try {
        const { data: fullEvent, error } = await supabase.from("events").select("*").eq("id", eventToEdit.id).single();
        if (error) throw error;
        if (fullEvent) {
          setEventToEdit(fullEvent);
        }
      } catch (error) {
        console.error("Error:", error);
        alert("이벤트 정보를 불러오는 중 오류가 발생했습니다.");
        return;
      }
      setShowPasswordModal(false);
      setShowEditModal(true);
      setEventPassword("");
    } else {
      alert("비밀번호가 올바르지 않습니다.");
    }
  };

  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    if (!settings.enabled || isBillboardOpen || settings.inactivityTimeout === 0 || fromQR) return;
    inactivityTimerRef.current = setTimeout(() => { if (billboardImages.length > 0) setIsBillboardOpen(true); }, settings.inactivityTimeout);
  }, [settings.enabled, settings.inactivityTimeout, isBillboardOpen, billboardImages.length, fromQR]);

  useEffect(() => {
    const activityEvents = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"];
    let lastCallTime = 0;
    const throttleDelay = 200;
    const handleUserActivity = () => { const now = Date.now(); if (now - lastCallTime >= throttleDelay) { lastCallTime = now; resetInactivityTimer(); } };
    resetInactivityTimer();
    activityEvents.forEach((event) => window.addEventListener(event, handleUserActivity));
    return () => { if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current); activityEvents.forEach((event) => window.removeEventListener(event, handleUserActivity)); };
  }, [resetInactivityTimer]);

  useEffect(() => {
    const loadBillboardImages = async () => {
      if (!settings.enabled) { setBillboardImages([]); setBillboardEvents([]); return; }
      try {
        let query = supabase.from("events").select("id,title,date,start_date,end_date,time,location,category,price,image,image_thumbnail,image_medium,image_full,video_url,description,organizer,capacity,registered,link1,link2,link3,link_name1,link_name2,link_name3,created_at,updated_at");
        query = query.or("image_full.not.is.null,image.not.is.null,video_url.not.is.null");
        if (settings.dateRangeStart) query = query.gte("start_date", settings.dateRangeStart);
        if (settings.dateRangeEnd) query = query.lte("start_date", settings.dateRangeEnd);
        query = query.order("date", { ascending: true });
        const { data: events } = await query;
        if (events && events.length > 0) {
          const filteredEvents = events.filter((event) => {
            const endDate = event.end_date || event.start_date || event.date;
            if (!endDate) return false;
            if (settings.excludedEventIds && settings.excludedEventIds.includes(event.id)) return false;
            if (settings.excludedWeekdays && settings.excludedWeekdays.length > 0) {
              const eventDate = new Date(event.start_date || event.date);
              if (settings.excludedWeekdays.includes(eventDate.getDay())) return false;
            }
            return true;
          });
          const imagesOrVideos = filteredEvents.map((event) => event?.video_url || event?.image_full || event?.image);
          setBillboardImages(imagesOrVideos);
          setBillboardEvents(filteredEvents);
          if (settings.autoOpenOnLoad && !fromQR) {
            const todayStr = new Date().toDateString();
            const dismissedDate = localStorage.getItem("billboardDismissedDate");
            if (dismissedDate !== todayStr && imagesOrVideos.length > 0) setIsBillboardOpen(true);
          }
        }
      } catch (error) { console.error("Error", error); }
    };
    loadBillboardImages();
  }, [settings, fromQR]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const eventId = params.get("event");
    const source = params.get("from");
    if (eventId) {
      const id = parseInt(eventId);
      setQrLoading(true);
      if (!source || (source !== "qr" && source !== "edit")) setSharedEventId(id);
      const loadEventAndNavigate = async () => {
        try {
          const { data: event } = await supabase.from("events").select("id, start_date, date").eq("id", id).single();
          if (event) {
            const eventDate = event.start_date || event.date;
            if (eventDate) setCurrentMonth(new Date(eventDate));
            setTimeout(() => {
              setQrLoading(false);
              if (source === "qr" || source === "edit") setTimeout(() => setHighlightEvent({ id: event.id, nonce: Date.now() }), 500);
            }, 100);
          } else setQrLoading(false);
        } catch (error) { console.error(error); setQrLoading(false); }
      };
      loadEventAndNavigate();
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  useEffect(() => { if (!searchTerm) navigateWithCategory("all"); }, [searchTerm, navigateWithCategory]);
  useEffect(() => { if (selectedDate && !qrLoading) { const scrollContainer = document.querySelector(".overflow-y-auto"); if (scrollContainer) scrollContainer.scrollTop = 0; } }, [selectedDate, qrLoading]);
  useEffect(() => { const handleClearDate = () => { setSelectedDate(null); setFromBanner(false); setBannerMonthBounds(null); }; window.addEventListener("clearSelectedDate", handleClearDate); return () => window.removeEventListener("clearSelectedDate", handleClearDate); }, []);
  useEffect(() => {
    const handleResetToToday = () => { const today = new Date(); setCurrentMonth(today); setSelectedDate(null); navigateWithCategory("all"); if (sortBy === "random") { setIsRandomBlinking(true); setTimeout(() => setIsRandomBlinking(false), 500); } };
    window.addEventListener("resetToToday", handleResetToToday); return () => window.removeEventListener("resetToToday", handleResetToToday);
  }, [navigateWithCategory, sortBy]);

  useEffect(() => {
    const handleCreateEvent = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail?.source === 'banner' && customEvent.detail?.monthIso) {
        if (selectedDate) { setFromBanner(false); setBannerMonthBounds(null); }
        else {
          const firstDayOfMonth = new Date(customEvent.detail.monthIso);
          setSelectedDate(firstDayOfMonth); setFromBanner(true);
          const year = firstDayOfMonth.getFullYear(); const month = firstDayOfMonth.getMonth();
          const firstDay = new Date(year, month, 1); const lastDay = new Date(year, month + 1, 0);
          const formatDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
          setBannerMonthBounds({ min: formatDate(firstDay), max: formatDate(lastDay) });
        }
      } else {
        if (!selectedDate) setSelectedDate(new Date());
        setFromBanner(false); setBannerMonthBounds(null);
      }
      setShowRegistrationModal(true);
    };
    window.addEventListener("createEventForDate", handleCreateEvent);
    return () => window.removeEventListener("createEventForDate", handleCreateEvent);

  }, [selectedDate]);

  useEffect(() => { window.dispatchEvent(new CustomEvent("selectedDateChanged", { detail: selectedDate })); }, [selectedDate]);
  useEffect(() => {
    const handleFullscreenDateClick = (e: Event) => { const customEvent = e as CustomEvent<{ date: Date; clickPosition?: { x: number; y: number } }>; setFullscreenSelectedDate(customEvent.detail.date); setFullscreenClickPosition(customEvent.detail.clickPosition); setIsFullscreenDateModalOpen(true); };
    window.addEventListener("fullscreenDateClick", handleFullscreenDateClick); return () => window.removeEventListener("fullscreenDateClick", handleFullscreenDateClick);

  }, []);

  // --------------------------------------------------------------------------------
  // 7. 렌더링
  // --------------------------------------------------------------------------------
  const EXPANDED_HEIGHT = 200;

  const renderHeight = useMemo(() => {
    if (isDragging) return `${liveCalendarHeight}px`;
    if (calendarMode === 'collapsed') return '0px';
    if (calendarMode === 'fullscreen') {
      const containerHeight = calculateFullscreenHeight();
      const controlBarHeight = calendarControlBarRef.current?.offsetHeight || 32;
      const categoryButtonsHeight = calendarCategoryButtonsRef.current?.offsetHeight || 42;
      return `${Math.max(0, containerHeight - controlBarHeight - categoryButtonsHeight)}px`;
    }
    return `${EXPANDED_HEIGHT}px`; // 'expanded' 모드의 높이
  }, [isDragging, liveCalendarHeight, calendarMode, calculateFullscreenHeight]);
  const isFixed = calendarMode === "fullscreen" || (isDragging && liveCalendarHeight > 300);
  const buttonBgClass = calendarMode === "collapsed" ? "home-toolbar-btn-blue" : "home-toolbar-btn-dark";
  const arrowIconContent = calendarMode === "collapsed" ? <i className="ri-arrow-up-s-line home-icon-sm home-icon-arrow-up"></i> : <i className="ri-arrow-down-s-line home-icon-sm home-icon-arrow-down"></i>;

  return (
    <div
      ref={containerRef}
      className="home-container"
      style={{
        backgroundColor: "var(--page-bg-color)",
        touchAction: "pan-y"
      }}
    >
      <div ref={headerRef} className="home-header" style={{ backgroundColor: "var(--header-bg-color)", touchAction: "auto" }}>
        <Header
          currentMonth={currentMonth}
          onNavigateMonth={(dir) => {
            if (isAnimating) return; setIsAnimating(true);
            const w = window.innerWidth;
            setDragOffset(dir === "prev" ? w : -w);
            const newM = new Date(currentMonth); newM.setDate(1);
            if (viewMode === "year") newM.setFullYear(currentMonth.getFullYear() + (dir === "prev" ? -1 : 1));
            else newM.setMonth(currentMonth.getMonth() + (dir === "prev" ? -1 : 1));
            setTimeout(() => { setCurrentMonth(newM); setDragOffset(0); setSelectedDate(null); setFromBanner(false); setBannerMonthBounds(null); setIsAnimating(false); }, 250);
          }}
          onDateChange={(m) => { setCurrentMonth(m); setSelectedDate(null); setFromBanner(false); setBannerMonthBounds(null); }}
          onAdminModeToggle={handleAdminModeToggle}
          onBillboardOpen={handleBillboardOpen}
          onBillboardSettingsOpen={handleBillboardSettingsOpen}
          viewMode={viewMode}
          onViewModeChange={handleViewModeChange}
          billboardEnabled={settings.enabled}
        />
      </div>

      <div className="home-main">
        <div
          ref={calendarRef}
          className="home-calendar-wrapper"
          style={{
            backgroundColor: "var(--calendar-bg-color)",
            touchAction: "pan-y",
            position: isFixed ? "fixed" : "relative",
            top: isFixed ? `${headerHeight}px` : undefined,
            left: 0, right: 0,
            zIndex: isFixed ? 30 : 15,
          }}
        >
          <div
            ref={calendarContentRef}
            className="home-calendar-content"
            style={{
              height: renderHeight,
              transition: isDragging ? "none" : "height 0.3s cubic-bezier(0.33, 1, 0.68, 1)",
              willChange: isDragging ? "height" : undefined,
              touchAction: viewMode === "year" ? "auto" : "none"
            }}
          >
            <EventCalendar
              selectedDate={selectedDate}
              onDateSelect={handleDateSelect}
              onMonthChange={handleMonthChange}
              isAdminMode={effectiveIsAdmin}
              showHeader={false}
              currentMonth={currentMonth}
              onEventsUpdate={handleEventsUpdate}
              viewMode={viewMode}
              onViewModeChange={handleViewModeChange}
              hoveredEventId={hoveredEventId}
              dragOffset={dragOffset}
              isAnimating={isAnimating}
              calendarHeightPx={isDragging ? liveCalendarHeight : getTargetHeight()}
              calendarMode={calendarMode}
              selectedCategory={selectedCategory}

            />
          </div>

          <div ref={calendarControlBarRef} className="home-calendar-control-bar" style={{ backgroundColor: "var(--calendar-bg-color)", touchAction: "none", padding: "0 9px" }}>
            <div className="home-toolbar">
              <button
                onClick={() => setCalendarMode(prev => prev === "collapsed" ? "expanded" : prev === "fullscreen" ? "expanded" : "collapsed")}
                className={`home-toolbar-btn ${buttonBgClass}`}
              >
                <i className={`${calendarMode === "collapsed" ? "ri-calendar-line" : "ri-calendar-close-line"} home-icon-sm`}></i>
                <span className="home-toolbar-text">{calendarMode === "collapsed" ? "이벤트 등록달력" : "달력 접기"}</span>
                {arrowIconContent}
              </button>
              <div className="home-toolbar-spacer"></div>
              {calendarMode === "fullscreen" ? (
                null
              ) : (
                <>
                  {/* 오늘 버튼 조건부 렌더링 */}
                  {!isCurrentMonthVisible && (
                    <button onClick={() => { const today = new Date(); setCurrentMonth(today); setSelectedDate(null); navigateWithCategory("all"); if (sortBy === "random") { setIsRandomBlinking(true); setTimeout(() => setIsRandomBlinking(false), 500); } }} className="home-btn-today"><span>오늘</span><i className="ri-calendar-check-line home-text-10px"></i></button>
                  )}
                  <button onClick={() => setShowSortModal(true)} className={`home-toolbar-btn ${sortBy === "random" && isRandomBlinking ? "home-toolbar-btn-pulse" : "home-toolbar-btn-dark"}`}><i className={`${getSortIcon()} home-icon-sm`}></i><span className="home-text-xs">{getSortLabel()}</span></button>
                  <button onClick={() => setShowSearchModal(true)} className="home-btn-search"><i className="ri-search-line home-icon-sm"></i></button>
                </>
              )}
              <button onClick={() => setCalendarMode(prev => prev === "fullscreen" ? "expanded" : "fullscreen")} className={`home-toolbar-btn home-toolbar-btn-fullscreen ${calendarMode === "fullscreen" ? "home-toolbar-btn-blue" : "home-toolbar-btn-dark"}`}><i className={`${calendarMode === "fullscreen" ? "ri-fullscreen-exit-line" : "ri-fullscreen-line"} home-icon-sm`}></i></button>
            </div>
          </div>
        </div>

        <div
          ref={eventListElementRef}
          className="home-content-scroll"
          style={{
            marginTop: isFixed ? `${calculateFullscreenHeight()}px` : undefined,
            overscrollBehaviorY: "contain"
          }}
        >


          {qrLoading ? (
            <div className="home-loading-container"><div className="home-loading-text">이벤트 로딩 중...</div></div>
          ) : (
            <>


              <EventList
                key={eventJustCreated || undefined}
                selectedDate={selectedDate}
                currentMonth={currentMonth}
                isAdminMode={effectiveIsAdmin}
                adminType={adminType}
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
                sharedEventId={sharedEventId}
                onSharedEventOpened={() => setSharedEventId(null)}
                dragOffset={dragOffset}
                isAnimating={isAnimating}
                slideContainerRef={eventListSlideContainerRef}
                onMonthChange={(date) => setCurrentMonth(date)}
                onModalStateChange={setIsEventListModalOpen}
              />
            </>
          )}
          <Footer />
        </div>
      </div>

      {/* Modals */}
      {settings.enabled && <FullscreenBillboard images={billboardImages} events={billboardEvents} isOpen={isBillboardOpen} onClose={handleBillboardClose} onEventClick={handleBillboardEventClick} autoSlideInterval={settings.autoSlideInterval} transitionDuration={settings.transitionDuration} dateRangeStart={settings.dateRangeStart} dateRangeEnd={settings.dateRangeEnd} showDateRange={settings.showDateRange} playOrder={settings.playOrder} />}
      <AdminBillboardModal isOpen={isBillboardSettingsOpen} onClose={() => { handleBillboardSettingsClose(); if (adminType === "sub") setTimeout(() => window.dispatchEvent(new CustomEvent("reopenAdminSettings")), 100); }} settings={settings} onUpdateSettings={updateSettings} onResetSettings={resetSettings} adminType={billboardUserId ? "sub" : isAdmin ? "super" : null} billboardUserId={billboardUserId} billboardUserName={billboardUserName} />
      {showRegistrationModal && selectedDate && <EventRegistrationModal isOpen={showRegistrationModal} onClose={() => { setShowRegistrationModal(false); if (fromBanner) setSelectedDate(null); setFromBanner(false); setBannerMonthBounds(null); }} selectedDate={selectedDate} onMonthChange={(d) => setCurrentMonth(d)} onEventCreated={(d, id) => { setShowRegistrationModal(false); setFromBanner(false); setBannerMonthBounds(null); setCurrentMonth(d); setEventJustCreated(Date.now()); setHighlightEvent({ id: id || 0, nonce: Date.now() }); }} fromBanner={fromBanner} bannerMonthBounds={bannerMonthBounds ?? undefined} />}
      {isFullscreenDateModalOpen && fullscreenSelectedDate && <FullscreenDateEventsModal isOpen={isFullscreenDateModalOpen} onClose={() => { setIsFullscreenDateModalOpen(false); setFullscreenSelectedDate(null); setFullscreenClickPosition(undefined); }} selectedDate={fullscreenSelectedDate} clickPosition={fullscreenClickPosition} onEventClick={handleDailyModalEventClick} />}
      <EventDetailModal isOpen={!!selectedEvent} event={selectedEvent} onClose={closeModal} onEdit={handleEditClick} onDelete={handleDeleteClick} isAdminMode={effectiveIsAdmin} />
      {
        showPasswordModal && eventToEdit && (
          <EventPasswordModal event={eventToEdit} password={eventPassword} onPasswordChange={setEventPassword} onSubmit={handlePasswordSubmit} onClose={() => { setShowPasswordModal(false); setEventPassword(""); setEventToEdit(null); }} />
        )
      }
      {showEditModal && eventToEdit && (
        <EventEditModal
          isOpen={showEditModal}
          onClose={() => {
            setShowEditModal(false);
            setEventToEdit(null);
          }}
          event={eventToEdit}
          isAdminMode={effectiveIsAdmin}
          onEventUpdated={() => window.dispatchEvent(new CustomEvent("eventUpdated"))}
          onDelete={handleDeleteClick}
          allGenres={allGenres}
        />
      )}
    </div >
  );
}