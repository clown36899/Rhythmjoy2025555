import { useState, useEffect, useRef, useCallback, useMemo, forwardRef, lazy, Suspense } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";





import EventList from "./components/EventList";
import Header from "./components/Header";

import FullscreenBillboard from "../../components/FullscreenBillboard";
// Lazy loading으로 성능 최적화 - 큰 모달 컴포넌트들
const AdminBillboardModal = lazy(() => import("./components/AdminBillboardModal"));
const EventRegistrationModal = lazy(() => import("../../components/EventRegistrationModal"));

import EventDetailModal from "./components/EventDetailModal";
import EventPasswordModal from "./components/EventPasswordModal";
import CalendarSearchModal from "./components/CalendarSearchModal";
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
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();


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
    const [fromFloatingBtn, setFromFloatingBtn] = useState(false);
    const [bannerMonthBounds, setBannerMonthBounds] = useState<{ min: string; max: string } | null>(null);
    const [registrationCalendarMode, setRegistrationCalendarMode] = useState<'collapsed' | 'expanded' | 'fullscreen' | null>(null);

    // Calendar search state
    const [showCalendarSearch, setShowCalendarSearch] = useState(false);


    // ... (중략) ...

    useEffect(() => {
        const handleCreateEvent = (e: Event) => {
            const customEvent = e as CustomEvent;

            // Capture calendar mode from event detail
            const eventCalendarMode = customEvent.detail?.calendarMode;
            if (eventCalendarMode) {
                setRegistrationCalendarMode(eventCalendarMode);
            }

            if (customEvent.detail?.source === 'banner' && customEvent.detail?.monthIso) {
                // ... (기존 배너 로직 유지) ...
                const firstDayOfMonth = new Date(customEvent.detail.monthIso + '-01');
                setSelectedDate(firstDayOfMonth);
                setFromBanner(true);
                setFromFloatingBtn(false);
                if (firstDayOfMonth) {
                    const year = firstDayOfMonth.getFullYear(); const month = firstDayOfMonth.getMonth();
                    const firstDay = new Date(year, month, 1); const lastDay = new Date(year, month + 1, 0);
                    const formatDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
                    setBannerMonthBounds({ min: formatDate(firstDay), max: formatDate(lastDay) });
                }
            } else if (customEvent.detail?.source === 'floatingBtn') {
                if (!selectedDate) setSelectedDate(new Date());
                setFromFloatingBtn(true);
                setFromBanner(false); setBannerMonthBounds(null);
            } else {
                if (!selectedDate) setSelectedDate(new Date());
                setFromBanner(false); setBannerMonthBounds(null);
            }
            setShowRegistrationModal(true);
        };
        window.addEventListener("createEventForDate", handleCreateEvent);
        return () => window.removeEventListener("createEventForDate", handleCreateEvent);

    }, [selectedDate]);

    // ... (중략) ...

    { showRegistrationModal && selectedDate && <EventRegistrationModal isOpen={showRegistrationModal} onClose={() => { setShowRegistrationModal(false); if (fromBanner) { setSelectedDate(null); setFromBanner(false); setBannerMonthBounds(null); } if (fromFloatingBtn) { setSelectedDate(null); setFromFloatingBtn(false); } }} selectedDate={selectedDate} onMonthChange={(d) => setCurrentMonth(d)} onEventCreated={(d, id) => { setShowRegistrationModal(false); setFromBanner(false); setFromFloatingBtn(false); setBannerMonthBounds(null); setCurrentMonth(d); setEventJustCreated(Date.now()); setHighlightEvent({ id: id || 0, nonce: Date.now() }); }} fromBanner={fromBanner} bannerMonthBounds={bannerMonthBounds ?? undefined} /> }
    const [qrLoading, setQrLoading] = useState(false);


    const [showInputModal, setShowInputModal] = useState(false);
    const [showSortModal, setShowSortModal] = useState(false);
    const [sortBy, setSortBy] = useState<"random" | "time" | "title">("random");
    const [highlightEvent, setHighlightEvent] = useState<{ id: number; nonce: number } | null>(null);
    const [sharedEventId, setSharedEventId] = useState<number | null>(null);
    const [eventJustCreated, setEventJustCreated] = useState<number>(0);
    const [searchTerm, setSearchTerm] = useState("");

    // Derive sectionViewMode from URL parameters
    const sectionViewMode = (searchParams.get('view') as 'preview' | 'viewAll-events' | 'viewAll-classes') || 'preview';

    // Handler to change section view mode via URL
    const handleSectionViewModeChange = useCallback((mode: 'preview' | 'viewAll-events' | 'viewAll-classes') => {
        const newParams = new URLSearchParams(searchParams);

        if (mode === 'preview') {
            // Remove view parameter when returning to preview
            newParams.delete('view');
        } else {
            // Set view parameter for viewAll modes
            newParams.set('view', mode);
        }

        setSearchParams(newParams, { replace: false });
    }, [searchParams, setSearchParams]);




    // ... existing code ...



    const [billboardImages, setBillboardImages] = useState<string[]>([]);
    const [billboardEvents, setBillboardEvents] = useState<any[]>([]);
    const [isBillboardOpen, setIsBillboardOpen] = useState(false);
    const [isBillboardSettingsOpen, setIsBillboardSettingsOpen] = useState(false);
    const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);





    const [selectedWeekday, setSelectedWeekday] = useState<number | null>(null);

    // --- EventList에서 이동된 상태들 ---
    const [selectedEvent, setSelectedEvent] = useState<AppEvent | null>(null);
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [eventToEdit, setEventToEdit] = useState<AppEvent | null>(null);
    const [eventPassword, setEventPassword] = useState("");
    const [showEditModal, setShowEditModal] = useState(false);



    // Navigate to full calendar page when button is clicked
    useEffect(() => {
        const handleSetFullscreenMode = () => {
            navigate('/calendar');
        };

        window.addEventListener('setFullscreenMode', handleSetFullscreenMode);

        return () => {
            window.removeEventListener('setFullscreenMode', handleSetFullscreenMode);
        };
    }, [navigate]);



    // Refs

    const containerRef = useRef<HTMLDivElement>(null!);
    const eventListElementRef = useRef<HTMLDivElement>(null!);
    const eventListSlideContainerRef = useRef<HTMLDivElement | null>(null);
    const headerRef = useRef<HTMLDivElement>(null);



    // 모달이 열렸을 때 배경 컨텐츠의 상호작용을 막기 위한 `inert` 속성 관리
    useEffect(() => {
        const isAnyModalOpen = showInputModal ||
            showSortModal ||
            showRegistrationModal ||
            isBillboardSettingsOpen ||

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
    }, [showInputModal, showSortModal, showRegistrationModal, isBillboardSettingsOpen, selectedEvent, showEditModal, showPasswordModal]);

    const handleHorizontalSwipe = (direction: 'next' | 'prev') => {
        setCurrentMonth((prev) => {
            const newM = new Date(prev);
            newM.setDate(1);
            if (false) {
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
        dragOffset,
        isAnimating,
    } = useCalendarGesture({
        headerHeight: 50, // 화면에 보이는 50px 고정값 사용 (측정값 159px 오류 방지)
        containerRef,
        eventListElementRef,
        onHorizontalSwipe: handleHorizontalSwipe,
        isYearView: false,
    });

    // Sync calendarMode with URL parameters
    useEffect(() => {
        const urlCalendarMode = searchParams.get('calendar');
        if (urlCalendarMode === 'fullscreen' && calendarMode !== 'fullscreen') {
            setCalendarMode('fullscreen');
        } else if (!urlCalendarMode && calendarMode === 'fullscreen') {
            setCalendarMode('collapsed');
        }
    }, [searchParams]);

    // Update URL when calendarMode changes to fullscreen
    useEffect(() => {
        const currentCalendarParam = searchParams.get('calendar');

        if (calendarMode === 'fullscreen' && currentCalendarParam !== 'fullscreen') {
            const newParams = new URLSearchParams(searchParams);
            newParams.set('calendar', 'fullscreen');
            setSearchParams(newParams, { replace: false });
        } else if (calendarMode !== 'fullscreen' && currentCalendarParam === 'fullscreen') {
            const newParams = new URLSearchParams(searchParams);
            newParams.delete('calendar');
            setSearchParams(newParams, { replace: true });
        }
    }, [calendarMode]);

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
    useEffect(() => { window.dispatchEvent(new CustomEvent("viewModeChanged", { detail: { viewMode: "month" } })); }, []);
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

        const handleResetV2MainView = () => {
            // Clear URL parameters
            const newParams = new URLSearchParams(searchParams);
            newParams.delete('view');
            newParams.delete('calendar');
            setSearchParams(newParams, { replace: true });

            setCalendarMode('collapsed');
            setFromBanner(false);
            setBannerMonthBounds(null);

            // Go to today if needed, or just reset view
            // const today = new Date();
            // setCurrentMonth(today); // Optional: Reset month to today? User just said "Preview Main Screen" which usually implies initial state.
            // Let's keep current month but collapse calendar.

            setSelectedDate(null);
            navigateWithCategory("all");

            // Scroll to top
            window.scrollTo({ top: 0, behavior: 'smooth' });
            const scrollContainer = document.querySelector(".overflow-y-auto");
            if (scrollContainer) scrollContainer.scrollTop = 0;
        };



        const handleOpenCalendarSearch = () => {
            setShowCalendarSearch(true);
        };

        const handlePrevMonth = () => handleHorizontalSwipe('prev');
        const handleNextMonth = () => handleHorizontalSwipe('next');

        window.addEventListener('toggleCalendarMode', handleToggleCalendarMode);

        window.addEventListener('goToToday', handleGoToToday);
        window.addEventListener('openSortModal', handleOpenSortModal);
        window.addEventListener('openCalendarSearch', handleOpenCalendarSearch);
        window.addEventListener('resetV2MainView', handleResetV2MainView);
        window.addEventListener('prevMonth', handlePrevMonth);
        window.addEventListener('nextMonth', handleNextMonth);


        return () => {
            window.removeEventListener('toggleCalendarMode', handleToggleCalendarMode);

            window.removeEventListener('goToToday', handleGoToToday);
            window.removeEventListener('openSortModal', handleOpenSortModal);
            window.removeEventListener('openCalendarSearch', handleOpenCalendarSearch);
            window.removeEventListener('resetV2MainView', handleResetV2MainView);
            window.removeEventListener('prevMonth', handlePrevMonth);
            window.removeEventListener('nextMonth', handleNextMonth);

        };
    }, [calendarMode, sortBy, navigateWithCategory, handleSectionViewModeChange]);
    const [fromQR] = useState(() => { const p = new URLSearchParams(window.location.search); const s = p.get("from"); return s === "qr" || s === "edit"; });
    const { settings, updateSettings, resetSettings } = useBillboardSettings();

    const handleBillboardClose = () => { setIsBillboardOpen(false); localStorage.setItem("billboardDismissedDate", new Date().toDateString()); };
    const handleBillboardOpen = () => setIsBillboardOpen(true);
    const handleBillboardSettingsOpen = () => setIsBillboardSettingsOpen(true);
    const handleBillboardSettingsClose = () => setIsBillboardSettingsOpen(false);
    const handleBillboardEventClick = (event: any) => { setIsBillboardOpen(false); if (event && event.id) { const eventDate = event.start_date || event.date; if (eventDate) setCurrentMonth(new Date(eventDate)); setTimeout(() => setHighlightEvent({ id: event.id, nonce: Date.now() }), 100); } };

    const handleCalendarSearchSelect = (event: AppEvent) => {
        // Find the earliest date for this event
        let earliestDate: Date;

        if (event.event_dates && event.event_dates.length > 0) {
            // Multi-day event with individual dates - use the first one
            const sortedDates = [...event.event_dates].sort();
            earliestDate = new Date(sortedDates[0]);
        } else if (event.start_date) {
            // Use start_date if available
            earliestDate = new Date(event.start_date);
        } else {
            // Fallback to date field
            earliestDate = new Date(event.date || '');
        }

        // Calculate month difference for animation
        const targetYear = earliestDate.getFullYear();
        const targetMonth = earliestDate.getMonth();
        const currentYear = currentMonth.getFullYear();
        const currentMonthNum = currentMonth.getMonth();

        const monthDiff = (targetYear - currentYear) * 12 + (targetMonth - currentMonthNum);

        if (Math.abs(monthDiff) > 1) {
            // Show visual swipe animation
            const calendarContainer = document.querySelector('.calendar-grid-container');
            if (calendarContainer) {
                const direction = monthDiff > 0 ? -1 : 1; // Negative for forward, positive for backward
                const distance = Math.min(Math.abs(monthDiff) * 100, 500); // Max 500px

                // Apply swipe animation
                (calendarContainer as HTMLElement).style.transition = 'transform 0.6s ease-out';
                (calendarContainer as HTMLElement).style.transform = `translateX(${direction * distance}px)`;

                // Reset and navigate to target month
                setTimeout(() => {
                    (calendarContainer as HTMLElement).style.transition = 'none';
                    (calendarContainer as HTMLElement).style.transform = 'translateX(0)';
                    setCurrentMonth(earliestDate);
                    setTimeout(() => {
                        (calendarContainer as HTMLElement).style.transition = '';
                        highlightAndScroll(event.id);
                    }, 50);
                }, 600);
            } else {
                // Fallback if container not found
                setCurrentMonth(earliestDate);
                setTimeout(() => highlightAndScroll(event.id), 300);
            }
        } else {
            // Close enough, just navigate directly
            setCurrentMonth(earliestDate);
            setTimeout(() => highlightAndScroll(event.id), 300);
        }
    };

    const highlightAndScroll = (eventId: number) => {
        // Highlight the event
        // setHighlightedEventId(eventId);

        // Remove highlight after 3 seconds
        setTimeout(() => {
            // setHighlightedEventId(null);
        }, 3000);

        // Scroll to the event card with retry mechanism
        const scrollToEvent = (retries = 5) => {
            const eventCard = document.querySelector(`[data-event-id="${eventId}"]`);
            if (eventCard) {
                eventCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } else if (retries > 0) {
                // Retry if element not found (DOM might still be updating)
                setTimeout(() => scrollToEvent(retries - 1), 200);
            }
        };

        // Wait for DOM update
        setTimeout(() => scrollToEvent(), 300);
    };


    const handleMonthChange = (month: Date) => { setCurrentMonth(month); setSelectedDate(null); setSelectedWeekday(null); setFromBanner(false); setBannerMonthBounds(null); navigateWithCategory("all"); };
    // const handleEventsUpdate = async (createdDate?: Date) => { if (createdDate) await handleDateSelect(createdDate); };
    const handleAdminModeToggle = (adminMode: boolean, type: "super" | "sub" | null = null, userId: string | null = null, userName: string = "") => { if (adminMode && type === "super" && !userId) setIsAdminModeOverride(true); else if (!adminMode) setIsAdminModeOverride(false); setAdminType(type ?? null); setBillboardUserId(userId ?? null); setBillboardUserName(userName ?? ""); };

    // const handleViewModeChange = (mode: "month" | "year") => { if (mode === "year") setSavedMonth(new Date(currentMonth)); else if (mode === "month" && savedMonth) setCurrentMonth(new Date(savedMonth)); setViewMode(mode); };
    const handleSearchStart = () => navigateWithCategory("all");

    const handleDailyModalEventClick = (event: AppEvent) => {
        // 약간의 딜레이 후 상세 모달을 열어 애니메이션이 겹치지 않게 함
        setTimeout(() => {
            setSelectedEvent(event);
        }, 100);
    };

    const closeModal = () => {
        setSelectedEvent(null);
        // Don't close search modal - keep it open so user can select other events
    };

    const handleEditClick = (event: AppEvent, e?: React.MouseEvent) => {
        e?.stopPropagation();

        // Close detail modal
        setSelectedEvent(null);

        // Dispatch event for EventList to handle editing
        window.dispatchEvent(new CustomEvent('editEventFromDetail', { detail: event }));
    };
    const deleteEvent = async (eventId: number, password: string | null = null) => {
        try {
            const { error } = await supabase.functions.invoke('delete-event', { body: { eventId, password } });
            if (error) throw error;
            alert("이벤트가 삭제되었습니다.");
            window.dispatchEvent(new CustomEvent("eventDeleted", { detail: { eventId } }));
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
                let query = supabase.from("events").select("id,title,date,start_date,end_date,time,location,category,price,image,image_micro,image_thumbnail,image_medium,image_full,video_url,description,organizer,capacity,registered,link1,link2,link3,link_name1,link_name2,link_name3,created_at,updated_at");
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

    // QR Code & Deep Link Handling - Unified Logic
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const eventId = params.get("event");
        const category = params.get("category");
        const source = params.get("from");

        if (eventId) {
            const id = parseInt(eventId);
            setQrLoading(true);

            // Set shared event ID for non-QR sources
            if (!source || (source !== "qr" && source !== "edit")) {
                setSharedEventId(id);
            }

            const loadEventAndScroll = async () => {
                try {
                    const { data: event } = await supabase
                        .from("events")
                        .select("id, start_date, date, category")
                        .eq("id", id)
                        .single();

                    if (event) {
                        // Navigate to event's month
                        const eventDate = event.start_date || event.date;
                        if (eventDate) {
                            setCurrentMonth(new Date(eventDate));
                        }

                        // Wait for DOM to render, then scroll
                        setTimeout(() => {
                            setQrLoading(false);

                            if (source === "qr" || source === "edit") {
                                // QR/Edit: Scroll to event in preview mode with horizontal scroll
                                scrollToEventInPreview(id, category || event.category);
                            } else {
                                // Regular deep link: Just highlight
                                setTimeout(() => {
                                    setHighlightEvent({ id: event.id, nonce: Date.now() });
                                }, 500);
                            }
                        }, 1200); // Increased delay for DOM rendering
                    } else {
                        setQrLoading(false);
                    }
                } catch (error) {
                    console.error("QR/Deep link error:", error);
                    setQrLoading(false);
                }
            };

            loadEventAndScroll();

            // Clean up URL parameters
            window.history.replaceState({}, "", window.location.pathname);
        }
    }, []);
    // Scroll to event in preview mode with horizontal scroll support
    const scrollToEventInPreview = (eventId: number, category: string) => {
        const scrollToEvent = (retries = 10) => {
            const eventCard = document.querySelector(`[data-event-id="${eventId}"]`);

            if (eventCard) {
                // First, do vertical scroll to bring section into view
                // Use 'inline: nearest' to avoid resetting horizontal scroll
                eventCard.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center',
                    inline: 'nearest'
                });

                // Then, wait a bit and do horizontal scroll
                setTimeout(() => {
                    // Find the horizontal scroll container (correct class name)
                    const slideContainer = eventCard.closest('.evt-v2-horizontal-scroll');

                    if (slideContainer) {
                        // Get fresh positions after vertical scroll
                        const cardRect = eventCard.getBoundingClientRect();
                        const containerRect = slideContainer.getBoundingClientRect();

                        // Calculate scroll position to center the card
                        const cardCenter = cardRect.left + (cardRect.width / 2);
                        const containerCenter = containerRect.left + (containerRect.width / 2);
                        const scrollOffset = cardCenter - containerCenter;

                        slideContainer.scrollTo({
                            left: slideContainer.scrollLeft + scrollOffset,
                            behavior: 'smooth'
                        });
                    }
                }, 500); // Wait for vertical scroll to settle

                // Highlight animation
                eventCard.classList.add('qr-highlighted');
                setTimeout(() => {
                    eventCard.classList.remove('qr-highlighted');
                }, 6000); // 3 pulses × 2s each

            } else if (retries > 0) {
                // Retry if DOM not ready
                setTimeout(() => scrollToEvent(retries - 1), 300);
            }
        };

        scrollToEvent();
    };

    useEffect(() => { if (!searchTerm) navigateWithCategory("all"); }, [searchTerm, navigateWithCategory]);
    useEffect(() => { if (selectedDate && !qrLoading) { const scrollContainer = document.querySelector(".overflow-y-auto"); if (scrollContainer) scrollContainer.scrollTop = 0; } }, [selectedDate, qrLoading]);
    useEffect(() => { const handleClearDate = () => { setSelectedDate(null); setFromBanner(false); setBannerMonthBounds(null); }; window.addEventListener("clearSelectedDate", handleClearDate); return () => window.removeEventListener("clearSelectedDate", handleClearDate); }, []);

    // Event Search from Header
    useEffect(() => {
        const handleOpenEventSearch = () => {
            console.log('[Page.tsx] openEventSearch event received');
            setShowInputModal(true);
        };
        window.addEventListener("openEventSearch", handleOpenEventSearch);
        return () => window.removeEventListener("openEventSearch", handleOpenEventSearch);
    }, []);
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
        const handleEventSelected = (e: Event) => {
            const customEvent = e as CustomEvent;
            if (customEvent.detail) {
                handleDailyModalEventClick(customEvent.detail);
            }
        };
        window.addEventListener("eventSelected", handleEventSelected);
        return () => window.removeEventListener("eventSelected", handleEventSelected);
    }, []);

    // --------------------------------------------------------------------------------
    // 7. 렌더링
    // --------------------------------------------------------------------------------






    return (
        <div
            ref={containerRef}
            className="home-container"
            style={{

                touchAction: "pan-y",
                minHeight: '100svh'
            }}
        >
            <div ref={headerRef} className="home-header global-header-shim" style={{ touchAction: "auto", display: 'none' }}>
                {/* Header components moved to MobileShell */}
            </div>

            {/* Sticky Weekday Header - Only visible in Fullscreen Mode */}


            <div
                className="home-main"
                ref={eventListElementRef}

            >

                {/* Event List - Hidden in Fullscreen Mode but still mounted for event listeners */}
                {qrLoading ? (
                    <div className="home-loading-container"><div className="home-loading-text">이벤트 로딩 중...</div></div>
                ) : (
                    <div>
                        <EventList
                            key={eventJustCreated || undefined}
                            selectedDate={showRegistrationModal ? null : selectedDate}
                            currentMonth={currentMonth}
                            isAdminMode={effectiveIsAdmin}
                            adminType={adminType}
                            viewMode="month"
                            // onEventHover={setHoveredEventId}
                            searchTerm={searchTerm}
                            setSearchTerm={setSearchTerm}
                            onSearchStart={handleSearchStart}
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

                            onModalStateChange={() => { }}
                            selectedWeekday={selectedWeekday}
                            sectionViewMode={sectionViewMode}
                            onSectionViewModeChange={handleSectionViewModeChange}
                        />
                    </div>
                )}


                {/* Modals */}
                {settings.enabled && <FullscreenBillboard images={billboardImages} events={billboardEvents} isOpen={isBillboardOpen} onClose={handleBillboardClose} onEventClick={handleBillboardEventClick} autoSlideInterval={settings.autoSlideInterval} transitionDuration={settings.transitionDuration} dateRangeStart={settings.dateRangeStart} dateRangeEnd={settings.dateRangeEnd} showDateRange={settings.showDateRange} playOrder={settings.playOrder} />}
                {isBillboardSettingsOpen && (
                    <Suspense fallback={<div />}>
                        <AdminBillboardModal
                            isOpen={isBillboardSettingsOpen}
                            onClose={() => { handleBillboardSettingsClose(); if (adminType === "sub") setTimeout(() => window.dispatchEvent(new CustomEvent("reopenAdminSettings")), 100); }}
                            settings={settings}
                            onUpdateSettings={updateSettings}
                            onResetSettings={resetSettings}
                            adminType={billboardUserId ? "sub" : isAdmin ? "super" : null}
                            billboardUserId={billboardUserId}
                            billboardUserName={billboardUserName}
                        />
                    </Suspense>
                )}

                {showRegistrationModal && selectedDate && (
                    <Suspense fallback={<div />}>
                        <EventRegistrationModal
                            isOpen={showRegistrationModal}
                            onClose={() => {
                                setShowRegistrationModal(false);
                                if (fromBanner) {
                                    setSelectedDate(null);
                                    setFromBanner(false);
                                    setBannerMonthBounds(null);
                                }
                                if (fromFloatingBtn) {
                                    setSelectedDate(null);
                                    // Only collapse if registration didn't start from fullscreen
                                    if (registrationCalendarMode !== 'fullscreen') {
                                        handleSectionViewModeChange('preview'); // 프리뷰 모드로 강제 전환
                                        setCalendarMode('collapsed'); // 달력 접기
                                    }
                                    setFromFloatingBtn(false);
                                }
                            }}
                            selectedDate={selectedDate!}
                            onMonthChange={(d) => setCurrentMonth(d)}
                            onEventCreated={(d, id) => {
                                setShowRegistrationModal(false);
                                setFromBanner(false);
                                setFromFloatingBtn(false);
                                setBannerMonthBounds(null);
                                setCurrentMonth(d);

                                if (registrationCalendarMode === 'fullscreen') {
                                    // Fullscreen calendar mode: stay in calendar, highlight event
                                    setSelectedDate(null); // Clear date selection
                                    // setHighlightedEventId(id || null);

                                    // Scroll to the event after it's rendered
                                    setTimeout(() => {
                                        const eventElement = document.querySelector(`[data-event-id="${id}"]`);
                                        if (eventElement) {
                                            eventElement.scrollIntoView({
                                                behavior: 'smooth',
                                                block: 'center'
                                            });
                                        }
                                    }, 500); // Wait for calendar to refresh

                                    // 5-blink animation (10 toggles = 5 blinks)
                                    let blinkCount = 0;
                                    const blinkInterval = setInterval(() => {
                                        // setHighlightedEventId(prev => prev === null ? (id || null) : null);
                                        blinkCount++;
                                        if (blinkCount >= 10) {
                                            clearInterval(blinkInterval);
                                            // setHighlightedEventId(id || null); // End with highlighted
                                            // Clear highlight after 2 seconds
                                            // setTimeout(() => setHighlightedEventId(null), 2000);
                                        }
                                    }, 300); // 300ms per toggle
                                } else {
                                    // Preview mode: current behavior (show in list)
                                    setEventJustCreated(Date.now());
                                    setHighlightEvent({ id: id || 0, nonce: Date.now() });
                                }

                                // Reset registration mode
                                setRegistrationCalendarMode(null);
                            }}
                            fromBanner={fromBanner}
                            bannerMonthBounds={bannerMonthBounds ?? undefined}
                        />
                    </Suspense>
                )}


                <EventDetailModal isOpen={!!selectedEvent} event={selectedEvent!} onClose={closeModal} onEdit={handleEditClick} onDelete={handleDeleteClick} isAdminMode={effectiveIsAdmin} />
                {
                    showPasswordModal && eventToEdit && (
                        <EventPasswordModal event={eventToEdit} password={eventPassword} onPasswordChange={setEventPassword} onSubmit={handlePasswordSubmit} onClose={() => { setShowPasswordModal(false); setEventPassword(""); setEventToEdit(null); }} />
                    )
                }
                {/* Search Input Modal */}
                <CalendarSearchModal
                    isOpen={showInputModal}
                    onClose={() => setShowInputModal(false)}
                    onSelectEvent={(event) => {
                        // Show event detail modal directly
                        setSelectedEvent(event);
                        setShowInputModal(false);
                    }}
                />
            </div>
        </div >
    );
}
