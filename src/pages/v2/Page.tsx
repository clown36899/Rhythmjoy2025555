import { useState, useEffect, useRef, useCallback, useMemo, forwardRef, lazy, Suspense } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";





import EventList from "./components/EventList";


import FullscreenBillboard from "../../components/FullscreenBillboard";
// Lazy loading으로 성능 최적화 - 큰 모달 컴포넌트들
const AdminBillboardModal = lazy(() => import("./components/AdminBillboardModal"));
const EventRegistrationModal = lazy(() => import("../../components/EventRegistrationModal"));

import EventDetailModal from "./components/EventDetailModal";
import VenueDetailModal from "../practice/components/VenueDetailModal";
// EventPasswordModal removed
import CalendarSearchModal from "./components/CalendarSearchModal";
import { useEventFavorites } from "../../hooks/useEventFavorites";
import { registerLocale } from "react-datepicker";
import { ko } from "date-fns/locale/ko";
import "react-datepicker/dist/react-datepicker.css";


import { useBillboardSettings } from "../../hooks/useBillboardSettings";
import { useAuth } from "../../contexts/AuthContext";
import { useCalendarGesture } from "./hooks/useCalendarGesture";
import { useEventActions } from "./hooks/useEventActions";
import { useCalendarState } from "./hooks/useCalendarState";
import { useDeepLinkLogic } from "./hooks/useDeepLinkLogic";
import { useBillboardLogic } from "./hooks/useBillboardLogic";
import "./styles/Page.css";

