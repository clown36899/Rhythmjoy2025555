import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { lazy, Suspense } from "react";

import FullEventCalendar from "./components/FullEventCalendar";
import "./styles/CalendarPage.css";
import { useCalendarGesture } from "../v2/hooks/useCalendarGesture";
import { useEventModal } from "../../hooks/useEventModal";

import EventDetailModal from "../v2/components/EventDetailModal";
import CalendarSearchModal from "../v2/components/CalendarSearchModal";
import VenueDetailModal from "../practice/components/VenueDetailModal";
import { useAuth } from "../../contexts/AuthContext";
import { useUserInteractions } from "../../hooks/useUserInteractions";
import { useSetPageAction } from "../../contexts/PageActionContext";

const EventPasswordModal = lazy(() => import("../v2/components/EventPasswordModal"));
const EventRegistrationModal = lazy(() => import("../../components/EventRegistrationModal"));
import RegistrationChoiceModal from "../v2/components/RegistrationChoiceModal";


export default function CalendarPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { user, signInWithKakao, isAdmin: authIsAdmin } = useAuth();

    // 상태 관리
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
    const [viewMode, setViewMode] = useState<"month" | "year">("month");

    // [Fix] 랜덤 시드 고정 - 사이트 진입/새로고침 시에만 한 번 생성되도록 변경
    const [randomSeed] = useState(() => Math.floor(Math.random() * 1000000));

    // URL 파라미터에서 category 읽기
    const initialTabFilter = useMemo(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const category = urlParams.get('category');
        if (category === 'social') return 'social-events';
        if (category === 'classes') return 'classes';
        if (category === 'all') return 'all';
        return 'all'; // 기본값을 전체 탭으로 변경
    }, []);

    const [tabFilter, setTabFilter] = useState<'all' | 'social-events' | 'classes' | 'overseas'>(initialTabFilter as any);

    // Event Modal States - using Hook
    const eventModal = useEventModal();
    const [highlightedEventId, setHighlightedEventId] = useState<number | string | null>(null);
    const [showRegisterModal, setShowRegisterModal] = useState(false);
    const [showChoiceModal, setShowChoiceModal] = useState(false);
    const [showCalendarSearch, setShowCalendarSearch] = useState(false);


    // Auth
    const [isAdmin, setIsAdmin] = useState(false);
    const [adminType, setAdminType] = useState<"super" | "sub" | null>(null);

    // Favorites - Using centralized useUserInteractions
    const { interactions, toggleEventFavorite } = useUserInteractions(user?.id || null);
    const favoriteEventIds = useMemo(() => new Set(interactions?.event_favorites || []), [interactions]);

    // Venue Modal State
    const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null);

    const handleVenueClick = useCallback((venueId: string) => {
        setSelectedVenueId(venueId);
    }, []);

    const closeVenueModal = useCallback(() => {
        setSelectedVenueId(null);
    }, []);

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

    // 스크롤 로직을 분리하여 재사용
    const handleScrollToToday = useCallback(() => {
        console.log('[CalendarPage] handleScrollToToday started. currentMonth:', currentMonth);
        // 1. 활성 슬라이드 내의 오늘 날짜 요소 찾기
        const selector = '.calendar-month-slide[data-active-month="true"] .calendar-date-number-today';
        console.log(`[CalendarPage] Searching for selector: ${selector}`);
        const todayEl = document.querySelector(selector) as HTMLElement;
        console.log(`[CalendarPage] todayEl found?`, !!todayEl);

        if (!todayEl) {
            console.log('[CalendarPage] todayEl not found with strict selector.');
            // Fallback logging for debug: does it exist at all?
            const fallbackEl = document.querySelector('.calendar-date-number-today');
            console.log('[CalendarPage] Does ANY .calendar-date-number-today exist?', !!fallbackEl);
            if (fallbackEl) console.log('[CalendarPage] Its parent class:', fallbackEl.parentElement?.className, 'Grandparent:', fallbackEl.parentElement?.parentElement?.className);
        }

        if (todayEl) {
            // 2. 스크롤 가능한 부모 찾기 (없으면 Window)
            let scrollParent: HTMLElement | Window | null = todayEl.parentElement;
            while (scrollParent instanceof HTMLElement) {
                const style = window.getComputedStyle(scrollParent);
                if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
                    break;
                }
                if (scrollParent.tagName === 'BODY' || scrollParent.tagName === 'HTML') {
                    scrollParent = window;
                    break;
                }
                scrollParent = scrollParent.parentElement;
            }

            if (!scrollParent) scrollParent = window;

            const isWindow = scrollParent === window || scrollParent === document.body || scrollParent === document.documentElement;

            // 3. 헤더 높이 계산 (Sticky Header Offset)
            const headerEl = document.querySelector('.calendar-page-weekday-header') as HTMLElement;
            const headerHeight = headerEl ? headerEl.offsetHeight : 0;
            const stickyHeaderOffset = headerHeight + 100; // 헤더 + 탭 메뉴 등 여유 공간 (가림 방지)

            // 4. 위치 계산 및 스크롤 실행
            console.log('[CalendarPage] Found scroll parent:', isWindow ? 'Window' : (scrollParent as HTMLElement).className);
            if (isWindow) {
                const rect = todayEl.getBoundingClientRect();
                const elementPosition = rect.top + window.pageYOffset;
                const offsetPosition = elementPosition - stickyHeaderOffset;

                console.log('[CalendarPage] Scrolling Window to:', offsetPosition);
                window.scrollTo({ top: offsetPosition, behavior: 'smooth' });
            } else {
                const parentEl = scrollParent as HTMLElement;
                const childRect = todayEl.getBoundingClientRect();
                const parentRect = parentEl.getBoundingClientRect();
                const currentScroll = parentEl.scrollTop;
                const relativeTop = childRect.top - parentRect.top;
                const targetScroll = currentScroll + relativeTop - stickyHeaderOffset;

                console.log('[CalendarPage] Scrolling Parent to:', targetScroll);
                parentEl.scrollTo({ top: targetScroll, behavior: 'smooth' });
            }
            return true; // 성공
        }
        return false; // 실패
    }, [currentMonth]);

    const [isNavigatingToToday, setIsNavigatingToToday] = useState(false);

    // 월 변경 등 렌더링 후 스크롤 로직 실행 (MutationObserver 활용)
    useEffect(() => {
        console.log(`[CalendarPage] useEffect check. isNavigatingToToday: ${isNavigatingToToday}`);
        if (isNavigatingToToday) {
            console.log('[CalendarPage] Skipping immediate scroll. Waiting for DOM update via observer.');

            // 2. 없으면 DOM 변경 감지 (렌더링 대기)
            const observer = new MutationObserver((mutations) => {
                console.log('[CalendarPage] Mutation observed. Count:', mutations.length);
                mutations.slice(0, 3).forEach(m => console.log('Mutation:', m.type, m.attributeName, (m.target as Element).className));

                // RAF로 한 프레임 지연 실행하여 페인팅 후 스크롤
                requestAnimationFrame(() => {
                    if (handleScrollToToday()) {
                        console.log('[CalendarPage] Scroll successful via observer.');
                        setIsNavigatingToToday(false);
                        observer.disconnect();
                        // 성공 시 URL 정리
                        const urlParams = new URLSearchParams(window.location.search);
                        if (urlParams.get('scrollToToday') === 'true') {
                            const newUrl = window.location.pathname + window.location.search.replace(/[&?]scrollToToday=true/, '');
                            window.history.replaceState({}, '', newUrl);
                        }
                    }
                });
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true, // 속성 변경 감지 추가
                attributeFilter: ['data-active-month', 'class'] // 감지할 속성 필터링
            });

            return () => {
                console.log('[CalendarPage] Disconnecting observer.');
                observer.disconnect();
            };
        }
    }, [currentMonth, isNavigatingToToday, handleScrollToToday]);

    // 초기 마운트 시 URL 파라미터 확인
    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const shouldScrollToToday = urlParams.get('scrollToToday') === 'true';

        if (shouldScrollToToday) {
            setIsNavigatingToToday(true);
        }
    }, []);

    // Handlers
    const handleMonthChange = useCallback((newMonth: Date) => {
        setCurrentMonth(newMonth);
        setSelectedDate(null);
    }, []);

    // URL 파라미터에서 'id' 읽어서 이벤트 상세 모달 열기 (Deep Link)
    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const eventId = urlParams.get('id');

        if (eventId) {
            const fetchEvent = async () => {
                try {
                    // Try events table first
                    const result = await supabase
                        .from('events')
                        .select('*')
                        .eq('id', eventId)
                        .maybeSingle();

                    let { data } = result;
                    const { error } = result;

                    let isSocial = false;

                    // If not found, try social_schedules
                    if (!data && !error) {
                        const socialRes = await supabase
                            .from('social_schedules')
                            .select('*')
                            .eq('id', eventId)
                            .maybeSingle();
                        if (socialRes.data) {
                            data = socialRes.data;
                            isSocial = true;
                        }
                    }

                    if (error) throw error;

                    if (data) {
                        // 1. 해당 탭(Category)으로 전환
                        if (data.scope === 'overseas') {
                            setTabFilter('overseas');
                        } else if (isSocial || ['class', 'regular', 'club'].includes(data.category)) {
                            setTabFilter(isSocial ? 'social-events' : 'classes');
                        } else {
                            setTabFilter('social-events');
                        }

                        // 2. 해당 월로 달력 이동
                        const eventDate = new Date(data.date || data.start_date || new Date());
                        const targetMonth = new Date(eventDate.getFullYear(), eventDate.getMonth(), 1);
                        handleMonthChange(targetMonth);

                        // 3. 모달 열기
                        setTimeout(() => {
                            const eventToSet = isSocial ? {
                                ...data,
                                id: `social-${data.id}`,
                                is_social_integrated: true
                            } : data;
                            eventModal.setSelectedEvent(eventToSet);
                            setHighlightedEventId(eventToSet.id);
                        }, 100); // [Optimization] Reduced from 500ms

                        // 4. 3초 후 하이라이트 제거
                        setTimeout(() => {
                            setHighlightedEventId(null);
                        }, 3500);
                    }
                } catch (err) {
                    console.error('Deep link failed:', err);
                }
            };
            fetchEvent();
        }
    }, [handleMonthChange]);

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
    }, []);





    // Event handlers are now provided by useEventModal Hook

    // 이벤트 생성 후 해당 날짜로 이동 및 하이라이트
    const handleEventCreated = useCallback((eventId: number | string, eventDate: Date) => {
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

        const handleGoToToday = () => {
            const today = new Date();
            const isSameMonth = currentMonth.getFullYear() === today.getFullYear() &&
                currentMonth.getMonth() === today.getMonth();

            if (isSameMonth) {
                // 같은 달이면 즉시 위치 이동
                handleScrollToToday();
            } else {
                handleMonthChange(today);
                // 다른 달이면 렌더링 대기 후 이동 (Observer가 감지)
                setIsNavigatingToToday(true);
            }
        };

        window.addEventListener('setFullscreenMode', handleSetFullscreenMode);
        window.addEventListener('openCalendarSearch', handleOpenCalendarSearch);
        window.addEventListener('prevMonth', handlePrevMonth);
        window.addEventListener('nextMonth', handleNextMonth);
        window.addEventListener('goToToday', handleGoToToday);

        return () => {
            window.removeEventListener('setFullscreenMode', handleSetFullscreenMode);
            window.removeEventListener('openCalendarSearch', handleOpenCalendarSearch);
            window.removeEventListener('prevMonth', handlePrevMonth);
            window.removeEventListener('nextMonth', handleNextMonth);
            window.removeEventListener('goToToday', handleGoToToday);
        };
    }, [navigate, handleNavigateMonth, handleMonthChange]);

    // Shell State Sync
    useEffect(() => {
        window.dispatchEvent(new CustomEvent("calendarModeChanged", { detail: "fullscreen" }));
    }, []);

    // Sync currentMonth with Shell Header
    useEffect(() => {
        window.dispatchEvent(new CustomEvent('updateCalendarView', {
            detail: {
                year: currentMonth.getFullYear(),
                month: currentMonth.getMonth()
            }
        }));
    }, [currentMonth]);

    // FAB Registration Action
    useSetPageAction(useMemo(() => ({
        icon: 'ri-add-line',
        label: '일정 등록',
        requireAuth: true,
        onClick: () => setShowChoiceModal(true)
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
                    <div className="tab-label-wrapper">
                        <span className="translated-part">{t('socialEvents')}</span>
                        <span className="fixed-part ko" translate="no">소셜&행사</span>
                        <span className="fixed-part en" translate="no">Social & event</span>
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
                <button
                    className={`calendar-tab-btn ${tabFilter === 'overseas' ? 'active' : ''}`}
                    onClick={() => setTabFilter('overseas')}
                >
                    <span style={{ fontSize: '1.25rem', lineHeight: 1 }}>🌏</span>
                    <div className="tab-label-wrapper">
                        <span className="translated-part">Global</span>
                        <span className="fixed-part ko" translate="no">국외</span>
                        <span className="fixed-part en" translate="no">Global</span>
                    </div>
                </button>
            </div>

            {/* Sticky Weekday Header */}

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
                    seed={randomSeed}
                />
            </div>

            {/* Event Detail Modal */}
            {eventModal.selectedEvent && (
                <EventDetailModal
                    event={eventModal.selectedEvent}
                    isOpen={!!eventModal.selectedEvent}
                    onClose={eventModal.closeAllModals}
                    isAdminMode={isAdmin}
                    // @ts-expect-error - adminType prop mismatch fix pending in component
                    adminType={adminType}
                    onDelete={(id: any) => eventModal.handleDeleteEvent(typeof id === 'number' ? id : id.id)}
                    onEdit={(event: any) => eventModal.handleEditClick(event)}
                    isDeleting={eventModal.isDeleting}
                    isFavorite={favoriteEventIds.has(eventModal.selectedEvent.id)}
                    onToggleFavorite={(e: any) => {
                        e?.stopPropagation();
                        if (!user) {
                            if (confirm('즐겨찾기는 로그인 후 이용 가능합니다.\n확인을 눌러서 로그인을 진행해주세요')) {
                                signInWithKakao();
                            }
                            return;
                        }
                        if (eventModal.selectedEvent) toggleEventFavorite(eventModal.selectedEvent.id);
                    }}
                    onOpenVenueDetail={handleVenueClick}
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

            {/* Venue Detail Modal */}
            {selectedVenueId && (
                <VenueDetailModal
                    venueId={selectedVenueId}
                    onClose={closeVenueModal}
                />
            )}


            {/* Registration Choice Modal */}
            <RegistrationChoiceModal
                isOpen={showChoiceModal}
                onClose={() => setShowChoiceModal(false)}
                onSelectMain={() => {
                    setShowChoiceModal(false);
                    setShowRegisterModal(true);
                }}
            />

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
                        editEventData={eventModal.eventToEdit}
                        onEventCreated={() => { }} // Edit mode doesn't use this but it's required by interface
                        isDeleting={eventModal.isDeleting}
                        onEventUpdated={(updatedEvent: any) => {
                            eventModal.setShowEditModal(false);
                            window.dispatchEvent(new CustomEvent("eventUpdated", { detail: updatedEvent }));
                        }}
                        onDelete={() => {
                            if (eventModal.eventToEdit) {
                                eventModal.handleDeleteEvent(eventModal.eventToEdit.id);
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
