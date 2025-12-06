import { useState, useEffect, useRef, useCallback, useMemo, forwardRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";




import EventCalendar from "./components/EventCalendar";
import EventList from "./components/EventList";
import Header from "./components/Header";

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
import { useCalendarGesture } from "./hooks/useCalendarGesture";
import "./styles/Page.css";

export default function HomePageV2() {
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
        if (!cat || cat === "all") navigate("/v2");
        else navigate(`/v2?category=${cat}`);
    }, [navigate]);

    // --------------------------------------------------------------------------------
    // 2. 상태 관리
    // --------------------------------------------------------------------------------
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [viewMode, setViewMode] = useState<"month" | "year">("month");
    // const [headerHeight, setHeaderHeight] = useState(60); // Removed: using fixed 50px
    // const [headerDebugInfo, setHeaderDebugInfo] = useState<string>(""); // Removed: no longer measuring

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


    const [isFullscreenTransition, setIsFullscreenTransition] = useState(false);

    // ... existing code ...



    const [billboardImages, setBillboardImages] = useState<string[]>([]);
    const [billboardEvents, setBillboardEvents] = useState<any[]>([]);
    const [isBillboardOpen, setIsBillboardOpen] = useState(false);
    const [isBillboardSettingsOpen, setIsBillboardSettingsOpen] = useState(false);
    const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);




    const [isFullscreenDateModalOpen, setIsFullscreenDateModalOpen] = useState(false);
    const [fullscreenSelectedDate, setFullscreenSelectedDate] = useState<Date | null>(null);
    const [fullscreenClickPosition, setFullscreenClickPosition] = useState<{ x: number; y: number } | undefined>(undefined);
    const [selectedWeekday, setSelectedWeekday] = useState<number | null>(null);

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



    // 모달이 열렸을 때 배경 컨텐츠의 상호작용을 막기 위한 `inert` 속성 관리
    useEffect(() => {
        const isAnyModalOpen = showSearchModal ||
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
    }, [showSearchModal, showSortModal, showRegistrationModal, isBillboardSettingsOpen, isFullscreenDateModalOpen, selectedEvent, showEditModal, showPasswordModal]);

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
        headerHeight: 50, // 화면에 보이는 50px 고정값 사용 (측정값 159px 오류 방지)
        containerRef,
        calendarRef,
        calendarContentRef,
        eventListElementRef,
        onHorizontalSwipe: handleHorizontalSwipe,
        isYearView: viewMode === 'year',
        // headerDebugInfo // Removed
    });

    // Track top bar height for accurate positioning
    // useEffect(() => {
    //   console.log(`[Page] STATE CHANGE: headerHeight=${headerHeight}, debugInfo="${headerDebugInfo}"`);
    // }, [headerHeight, headerDebugInfo]);



    const isCurrentMonthVisible = (() => {
        const today = new Date();
        return currentMonth.getFullYear() === today.getFullYear() &&
            currentMonth.getMonth() === today.getMonth();
    })();

    // --------------------------------------------------------------------------------
    // 6. 핸들러 및 기타 로직
    // --------------------------------------------------------------------------------
    useEffect(() => { if (headerRef.current) { /* setHeaderHeight(headerRef.current.offsetHeight); */ } }, []);
    useEffect(() => { if (effectiveIsAdmin && !billboardUserId && adminType !== "super") setAdminType("super"); else if (!effectiveIsAdmin && !billboardUserId && adminType !== null) { setAdminType(null); setIsAdminModeOverride(false); } }, [effectiveIsAdmin, billboardUserId, adminType]);
    useEffect(() => { window.dispatchEvent(new CustomEvent("monthChanged", { detail: { month: currentMonth.toISOString() } })); }, [currentMonth]);
    useEffect(() => { window.dispatchEvent(new CustomEvent("viewModeChanged", { detail: { viewMode } })); }, [viewMode]);
    // Shell State Synchronization
    useEffect(() => { window.dispatchEvent(new CustomEvent("calendarModeChanged", { detail: calendarMode })); }, [calendarMode]);
    useEffect(() => { window.dispatchEvent(new CustomEvent("sortByChanged", { detail: sortBy })); }, [sortBy]);
    useEffect(() => { window.dispatchEvent(new CustomEvent("isCurrentMonthVisibleChanged", { detail: isCurrentMonthVisible })); }, [isCurrentMonthVisible]);

    // Shell Command Listeners
    useEffect(() => {
        const handleToggleCalendarMode = () => {
            if (calendarMode === "fullscreen") setCalendarMode("expanded");
            else setCalendarMode(prev => prev === "collapsed" ? "expanded" : "collapsed");
        };
        const handleSetFullscreenMode = () => {
            if (calendarMode !== "fullscreen") {
                setIsFullscreenTransition(true);
                setCalendarMode("fullscreen");
            } else {
                setCalendarMode("collapsed");
            }
        };
        const handleGoToToday = () => {
            const today = new Date();
            setCurrentMonth(today);
            setSelectedDate(null);
            navigateWithCategory("all");
            // Trigger pulses if needed
            if (sortBy === "random") {
                // Pulse logic moved to Shell
            }
        };
        const handleOpenSortModal = () => setShowSortModal(true);
        const handleOpenSearchModal = () => setShowSearchModal(true);

        window.addEventListener('toggleCalendarMode', handleToggleCalendarMode);
        window.addEventListener('setFullscreenMode', handleSetFullscreenMode);
        window.addEventListener('goToToday', handleGoToToday);
        window.addEventListener('openSortModal', handleOpenSortModal);
        window.addEventListener('openSearchModal', handleOpenSearchModal);

        return () => {
            window.removeEventListener('toggleCalendarMode', handleToggleCalendarMode);
            window.removeEventListener('setFullscreenMode', handleSetFullscreenMode);
            window.removeEventListener('goToToday', handleGoToToday);
            window.removeEventListener('openSortModal', handleOpenSortModal);
            window.removeEventListener('openSearchModal', handleOpenSearchModal);
        };
    }, [calendarMode, sortBy]);
    const [fromQR] = useState(() => { const p = new URLSearchParams(window.location.search); const s = p.get("from"); return s === "qr" || s === "edit"; });
    const { settings, updateSettings, resetSettings } = useBillboardSettings();

    const handleBillboardClose = () => { setIsBillboardOpen(false); localStorage.setItem("billboardDismissedDate", new Date().toDateString()); };
    const handleBillboardOpen = () => setIsBillboardOpen(true);
    const handleBillboardSettingsOpen = () => setIsBillboardSettingsOpen(true);
    const handleBillboardSettingsClose = () => setIsBillboardSettingsOpen(false);
    const handleBillboardEventClick = (event: any) => { setIsBillboardOpen(false); if (event && event.id) { const eventDate = event.start_date || event.date; if (eventDate) setCurrentMonth(new Date(eventDate)); setTimeout(() => setHighlightEvent({ id: event.id, nonce: Date.now() }), 100); } };

    const handleDateSelect = (date: Date | null, hasEvents?: boolean) => { setSelectedDate(date); if (date) setSelectedWeekday(null); if (date && hasEvents) navigateWithCategory("all"); };
    const handleMonthChange = (month: Date) => { setCurrentMonth(month); setSelectedDate(null); setSelectedWeekday(null); setFromBanner(false); setBannerMonthBounds(null); if (viewMode === "month") navigateWithCategory("all"); };
    const handleEventsUpdate = async (createdDate?: Date) => { if (createdDate) await handleDateSelect(createdDate); };
    const handleAdminModeToggle = (adminMode: boolean, type: "super" | "sub" | null = null, userId: string | null = null, userName: string = "") => { if (adminMode && type === "super" && !userId) setIsAdminModeOverride(true); else if (!adminMode) setIsAdminModeOverride(false); setAdminType(type ?? null); setBillboardUserId(userId ?? null); setBillboardUserName(userName ?? ""); };

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
        const handleResetToToday = () => { const today = new Date(); setCurrentMonth(today); setSelectedDate(null); navigateWithCategory("all"); };
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
    const EXPANDED_HEIGHT = 173;

    const renderHeight = useMemo(() => {
        if (isDragging) return `${liveCalendarHeight}px`;
        if (calendarMode === 'collapsed') return '0px';
        if (calendarMode === 'fullscreen') {
            // calculateFullscreenHeight() 결과값:
            // 전체 화면 높이(Viewport) - 헤더 높이(50px) - 하단 네비게이션(BottomNav) - 필터 바(FilterBar)
            // (ControlBar 높이는 차감하지 않음)
            const containerHeight = calculateFullscreenHeight();

            // [수정 완료] 이중 차감 방지
            // containerHeight에서 이미 ControlBar 높이가 빠져있으므로, 여기서 다시 빼지 않습니다.
            return `${Math.max(0, containerHeight)}px`;
        }
        return `${EXPANDED_HEIGHT}px`; // 'expanded' 모드의 높이 (173px)
    }, [isDragging, liveCalendarHeight, calendarMode, calculateFullscreenHeight]);
    const isFixed = calendarMode === "fullscreen";


    // Calculate header height for home-main padding
    useEffect(() => {
        let animationFrameId: number;
        let isAnimating = true;

        const updateMainPadding = () => {
            const header = headerRef.current;
            if (header) {
                const headerHeight = header.offsetHeight;
                const mainElement = document.querySelector('.home-main') as HTMLElement;
                if (mainElement) {
                    mainElement.style.paddingTop = `${headerHeight}px`;
                }
            }

            // Continue updating during animation
            if (isAnimating) {
                animationFrameId = requestAnimationFrame(updateMainPadding);
            }
        };

        // Start continuous updates
        updateMainPadding();

        // Stop after animation completes (350ms)
        const stopTimer = setTimeout(() => {
            isAnimating = false;
            cancelAnimationFrame(animationFrameId);
            // Final update
            updateMainPadding();
        }, 350);

        window.addEventListener('resize', updateMainPadding);

        return () => {
            isAnimating = false;
            cancelAnimationFrame(animationFrameId);
            clearTimeout(stopTimer);
            window.removeEventListener('resize', updateMainPadding);
        };
    }, [calendarMode]);



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

                {/* Calendar Section - Inside Header */}
                <div
                    ref={calendarRef}
                    className="home-calendar-wrapper"
                    style={{
                        backgroundColor: "var(--calendar-bg-color)",
                        touchAction: "pan-y",
                        position: isFixed ? "fixed" : "relative",
                        left: 0, right: 0,
                        zIndex: isFixed ? 30 : 15,
                    }}
                    onTransitionEnd={() => {
                        if (isFullscreenTransition) {
                            setIsFullscreenTransition(false);
                        }
                    }}
                >
                    {/* Weekday Header */}
                    <div className="calendar-weekday-header no-select">
                        {["일", "월", "화", "수", "목", "금", "토"].map((day, index) => (
                            <div
                                key={day}
                                className={`calendar-weekday-item ${selectedWeekday === index ? 'selected' : ''}`}
                                style={{
                                    cursor: 'pointer'
                                }}
                                onClick={() => {
                                    console.log(`[Page] Weekday clicked: ${day} (index: ${index})`);
                                    if (selectedWeekday === index) {
                                        console.log(`[Page] Deselecting weekday`);
                                        setSelectedWeekday(null);
                                    } else {
                                        console.log(`[Page] Selecting weekday: ${index}`);
                                        setSelectedWeekday(index);
                                        setSelectedDate(null);
                                    }
                                }}
                            >
                                {day}
                                {selectedWeekday === index && (
                                    <i className="ri-close-line" style={{ fontSize: '10px', marginLeft: '1px', opacity: 0.8 }}></i>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* 
            [Height Connection Explanation]
            This div is the main container for the calendar content.
            - style.height: assigned to 'renderHeight'.
            - 'renderHeight': comes from useCalendarGesture hook.
              It is the result of: Viewport Height - Header Height (50px) - Bottom Nav - Control Bar - Filter Bar.
              This ensures the calendar fills the remaining space exactly.
          */}
                    <div
                        ref={calendarContentRef}
                        className="home-calendar-content"
                        style={{
                            height: renderHeight, // <--- This is where the calculated height is applied!
                            transition: isDragging ? "none" : "height 0.3s cubic-bezier(0.33, 1, 0.68, 1)",
                            willChange: isDragging ? "height" : undefined,
                            touchAction: (viewMode === "year" || calendarMode === "fullscreen") ? "pan-y" : "none",
                            overflowY: calendarMode === "fullscreen" ? "auto" : "hidden",
                            overscrollBehavior: calendarMode === "fullscreen" ? "contain" : "auto",
                            WebkitOverflowScrolling: calendarMode === "fullscreen" ? "touch" : undefined
                        }}
                    >
                        <EventCalendar
                            currentMonth={currentMonth}
                            selectedDate={selectedDate}
                            onDateSelect={handleDateSelect}
                            onMonthChange={handleMonthChange}
                            isAdminMode={effectiveIsAdmin}
                            showHeader={false}
                            onEventsUpdate={handleEventsUpdate}
                            viewMode={viewMode}
                            onViewModeChange={handleViewModeChange}
                            hoveredEventId={hoveredEventId}
                            dragOffset={dragOffset}
                            isAnimating={isAnimating}
                            // calendarHeightPx: Internal height used by EventCalendar for row calculations
                            calendarHeightPx={isDragging ? liveCalendarHeight : getTargetHeight()}
                            calendarMode={calendarMode}
                            selectedCategory={selectedCategory}
                            isTransitioning={isFullscreenTransition}
                        />
                    </div>


                </div>


            </div>

            <div
                className="home-main"
                ref={eventListElementRef}
                style={{
                    marginTop: isFixed ? `${calculateFullscreenHeight()}px` : undefined,
                    overscrollBehaviorY: "contain"
                }}
            >
                {qrLoading ? (
                    <div className="home-loading-container"><div className="home-loading-text">이벤트 로딩 중...</div></div>
                ) : (
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
                        onHighlightComplete={() => setHighlightEvent(null)}
                        sharedEventId={sharedEventId}
                        onSharedEventOpened={() => setSharedEventId(null)}
                        dragOffset={dragOffset}
                        isAnimating={isAnimating}
                        slideContainerRef={eventListSlideContainerRef}
                        onMonthChange={setCurrentMonth}
                        calendarMode={calendarMode}
                        onEventClickInFullscreen={handleDailyModalEventClick}
                        onModalStateChange={() => { }}
                        selectedWeekday={selectedWeekday}
                    />
                )}

                {/* Modals */}
                {settings.enabled && <FullscreenBillboard images={billboardImages} events={billboardEvents} isOpen={isBillboardOpen} onClose={handleBillboardClose} onEventClick={handleBillboardEventClick} autoSlideInterval={settings.autoSlideInterval} transitionDuration={settings.transitionDuration} dateRangeStart={settings.dateRangeStart} dateRangeEnd={settings.dateRangeEnd} showDateRange={settings.showDateRange} playOrder={settings.playOrder} />}
                <AdminBillboardModal isOpen={isBillboardSettingsOpen} onClose={() => { handleBillboardSettingsClose(); if (adminType === "sub") setTimeout(() => window.dispatchEvent(new CustomEvent("reopenAdminSettings")), 100); }} settings={settings} onUpdateSettings={updateSettings} onResetSettings={resetSettings} adminType={billboardUserId ? "sub" : isAdmin ? "super" : null} billboardUserId={billboardUserId} billboardUserName={billboardUserName} />
                {showRegistrationModal && selectedDate && <EventRegistrationModal isOpen={showRegistrationModal} onClose={() => { setShowRegistrationModal(false); if (fromBanner) setSelectedDate(null); setFromBanner(false); setBannerMonthBounds(null); }} selectedDate={selectedDate} onMonthChange={(d) => setCurrentMonth(d)} onEventCreated={(d, id) => { setShowRegistrationModal(false); setFromBanner(false); setBannerMonthBounds(null); setCurrentMonth(d); setEventJustCreated(Date.now()); setHighlightEvent({ id: id || 0, nonce: Date.now() }); }} fromBanner={fromBanner} bannerMonthBounds={bannerMonthBounds ?? undefined} />}
                {isFullscreenDateModalOpen && fullscreenSelectedDate && <FullscreenDateEventsModal isOpen={isFullscreenDateModalOpen} onClose={() => { setIsFullscreenDateModalOpen(false); setFullscreenSelectedDate(null); setFullscreenClickPosition(undefined); }} selectedDate={fullscreenSelectedDate} clickPosition={fullscreenClickPosition} onEventClick={handleDailyModalEventClick} selectedCategory={selectedCategory} />}
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
            </div>
        </div>
    );
}