export default function HomePageV2() {
    // --------------------------------------------------------------------------------
    // 1. Core Hooks & Context
    // --------------------------------------------------------------------------------
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();
    const { isAdmin, user, signInWithKakao } = useAuth();
    const { settings, updateSettings, resetSettings } = useBillboardSettings();

    registerLocale("ko", ko); // Move side effect here or keep outside? Keep here is fine.

    // --------------------------------------------------------------------------------
    // 2. Local State
    // --------------------------------------------------------------------------------
    // UI Constants & derived state
    const [fromQR] = useState(() => new URLSearchParams(window.location.search).get("from") === "qr");

    // Admin State
    const [adminType, setAdminType] = useState<"super" | "sub" | null>(null);
    const [billboardUserId] = useState<string | null>(null);
    const [billboardUserName] = useState<string>("");
    const [isAdminModeOverride, setIsAdminModeOverride] = useState(false);
    const effectiveIsAdmin = isAdmin || isAdminModeOverride;

    // Modal & View State
    const [showRegistrationModal, setShowRegistrationModal] = useState(false);
    const [fromBanner, setFromBanner] = useState(false);
    const [bannerMonthBounds, setBannerMonthBounds] = useState<{ min: string; max: string } | null>(null);
    const [registrationCalendarMode, setRegistrationCalendarMode] = useState<'collapsed' | 'expanded' | 'fullscreen' | null>(null);

    // Search & Sort State
    const [showInputModal, setShowInputModal] = useState(false);
    const [showSortModal, setShowSortModal] = useState(false);
    const [sortBy, setSortBy] = useState<"random" | "time" | "title">("random");
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedWeekday] = useState<number | null>(null); // Placeholder for EventList compatibility
    const [eventJustCreated, setEventJustCreated] = useState<number>(0);
    const [allGenres, setAllGenres] = useState<{ class: string[]; event: string[] }>({ class: [], event: [] });

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
        selectedVenueId, handleVenueClick, closeVenueModal
    } = useEventActions({ adminType, user, signInWithKakao });

    // Deep Link & QR Logic
    const {
        qrLoading, highlightEvent, setHighlightEvent,
        sharedEventId, setSharedEventId
    } = useDeepLinkLogic({ setCurrentMonth });

    // Billboard Logic
    const {
        isBillboardOpen,
        isBillboardSettingsOpen, setIsBillboardSettingsOpen,
        billboardImages, billboardEvents,
        handleBillboardClose, handleBillboardSettingsClose,
        handleBillboardEventClick
    } = useBillboardLogic({ settings, fromQR, setCurrentMonth, setHighlightEvent });

    const handleBillboardSettingsOpen = () => setIsBillboardSettingsOpen(true);
    const handleSearchStart = () => navigateWithCategory("all");

    // Favorites Logic
    const { favoriteEventIds, toggleFavorite } = useEventFavorites(user, signInWithKakao);

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

    // Derive sectionViewMode from URL parameters
    const sectionViewMode = (searchParams.get('view') as 'preview' | 'viewAll-events' | 'viewAll-classes') || 'preview';

    // Handler to change section view mode via URL
    const handleSectionViewModeChange = useCallback((mode: 'preview' | 'viewAll-events' | 'viewAll-classes') => {
        const newParams = new URLSearchParams(searchParams);

        if (mode === 'preview') {
            newParams.delete('view');
        } else {
            newParams.set('view', mode);
        }

        setSearchParams(newParams, { replace: false });
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
    const eventListSlideContainerRef = useRef<HTMLDivElement | null>(null);

    // 모달이 열렸을 때 배경 컨텐츠의 상호작용을 막기 위한 `inert` 속성 관리
    useEffect(() => {
        const isAnyModalOpen = showInputModal ||
            showRegistrationModal ||
            isBillboardSettingsOpen ||
            !!selectedEvent;

        const container = containerRef.current;
        if (container) {
            container.inert = isAnyModalOpen;
        }
        return () => { if (container) container.inert = false; };
    }, [showInputModal, showSortModal, showRegistrationModal, isBillboardSettingsOpen, selectedEvent]);

    const handleHorizontalSwipe = (direction: 'next' | 'prev') => {
        changeMonth(direction);
        setFromBanner(false);
        setBannerMonthBounds(null);
    };

    // --------------------------------------------------------------------------------
    // 4. Custom Hook: Calendar Gesture & State
    // --------------------------------------------------------------------------------
    const {
        calendarMode,
        setCalendarMode,
        dragOffset,
        isAnimating,
    } = useCalendarGesture({
        headerHeight: 50,
        containerRef,
        eventListElementRef,
        onHorizontalSwipe: handleHorizontalSwipe,
        isYearView: false,
    });

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
    useEffect(() => { if (effectiveIsAdmin && !billboardUserId && adminType !== "super") setAdminType("super"); else if (!effectiveIsAdmin && !billboardUserId && adminType !== null) { setAdminType(null); setIsAdminModeOverride(false); } }, [effectiveIsAdmin, billboardUserId, adminType]);

    // State Sync dispatchers
    useEffect(() => { window.dispatchEvent(new CustomEvent("viewModeChanged", { detail: { viewMode: "month" } })); }, []);
    useEffect(() => { window.dispatchEvent(new CustomEvent("calendarModeChanged", { detail: calendarMode })); }, [calendarMode]);
    useEffect(() => { window.dispatchEvent(new CustomEvent("sortByChanged", { detail: sortBy })); }, [sortBy]);

    // Shell Command Listeners
    useEffect(() => {
        const handleToggleCalendarMode = () => {
            if (calendarMode === "fullscreen") setCalendarMode("expanded");
            else setCalendarMode(prev => prev === "collapsed" ? "expanded" : "collapsed");
        };

        const handleGoToToday = () => { moveToToday(); };
        const handleOpenSortModal = () => setShowSortModal(true);
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
        window.addEventListener('openSortModal', handleOpenSortModal);
        window.addEventListener('openCalendarSearch', handleOpenCalendarSearch);
        window.addEventListener('resetV2MainView', handleResetV2MainView);
        window.addEventListener('openBillboardSettings', handleBillboardSettingsOpen);
        window.addEventListener('prevMonth', handlePrevMonth);
        window.addEventListener('nextMonth', handleNextMonth);

        return () => {
            window.removeEventListener('toggleCalendarMode', handleToggleCalendarMode);
            window.removeEventListener('goToToday', handleGoToToday);
            window.removeEventListener('openSortModal', handleOpenSortModal);
            window.removeEventListener('openCalendarSearch', handleOpenCalendarSearch);
            window.removeEventListener('resetV2MainView', handleResetV2MainView);
            window.removeEventListener('openBillboardSettings', handleBillboardSettingsOpen);
            window.removeEventListener('prevMonth', handlePrevMonth);
            window.removeEventListener('nextMonth', handleNextMonth);
        };
    }, [calendarMode, sortBy, navigateWithCategory, searchParams, setSearchParams, moveToToday, handleBillboardSettingsOpen, setCalendarMode, setShowInputModal]);
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
                            isAnimating={isAnimating}
                            onEventClickInFullscreen={(event) => setSelectedEvent(event)}
                            onEventClick={(event) => {
                                setSelectedEvent(event);
                            }}
                            slideContainerRef={eventListSlideContainerRef}
                            onMonthChange={setCurrentMonth}
                            calendarMode={calendarMode}

                            onModalStateChange={(isModalOpen) => {
                                // This prop might need review as internal modal is gone, but it can still signal other modals
                                const container = containerRef.current;
                                if (container) container.inert = isModalOpen;
                            }} selectedWeekday={selectedWeekday}
                            sectionViewMode={sectionViewMode}
                            onSectionViewModeChange={handleSectionViewModeChange}
                            onGenresLoaded={(genres) => setAllGenres(genres as { class: string[]; event: string[] })}
                            isFavoriteMap={favoriteEventIds}
                            onToggleFavorite={toggleFavorite}
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
                    event={selectedEvent!}
                    onClose={closeModal}
                    onEdit={handleEditClick}
                    onDelete={handleDeleteClick}
                    isAdminMode={effectiveIsAdmin}
                    currentUserId={user?.id}
                    onOpenVenueDetail={handleVenueClick}
                    allGenres={allGenres}
                    isFavorite={selectedEvent ? favoriteEventIds.has(selectedEvent.id) : false}
                    onToggleFavorite={(e) => selectedEvent && toggleFavorite(selectedEvent.id, e)}
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
