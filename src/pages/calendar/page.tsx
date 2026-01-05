import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { lazy, Suspense } from "react";

import FullEventCalendar from "./components/FullEventCalendar";
import "./styles/CalendarPage.css";
import { useCalendarGesture } from "../v2/hooks/useCalendarGesture";
import { useEventModal } from "../../hooks/useEventModal";

import EventDetailModal from "../v2/components/EventDetailModal";
import CalendarSearchModal from "../v2/components/CalendarSearchModal";
import { useAuth } from "../../contexts/AuthContext";
import { useEventFavorites } from "../../hooks/useEventFavorites";
import { useSetPageAction } from "../../contexts/PageActionContext";

const EventPasswordModal = lazy(() => import("../v2/components/EventPasswordModal"));
const EventRegistrationModal = lazy(() => import("../../components/EventRegistrationModal"));


export default function CalendarPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { user, signInWithKakao, isAdmin: authIsAdmin } = useAuth();

    // 상태 관리
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
    const [viewMode, setViewMode] = useState<"month" | "year">("month");
    const [selectedWeekday, setSelectedWeekday] = useState<number | null>(null);
    const [tabFilter, setTabFilter] = useState<'all' | 'social-events' | 'classes'>('all');

    // Event Modal States - using Hook
    const eventModal = useEventModal();
    const [highlightedEventId, setHighlightedEventId] = useState<number | null>(null);
    const [showRegisterModal, setShowRegisterModal] = useState(false);
    const [showCalendarSearch, setShowCalendarSearch] = useState(false);


    // Auth
    const [isAdmin, setIsAdmin] = useState(false);
    const [adminType, setAdminType] = useState<"super" | "sub" | null>(null);

    // Favorites - using centralized hook
    const { favoriteEventIds, toggleFavorite } = useEventFavorites(user, signInWithKakao);

    const containerRef = useRef<HTMLDivElement>(null!);
    const eventListElementRef = useRef<HTMLDivElement>(null!); // Dummy ref for useCalendarGesture

    // 초기화
    // 모바일 바운스 방지 - 제거됨 (Pull-to-Refresh 활성화)
    // useEffect(() => {
    //     document.documentElement.style.overscrollBehavior = 'none';
    //     document.body.style.overscrollBehavior = 'none';
    //     return () => {
    //         document.documentElement.style.overscrollBehavior = '';
    //         document.body.style.overscrollBehavior = '';
    //     };
    // }, []);

    // 모달 열렸을 때 배경 스크롤 방지
    useEffect(() => {
        const isAnyModalOpen = showRegisterModal || eventModal.showEditModal || eventModal.showPasswordModal || !!eventModal.selectedEvent;

        if (isAnyModalOpen) {
            // 현재 스크롤 위치 저장
            const scrollY = window.scrollY;
            document.body.style.position = 'fixed';
            document.body.style.top = `-${scrollY}px`;
            document.body.style.width = '100%';
            document.body.style.overflow = 'hidden';
        } else {
            // 스크롤 위치 복원
            const scrollY = document.body.style.top;
            document.body.style.position = '';
            document.body.style.top = '';
            document.body.style.width = '';
            document.body.style.overflow = '';
            if (scrollY) {
                window.scrollTo(0, parseInt(scrollY || '0') * -1);
            }
        }
    }, [showRegisterModal, eventModal.showEditModal, eventModal.showPasswordModal, eventModal.selectedEvent]);

    // Auth Check (Keep existing logic or sync with AuthContext)
    useEffect(() => {
        if (authIsAdmin) {
            setIsAdmin(true);
            setAdminType("super");
        }
        // Fallback or explicit check if needed, but useAuth is preferred.
        // Keeping original check as fallback if needed, but strictly useAuth is better.
        // For now, syncing from useAuth is safest.
    }, [authIsAdmin]);

    // 초기 마운트 시 오늘 날짜로 스크롤 (Window 기반 하이브리드 보정 로직)
    // + 탭 전환 시에도 오늘 날짜로 스크롤
    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const shouldScrollToToday = urlParams.get('scrollToToday') === 'true';

        // 사용자 개입 감지 Ref
        const userInteracted = { current: false };
        const handleUserInteraction = () => {
            userInteracted.current = true;
        };

        // 스크롤 방해 요소 감지 리스너 (휠, 터치, 키보드)
        window.addEventListener('wheel', handleUserInteraction, { passive: true });
        window.addEventListener('touchmove', handleUserInteraction, { passive: true });
        window.addEventListener('keydown', handleUserInteraction, { passive: true });

        let attempts = 0;
        const maxAttempts = 20; // 2초간 끈질기게 추적
        let stableCount = 0;

        const doScroll = () => {
            // 사용자가 개입했다면 즉시 중단 (싸움 방지)
            if (userInteracted.current) {
                return;
            }

            const todayEl = document.querySelector('.calendar-month-slide[data-active-month="true"] .calendar-date-number-today') as HTMLElement;
            const headerEl = document.querySelector('.calendar-page-weekday-header') as HTMLElement;

            if (todayEl && headerEl) {
                // Window 전체 좌표 기준 계산
                const todayRect = todayEl.getBoundingClientRect();
                const headerRect = headerEl.getBoundingClientRect();
                const currentScrollY = window.pageYOffset || document.documentElement.scrollTop;

                // 오차: 오늘 날짜 상단 - 요일 헤더 하단
                // (오늘 날짜 요소가 요일 헤더 바로 아래에 딱 붙도록 정교하게 계산)
                const offsetError = todayRect.top - headerRect.bottom;

                if (Math.abs(offsetError) > 0.5) {
                    // Window 강제 즉시 스크롤 (behavior: 'auto'는 브라우저 기본 즉시 이동)
                    window.scrollTo({
                        top: currentScrollY + offsetError,
                        behavior: 'auto'
                    });
                    stableCount = 0;
                } else {
                    stableCount++;
                }

                // 로깅 제거


                // 안정화 조건 (5회 연속 오차 범위 내 고정)
                if (stableCount >= 5 && attempts > 8) {
                    // console.log('✅ [ScrollLog] Final Alignment Stabilized.');
                    if (shouldScrollToToday) {
                        const newUrl = window.location.pathname;
                        window.history.replaceState({}, '', newUrl);
                    }
                    return;
                }
            }

            attempts++;
            if (attempts < maxAttempts) {
                // 사용자가 효과를 본 500ms, 800ms, 1100ms 타이밍을 모두 커버하는 100ms 정밀 루프
                setTimeout(doScroll, 100);
            }
        };

        // 지연 시간 최적화 (사용자의 500ms 제안 반영하여 400ms에 첫 시도)
        const timer = setTimeout(doScroll, 400);
        return () => {
            clearTimeout(timer);
            window.removeEventListener('wheel', handleUserInteraction);
            window.removeEventListener('touchmove', handleUserInteraction);
            window.removeEventListener('keydown', handleUserInteraction);
        };
    }, [currentMonth, tabFilter]); // tabFilter 추가: 탭 전환 시에도 스크롤



    // Handlers
    const handleMonthChange = useCallback((newMonth: Date) => {
        setCurrentMonth(newMonth);
        setSelectedDate(null);
        setSelectedWeekday(null);
    }, []);

    const handleNavigateMonth = useCallback((direction: "prev" | "next") => {
        const newMonth = new Date(currentMonth);
        newMonth.setDate(1);
        if (viewMode === "year") {
            newMonth.setFullYear(currentMonth.getFullYear() + (direction === "prev" ? -1 : 1));
        } else {
            newMonth.setMonth(currentMonth.getMonth() + (direction === "prev" ? -1 : 1));
        }
        handleMonthChange(newMonth);
    }, [currentMonth, viewMode, handleMonthChange]);

    const handleDateSelect = useCallback((date: Date | null) => {
        setSelectedDate(date);
        if (date) setSelectedWeekday(null);
    }, []);





    // Event handlers are now provided by useEventModal Hook

    // 이벤트 생성 후 해당 날짜로 이동 및 하이라이트
    const handleEventCreated = useCallback((eventId: number, eventDate: Date) => {
        // 해당 월로 이동
        const targetMonth = new Date(eventDate.getFullYear(), eventDate.getMonth(), 1);
        handleMonthChange(targetMonth);

        // 하이라이트 설정
        setHighlightedEventId(eventId);

        // 스크롤 및 하이라이트 제거는 FullEventCalendar에서 처리
        setTimeout(() => {
            setHighlightedEventId(null);
        }, 3000); // 3초 후 하이라이트 제거
    }, [handleMonthChange]);

    // Event Listeners
    useEffect(() => {
        const handleSetFullscreenMode = () => {
            navigate('/v2');
        };

        const handleOpenCalendarSearch = () => {
            setShowCalendarSearch(true);
        };



        const handlePrevMonth = () => {
            handleNavigateMonth('prev');
        };

        const handleNextMonth = () => {
            handleNavigateMonth('next');
        };

        window.addEventListener('setFullscreenMode', handleSetFullscreenMode);
        window.addEventListener('openCalendarSearch', handleOpenCalendarSearch);
        window.addEventListener('prevMonth', handlePrevMonth);
        window.addEventListener('nextMonth', handleNextMonth);

        return () => {
            window.removeEventListener('setFullscreenMode', handleSetFullscreenMode);
            window.removeEventListener('openCalendarSearch', handleOpenCalendarSearch);
            window.removeEventListener('prevMonth', handlePrevMonth);
            window.removeEventListener('nextMonth', handleNextMonth);
        };
    }, [navigate, handleNavigateMonth]);

    // Shell State Sync
    useEffect(() => {
        window.dispatchEvent(new CustomEvent("calendarModeChanged", { detail: "fullscreen" }));
    }, []);

    // FAB Registration Action
    useSetPageAction(useMemo(() => ({
        icon: 'ri-add-line',
        label: '일정 등록',
        requireAuth: true,
        onClick: () => setShowRegisterModal(true)
    }), []));

    // 제스처 훅 사용 - 스와이프 기능을 위해 필요
    const {
        dragOffset,
        isAnimating,
    } = useCalendarGesture({
        headerHeight: 50,
        containerRef,
        eventListElementRef,
        onHorizontalSwipe: (direction) => {
            handleNavigateMonth(direction);
        },
        isYearView: viewMode === 'year',
        defaultMode: 'fullscreen',
    });

    return (
        <div className="calendar-page-container" ref={containerRef}>
            {/* <div className="calendar-page-header global-header">
                <Header
                    calendarMode="fullscreen" // 항상 전체화면 모드로 표시
                    currentMonth={currentMonth}
                    viewMode={viewMode}
                    onNavigateMonth={handleNavigateMonth}
                    onTodayClick={handleGoToToday}
                // onSectionViewModeChange를 통해 Back 버튼 로직이 트리거될 수 있음
                />
            </div> */}

            {/* Tab Menu */}
            <div className="calendar-tab-menu">
                <button
                    className={`calendar-tab-btn ${tabFilter === 'all' ? 'active' : ''}`}
                    onClick={() => setTabFilter('all')}
                >
                    <i className="ri-calendar-line"></i>
                    <div className="tab-label-wrapper">
                        <span className="translated-part">{t('all')}</span>
                        <span className="fixed-part ko" translate="no">전체</span>
                        <span className="fixed-part en" translate="no">ALL</span>
                    </div>
                </button>
                <button
                    className={`calendar-tab-btn ${tabFilter === 'social-events' ? 'active' : ''}`}
                    onClick={() => setTabFilter('social-events')}
                >
                    <i className="ri-calendar-event-fill"></i>
                    <div className="tab-label-wrapper">
                        <span className="translated-part">{t('socialEvents')}</span>
                        <span className="fixed-part ko" translate="no">소셜&행사</span>
                        <span className="fixed-part en" translate="no">Social</span>
                    </div>
                </button>
                <button
                    className={`calendar-tab-btn ${tabFilter === 'classes' ? 'active' : ''}`}
                    onClick={() => setTabFilter('classes')}
                >
                    <i className="ri-graduation-cap-fill"></i>
                    <div className="tab-label-wrapper">
                        <span className="translated-part">{t('classes')}</span>
                        <span className="fixed-part ko" translate="no">강습</span>
                        <span className="fixed-part en" translate="no">Class</span>
                    </div>
                </button>
            </div>

            {/* Sticky Weekday Header */}
            <div className="calendar-page-weekday-header">
                <div className="calendar-weekday-header no-select">
                    {['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].map((dayKey, index) => (
                        <div
                            key={dayKey}
                            className={`calendar-weekday-item ${selectedWeekday === index ? 'selected' : ''}`}
                            style={{
                                cursor: 'pointer'
                            }}
                            onClick={() => {
                                if (selectedWeekday === index) {
                                    setSelectedWeekday(null);
                                } else {
                                    setSelectedWeekday(index);
                                    setSelectedDate(null);
                                }
                            }}
                        >
                            <div className="weekday-wrapper">
                                <span className="translated-part">
                                    {t(`weekdays.${dayKey}`)}
                                </span>
                                {/* User defined short forms for each language */}
                                <span className="fixed-part ko" translate="no">
                                    {{ sun: '일', mon: '월', tue: '화', wed: '수', thu: '목', fri: '금', sat: '토' }[dayKey as 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat']}
                                </span>
                                <span className="fixed-part en" translate="no">
                                    {{ sun: 'Sun', mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat' }[dayKey as 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat']}
                                </span>
                            </div>
                            {selectedWeekday === index && (
                                <i className="ri-close-line absolute-icon"></i>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            <div className="calendar-page-main">
                <FullEventCalendar
                    currentMonth={currentMonth}
                    selectedDate={selectedDate}
                    onDateSelect={handleDateSelect}
                    onMonthChange={handleMonthChange}
                    viewMode={viewMode}
                    onViewModeChange={setViewMode}

                    calendarHeightPx={window.innerHeight - 100} // 대략적인 높이 계산
                    dragOffset={dragOffset}
                    isAnimating={isAnimating}
                    onEventClick={(event: any) => eventModal.setSelectedEvent(event)}
                    highlightedEventId={highlightedEventId}
                    tabFilter={tabFilter}
                />
            </div>

            {/* Event Detail Modal */}
            {eventModal.selectedEvent && (
                <EventDetailModal
                    event={eventModal.selectedEvent}
                    isOpen={!!eventModal.selectedEvent}
                    onClose={eventModal.closeAllModals}
                    isAdminMode={isAdmin}
                    // @ts-ignore - adminType prop mismatch fix pending in component
                    adminType={adminType}
                    onDelete={(id: any) => eventModal.handleDeleteEvent(typeof id === 'number' ? id : id.id)}
                    onEdit={(event: any) => eventModal.handleEditClick(event)}
                    isFavorite={favoriteEventIds.has(eventModal.selectedEvent.id)}
                    onToggleFavorite={(e: any) => eventModal.selectedEvent && toggleFavorite(eventModal.selectedEvent.id, e)}
                />
            )}

            {/* Password Modal */}
            {eventModal.showPasswordModal && (
                <Suspense fallback={<div />}>
                    <EventPasswordModal
                        event={eventModal.eventToEdit!}
                        onClose={() => eventModal.setShowPasswordModal(false)}
                        onSubmit={eventModal.handlePasswordSubmit}
                        password={eventModal.eventPassword}
                        onPasswordChange={eventModal.setEventPassword}
                    />
                </Suspense>
            )}


            {/* Register Modal (New Event) */}
            {showRegisterModal && (
                <Suspense fallback={<div />}>
                    <EventRegistrationModal
                        isOpen={showRegisterModal}
                        onClose={() => setShowRegisterModal(false)}
                        selectedDate={selectedDate || new Date()}
                        onEventCreated={(createdDate: any, eventId: any) => {
                            setShowRegisterModal(false);
                            if (eventId) {
                                handleEventCreated(eventId, createdDate);
                            }
                        }}
                    />
                </Suspense>
            )}

            {/* Edit Modal */}
            {eventModal.showEditModal && eventModal.eventToEdit && (
                <Suspense fallback={<div />}>
                    <EventRegistrationModal
                        isOpen={eventModal.showEditModal}
                        onClose={() => eventModal.setShowEditModal(false)}
                        selectedDate={new Date(eventModal.eventToEdit.date || eventModal.eventToEdit.start_date || new Date())}
                        // @ts-ignore - editEventData prop check pending
                        editEventData={eventModal.eventToEdit}
                        onEventCreated={() => { }} // Edit mode doesn't use this but it's required by interface
                        onEventUpdated={(updatedEvent: any) => {
                            eventModal.setShowEditModal(false);
                            window.dispatchEvent(new CustomEvent("eventUpdated", { detail: updatedEvent }));
                        }}
                        onDelete={() => {
                            if (eventModal.eventToEdit) {
                                eventModal.handleDeleteEvent(eventModal.eventToEdit.id);
                                eventModal.setShowEditModal(false);
                            }
                        }}
                    />
                </Suspense>
            )}

            {/* Calendar Search Modal */}
            <CalendarSearchModal
                isOpen={showCalendarSearch}
                onClose={() => setShowCalendarSearch(false)}
                onSelectEvent={(event: any) => {
                    setShowCalendarSearch(false);
                    // Navigate to event's month
                    const eventDate = new Date(event.start_date || event.date || new Date());
                    handleMonthChange(new Date(eventDate.getFullYear(), eventDate.getMonth(), 1));
                    // Highlight and scroll to event
                    setHighlightedEventId(event.id);
                    setTimeout(() => setHighlightedEventId(null), 3000);
                }}
            />
        </div>
    );
}
