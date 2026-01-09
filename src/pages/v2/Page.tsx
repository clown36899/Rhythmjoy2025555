import { useState, useEffect, useRef, useCallback, useMemo, forwardRef, lazy, Suspense } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";





import EventList from "./components/EventList";



// Lazy loading으로 성능 최적화 - 큰 모달 컴포넌트들
const EventRegistrationModal = lazy(() => import("../../components/EventRegistrationModal"));

import EventDetailModal from "./components/EventDetailModal";
import VenueDetailModal from "../practice/components/VenueDetailModal";
// EventPasswordModal removed
import CalendarSearchModal from "./components/CalendarSearchModal";
import { useUserInteractions } from "../../hooks/useUserInteractions";
import { registerLocale } from "react-datepicker";
import { ko } from "date-fns/locale/ko";
import "react-datepicker/dist/react-datepicker.css";



import { useAuth } from "../../contexts/AuthContext";
import { useSetPageAction } from "../../contexts/PageActionContext";
import { useCalendarGesture } from "./hooks/useCalendarGesture";
import { useEventActions } from "./hooks/useEventActions";
import { useCalendarState } from "./hooks/useCalendarState";
import { useDeepLinkLogic } from "./hooks/useDeepLinkLogic";


import "./styles/Page.css";

export default function HomePageV2() {
    // --------------------------------------------------------------------------------
    // 1. Core Hooks & Context
    // --------------------------------------------------------------------------------
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();
    const { isAdmin, user, signInWithKakao } = useAuth();


    // Import Social Types and Components


    registerLocale("ko", ko); // Move side effect here or keep outside? Keep here is fine.

    // --------------------------------------------------------------------------------
    // 2. Local State
    // --------------------------------------------------------------------------------
    // UI Constants & derived state


    // Admin State
    const [adminType, setAdminType] = useState<"super" | "sub" | null>(null);
    const [isAdminModeOverride, setIsAdminModeOverride] = useState(false);
    const effectiveIsAdmin = isAdmin || isAdminModeOverride;

    // Modal & View State
    const [showRegistrationModal, setShowRegistrationModal] = useState(false);
    const [fromBanner, setFromBanner] = useState(false);
    const [bannerMonthBounds, setBannerMonthBounds] = useState<{ min: string; max: string } | null>(null);
    const [registrationCalendarMode, setRegistrationCalendarMode] = useState<'collapsed' | 'expanded' | 'fullscreen' | null>(null);

    // Search & Sort State
    const [showInputModal, setShowInputModal] = useState(false);
    const [eventJustCreated, setEventJustCreated] = useState<number>(0);
    const [allGenres] = useState<{ class: string[]; event: string[] }>({ class: [], event: [] });

    // --------------------------------------------------------------------------------
    // 3. Custom Logic Hooks (Refactored)
    // --------------------------------------------------------------------------------

    // Calendar State (Date, Navigation)
    const {
        selectedDate, setSelectedDate,
        currentMonth, setCurrentMonth,

        navigateWithCategory,
        handleHorizontalSwipe: changeMonth,
        moveToToday
    } = useCalendarState();

    // Event Actions (Edit, Delete, Details)
    const {
        selectedEvent, setSelectedEvent,
        handleDailyModalEventClick, closeModal,
        handleEditClick, handleDeleteClick,
        selectedVenueId, handleVenueClick, closeVenueModal,
        isDeleting, deleteProgress
    } = useEventActions({ adminType, user, signInWithKakao });

    // Deep Link & QR Logic
    const {
        qrLoading, highlightEvent, setHighlightEvent
    } = useDeepLinkLogic({ setCurrentMonth });








    // Favorites Logic - Using centralized useUserInteractions
    const { interactions, toggleEventFavorite: baseToggleEventFavorite } = useUserInteractions(user?.id || null);
    const favoriteEventIds = useMemo(() => new Set(interactions?.event_favorites || []), [interactions]);

    // Toggle favorite function
    const toggleFavorite = useCallback(async (eventId: number | string, e?: React.MouseEvent) => {
        e?.stopPropagation();

        if (!user) {
            if (confirm('즐겨찾기는 로그인 후 이용 가능합니다.\n확인을 눌러서 로그인을 진행해주세요')) {
                try {
                    await signInWithKakao();
                } catch (err) {
                    console.error(err);
                }
            }
            return;
        }

        try {
            await baseToggleEventFavorite(eventId);
        } catch (err) {
            console.error('Error toggling favorite:', err);
        }
    }, [user, signInWithKakao, baseToggleEventFavorite]);





    // --------------------------------------------------------------------------------
    // 4. UI Components (Memoized)
    // --------------------------------------------------------------------------------

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

    // Memoized EventList Handlers (Moved outside conditional for Rules of Hooks)
    const handleEventClick = useCallback((event: any) => setSelectedEvent(event), [setSelectedEvent]);



    // Handler to change section view mode via URL
    const handleSectionViewModeChange = useCallback((mode: 'preview' | 'viewAll-events' | 'viewAll-classes') => {
        const newParams = new URLSearchParams(searchParams);

        if (mode === 'preview') {
            newParams.delete('view');
        } else {
            newParams.set('view', mode);
        }

        setSearchParams(newParams, { replace: false });
        // 스크롤 초기화
        window.scrollTo(0, 0);
    }, [searchParams, setSearchParams]);

    // --------------------------------------------------------------------------------
    // 5. Effects
    // --------------------------------------------------------------------------------
    // 모바일 바운스 방지
    // 모바일 바운스 방지 - 제거됨 (Pull-to-Refresh 활성화)
    // useEffect(() => {
    //     document.documentElement.style.overscrollBehavior = 'none';
    //     document.body.style.overscrollBehavior = 'none';
    //     return () => {
    //         document.documentElement.style.overscrollBehavior = '';
    //         document.body.style.overscrollBehavior = '';
    //     };
    // }, []);

    // --------------------------------------------------------------------------------
    // Refs & Layout Effects
    // --------------------------------------------------------------------------------
    const containerRef = useRef<HTMLDivElement>(null!);
    const eventListElementRef = useRef<HTMLDivElement>(null!);


    // 모달이 열렸을 때 배경 컨텐츠의 상호작용을 막기 위한 `inert` 속성 관리
    useEffect(() => {
        const isAnyModalOpen = showInputModal ||
            showRegistrationModal ||
            !!selectedEvent;

        const container = containerRef.current;
        if (container) {
            container.inert = isAnyModalOpen;
        }
        return () => { if (container) container.inert = false; };
    }, [showInputModal, showRegistrationModal, selectedEvent]);

    const handleHorizontalSwipe = useCallback((direction: 'next' | 'prev') => {
        changeMonth(direction);
        setFromBanner(false);
        setBannerMonthBounds(null);
    }, [changeMonth]);

    // --------------------------------------------------------------------------------
    // 4. Custom Hook: Calendar Gesture & State
    // --------------------------------------------------------------------------------
    const {
        calendarMode,
        setCalendarMode,

    } = useCalendarGesture({
        headerHeight: 50,
        containerRef,
        eventListElementRef,
        onHorizontalSwipe: handleHorizontalSwipe,
        isYearView: false,
    });

    // FAB Registration Action (Moved here to access calendarMode)
    useSetPageAction(useMemo(() => ({
        icon: 'ri-add-line',
        label: '자율등록(누구나)',
        requireAuth: true,
        onClick: () => {
            window.dispatchEvent(new CustomEvent('createEventForDate', {
                detail: { source: 'floatingBtn', calendarMode }
            }));
        }
    }), [calendarMode]));

    // Calendar Mode Sync Effects
    useEffect(() => {
        const urlCalendarMode = searchParams.get('calendar');
        if (urlCalendarMode === 'fullscreen' && calendarMode !== 'fullscreen') {
            setCalendarMode('fullscreen');
        } else if (!urlCalendarMode && calendarMode === 'fullscreen') {
            setCalendarMode('collapsed');
        }
    }, [searchParams, calendarMode, setCalendarMode]);

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
    }, [calendarMode, searchParams, setSearchParams]);

    // Navigate to full calendar logic
    useEffect(() => {
        const handleSetFullscreenMode = () => { navigate('/calendar'); };
        window.addEventListener('setFullscreenMode', handleSetFullscreenMode);
        return () => { window.removeEventListener('setFullscreenMode', handleSetFullscreenMode); };
    }, [navigate]);

    // Admin type sync logic
    useEffect(() => { if (effectiveIsAdmin && adminType !== "super") setAdminType("super"); else if (!effectiveIsAdmin && adminType !== null) { setAdminType(null); setIsAdminModeOverride(false); } }, [effectiveIsAdmin, adminType]);

    // State Sync dispatchers
    useEffect(() => { window.dispatchEvent(new CustomEvent("viewModeChanged", { detail: { viewMode: "month" } })); }, []);
    useEffect(() => { window.dispatchEvent(new CustomEvent("calendarModeChanged", { detail: calendarMode })); }, [calendarMode]);


    // Shell Command Listeners
    useEffect(() => {
        const handleToggleCalendarMode = () => {
            if (calendarMode === "fullscreen") setCalendarMode("expanded");
            else setCalendarMode(prev => prev === "collapsed" ? "expanded" : "collapsed");
        };

        const handleGoToToday = () => { moveToToday(); };
        const handleResetV2MainView = () => {
            const newParams = new URLSearchParams(searchParams);
            newParams.delete('view'); newParams.delete('calendar');
            setSearchParams(newParams, { replace: true });

            // Only collapse if not already collapsed to avoid loops? No, explicit command.
            setCalendarMode('collapsed');
            setFromBanner(false); setBannerMonthBounds(null);
            setSelectedDate(null);
            navigateWithCategory("all");

            window.scrollTo({ top: 0, behavior: 'smooth' });
            const scrollContainer = document.querySelector(".overflow-y-auto");
            if (scrollContainer) scrollContainer.scrollTop = 0;
        };

        const handleOpenCalendarSearch = () => setShowInputModal(true);
        const handlePrevMonth = () => handleHorizontalSwipe('prev');
        const handleNextMonth = () => handleHorizontalSwipe('next');

        window.addEventListener('toggleCalendarMode', handleToggleCalendarMode);
        window.addEventListener('goToToday', handleGoToToday);
        window.addEventListener('openCalendarSearch', handleOpenCalendarSearch);
        window.addEventListener('resetV2MainView', handleResetV2MainView);

        window.addEventListener('prevMonth', handlePrevMonth);
        window.addEventListener('nextMonth', handleNextMonth);

        return () => {
            window.removeEventListener('toggleCalendarMode', handleToggleCalendarMode);
            window.removeEventListener('goToToday', handleGoToToday);
            window.removeEventListener('openCalendarSearch', handleOpenCalendarSearch);
            window.removeEventListener('resetV2MainView', handleResetV2MainView);

            window.removeEventListener('prevMonth', handlePrevMonth);
            window.removeEventListener('nextMonth', handleNextMonth);
        };
    }, [calendarMode, navigateWithCategory, searchParams, setSearchParams, moveToToday, setCalendarMode, setShowInputModal]);

    // Global Search Event (from header search button)
    useEffect(() => {
        const handleOpenGlobalSearch = () => {
            console.log('[Page.tsx] openGlobalSearch event received');
            setShowInputModal(true);
        };
        window.addEventListener("openGlobalSearch", handleOpenGlobalSearch);
        return () => window.removeEventListener("openGlobalSearch", handleOpenGlobalSearch);
    }, []);

    useEffect(() => {
        const handleOpenEventSearch = () => {
            console.log('[Page.tsx] openEventSearch event received');
            setShowInputModal(true);
        };
        window.addEventListener("openEventSearch", handleOpenEventSearch);
        return () => window.removeEventListener("openEventSearch", handleOpenEventSearch);
    }, []);
    useEffect(() => {
        const handleResetToToday = () => { moveToToday(); };
        window.addEventListener("resetToToday", handleResetToToday); return () => window.removeEventListener("resetToToday", handleResetToToday);
    }, [moveToToday]);

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

    // selectedDateChanged dispatch moved to hook


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

                            highlightEvent={highlightEvent}
                            onEventClick={handleEventClick}
                            onMonthChange={setCurrentMonth}
                            calendarMode={calendarMode}
                            onSectionViewModeChange={handleSectionViewModeChange}
                        />
                    </div>
                )}


                {/* Modals */}


                {showRegistrationModal && selectedDate && (
                    <Suspense fallback={<div />}>
                        <EventRegistrationModal
                            isOpen={showRegistrationModal}
                            onClose={() => {
                                setShowRegistrationModal(false);
                                setSelectedDate(null); // Always clear to prevent unused date view
                                setFromBanner(false);

                                setBannerMonthBounds(null);
                            }}
                            selectedDate={selectedDate!}
                            onMonthChange={(d) => setCurrentMonth(d)}
                            onEventCreated={(d, id) => {
                                setShowRegistrationModal(false);
                                setFromBanner(false);

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
                                    // Restore intended behavior: Go to Preview Page
                                    setSelectedDate(null); // Clear selected date to exit "Unused Screen" (Date view)
                                    handleSectionViewModeChange('preview'); // Reset to default view
                                    setCalendarMode('collapsed'); // Ensure calendar is collapsed

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


                <EventDetailModal
                    isOpen={!!selectedEvent}
                    event={selectedEvent as any}
                    onClose={closeModal}
                    onEdit={handleEditClick as any}
                    onDelete={handleDeleteClick as any}
                    isAdminMode={effectiveIsAdmin}
                    currentUserId={user?.id}
                    onOpenVenueDetail={handleVenueClick}
                    allGenres={allGenres}
                    isFavorite={selectedEvent ? favoriteEventIds.has(selectedEvent.id) : false}
                    onToggleFavorite={(e) => selectedEvent && toggleFavorite(selectedEvent.id, e)}
                    isDeleting={isDeleting}
                    deleteProgress={deleteProgress}
                />

                {/* Venue Detail Modal - Hoisted to Page Level for persistence */}
                {selectedVenueId && (
                    <VenueDetailModal
                        venueId={selectedVenueId}
                        onClose={closeVenueModal}
                    />
                )}
                {/* Search Input Modal */}
                {/* Search Input Modal */}
                <CalendarSearchModal
                    isOpen={showInputModal}
                    onClose={() => setShowInputModal(false)}
                    onSelectEvent={(event) => {
                        // Show event detail modal directly, keep search modal open
                        setSelectedEvent(event);
                    }}
                    searchMode="all"
                />
            </div>
        </div >
    );
}
