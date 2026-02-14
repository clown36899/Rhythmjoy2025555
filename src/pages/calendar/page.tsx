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

    // [Fix] 브라우저 자동 스크롤 복원 차단 (SPA에서 직접 제어하기 위함)
    useEffect(() => {
        if ('scrollRestoration' in window.history) {
            console.log('[캘린더] 브라우저 스크롤 복원 모드 -> manual 설정');
            window.history.scrollRestoration = 'manual';
        }
    }, []);

    // [Fix] 사용자 조작 감지 (자동 스크롤 재시도 시 방해 금지용)
    const userInteractedRef = useRef(false);
    const mountTimeRef = useRef(Date.now());
    useEffect(() => {
        const handleInteraction = (e: Event) => {
            // [Fix] 페이지 진입 직후의 클릭이 스크롤을 방해하지 않도록 1초 유예
            if (Date.now() - mountTimeRef.current < 1000) return;

            if (!userInteractedRef.current) {
                console.log(`👤 [캘린더] 사용자 조작 감지 (${e.type}) - 스크롤 중단`);
                userInteractedRef.current = true;
            }
        };
        window.addEventListener('touchstart', handleInteraction, { passive: true });
        window.addEventListener('wheel', handleInteraction, { passive: true });
        window.addEventListener('mousedown', handleInteraction, { passive: true });

        return () => {
            window.removeEventListener('touchstart', handleInteraction);
            window.removeEventListener('wheel', handleInteraction);
            window.removeEventListener('mousedown', handleInteraction);
        };
    }, []);

    // 모달 열렸을 때 배경 스크롤 방지
    useEffect(() => {
        const isAnyModalOpen = showRegisterModal || eventModal.showEditModal || eventModal.showPasswordModal || !!eventModal.selectedEvent;
        // console.log(`[캘린더] 모달 상태 변경 -> 열림?: ${isAnyModalOpen}`);

        if (isAnyModalOpen) {
            const scrollY = window.scrollY;
            // console.log(`[캘린더] 모달 오픈 - 현재 스크롤 저장: ${scrollY}`);
            document.body.style.position = 'fixed';
            document.body.style.top = `-${scrollY}px`;
            document.body.style.width = '100%';
            document.body.style.overflow = 'hidden';
        } else {
            const savedTop = document.body.style.top;
            document.body.style.position = '';
            document.body.style.top = '';
            document.body.style.width = '';
            document.body.style.overflow = '';

            if (savedTop) {
                const scrollY = Math.abs(parseInt(savedTop));
                console.log(`[캘린더] 모달 닫힘 - 스크롤 위치 복구: ${scrollY}`);
                window.scrollTo(0, scrollY);
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

    const handleScrollToToday = useCallback(() => {
        // 1. 활성 슬라이드 내의 오늘 날짜 요소 찾기
        const selector = '.calendar-month-slide[data-active-month="true"] .calendar-date-number-today';
        const todayEl = document.querySelector(selector) as HTMLElement;

        if (!todayEl) {
            console.log(`🔎 [캘린더] 오늘 요소를 찾을 수 없습니다: ${selector}`);
            return false;
        }

        // [Simple Fix] 모든 복잡한 계산을 제거하고 표준 API 사용
        // FullEventCalendar.css에 추가된 scroll-margin-top과 연동됩니다.
        requestAnimationFrame(() => {
            if (userInteractedRef.current) {
                console.log('� [캘린더] 사용자 조작 감지 - 스크롤 취소');
                return;
            }

            const rect = todayEl.getBoundingClientRect();
            const scrollTop = window.pageYOffset || document.documentElement.scrollTop;

            // 목표 Y: 현재 스크롤 + 오늘 요소 위치 - 화면 높이의 1/5 (약 20% 지점)
            const targetY = scrollTop + rect.top - (window.innerHeight / 5);

            console.log(`🚀 [캘린더] 오늘 위치 정밀 스크롤 (Target Y: ${targetY})`);
            window.scrollTo({
                top: Math.max(0, targetY),
                behavior: 'smooth'
            });

            // URL 정리
            const urlParams = new URLSearchParams(window.location.search);
            if (urlParams.get('scrollToToday') === 'true') {
                const newUrl = window.location.pathname + window.location.search.replace(/[&?]scrollToToday=true/, '');
                window.history.replaceState({}, '', newUrl);
            }
        });

        return true;
    }, [currentMonth]);

    // [Fix] State 대신 Ref를 사용하여 렌더링 사이클 지연으로 인한 스크롤 무시 방지
    const shouldScrollToTodayRef = useRef(false);

    // 초기 상태 설정
    useEffect(() => {
        const today = new Date();
        const isSameMonth = currentMonth.getFullYear() === today.getFullYear() &&
            currentMonth.getMonth() === today.getMonth();
        if (isSameMonth) {
            shouldScrollToTodayRef.current = true;
        }
    }, []); // 마운트 시 최초 1회만

    // 월 변경 등 렌더링 후 스크롤 로직 실행 (MutationObserver 제거됨)
    // 부모인 CalendarPage에서는 전역적인 상태 감시보다는 FullEventCalendar의 알림에 의존합니다.

    // [Smart Scroll] 달력 진입 및 달 이동 시 상황별 스크롤 분기
    useEffect(() => {
        // [Add] 달이 바뀌면 이전의 사용자 조작 기록을 초기화
        userInteractedRef.current = false;

        // 오늘 날짜 정보
        const today = new Date();
        const isSameMonth = currentMonth.getFullYear() === today.getFullYear() &&
            currentMonth.getMonth() === today.getMonth();

        console.log(`[캘린더] 월 이동 감지 -> 현재: ${currentMonth.getMonth() + 1}월, 오늘: ${today.getMonth() + 1}월, 같은달?: ${isSameMonth}`);

        if (isSameMonth) {
            // 이번 달로 이동한 경우 -> 스크롤 예약
            shouldScrollToTodayRef.current = true;
        } else {
            // 다른 달로 이동한 경우 -> 페이지 최상단(0)으로 즉시 이동
            shouldScrollToTodayRef.current = false;
            window.scrollTo({ top: 0, behavior: 'instant' });
        }
    }, [currentMonth]);

    // Handlers
    const handleMonthChange = useCallback((newMonth: Date) => {
        setCurrentMonth(newMonth);
        setSelectedDate(null);
    }, []);

    // [New] 탭 클릭 핸들러 (사용자 요청 단순화 정책)
    const handleTabClick = (filter: 'all' | 'social-events' | 'classes' | 'overseas') => {
        // 사용자 조작 플래그 초기화하여 스크롤 허용
        userInteractedRef.current = false;

        const today = new Date();
        const isTodayMonth = currentMonth.getFullYear() === today.getFullYear() &&
            currentMonth.getMonth() === today.getMonth();

        if (isTodayMonth) {
            // 이번 달인 경우: 데이터 로딩 후 오늘 위치로 스크롤 예약
            shouldScrollToTodayRef.current = true;
        } else {
            // 다른 달인 경우: 즉시 최상단(0)으로 이동
            shouldScrollToTodayRef.current = false;
            window.scrollTo({ top: 0, behavior: 'instant' });
        }
        setTabFilter(filter);
    };

    // URL 파라미터에서 'id' 읽어서 이벤트 상세 모달 열기 (Deep Link)
    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const eventId = urlParams.get('id');

        if (eventId) {
            const fetchEvent = async () => {
                try {
                    // Try events table
                    const { data, error } = await supabase
                        .from('events')
                        .select('*')
                        .eq('id', eventId)
                        .maybeSingle();

                    if (error) throw error;

                    if (data) {
                        const isSocial = !!data.group_id || data.category === 'social';
                        const isLesson = ['class', 'regular', 'club'].includes(data.category);

                        // 1. 해당 탭(Category)으로 전환
                        if (data.scope === 'overseas') {
                            setTabFilter('overseas');
                        } else if (isSocial) {
                            setTabFilter('social-events');
                        } else if (isLesson) {
                            setTabFilter('classes');
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
                                is_social_integrated: true
                            } : data;
                            eventModal.setSelectedEvent(eventToSet);
                            setHighlightedEventId(eventToSet.id);
                        }, 100);

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
            console.log('🔘 [캘린더] 오늘 버튼 클릭 - 스크롤 실행');
            // 버튼 클릭 시에는 사용자 조작 기록을 초기화하여 즉시 스크롤이 작동하도록 함
            userInteractedRef.current = false;

            const today = new Date();
            const isSameMonth = currentMonth.getFullYear() === today.getFullYear() &&
                currentMonth.getMonth() === today.getMonth();

            if (isSameMonth) {
                // 같은 달이면 즉시 위치 이동
                handleScrollToToday();
            } else {
                // 다른 달이면 이동 예약 후 월 변경
                shouldScrollToTodayRef.current = true;
                handleMonthChange(today);
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
                    onClick={() => handleTabClick('all')}
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
                    onClick={() => handleTabClick('social-events')}
                >
                    <div className="tab-label-wrapper">
                        <span className="translated-part">{t('socialEvents')}</span>
                        <span className="fixed-part ko" translate="no">소셜&행사</span>
                        <span className="fixed-part en" translate="no">Social & event</span>
                    </div>
                </button>
                <button
                    className={`calendar-tab-btn ${tabFilter === 'classes' ? 'active' : ''}`}
                    onClick={() => handleTabClick('classes')}
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
                    onClick={() => handleTabClick('overseas')}
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
                    onDataLoaded={() => {
                        console.log('📡 [CalendarPage] Data and Layout ready.');
                        if (shouldScrollToTodayRef.current) {
                            handleScrollToToday();
                            shouldScrollToTodayRef.current = false;
                        }
                    }}
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
                onSelectPublic={() => {
                    setShowChoiceModal(false);
                    const dateStr = selectedDate ? selectedDate.toISOString().split('T')[0] : '';
                    const url = dateStr ? `/social?action=register_social&date=${dateStr}` : '/social?action=register_social';
                    navigate(url);
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
