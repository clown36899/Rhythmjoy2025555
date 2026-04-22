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
const CalendarDateMapModal = lazy(() => import("./components/CalendarDateMapModal"));


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

    const [tabFilter, setTabFilter] = useState<'all' | 'social-events' | 'classes'>(initialTabFilter as any);

    // Event Modal States - using Hook
    const eventModal = useEventModal();
    const [highlightedEventId, setHighlightedEventId] = useState<number | string | null>(null);
    const [showRegisterModal, setShowRegisterModal] = useState(false);
    const [showCalendarSearch, setShowCalendarSearch] = useState(false);
    const [isMapView, setIsMapView] = useState(true); // [New] 지도 뷰 모드 상태 (기본값 true로 변경)
    const [mapDateEvents, setMapDateEvents] = useState<AppEvent[]>([]); // [New] 지도에 표시할 이벤트들
    const [showMapModal, setShowMapModal] = useState(false); // [New] 지도 모달 표시 상태


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
    // [Fix] useEffect([currentMonth])가 마운트/재진입 직후 shouldScrollToToday를 덮어쓰는 것을 방지
    const skipCurrentMonthEffectRef = useRef(true);

    useLayoutEffect(() => {
        if ('scrollRestoration' in window.history) {
            window.history.scrollRestoration = 'manual';
        }
    }, []);

    // 바텀 내비게이션 재클릭 등 라우트 재진입 감지 → scroll useLayoutEffect보다 먼저 선언해야 순서 보장
    useLayoutEffect(() => {
        initialJumpDoneRef.current = false;
        userInteractedRef.current = false;
        shouldScrollToTodayRef.current = true;
        skipCurrentMonthEffectRef.current = true;
        // React state 배치로 인해 state 대신 ref로 직접 DOM 숨김
        if (containerRef.current) containerRef.current.style.visibility = 'hidden';
    }, [location.key]);

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
            // [Fix] overflow:hidden 방식으로 스크롤 잠금
            // position:fixed 방식은 body 레이아웃을 변경하여 좌표계와 워프 로직이 깨지므로 사용하지 않음
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
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
            // [Logic Sync] 모든 행사를 통합 집계 (scope 필터 제거)
            localEventsToCount = [...allEvents, ...socialSchedules];

            if (tabFilter === 'social-events') {
                const isNotClass = (e: any) => !['class', 'regular', 'club'].includes(e.category?.toLowerCase());
                localEventsToCount = localEventsToCount.filter(isNotClass);
            } else if (tabFilter === 'classes') {
                const isClass = (e: any) => ['class', 'regular', 'club'].includes(e.category?.toLowerCase());
                localEventsToCount = localEventsToCount.filter(isClass);
            }
        }

        // [Social Fix] 소셜(1:1)과 일반(4:5) 이벤트를 분리 집계하여 정확한 높이 계산
        const socialByDate: Record<string, number> = {};
        const regularByDate: Record<string, number> = {};

        // FullEventCalendar.tsx의 isSocialEvent 로직과 1:1 동일
        const isSocialEvt = (event: any) =>
            !!(event as any).group_id || event.category === 'social' || String(event.id).startsWith('social-');

        const addToDate = (map: Record<string, number>, dateStr: string) => {
            map[dateStr] = (map[dateStr] || 0) + 1;
        };

        const getLocalStr = (d: any) => {
            if (!d) return null;
            const dateObj = new Date(d);
            if (isNaN(dateObj.getTime())) return null;
            return `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
        };

        localEventsToCount.forEach((event: any) => {
            const targetMap = isSocialEvt(event) ? socialByDate : regularByDate;
            if (event.event_dates && event.event_dates.length > 0) {
                const isClass = event.category && ['class', 'regular', 'club'].includes(event.category.toLowerCase());
                const sortedDates = [...event.event_dates].sort();
                event.event_dates.forEach((d: string) => {
                    const dateStr = getLocalStr(d);
                    if (!dateStr) return;
                    if (isClass && dateStr !== getLocalStr(sortedDates[0])) return;
                    addToDate(targetMap, dateStr);
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
                        addToDate(targetMap, dateStr);
                        curr.setDate(curr.getDate() + 1);
                        limit++;
                    }
                } else {
                    const dateStr = getLocalStr(startStr);
                    if (dateStr) addToDate(targetMap, dateStr);
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

        // [Dynamic Title Math] CSS clamp(0rem, 2.5vw, 0.85rem) & line-height: 1.25 구현
        // 2.5vw가 13.6px(0.85rem)을 넘지 않도록 제한
        const titleFontSize = Math.min(13.6, vw * 0.025);
        const titleLineHeight = titleFontSize * 1.25;

        // CSS -webkit-line-clamp: 2 → 최대 2줄까지 표시됨
        // min-height: 24px (.calendar-fullscreen-title-container) + padding-top: 3px
        const dynamicTitleHeight = Math.max(24, titleLineHeight * 2) + 3;
        console.log('dynamicTitleHeight', dynamicTitleHeight);
        const cardVerticalPadding = 8; // .calendar-fullscreen-event-card margin-bottom: 8px

        // [정밀 오늘이동 수치] 날짜 숫자 헤더(56px) + 이벤트 카드
        // 일반 이벤트: aspect-ratio 4/5, 소셜 이벤트: aspect-ratio 1/1
        // cellWidth - 5 = 실제 이미지 너비 (card padding 2px*2 + border 1px)
        const imageWidth = cellWidth - 5;
        const regularCardHeight = imageWidth * (5 / 4) + dynamicTitleHeight + cardVerticalPadding;
        const socialCardHeight = imageWidth * 1 + dynamicTitleHeight + cardVerticalPadding;
        console.log('imageWidth', imageWidth, 'regularCardH', regularCardHeight.toFixed(1), 'socialCardH', socialCardHeight.toFixed(1));

        // [Pixel Perfect Fix] 주차별 높이 계산 루프 (소셜/일반 분리)
        for (let w = 0; w < totalWeeks; w++) {
            let maxDayHeight = 56;
            let debugSoc = 0, debugReg = 0;
            for (let d = 0; d < 7; d++) {
                const dayOffset = (w * 7) + d - firstDay;
                if (dayOffset >= 0 && dayOffset < daysInMonth) {
                    const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), dayOffset + 1);
                    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
                    const sCount = socialByDate[dateStr] || 0;
                    const rCount = regularByDate[dateStr] || 0;
                    const dayHeight = 56 + sCount * socialCardHeight + rCount * regularCardHeight;
                    if (dayHeight > maxDayHeight) {
                        maxDayHeight = dayHeight;
                        debugSoc = sCount;
                        debugReg = rCount;
                    }
                }
            }

            // [One-Shot Fix] 이벤트가 없으면 최소 높이(56px)만 유지하고, 강제로 늘리지 않음
            const actualWeekHeight = maxDayHeight;

            if (isSameMonth && w < todayWeekIndex) {
                // 그리드 row-gap(16px) 합산 (중요: rowGap이 빠지면 위쪽 주차만큼 오차가 누적됨)
                sumPrecedingHeight += (actualWeekHeight + 16);
            }

            cumulativePageHeight += actualWeekHeight;
            if (w < totalWeeks - 1) cumulativePageHeight += 16; // 주차 간 간격(16px)만 합산

            debugTable.push({ week: w, soc: debugSoc, reg: debugReg, height: actualWeekHeight.toFixed(1) });
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
            // [Optimization] "딱 맞게" 요청 반영: vh 가산량을 완전히 제거하고 컨텐츠 높이만 유지.
            // 오늘 날짜 이동은 페이지 하단 한계 내에서 최대한 수행됨.
            totalHeight: cumulativePageHeight + containerPaddingTop + lastRowExtraPadding,
            isSameMonth,
            debugTitleHeight: dynamicTitleHeight
        };
    }, [currentMonth, calendarData, tabFilter]);

    const handleScrollToToday = useCallback((behavior: 'smooth' | 'auto' | 'instant' = 'smooth', forced = false, onDone?: () => void) => {
        if (!forced && userInteractedRef.current) { onDone?.(); return; }
        if (!calendarMetrics.isSameMonth && !forced) { onDone?.(); return; }

        const gridEl = document.querySelector('[data-active-month="true"] .calendar-grid-container');
        const navHeaderEl = document.querySelector('.calendar-tabs-header');

        if (!gridEl) { onDone?.(); return; }

        let retryCount = 0;
        const maxRetries = 10;

        const performWarp = () => {
            const todayEl = document.querySelector('.calendar-grid-cell.is-today');

            if (!todayEl && retryCount < maxRetries) {
                retryCount++;
                requestAnimationFrame(performWarp);
                return;
            }

            const headerBottom = navHeaderEl
                ? navHeaderEl.getBoundingClientRect().bottom
                : 156;

            const gridAbsoluteTop = gridEl.getBoundingClientRect().top + window.scrollY;

            let finalY = 0;
            if (todayEl) {
                const todayRect = todayEl.getBoundingClientRect();
                finalY = (todayRect.top + window.scrollY) - gridAbsoluteTop;
            } else {
                finalY = calendarMetrics.targetY;
            }

            const scrollTarget = Math.max(0, gridAbsoluteTop + finalY - headerBottom);

            console.log(`📏 [Warp-Final] mode: ${todayEl ? 'DOM' : 'FALLBACK'}, result: ${scrollTarget.toFixed(1)}`);
            window.scrollTo({ top: scrollTarget, behavior: behavior as ScrollBehavior });
            onDone?.();
        };

        performWarp();

    }, [calendarMetrics]);




    useLayoutEffect(() => {
        // [Modal Guard] 모달 열림 상태에서는 body가 position:fixed이므로 워프 스킵
        const isAnyModalOpen = showRegisterModal || eventModal.showEditModal || eventModal.showPasswordModal || !!eventModal.selectedEvent;
        if (isAnyModalOpen) return;

        // [One-Shot Warp Trigger] 초기 진입 시 혹은 탭 전환 시 상단 안착 실행
        if (calendarData && (!initialJumpDoneRef.current || shouldScrollToTodayRef.current)) {
            console.log('⚡ [useLayoutEffect] CalendarPage 워프 실행');
            initialJumpDoneRef.current = true;
            shouldScrollToTodayRef.current = false;
            const showPage = () => {
                if (containerRef.current) containerRef.current.style.visibility = 'visible';
            };
            if (calendarMetrics.isSameMonth) {
                handleScrollToToday('instant', true, showPage);
            } else {
                showPage();
            }
        }
    }, [calendarMetrics.isSameMonth, !!calendarData, handleScrollToToday, tabFilter, calendarMetrics.targetY, location.key]);

    useEffect(() => {
        // [Fix] 마운트/재진입 직후 첫 발동은 skip - location.key useLayoutEffect에서 이미 처리됨
        if (skipCurrentMonthEffectRef.current) {
            skipCurrentMonthEffectRef.current = false;
            return;
        }
        // 버튼/스와이프 등으로 currentMonth가 변경될 때의 추가 처리는 handleMonthChange에서 담당함
    }, [currentMonth]);

    const handleMonthChange = useCallback((newMonth: Date) => {
        userInteractedRef.current = false;
        const today = new Date();
        const isSameMonth = newMonth.getFullYear() === today.getFullYear() &&
            newMonth.getMonth() === today.getMonth();

        if (isSameMonth) {
            shouldScrollToTodayRef.current = true;
        } else {
            shouldScrollToTodayRef.current = false;
            window.scrollTo({ top: 0, behavior: 'instant' });
        }

        setCurrentMonth(newMonth);
        setSelectedDate(null);
    }, []);

    const handleTabClick = (filter: 'all' | 'social-events' | 'classes') => {
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

                        if (isSocial) {
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
                            const eventToSet = data;
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
                    <div className="tab-label-wrapper">
                        <span className="translated-part">{t('classes')}</span>
                        <span className="fixed-part ko" translate="no">강습</span>
                        <span className="fixed-part en" translate="no">Class</span>
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
                    onDataLoaded={useCallback(() => {
                        console.log('📡 [CalendarPage] Data and Layout ready.');
                    }, [])}
                    viewMode={viewMode}
                    onViewModeChange={setViewMode}
                    calendarHeightPx={window.innerHeight - 100}
                    dragOffset={dragOffset}
                    isAnimating={isAnimating}
                    onEventClick={(event: any, date: Date, dayEvents: AppEvent[]) => {
                        // [Optimization] 해외 이벤트(overseas)는 지도를 띄우지 않고 즉시 상세 모달 오픈
                        const isOverseas = false; // 통합 정책에 따라 구분 제거

                        if (isMapView && !isOverseas) {
                            setSelectedDate(date);
                            setMapDateEvents(dayEvents);
                            setShowMapModal(true);
                        } else {
                            eventModal.setSelectedEvent(event);
                        }
                    }}
                    highlightedEventId={highlightedEventId}
                    tabFilter={tabFilter}
                    seed={randomSeed}
                    isMapView={isMapView}
                    onDateClickWithEvents={(date, events) => {
                        // [Optimization] 국외 탭(overseas)인 경우 날짜 클릭 시 지도를 띄우지 않음
                        if (isMapView) {
                            setSelectedDate(date);
                            setMapDateEvents(events);
                            setShowMapModal(true);
                        }
                    }}
                />
            </div>

            {/* Event Detail Modal */}
            {
                eventModal.selectedEvent && (
                    <EventDetailModal
                        event={eventModal.selectedEvent as any}
                        isOpen={!!eventModal.selectedEvent}
                        onClose={eventModal.closeAllModals}
                        isAdminMode={isAdmin}
                        currentUserId={user?.id}
                        onDelete={(event: any) => eventModal.handleDeleteEvent(event.id)}
                        onEdit={(event: any) => {
                            const isSocial = String(event.id).startsWith('social-') || !!(event as any).group_id || (event.category === 'social');
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
                )
            }

            {/* Password Modal */}
            {
                eventModal.showPasswordModal && (
                    <Suspense fallback={<div />}>
                        <EventPasswordModal
                            event={eventModal.eventToEdit!}
                            onClose={() => eventModal.setShowPasswordModal(false)}
                            onSubmit={eventModal.handlePasswordSubmit}
                            password={eventModal.eventPassword}
                            onPasswordChange={eventModal.setEventPassword}
                        />
                    </Suspense>
                )
            }

            {/* Venue Detail Modal */}
            {
                selectedVenueId && (
                    <Suspense fallback={<div />}>
                        <VenueDetailModal
                            venueId={selectedVenueId}
                            onClose={closeVenueModal}
                        />
                    </Suspense>
                )
            }


            {/* Register Modal (New Event) */}
            {
                showRegisterModal && (
                    <Suspense fallback={<div />}>
                        <EventRegistrationModal
                            isOpen={showRegisterModal}
                            onClose={() => setShowRegisterModal(false)}
                            selectedDate={selectedDate || new Date()}
                            onEventCreated={handleEventCreated}
                        />
                    </Suspense>
                )
            }

            {/* Edit Modal */}
            {
                eventModal.showEditModal && eventModal.eventToEdit && (
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
                )
            }

            {/* Calendar Search Modal */}
            {
                showCalendarSearch && (
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
                )
            }

            {/* Social Schedule Edit Modal */}
            {
                socialEditEvent && (
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
                )
            }

            {/* Calendar Date Map Modal */}
            {
                showMapModal && (
                    <Suspense fallback={<div />}>
                        <CalendarDateMapModal
                            isOpen={showMapModal}
                            onClose={() => setShowMapModal(false)}
                            date={selectedDate}
                            events={mapDateEvents}
                            onEventClick={(event: any) => {
                                eventModal.setSelectedEvent(event);
                            }}
                        />
                    </Suspense>
                )
            }
        </div >
    );
}
