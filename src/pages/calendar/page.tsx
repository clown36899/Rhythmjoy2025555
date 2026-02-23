import React, { useState, useEffect, useCallback, useRef, useMemo, useLayoutEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import type { Event as AppEvent } from "../../lib/supabase";
import { lazy, Suspense } from "react";

import FullEventCalendar from "./components/FullEventCalendar";
import "./styles/CalendarPage.css";
import { useCalendarGesture } from "../v2/hooks/useCalendarGesture";
import { useEventModal } from "../../hooks/useEventModal";
import { useCalendarEventsQuery } from "../../hooks/queries/useCalendarEventsQuery";

import EventDetailModal from "../v2/components/EventDetailModal";
import CalendarSearchModal from "../v2/components/CalendarSearchModal";
import VenueDetailModal from "../practice/components/VenueDetailModal";
import { useAuth } from "../../contexts/AuthContext";
import { useUserInteractions } from "../../hooks/useUserInteractions";
import { useSetPageAction } from "../../contexts/PageActionContext";
import { useModalActions } from "../../contexts/ModalContext";

const EventPasswordModal = lazy(() => import("../v2/components/EventPasswordModal"));
const EventRegistrationModal = lazy(() => import("../../components/EventRegistrationModal"));
const SocialScheduleModal = lazy(() => import("../social/components/SocialScheduleModal"));


export default function CalendarPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const location = useLocation();
    const lastHandledEventIdRef = useRef<string | null>(null);
    const { user, signInWithKakao, isAdmin: authIsAdmin } = useAuth();
    const { openModal, closeModal } = useModalActions();

    // 상태 관리
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
    const [viewMode, setViewMode] = useState<"month" | "year">("month");

    // [Fix] 랜덤 시드 고정
    const [randomSeed] = useState(() => Math.floor(Math.random() * 1000000));

    // URL 파라미터에서 category 읽기
    const initialTabFilter = useMemo(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const category = urlParams.get('category');
        if (category === 'social') return 'social-events';
        if (category === 'classes') return 'classes';
        if (category === 'all') return 'all';
        return 'all';
    }, []);

    const [tabFilter, setTabFilter] = useState<'all' | 'social-events' | 'classes' | 'overseas'>(initialTabFilter as any);

    // Event Modal States - using Hook
    const eventModal = useEventModal();
    const [highlightedEventId, setHighlightedEventId] = useState<number | string | null>(null);
    const [showRegisterModal, setShowRegisterModal] = useState(false);
    const [showCalendarSearch, setShowCalendarSearch] = useState(false);


    // Auth
    const isAdmin = authIsAdmin || false;
    const [adminType] = useState<"super" | "sub" | null>(authIsAdmin ? "super" : null);

    // [New] 데이터 훅을 부모로 끌어올림 (사전 높이 계산을 위함)
    const { data: calendarData, isLoading, refetch: refetchCalendarData } = useCalendarEventsQuery(currentMonth);

    // Favorites
    const { interactions, toggleEventFavorite } = useUserInteractions(user?.id || null);
    const favoriteEventIds = useMemo(() => new Set((interactions?.event_favorites || []).map(id => Number(id))), [interactions]);

    // Venue Modal State
    const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null);

    // Social Edit State
    const [socialEditEvent, setSocialEditEvent] = useState<any | null>(null);

    const handleVenueClick = useCallback((venueId: string) => {
        setSelectedVenueId(venueId);
    }, []);

    const closeVenueModal = useCallback(() => {
        setSelectedVenueId(null);
    }, []);

    const containerRef = useRef<HTMLDivElement>(null!);
    const eventListElementRef = useRef<HTMLDivElement>(null!);

    const userInteractedRef = useRef(false);
    const shouldScrollToTodayRef = useRef(false);
    const initialJumpDoneRef = useRef(false);
    const mountTimeRef = useRef(Date.now());

    useLayoutEffect(() => {
        if ('scrollRestoration' in window.history) {
            window.history.scrollRestoration = 'manual';
        }
    }, []);

    useEffect(() => {
        const handleInteraction = (e: Event) => {
            if (Date.now() - mountTimeRef.current < 1500) return;
            const target = e.target as HTMLElement;
            if (target.closest('button') || target.closest('a') || target.getAttribute('role') === 'button') {
                return;
            }
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

    useEffect(() => {
        const isAnyModalOpen = showRegisterModal || eventModal.showEditModal || eventModal.showPasswordModal || !!eventModal.selectedEvent;

        if (isAnyModalOpen) {
            const scrollY = window.scrollY;
            document.body.style.position = 'fixed';
            document.body.style.top = `-${scrollY}px`;
            document.body.style.width = '100%';
            document.body.style.overflow = 'hidden';
            document.body.setAttribute('data-allow-restore', 'true');
        } else {
            const savedTop = document.body.style.top;
            const canRestore = document.body.getAttribute('data-allow-restore') === 'true';

            document.body.style.position = '';
            document.body.style.top = '';
            document.body.style.width = '';
            document.body.style.overflow = '';
            document.body.removeAttribute('data-allow-restore');

            if (canRestore && savedTop && savedTop !== '0px' && savedTop !== '') {
                const scrollY = Math.abs(parseInt(savedTop));
                console.log(`[캘린더] 모달 닫힘 - 스크롤 위치 복구: ${scrollY}`);
                window.scrollTo(0, scrollY);
            }
        }
    }, [showRegisterModal, eventModal.showEditModal, eventModal.showPasswordModal, eventModal.selectedEvent]);


    // [Precision Fix] 캘린더 위치 및 높이 사전 계산기 (Self-Healing Logic)
    const calendarMetrics = useMemo(() => {
        const today = new Date();
        const firstDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).getDay();
        const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
        const totalWeeks = Math.ceil((daysInMonth + firstDay) / 7);

        const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
        // [Dynamic Fix] window.innerWidth(스크롤바 포함) 대신 clientWidth(스크롤바 제외) 사용
        // 실제 CSS Grid가 사용하는 가용 너비와 100% 일치시킴
        const vw = typeof document !== 'undefined' ? document.documentElement.clientWidth : 650;
        const boundedVw = Math.min(650, vw);
        const cellWidth = (boundedVw - 10) / 7; // .calendar-grid-container padding: 5px (좌우 합 10px)
        console.log('cellWidth', cellWidth);
        let localEventsToCount: AppEvent[] = [];
        if (calendarData) {
            const allEvents = (calendarData.events || []) as AppEvent[];
            const socialSchedules = (calendarData.socialSchedules || []) as any[];

            // [Logic Sync] FullEventCalendar.tsx의 filteredEvents 로직과 1:1 매칭
            if (tabFilter === 'overseas') {
                // 국외: scope === 'overseas'
                localEventsToCount = allEvents.filter(e => e.scope === 'overseas');
            } else {
                // 국내/그 외: scope !== 'overseas' 제외
                const domesticEvents = allEvents.filter(e => e.scope !== 'overseas');
                const domesticSocialSchedules = socialSchedules.filter(s => s.day_of_week === null || s.day_of_week === undefined);

                const socialAsEvents = domesticSocialSchedules.map(s => ({
                    ...s,
                    is_social_integrated: true
                }));

                if (tabFilter === 'all') {
                    localEventsToCount = [...domesticEvents, ...socialAsEvents];
                } else if (tabFilter === 'social-events') {
                    // 강습 카테고리(class, regular, club) 제외
                    const isNotClass = (e: any) => !['class', 'regular', 'club'].includes(e.category?.toLowerCase());
                    localEventsToCount = [
                        ...domesticEvents.filter(isNotClass),
                        ...socialAsEvents.filter(isNotClass)
                    ];
                } else if (tabFilter === 'classes') {
                    // 강습 카테고리만 포함
                    const isClass = (e: any) => ['class', 'regular', 'club'].includes(e.category?.toLowerCase());
                    localEventsToCount = [
                        ...domesticEvents.filter(isClass),
                        ...socialAsEvents.filter(isClass)
                    ];
                }
            }
        }

        const eventsByLocalDate: Record<string, number> = {};
        const getLocalStr = (d: any) => {
            if (!d) return null;
            const dateObj = new Date(d);
            if (isNaN(dateObj.getTime())) return null;
            return `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
        };

        localEventsToCount.forEach((event: any) => {
            if (event.event_dates && event.event_dates.length > 0) {
                const isClass = event.category && ['class', 'regular', 'club'].includes(event.category.toLowerCase());
                const sortedDates = [...event.event_dates].sort();
                event.event_dates.forEach((d: string) => {
                    const dateStr = getLocalStr(d);
                    if (!dateStr) return;
                    if (isClass && dateStr !== getLocalStr(sortedDates[0])) return;
                    eventsByLocalDate[dateStr] = (eventsByLocalDate[dateStr] || 0) + 1;
                });
            } else {
                // [Fix] FullEventCalendar.tsx eventsByDate와 동일하게 start_date~end_date 전체 범위 카운트
                const startStr = event.start_date || event.date || event.schedule_date;
                const endStr = event.end_date || event.date || event.schedule_date;
                const startDate = startStr ? new Date(startStr) : null;
                const endDate = endStr ? new Date(endStr) : null;

                if (startDate && endDate && !isNaN(startDate.getTime()) && !isNaN(endDate.getTime())) {
                    const curr = new Date(startDate);
                    let limit = 0;
                    while (curr <= endDate && limit < 365) {
                        const dateStr = `${curr.getFullYear()}-${String(curr.getMonth() + 1).padStart(2, '0')}-${String(curr.getDate()).padStart(2, '0')}`;
                        eventsByLocalDate[dateStr] = (eventsByLocalDate[dateStr] || 0) + 1;
                        curr.setDate(curr.getDate() + 1);
                        limit++;
                    }
                } else {
                    const dateStr = getLocalStr(startStr);
                    if (dateStr) eventsByLocalDate[dateStr] = (eventsByLocalDate[dateStr] || 0) + 1;
                }
            }
        });

        let sumPrecedingHeight = 0;
        let cumulativePageHeight = 0;
        const isSameMonth = currentMonth.getFullYear() === today.getFullYear() &&
            currentMonth.getMonth() === today.getMonth();
        const todayWeekIndex = Math.floor((today.getDate() + firstDay - 1) / 7);

        const debugTable: any[] = [];
        const containerPaddingTop = 5;

        // [Dynamic Title Math] CSS clamp(0rem, 2.4vw, 0.9rem) & line-height: 1.2 구현
        // 2.4vw가 14.4px(0.9rem)을 넘지 않도록 제한 (약 600px 이상에서 고정됨)
        const titleFontSize = Math.min(14.4, vw * 0.024);
        const titleLineHeight = titleFontSize * 1.2;

        // CSS -webkit-line-clamp: 2 → 최대 2줄까지 표시됨
        // min-height: 24px (.calendar-fullscreen-title-container)
        const dynamicTitleHeight = Math.max(24, titleLineHeight * 2);
        console.log('dynamicTitleHeight', dynamicTitleHeight);
        const cardVerticalPadding = 10; // .calendar-fullscreen-event-card margin-bottom: 10px

        // [정밀 오늘이동 수치] 날짜 숫자 헤더(56px) + 이벤트 카드
        // 이미지: aspect-ratio 5/5(1:1), placeholder: aspect-ratio 5/6(1:1.2)
        // cellWidth - 1(border-right) - 4(card padding 2px*2) = 실제 이미지 너비
        const imageWidth = cellWidth - 5;
        console.log('imageWidth', imageWidth);
        const imageHeight = imageWidth * (5 / 5);
        console.log('imageHeight', imageHeight);
        const cardHeight = imageHeight + dynamicTitleHeight + cardVerticalPadding;
        console.log('cardHeight', cardHeight);

        // [Pixel Perfect Fix] 주차별 높이 계산 루프
        for (let w = 0; w < totalWeeks; w++) {
            let maxInWeek = 0;
            for (let d = 0; d < 7; d++) {
                const dayOffset = (w * 7) + d - firstDay;
                if (dayOffset >= 0 && dayOffset < daysInMonth) {
                    const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), dayOffset + 1);
                    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
                    maxInWeek = Math.max(maxInWeek, eventsByLocalDate[dateStr] || 0);
                }
            }

            const weekContentHeight = 56 + (maxInWeek * cardHeight);
            // [One-Shot Fix] 이벤트가 없으면 최소 높이(56px)만 유지하고, 강제로 늘리지 않음
            const actualWeekHeight = Math.max(56, weekContentHeight);

            if (isSameMonth && w < todayWeekIndex) {
                // 그리드 row-gap(6px) 합산 (중요: rowGap이 빠지면 위쪽 주차만큼 오차가 누적됨)
                sumPrecedingHeight += (actualWeekHeight + 6);
            }
            cumulativePageHeight += (actualWeekHeight + 6);

            debugTable.push({ week: w, maxE: maxInWeek, height: actualWeekHeight.toFixed(1) });
        }

        let finalScrollTargetY = 0;
        if (isSameMonth) {
            // [Relative Target] 그리드 내부에서의 상대적 위치만 계산함.
            // 실제 절대 좌표(safe area 등 포함)는 handleScrollToToday에서 실측 좌표와 결합함.
            finalScrollTargetY = containerPaddingTop + sumPrecedingHeight;

            console.log(`🔎 [Metrics] --- 픽셀 퍼펙트 계산 리포트 ---`);
            console.log(`📏 [Metrics] VIEWPORT: vw=${vw}px, bounded=${boundedVw}px, cellWidth=${cellWidth.toFixed(2)}px`);
            console.table(debugTable);
            console.log(`🎯 [Metrics] 그리드 내 타겟 상대 좌표: ${finalScrollTargetY.toFixed(1)}`);
        }

        // .calendar-cell-fullscreen.is-last-row { padding-bottom: calc(60px + env(safe-area-inset-bottom)) }
        const lastRowExtraPadding = 60; // + safe-area-inset-bottom (기기별 상이)

        return {
            targetY: finalScrollTargetY,
            totalHeight: cumulativePageHeight + lastRowExtraPadding + vh,
            isSameMonth,
            debugTitleHeight: dynamicTitleHeight
        };
    }, [currentMonth, calendarData, tabFilter]);

    const handleScrollToToday = useCallback((behavior: 'smooth' | 'auto' | 'instant' = 'smooth', forced = false) => {
        if (!forced && userInteractedRef.current) return;

        // [One-Shot Math System] 사용자 요청에 따라 사후 보정 및 DOM 실측을 완전히 제거
        const { targetY, totalHeight } = calendarMetrics;
        if (targetY <= 0 && !forced) return;

        // [DOM 실측] 그리드의 실제 절대 위치를 기준으로 스크롤 타겟 계산
        // safe-area-inset, 헤더, padding-top 등 모든 오프셋이 자동 반영됨
        let scrollTarget = targetY;
        const gridEl = document.querySelector('[data-active-month="true"] .calendar-grid-container');
        if (gridEl) {
            const gridAbsoluteTop = gridEl.getBoundingClientRect().top + window.scrollY;
            // [Fix] 메인 헤더(약 55px) 아래로 안착되도록 오프셋 감산
            scrollTarget = gridAbsoluteTop + targetY - 55;
        }

        // [Safety Check] 스크롤 가능한 최대 높이보다 더 이동하려는 경우 방지
        // 내용이 화면보다 짧거나 바닥에 가까운 경우, 억지로 헤더 아래로 맞추려다 오작동하는 것을 막음
        // DOM 측정 대신 수학적으로 계산된 totalHeight를 신뢰하여 미리 판단
        const predictedMaxScroll = Math.max(0, totalHeight - window.innerHeight);

        if (scrollTarget > predictedMaxScroll) {
            scrollTarget = predictedMaxScroll;
        }

        console.log(`🚀 [One-Shot Scroll] Target: ${scrollTarget.toFixed(1)}, Rel: ${targetY.toFixed(1)}, Max: ${predictedMaxScroll}, Behavior: ${behavior}`);
        window.scrollTo({ top: scrollTarget, behavior: behavior as ScrollBehavior });

    }, [calendarMetrics]);

    useLayoutEffect(() => {
        // [One-Shot Warp Trigger] 초기 진입 시 혹은 탭 전환 시 상단 안착 실행
        if (calendarMetrics.isSameMonth && calendarData && (!initialJumpDoneRef.current || shouldScrollToTodayRef.current)) {
            console.log('⚡ [useLayoutEffect] 데이터/탭 전환 워프 실행');
            handleScrollToToday('instant', true);
            initialJumpDoneRef.current = true;
            shouldScrollToTodayRef.current = false; // 플래그 소모
        }
    }, [calendarMetrics.isSameMonth, !!calendarData, handleScrollToToday, tabFilter, calendarMetrics.targetY]);

    useEffect(() => {
        userInteractedRef.current = false;
        const today = new Date();
        const isSameMonth = currentMonth.getFullYear() === today.getFullYear() &&
            currentMonth.getMonth() === today.getMonth();

        if (isSameMonth) {
            shouldScrollToTodayRef.current = true;
        } else {
            shouldScrollToTodayRef.current = false;
            if (initialJumpDoneRef.current) {
                window.scrollTo({ top: 0, behavior: 'instant' });
            }
        }
    }, [currentMonth]);

    const handleMonthChange = useCallback((newMonth: Date) => {
        setCurrentMonth(newMonth);
        setSelectedDate(null);
    }, []);

    const handleTabClick = (filter: 'all' | 'social-events' | 'classes' | 'overseas') => {
        userInteractedRef.current = false;

        const today = new Date();
        const isTodayMonth = currentMonth.getFullYear() === today.getFullYear() &&
            currentMonth.getMonth() === today.getMonth();

        if (isTodayMonth) {
            shouldScrollToTodayRef.current = true;
        } else {
            shouldScrollToTodayRef.current = false;
            window.scrollTo({ top: 0, behavior: 'instant' });
        }
        setTabFilter(filter);
    };

    useEffect(() => {
        const urlParams = new URLSearchParams(location.search);
        const eventId = urlParams.get('id');

        if (eventId && eventId !== lastHandledEventIdRef.current) {
            lastHandledEventIdRef.current = eventId;
            const fetchEvent = async () => {
                try {
                    const { data, error } = await supabase
                        .from('events')
                        .select('*')
                        .eq('id', eventId)
                        .maybeSingle();

                    if (error) throw error;

                    if (data) {
                        const isSocial = !!data.group_id || data.category === 'social';
                        const isLesson = ['class', 'regular', 'club'].includes(data.category);

                        if (data.scope === 'overseas') {
                            setTabFilter('overseas');
                        } else if (isSocial) {
                            setTabFilter('social-events');
                        } else if (isLesson) {
                            setTabFilter('classes');
                        } else {
                            setTabFilter('social-events');
                        }

                        const eventDate = new Date(data.date || data.start_date || new Date());
                        const targetMonth = new Date(eventDate.getFullYear(), eventDate.getMonth(), 1);
                        handleMonthChange(targetMonth);

                        setTimeout(() => {
                            const eventToSet = isSocial ? { ...data, is_social_integrated: true } : data;
                            const highlightOnly = urlParams.get('highlightOnly') === 'true';
                            if (!highlightOnly) {
                                eventModal.setSelectedEvent(eventToSet);
                            }
                            setHighlightedEventId(eventToSet.id);
                        }, 100);

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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [location.search, handleMonthChange]);

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

    const handleSocialEdit = useCallback((event: any) => {
        const cleanEvent = { ...event };
        if (typeof cleanEvent.id === 'string' && cleanEvent.id.startsWith('social-')) {
            cleanEvent.id = cleanEvent.id.replace('social-', '');
        }
        setSocialEditEvent(cleanEvent);
        eventModal.closeAllModals();
    }, [eventModal]);

    const handleEventCreated = useCallback((createdDate: Date, eventId?: number | string) => {
        const targetMonth = new Date(createdDate.getFullYear(), createdDate.getMonth(), 1);
        handleMonthChange(targetMonth);
        if (eventId) {
            setHighlightedEventId(eventId);
            setTimeout(() => {
                setHighlightedEventId(null);
            }, 3000);
        }
    }, [handleMonthChange]);

    useEffect(() => {
        const handleSetFullscreenMode = () => {
            setTimeout(() => {
                navigate('/v2');
            }, 0);
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
            userInteractedRef.current = false;
            const today = new Date();
            const isSameMonth = currentMonth.getFullYear() === today.getFullYear() &&
                currentMonth.getMonth() === today.getMonth();

            if (isSameMonth) {
                handleScrollToToday();
            } else {
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
    }, [navigate, handleNavigateMonth, handleMonthChange, handleScrollToToday, currentMonth]);

    useEffect(() => {
        window.dispatchEvent(new CustomEvent("calendarModeChanged", { detail: "fullscreen" }));
    }, []);

    useEffect(() => {
        window.dispatchEvent(new CustomEvent('updateCalendarView', {
            detail: {
                year: currentMonth.getFullYear(),
                month: currentMonth.getMonth()
            }
        }));
    }, [currentMonth]);

    useSetPageAction(useMemo(() => ({
        icon: 'ri-add-line',
        label: t('일정 등록'),
        requireAuth: true,
        onClick: () => {
            openModal('registrationChoice', {
                onSelectMain: () => {
                    closeModal('registrationChoice');
                    setShowRegisterModal(true);
                },
                onSelectSocial: () => {
                    closeModal('registrationChoice');
                    openModal('weeklySocial');
                },
                onSelectPublic: () => {
                    closeModal('registrationChoice');
                    const dateStr = selectedDate ? selectedDate.toISOString().split('T')[0] : '';
                    const url = dateStr ? `/social?action=register_social&date=${dateStr}` : '/social?action=register_social';
                    navigate(url);
                }
            });
        }
    }), [t, openModal, closeModal, navigate, selectedDate]));

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

            <div
                className="calendar-page-main"
                style={{ minHeight: calendarMetrics.totalHeight }}
            >
                <FullEventCalendar
                    currentMonth={currentMonth}
                    selectedDate={selectedDate}
                    onDateSelect={handleDateSelect}
                    onMonthChange={handleMonthChange}
                    calendarData={calendarData}
                    isLoading={isLoading}
                    refetchCalendarData={refetchCalendarData}
                    onDataLoaded={() => {
                        console.log('📡 [CalendarPage] Data and Layout ready.');
                    }}
                    viewMode={viewMode}
                    onViewModeChange={setViewMode}
                    calendarHeightPx={window.innerHeight - 100}
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
                    event={eventModal.selectedEvent as any}
                    isOpen={!!eventModal.selectedEvent}
                    onClose={eventModal.closeAllModals}
                    isAdminMode={isAdmin}
                    currentUserId={user?.id}
                    onDelete={(event: any) => eventModal.handleDeleteEvent(event.id)}
                    onEdit={(event: any) => {
                        const isSocial = String(event.id).startsWith('social-') || event.is_social_integrated || (event.category === 'social');
                        if (isSocial) {
                            handleSocialEdit(event);
                        } else {
                            eventModal.handleEditClick(event);
                        }
                    }}
                    isDeleting={eventModal.isDeleting}
                    isFavorite={favoriteEventIds.has(Number(String(eventModal.selectedEvent.id).replace('social-', '')))}
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
                <Suspense fallback={<div />}>
                    <VenueDetailModal
                        venueId={selectedVenueId}
                        onClose={closeVenueModal}
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
                        onEventCreated={handleEventCreated}
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
                        onEventCreated={() => { }}
                        isDeleting={eventModal.isDeleting}
                        onEventUpdated={(updatedEvent: any) => {
                            eventModal.setShowEditModal(false);
                            window.dispatchEvent(new CustomEvent("eventUpdated", { detail: updatedEvent }));
                        }}
                        onDelete={(id: any) => {
                            eventModal.handleDeleteEvent(id);
                        }}
                    />
                </Suspense>
            )}

            {/* Calendar Search Modal */}
            {showCalendarSearch && (
                <Suspense fallback={<div />}>
                    <CalendarSearchModal
                        isOpen={showCalendarSearch}
                        onClose={() => setShowCalendarSearch(false)}
                        onSelectEvent={(event: any) => {
                            setShowCalendarSearch(false);
                            const eventDate = new Date(event.start_date || event.date || new Date());
                            handleMonthChange(new Date(eventDate.getFullYear(), eventDate.getMonth(), 1));
                            setHighlightedEventId(event.id);
                            setTimeout(() => setHighlightedEventId(null), 3000);
                        }}
                    />
                </Suspense>
            )}

            {/* Social Schedule Edit Modal */}
            {socialEditEvent && (
                <Suspense fallback={<div />}>
                    <SocialScheduleModal
                        isOpen={!!socialEditEvent}
                        onClose={() => setSocialEditEvent(null)}
                        groupId={socialEditEvent.group_id}
                        editSchedule={socialEditEvent}
                        onSuccess={() => {
                            window.dispatchEvent(new CustomEvent("eventUpdated", { detail: socialEditEvent }));
                        }}
                    />
                </Suspense>
            )}
        </div>
    );
}
