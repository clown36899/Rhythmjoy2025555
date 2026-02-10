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
        const handleInteraction = () => {
            // [Fix] 페이지 진입 시의 클릭(메뉴 클릭 등)이 오감지되지 않도록 500ms 유예
            if (Date.now() - mountTimeRef.current < 500) return;

            if (!userInteractedRef.current) {
                console.log('👤 [캘린더] 사용자 조작 감지됨 (자동 보정 중단)');
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
        console.log('🚀 [캘린더] 오늘 날짜 이동 시작. 현재월:', currentMonth.toLocaleDateString());

        // 1. 활성 슬라이드 내의 오늘 날짜 요소 찾기
        const selector = '.calendar-month-slide[data-active-month="true"] .calendar-date-number-today';
        const todayEl = document.querySelector(selector) as HTMLElement;

        console.log(`🔎 [캘린더] 요소 찾기 "${selector}":`, todayEl ? '성공 ✅' : '실패 ❌');

        if (!todayEl) {
            // 혹시 활성 슬라이드 속성이 아직 안 붙었을 수도 있으니 전체에서 검색
            const fallbackEl = document.querySelector('.calendar-date-number-today') as HTMLElement;
            console.log(`🔎 [캘린더] 대체 검색 (.calendar-date-number-today):`, fallbackEl ? '성공 ⚠️' : '실패 ❌');

            if (fallbackEl) {
                console.log('   -> 부모 클래스:', fallbackEl.closest('.calendar-month-slide')?.className);
            }
            return false;
        }

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

        console.log(`📜 [캘린더] 스크롤 컨테이너:`, isWindow ? 'WINDOW (전체화면)' : (scrollParent as HTMLElement).className);

        // 3. 헤더 높이 계산 (Sticky Header Offset)
        const headerEl = document.querySelector('.calendar-page-weekday-header') as HTMLElement;
        const headerHeight = headerEl ? headerEl.offsetHeight : 0;
        const stickyHeaderOffset = headerHeight + 100; // 헤더 + 여유 공간

        // 4. 위치 계산 및 스크롤 실행
        if (isWindow) {
            const rect = todayEl.getBoundingClientRect();
            const elementPosition = rect.top + window.pageYOffset;
            const offsetPosition = elementPosition - stickyHeaderOffset;

            console.log(`📍 [캘린더] WINDOW 스크롤 실행 -> 목표: ${Math.round(offsetPosition)} (현재요소top: ${Math.round(rect.top)}, 오프셋: ${stickyHeaderOffset}, 문서전체높이: ${document.documentElement.scrollHeight})`);

            // [Fix] 시각적으로 스크롤되는 걸 보여주기 위해 100ms 지연 후 이동 시작
            setTimeout(() => {
                if (userInteractedRef.current) return;
                window.scrollTo({ top: offsetPosition, behavior: 'smooth' });
            }, 100);

            // 확인 사살 (0.8초 뒤 위치 확인 - Smooth Scroll 애니메이션 및 레이아웃 요동 고려)
            setTimeout(() => {
                // 사용자가 이미 직접 스크롤을 시작했다면 시스템이 개입하지 않음
                if (userInteractedRef.current) {
                    console.log('💡 [캘린더] 사용자 조작이 감지되어 자동 스크롤 보정을 중단합니다.');
                    return;
                }

                const currentY = Math.round(window.scrollY);
                console.log(`📍 [캘린더] 스크롤 결과 확인 -> 현재: ${currentY}, 목표: ${Math.round(offsetPosition)}, 문서전체높이: ${document.documentElement.scrollHeight}`);

                if (Math.abs(currentY - offsetPosition) > 50) {
                    // 목표에 도달하지 않았는데 스크롤이 0이거나 문서 높이가 크게 변했다면(브라우저 리셋) 최종 보정
                    if (currentY === 0 || Math.abs(currentY - offsetPosition) > 100) {
                        console.log(`⚠️ [캘린더] 스크롤 위치 어긋남 감지. 최종 보정합니다.`);
                        window.scrollTo({ top: offsetPosition, behavior: 'auto' });
                    }
                }
            }, 800);

        } else {
            const parentEl = scrollParent as HTMLElement;
            const childRect = todayEl.getBoundingClientRect();
            const parentRect = parentEl.getBoundingClientRect();
            const currentScroll = parentEl.scrollTop;
            const relativeTop = childRect.top - parentRect.top;
            const targetScroll = currentScroll + relativeTop - stickyHeaderOffset;

            console.log(`📍 [캘린더] 요소 내부 스크롤 실행 -> 목표위치: ${Math.round(targetScroll)} (현재스크롤: ${Math.round(currentScroll)}, 상대위치: ${Math.round(relativeTop)})`);
            parentEl.scrollTo({ top: targetScroll, behavior: 'smooth' });
        }
        return true; // 성공
    }, [currentMonth]);

    const [isNavigatingToToday, setIsNavigatingToToday] = useState(false);

    // 월 변경 등 렌더링 후 스크롤 로직 실행 (MutationObserver 활용)
    useEffect(() => {
        console.log(`[캘린더] 상태 체크 -> 오늘날짜이동중?: ${isNavigatingToToday}`);
        if (isNavigatingToToday) {
            console.log('[캘린더] 즉시 스크롤 보류. 화면 변경(Mutation) 대기 중...');

            // 2. 없으면 DOM 변경 감지 (렌더링 대기)
            const observer = new MutationObserver((mutations) => {
                console.log('[캘린더] 화면 변경 감지! 변경 수:', mutations.length);
                mutations.slice(0, 3).forEach(m => console.log('  -> 변경 타입:', m.type, m.attributeName, (m.target as Element).className));

                // RAF로 한 프레임 지연 실행하여 페인팅 후 스크롤
                requestAnimationFrame(() => {
                    if (handleScrollToToday()) {
                        console.log('[캘린더] 화면 감지 후 스크롤 성공! 감시 종료.');
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
                console.log('[캘린더] 감시 종료 (Cleanup).');
                observer.disconnect();
            };
        }
    }, [currentMonth, isNavigatingToToday, handleScrollToToday]);

    // [Smart Scroll] 달력 진입 및 달 이동 시 상황별 스크롤 분기
    useEffect(() => {
        // [Add] 달이 바뀌면 이전의 사용자 조작 기록을 초기화 (스와이프 제스처가 다음 달 스크롤 보정을 막지 않도록)
        userInteractedRef.current = false;

        // 오늘 날짜 정보
        const today = new Date();
        const isSameMonth = currentMonth.getFullYear() === today.getFullYear() &&
            currentMonth.getMonth() === today.getMonth();

        console.log(`[캘린더] 월 이동 감지 -> 현재: ${currentMonth.getMonth() + 1}월, 오늘: ${today.getMonth() + 1}월, 같은달?: ${isSameMonth}`);

        if (isSameMonth) {
            // 1. 이번 달로 이동한 경우 (진입 포함) -> 오늘 날짜 위치로 이동 준비
            console.log('[캘린더] 이번 달이므로 오늘 날짜 위치로 스크롤 준비...');
            setIsNavigatingToToday(true);
        } else {
            // 2. 다른 달로 이동한 경우 -> 페이지 최상단(0)으로 즉시 이동
            console.log('[캘린더] 다른 달이므로 페이지 최상단(0)으로 이동합니다.');
            window.scrollTo({ top: 0, behavior: 'instant' });
            // 이동 중일 수도 있으니 플래그는 꺼둠
            setIsNavigatingToToday(false);
        }
    }, [currentMonth]);

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
                    onDataLoaded={() => {
                        console.log('📡 [CalendarPage] Validating data loaded signal.');
                        // [Fix] Removed setTimeout to prevent race conditions.
                        // MutationObserver (in useEffect) will handle scrolling once DOM is ready.
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
