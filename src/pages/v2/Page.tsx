import { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import EventList from "./components/EventList";

// Lazy loading으로 성능 최적화 - 큰 모달 컴포넌트들
const EventRegistrationModal = lazy(() => import("../../components/EventRegistrationModal"));

const VenueDetailModal = lazy(() => import("../practice/components/VenueDetailModal"));
const CalendarSearchModal = lazy(() => import("./components/CalendarSearchModal"));

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
import { useSwingSceneStats } from "./hooks/useSwingSceneStats";
import { addClientLog } from "../../utils/clientLogBuffer";

import "./styles/Page.css";

const isLocalDebugHost = () => typeof window !== 'undefined'
    && /^(localhost|127\.0\.0\.1|0\.0\.0\.0)$/.test(window.location.hostname);

const pageDeleteDiagnostic = (...args: unknown[]) => {
    if (!isLocalDebugHost()) return;
    console.info(...args);
    addClientLog('event', ...args);
};

export default function HomePageV2() {
    // --------------------------------------------------------------------------------
    // 1. Core Hooks & Context
    // --------------------------------------------------------------------------------
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();
    const { isAdmin, user, signInWithKakao } = useAuth();
    const { openModal, closeModal, updateModalProps } = useModalActions();

    // [Optimization] 홈 첫 화면 렌더와 통계 함수 호출을 분리한다.
    const { prefetch } = useSwingSceneStats({ autoLoad: false });
    useEffect(() => {
        const run = () => prefetch();
        const win = window as typeof window & {
            requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
            cancelIdleCallback?: (id: number) => void;
        };

        if (typeof win.requestIdleCallback === 'function') {
            const idleId = win.requestIdleCallback(run, { timeout: 3000 });
            return () => win.cancelIdleCallback?.(idleId);
        }

        const timer = window.setTimeout(run, 1800);
        return () => window.clearTimeout(timer);
    }, [prefetch]);

    registerLocale("ko", ko);

    // --------------------------------------------------------------------------------
    // 2. Local State
    // --------------------------------------------------------------------------------
    const [isAdminModeOverride] = useState(false);
    const effectiveIsAdmin = isAdmin || isAdminModeOverride;
    const adminType: "super" | "sub" | null = effectiveIsAdmin ? "super" : null;

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
    } = useEventActions({ adminType, user, signInWithKakao });

    const {
        qrLoading, highlightEvent, setHighlightEvent,
        pendingSharedEvent, setPendingSharedEvent
    } = useDeepLinkLogic({ setCurrentMonth });

    useEffect(() => {
        if (pendingSharedEvent) {
            setSelectedEvent(pendingSharedEvent);
            setPendingSharedEvent(null);
        }
    }, [pendingSharedEvent, setSelectedEvent, setPendingSharedEvent]);

    // Favorites Logic
    const { interactions, toggleEventFavorite: baseToggleEventFavorite } = useUserInteractions(user?.id || null);
    const favoriteEventIds = useMemo(() => new Set((interactions?.event_favorites || []).map(id => Number(id))), [interactions]);

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

    // [Proper Fix] Modal Props Memoization to prevent infinite render loops
    const eventDetailProps = useMemo(() => {
        if (!selectedEvent) return null;
        return {
            event: selectedEvent,
            onEdit: handleEditClick,
            onDelete: async (eventFromModal: any, e: any) => {
                const targetEvent = eventFromModal?.id ? eventFromModal : selectedEvent;
                pageDeleteDiagnostic('[EventDelete:PageV2] onDelete received', {
                    selectedEventId: selectedEvent?.id,
                    eventFromModalId: eventFromModal?.id,
                    targetEventId: targetEvent?.id,
                    effectiveIsAdmin,
                    adminType,
                    userId: user?.id || null,
                });
                const success = await handleDeleteClick(targetEvent, e);
                pageDeleteDiagnostic('[EventDelete:PageV2] onDelete result', {
                    targetEventId: targetEvent?.id,
                    success,
                });
                if (success) {
                    setSelectedEvent(null);
                    closeModal('eventDetail');
                }
            },
            isAdminMode: effectiveIsAdmin,
            currentUserId: user?.id,
            onOpenVenueDetail: handleVenueClick,
            allGenres: allGenres,
            isFavorite: favoriteEventIds.has(Number(selectedEvent.id)),
            onToggleFavorite: (e: React.MouseEvent) => toggleFavorite(selectedEvent.id, e),
            onClose: () => {
                setSelectedEvent(null);
                closeModal('eventDetail');
            }
        };
    }, [selectedEvent, handleEditClick, handleDeleteClick, effectiveIsAdmin, user?.id, handleVenueClick, allGenres, favoriteEventIds, toggleFavorite, setSelectedEvent, closeModal]);

    useEffect(() => {
        if (eventDetailProps && selectedEvent) {
            if (lastOpenedEventIdRef.current === selectedEvent.id) {
                updateModalProps('eventDetail', eventDetailProps);
                return;
            }
            openModal('eventDetail', eventDetailProps);
            lastOpenedEventIdRef.current = selectedEvent.id;
        } else if (!selectedEvent) {
            lastOpenedEventIdRef.current = null;
        }
    }, [eventDetailProps, openModal, selectedEvent, updateModalProps]);

    useEffect(() => {
        let active = true;
        const modalType = searchParams.get("modal");
        if (modalType === "stats") {
            openModal('stats', { userId: user?.id, initialTab: 'scene' });
            const newParams = new URLSearchParams(searchParams);
            newParams.delete("modal");
            if (active) {
                setSearchParams(newParams, { replace: true });
            }
        }
        return () => { active = false; };
    }, [searchParams, setSearchParams, user, openModal]);

    // --------------------------------------------------------------------------------
    // 4. UI Handlers
    // --------------------------------------------------------------------------------
    const handleEventClick = useCallback((event: any) => {
        setSelectedEvent(event);
    }, [setSelectedEvent]);

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
        // [Optimization] inert 로직 비활성화 유지 - modalStack 구독 제거
    }, [showInputModal, showRegistrationModal, selectedEvent]);

    const handleHorizontalSwipe = useCallback((direction: 'next' | 'prev') => {
        changeMonth(direction);
        setFromBanner(false);
        setBannerMonthBounds(null);
    }, [changeMonth]);

    const { calendarMode, setCalendarMode } = useCalendarGesture({
        headerHeight: 50, containerRef, eventListElementRef, onHorizontalSwipe: handleHorizontalSwipe, isYearView: false,
    });

    const openRegistrationChoiceModal = useCallback(() => {
        openModal('registrationChoice', {
            onSelectMain: () => {
                closeModal('registrationChoice');
                window.dispatchEvent(new CustomEvent('createEventForDate', {
                    detail: { source: 'homeMenu', calendarMode }
                }));
            },
            onSelectSocial: () => {
                closeModal('registrationChoice');
                openModal('weeklySocial');
            },
            onSelectOneDay: () => {
                closeModal('registrationChoice');
                openModal('oneDayRecruitRegistration');
            }
        });
    }, [calendarMode, openModal, closeModal]);

    useSetPageAction(useMemo(() => ({
        icon: 'ri-add-line', label: '자율등록(누구나)', requireAuth: true,
        onClick: openRegistrationChoiceModal
    }), [openRegistrationChoiceModal]));

    useEffect(() => {
        window.addEventListener('openV2RegistrationChoice', openRegistrationChoiceModal);
        return () => window.removeEventListener('openV2RegistrationChoice', openRegistrationChoiceModal);
    }, [openRegistrationChoiceModal]);

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
        <div ref={containerRef} className="home-container">
            <div className="home-main" ref={eventListElementRef}>
                {/* Floating Admin Webzine Tab */}
                {effectiveIsAdmin && (
                    <div className="admin-side-tab" onClick={() => navigate('/admin/webzine')}>
                        <span className="stats-side-tab-text">월간 빌보드</span>
                    </div>
                )}

                {/* Library Section Hidden as per request */}


                {qrLoading && (
                    <div className="home-loading-container"><div className="home-loading-text">이벤트 로딩 중...</div></div>
                )}
                <div style={qrLoading ? { visibility: 'hidden', pointerEvents: 'none', position: 'absolute' } : undefined}>
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

                <Suspense fallback={null}>
                    {selectedVenueId && (
                        <VenueDetailModal venueId={selectedVenueId} onClose={closeVenueModal} />
                    )}

                    <CalendarSearchModal
                        isOpen={showInputModal}
                        onClose={() => setShowInputModal(false)}
                        onSelectEvent={(event) => setSelectedEvent(event)}
                        searchMode="all"
                    />
                </Suspense>
            </div>
        </div>
    );
}
