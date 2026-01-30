import { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from "react";
import { useSearchParams } from "react-router-dom";
import EventList from "./components/EventList";

// Lazy loading으로 성능 최적화 - 큰 모달 컴포넌트들
const EventRegistrationModal = lazy(() => import("../../components/EventRegistrationModal"));

import VenueDetailModal from "../practice/components/VenueDetailModal";
import CalendarSearchModal from "./components/CalendarSearchModal";
import VideoThumbnailSection from "./components/VideoThumbnailSection";
import { useModalActions, useModalState } from "../../contexts/ModalContext";
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
import { useGlobalPlayer } from "../../contexts/GlobalPlayerContext";

export default function HomePageV2() {
    // --------------------------------------------------------------------------------
    // 1. Core Hooks & Context
    // --------------------------------------------------------------------------------
    const [searchParams, setSearchParams] = useSearchParams();
    const view = searchParams.get('view');
    const { isAdmin, user, signInWithKakao } = useAuth();
    const { openPlayer } = useGlobalPlayer();
    const { openModal, closeModal } = useModalActions();
    const { modalStack } = useModalState();

    registerLocale("ko", ko);

    // --------------------------------------------------------------------------------
    // 2. Local State
    // --------------------------------------------------------------------------------
    const [adminType] = useState<"super" | "sub" | null>(null);
    const [isAdminModeOverride] = useState(false);
    const effectiveIsAdmin = isAdmin || isAdminModeOverride;

    const [showRegistrationModal, setShowRegistrationModal] = useState(false);
    const [fromBanner, setFromBanner] = useState(false);
    const [bannerMonthBounds, setBannerMonthBounds] = useState<{ min: string; max: string } | null>(null);
    const [registrationCalendarMode, setRegistrationCalendarMode] = useState<'collapsed' | 'expanded' | 'fullscreen' | null>(null);

    const [showInputModal, setShowInputModal] = useState(false);
    const [eventJustCreated, setEventJustCreated] = useState<number>(0);
    const [allGenres] = useState<{ class: string[]; event: string[] }>({ class: [], event: [] });

    // --------------------------------------------------------------------------------
    // 3. Custom Logic Hooks
    // --------------------------------------------------------------------------------
    const {
        selectedDate, setSelectedDate,
        currentMonth, setCurrentMonth,
        navigateWithCategory,
        handleHorizontalSwipe: changeMonth,
        moveToToday
    } = useCalendarState();

    const {
        selectedEvent, setSelectedEvent,
        handleDailyModalEventClick,
        handleEditClick, handleDeleteClick,
        selectedVenueId, handleVenueClick, closeVenueModal,
        isDeleting, deleteProgress
    } = useEventActions({ adminType, user, signInWithKakao });

    const {
        qrLoading, highlightEvent, setHighlightEvent
    } = useDeepLinkLogic({ setCurrentMonth });

    // Favorites Logic
    const { interactions, toggleEventFavorite: baseToggleEventFavorite } = useUserInteractions(user?.id || null);
    const favoriteEventIds = useMemo(() => new Set(interactions?.event_favorites || []), [interactions]);

    const toggleFavorite = useCallback(async (eventId: number | string, e?: React.MouseEvent) => {
        e?.stopPropagation();
        if (!user) {
            if (confirm('즐겨찾기는 로그인 후 이용 가능합니다.\n확인을 눌러서 로그인을 진행해주세요')) {
                try { await signInWithKakao(); } catch (err) { console.error(err); }
            }
            return;
        }
        try { await baseToggleEventFavorite(eventId); } catch (err) { console.error('Error toggling favorite:', err); }
    }, [user, signInWithKakao, baseToggleEventFavorite]);

    // [Standard Fix] Open Detail Modal via Global Registry
    const lastOpenedEventIdRef = useRef<string | number | null>(null);

    useEffect(() => {
        if (selectedEvent) {
            // Guard: Only open if it's a new event or the modal was closed
            if (lastOpenedEventIdRef.current === selectedEvent.id) return;

            lastOpenedEventIdRef.current = selectedEvent.id;
            openModal('eventDetail', {
                event: selectedEvent,
                onEdit: handleEditClick,
                onDelete: async (e: any) => {
                    const success = await handleDeleteClick(e);
                    if (success) {
                        closeModal('eventDetail'); // Explicitly close global modal
                    }
                },
                isAdminMode: effectiveIsAdmin,
                currentUserId: user?.id,
                onOpenVenueDetail: handleVenueClick,
                allGenres: allGenres,
                isFavorite: favoriteEventIds.has(selectedEvent.id),
                onToggleFavorite: (e: React.MouseEvent) => toggleFavorite(selectedEvent.id, e),
                isDeleting: isDeleting,
                deleteProgress: deleteProgress,
                onClose: () => {
                    setSelectedEvent(null);
                    lastOpenedEventIdRef.current = null;
                    closeModal('eventDetail'); // Sync with global stack
                }
            });
        } else {
            lastOpenedEventIdRef.current = null;
        }
    }, [selectedEvent, openModal, handleEditClick, handleDeleteClick, effectiveIsAdmin, user?.id, handleVenueClick, allGenres, favoriteEventIds, toggleFavorite, isDeleting, deleteProgress, setSelectedEvent]);

    useEffect(() => {
        const modalType = searchParams.get("modal");
        if (modalType === "stats" && user) {
            openModal('stats', { userId: user.id, initialTab: 'scene' });
            const newParams = new URLSearchParams(searchParams);
            newParams.delete("modal");
            setSearchParams(newParams, { replace: true });
        }
    }, [searchParams, setSearchParams, user, openModal]);

    // --------------------------------------------------------------------------------
    // 4. UI Handlers
    // --------------------------------------------------------------------------------
    const handleEventClick = useCallback((event: any) => setSelectedEvent(event), [setSelectedEvent]);

    const handleSectionViewModeChange = useCallback((mode: 'preview' | 'viewAll-events' | 'viewAll-classes') => {
        const newParams = new URLSearchParams(searchParams);
        if (mode === 'preview') newParams.delete('view');
        else newParams.set('view', mode);
        setSearchParams(newParams, { replace: false });
        window.scrollTo(0, 0);
    }, [searchParams, setSearchParams]);

    const containerRef = useRef<HTMLDivElement>(null!);
    const eventListElementRef = useRef<HTMLDivElement>(null!);

    useEffect(() => {
        // [Safety Check] inert attribute is experimental and can glitch HMR updates or interaction threads.
        // Commenting out to restore native interaction chain.
        // const isAnyModalOpen = modalStack.length > 0 || showInputModal || showRegistrationModal || !!selectedEvent;
        // const container = containerRef.current;
        // if (container) container.inert = isAnyModalOpen;
        // return () => { if (container) container.inert = false; };
    }, [modalStack.length, showInputModal, showRegistrationModal, selectedEvent]);

    const handleHorizontalSwipe = useCallback((direction: 'next' | 'prev') => {
        changeMonth(direction);
        setFromBanner(false);
        setBannerMonthBounds(null);
    }, [changeMonth]);

    const { calendarMode, setCalendarMode } = useCalendarGesture({
        headerHeight: 50, containerRef, eventListElementRef, onHorizontalSwipe: handleHorizontalSwipe, isYearView: false,
    });

    useSetPageAction(useMemo(() => ({
        icon: 'ri-add-line', label: '자율등록(누구나)', requireAuth: true,
        onClick: () => {
            openModal('registrationChoice', {
                onSelectMain: () => {
                    closeModal('registrationChoice');
                    window.dispatchEvent(new CustomEvent('createEventForDate', {
                        detail: { source: 'floatingBtn', calendarMode }
                    }));
                }
            });
        }
    }), [calendarMode, openModal, closeModal]));

    // Sync effects, listeners (Today, Reset, Month Change etc.)
    useEffect(() => {
        const handleGoToToday = () => moveToToday();
        const handleOpenCalendarSearch = () => setShowInputModal(true);
        const handlePrevMonth = () => handleHorizontalSwipe('prev');
        const handleNextMonth = () => handleHorizontalSwipe('next');
        const handleResetV2MainView = () => {
            const newParams = new URLSearchParams(searchParams);
            newParams.delete('view'); newParams.delete('calendar');
            setSearchParams(newParams, { replace: true });
            setCalendarMode('collapsed');
            setFromBanner(false); setBannerMonthBounds(null);
            setSelectedDate(null);
            navigateWithCategory("all");
            window.scrollTo({ top: 0, behavior: 'smooth' });
        };

        window.addEventListener('goToToday', handleGoToToday);
        window.addEventListener('openCalendarSearch', handleOpenCalendarSearch);
        window.addEventListener('resetV2MainView', handleResetV2MainView);
        window.addEventListener('prevMonth', handlePrevMonth);
        window.addEventListener('nextMonth', handleNextMonth);
        return () => {
            window.removeEventListener('goToToday', handleGoToToday);
            window.removeEventListener('openCalendarSearch', handleOpenCalendarSearch);
            window.removeEventListener('resetV2MainView', handleResetV2MainView);
            window.removeEventListener('prevMonth', handlePrevMonth);
            window.removeEventListener('nextMonth', handleNextMonth);
        };
    }, [moveToToday, setShowInputModal, handleHorizontalSwipe, searchParams, setSearchParams, setCalendarMode, setSelectedDate, navigateWithCategory]);

    useEffect(() => {
        const handleCreateEvent = (e: Event) => {
            const customEvent = e as CustomEvent;
            if (customEvent.detail?.source === 'banner' && customEvent.detail?.monthIso) {
                const firstDayOfMonth = new Date(customEvent.detail.monthIso);
                setSelectedDate(firstDayOfMonth); setFromBanner(true);
                const year = firstDayOfMonth.getFullYear(); const month = firstDayOfMonth.getMonth();
                const firstDay = new Date(year, month, 1); const lastDay = new Date(year, month + 1, 0);
                const formatDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
                setBannerMonthBounds({ min: formatDate(firstDay), max: formatDate(lastDay) });
            } else {
                if (!selectedDate) setSelectedDate(new Date());
                setFromBanner(false); setBannerMonthBounds(null);
            }
            setShowRegistrationModal(true);
        };
        window.addEventListener("createEventForDate", handleCreateEvent);
        return () => window.removeEventListener("createEventForDate", handleCreateEvent);
    }, [selectedDate, setSelectedDate]);

    useEffect(() => {
        const handleEventSelected = (e: Event) => {
            const customEvent = e as CustomEvent;
            if (customEvent.detail) handleDailyModalEventClick(customEvent.detail);
        };
        window.addEventListener("eventSelected", handleEventSelected);
        return () => window.removeEventListener("eventSelected", handleEventSelected);
    }, [handleDailyModalEventClick]);

    // --------------------------------------------------------------------------------
    // 렌더링
    // --------------------------------------------------------------------------------
    return (
        <div ref={containerRef} className="home-container" style={{ touchAction: "pan-y", minHeight: '100svh' }}>
            <div className="home-main" ref={eventListElementRef}>
                {/* Floating Side Stats Tab */}
                <div className="stats-side-tab" onClick={async () => {
                    if (!user) {
                        if (confirm('통계를 확인하려면 로그인이 필요합니다.\n로그인하시겠습니까?')) {
                            try { await signInWithKakao(); } catch (err) { console.error(err); }
                        }
                        return;
                    }
                    openModal('stats', { userId: user.id, initialTab: 'my' });
                }}>
                    <i className="ri-bar-chart-groupped-fill stats-side-tab-icon"></i>
                    <span className="stats-side-tab-text">게시물 통계</span>
                </div>

                {view !== 'favorites' && (
                    <VideoThumbnailSection
                        onVideoClick={(videoId) => {
                            openPlayer({ id: videoId, type: 'video', title: 'Video Player' });
                        }}
                    />
                )}

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

                {showRegistrationModal && selectedDate && (
                    <Suspense fallback={<div />}>
                        <EventRegistrationModal
                            isOpen={showRegistrationModal}
                            onClose={() => {
                                setShowRegistrationModal(false);
                                setSelectedDate(null);
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
                                    setSelectedDate(null);
                                    setTimeout(() => {
                                        const eventElement = document.querySelector(`[data-event-id="${id}"]`);
                                        if (eventElement) eventElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                    }, 500);
                                } else {
                                    setSelectedDate(null);
                                    handleSectionViewModeChange('preview');
                                    setCalendarMode('collapsed');
                                    setEventJustCreated(Date.now());
                                    setHighlightEvent({ id: id || 0, nonce: Date.now() });
                                }
                                setRegistrationCalendarMode(null);
                            }}
                            fromBanner={fromBanner}
                            bannerMonthBounds={bannerMonthBounds ?? undefined}
                        />
                    </Suspense>
                )}

                {selectedVenueId && (
                    <VenueDetailModal venueId={selectedVenueId} onClose={closeVenueModal} />
                )}

                <CalendarSearchModal
                    isOpen={showInputModal}
                    onClose={() => setShowInputModal(false)}
                    onSelectEvent={(event) => setSelectedEvent(event)}
                    searchMode="all"
                />
            </div>
        </div>
    );
}
