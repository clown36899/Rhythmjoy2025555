import React, { useState, useEffect, useCallback, useRef, useMemo, useLayoutEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import type { Event as AppEvent } from "../../lib/supabase";
import { lazy, Suspense } from "react";

import FullEventCalendar from "./components/FullEventCalendar";
import CalendarListView from "./components/CalendarListView";
import CalendarMapView from "./components/CalendarMapView";
import "./styles/CalendarPage.css";
import { useCalendarGesture } from "../v2/hooks/useCalendarGesture";
import { useEventModal } from "../../hooks/useEventModal";
import { useCalendarEventsQuery } from "../../hooks/queries/useCalendarEventsQuery";
import { useListViewEvents } from "../../hooks/queries/useListViewEvents";

import EventDetailModal from "../v2/components/EventDetailModal";
import CalendarSearchModal from "../v2/components/CalendarSearchModal";
import VenueDetailModal from "../practice/components/VenueDetailModal";
import { useAuth } from "../../contexts/AuthContext";
import { useUserInteractions } from "../../hooks/useUserInteractions";
import { useSetPageAction } from "../../contexts/PageActionContext";
import { useModalActions } from "../../contexts/ModalContext";
import { getDanceScopeLabel, getVisibleDanceScopeOptions, normalizeVisibleDanceScope, type DanceScope } from "../../utils/danceTaxonomy";

const EventPasswordModal = lazy(() => import("../v2/components/EventPasswordModal"));
const EventRegistrationModal = lazy(() => import("../../components/EventRegistrationModal"));
const SocialScheduleModal = lazy(() => import("../social/components/SocialScheduleModal"));
const CalendarDateMapModal = lazy(() => import("./components/CalendarDateMapModal"));

const getCalendarLocalDateString = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const getSafeRect = (element: Element | null | undefined) => {
    if (!element || !element.isConnected) return null;
    try {
        return element.getBoundingClientRect();
    } catch {
        return null;
    }
};

const getCalendarEventVenue = (event: any) =>
    event.venue_name || event.place_name || event.location || event.address || '';

const getCalendarEventDateStrings = (event: any) => {
    const dates = new Set<string>();
    const addDate = (value: any) => {
        if (!value) return;
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return;
        dates.add(getCalendarLocalDateString(date));
    };

    if (Array.isArray(event.event_dates) && event.event_dates.length > 0) {
        event.event_dates.forEach(addDate);
        return Array.from(dates);
    }

    const startValue = event.start_date || event.date || event.schedule_date;
    const endValue = event.end_date || event.date || event.schedule_date;
    const startDate = startValue ? new Date(startValue) : null;
    const endDate = endValue ? new Date(endValue) : null;

    if (startDate && endDate && !Number.isNaN(startDate.getTime()) && !Number.isNaN(endDate.getTime())) {
        const current = new Date(startDate);
        let guard = 0;
        while (current <= endDate && guard < 365) {
            addDate(current);
            current.setDate(current.getDate() + 1);
            guard++;
        }
        return Array.from(dates);
    }

    addDate(startValue);
    return Array.from(dates);
};

const isCalendarEventInFilter = (event: any, filter: 'all' | 'social-events' | 'classes') => {
    const category = String(event.category || '').toLowerCase();
    const isClassLike = ['class', 'regular', 'club'].includes(category);
    if (filter === 'social-events') return !isClassLike;
    if (filter === 'classes') return isClassLike;
    return true;
};

type CalendarDanceScope = Exclude<DanceScope, 'unknown'>;
type CalendarDisplayMode = 'calendar' | 'list' | 'map';

const CALENDAR_WEEKDAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'];
const CALENDAR_MONTH_LABELS = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];

const normalizeCalendarDisplayMode = (value: string | null): CalendarDisplayMode => {
    if (value === 'list' || value === 'map') return value;
    return 'calendar';
};

export default function CalendarPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const location = useLocation();
    const lastHandledEventIdRef = useRef<string | null>(null);
    const scrollToTodayConsumedRef = useRef(false);
    const { user, signInWithKakao, isAdmin: authIsAdmin, isAuthCheckComplete } = useAuth();
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
    const [danceScope, setDanceScope] = useState<CalendarDanceScope>(() => {
        const urlParams = new URLSearchParams(window.location.search);
        return normalizeVisibleDanceScope(urlParams.get('dance'), false);
    });
    const [displayMode, setDisplayMode] = useState<CalendarDisplayMode>(() => {
        const urlParams = new URLSearchParams(window.location.search);
        return normalizeCalendarDisplayMode(urlParams.get('view'));
    });
    const [scrollWeekDateLabels, setScrollWeekDateLabels] = useState<string[]>(() => Array(7).fill(''));
    const [listTodayScrollSignal, setListTodayScrollSignal] = useState(0);
    const handleSetDisplayMode = useCallback((mode: CalendarDisplayMode) => {
        setDisplayMode(mode);
        const nextParams = new URLSearchParams(window.location.search);
        nextParams.set('view', mode);
        nextParams.delete('scrollToToday');
        nextParams.delete('nav');
        const nextSearch = nextParams.toString();
        const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`;
        if (nextUrl !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
            window.history.replaceState(window.history.state, '', nextUrl);
        }
        scrollToTodayConsumedRef.current = true;
        if (mode === 'list') {
            const today = new Date();
            userInteractedRef.current = false;
            shouldScrollToTodayRef.current = false;
            setCurrentMonth(prev => {
                if (prev.getFullYear() === today.getFullYear() && prev.getMonth() === today.getMonth()) return prev;
                return new Date(today.getFullYear(), today.getMonth(), 1);
            });
            setListTodayScrollSignal(signal => signal + 1);
        } else if (mode === 'map') {
            window.scrollTo({ top: 0, behavior: 'instant' });
        } else {
            userInteractedRef.current = false;
            shouldScrollToTodayRef.current = true;
        }
    }, []);

    // Event Modal States - using Hook
    const eventModal = useEventModal();
    const handleCalendarMapEventClick = useCallback((event: AppEvent) => {
        eventModal.setSelectedEvent(event as any);
    }, [eventModal.setSelectedEvent]);
    const [highlightedEventId, setHighlightedEventId] = useState<number | string | null>(null);
    const [showRegisterModal, setShowRegisterModal] = useState(false);
    const [showCalendarSearch, setShowCalendarSearch] = useState(false);
    const [showCalendarNavigator, setShowCalendarNavigator] = useState(false);
    const [navigatorYear, setNavigatorYear] = useState(() => new Date().getFullYear());
    const isMapView = displayMode === 'map';
    const [mapDateEvents, setMapDateEvents] = useState<AppEvent[]>([]); // [New] 지도에 표시할 이벤트들
    const [showMapModal, setShowMapModal] = useState(false); // [New] 지도 모달 표시 상태


    // Auth
    const isAdmin = authIsAdmin || false;
    const [adminType] = useState<"super" | "sub" | null>(authIsAdmin ? "super" : null);
    const visibleDanceScopeOptions = useMemo(() => getVisibleDanceScopeOptions(isAdmin), [isAdmin]);

    // [New] 데이터 훅을 부모로 끌어올림 (사전 높이 계산을 위함)
    const { data: calendarData, isLoading, refetch: refetchCalendarData } = useCalendarEventsQuery(currentMonth, danceScope);

    // 리스트 뷰 전용: 오늘~6개월 후 이벤트 (캘린더 쿼리와 완전히 분리)
    const listViewData = useListViewEvents(displayMode === 'list', danceScope);

    useEffect(() => {
        if (displayMode !== 'calendar') {
            setScrollWeekDateLabels(Array(7).fill(''));
            return;
        }

        let frame = 0;
        let lastLabelKey = '';

        const updateScrollDateLabel = () => {
            frame = 0;
            const stickyWeekdays = document.querySelector('.calendar-sticky-weekdays');
            const cells = Array.from(document.querySelectorAll<HTMLElement>('.calendar-cell-fullscreen[data-date]'));
            const stickyRect = getSafeRect(stickyWeekdays);
            if (!stickyRect || cells.length === 0) return;

            const switchLineY = stickyRect.bottom + 1;
            const rows = new Map<number, HTMLElement[]>();

            cells.forEach((cell) => {
                const rect = getSafeRect(cell);
                if (!rect) return;
                const rowTop = Math.round(rect.top);
                const existing = rows.get(rowTop);
                if (existing) existing.push(cell);
                else rows.set(rowTop, [cell]);
            });

            const sortedRows = Array.from(rows.entries())
                .sort(([topA], [topB]) => topA - topB)
                .map(([top, rowCells]) => ({
                    top,
                    cells: rowCells
                        .map(cell => ({ cell, rect: getSafeRect(cell) }))
                        .filter((entry): entry is { cell: HTMLElement; rect: DOMRect } => !!entry.rect)
                        .sort((a, b) => a.rect.left - b.rect.left)
                        .map(entry => entry.cell),
                }));

            let activeRow = sortedRows[0];
            for (const row of sortedRows) {
                if (row.top <= switchLineY) activeRow = row;
                else break;
            }

            const nextLabels = Array(7).fill('');
            activeRow?.cells.slice(0, 7).forEach((cell, index) => {
                const dateString = cell.dataset.date;
                if (!dateString) return;
                const [, , day] = dateString.split('-').map(Number);
                nextLabels[index] = String(day);
            });

            const nextLabelKey = nextLabels.join('|');
            if (nextLabelKey !== lastLabelKey) {
                lastLabelKey = nextLabelKey;
                setScrollWeekDateLabels(nextLabels);
            }
        };

        const scheduleUpdate = () => {
            if (frame) return;
            frame = requestAnimationFrame(updateScrollDateLabel);
        };

        scheduleUpdate();
        window.addEventListener('scroll', scheduleUpdate, { passive: true });
        window.addEventListener('resize', scheduleUpdate);

        return () => {
            if (frame) cancelAnimationFrame(frame);
            window.removeEventListener('scroll', scheduleUpdate);
            window.removeEventListener('resize', scheduleUpdate);
        };
    }, [displayMode, currentMonth, tabFilter, danceScope, calendarData]);

    // Favorites
    const { interactions, toggleEventFavorite } = useUserInteractions(user?.id || null);
    const favoriteEventIds = useMemo(() => new Set((interactions?.event_favorites || []).map(id => Number(id))), [interactions]);

    const calendarPageStats = useMemo(() => {
        const now = new Date();
        const todayStr = getCalendarLocalDateString(now);
        const weekEnd = new Date(now);
        weekEnd.setDate(now.getDate() + 6);
        const weekEndStr = getCalendarLocalDateString(weekEnd);

        const rawEvents = [
            ...((calendarData?.events || []) as any[]),
            ...((calendarData?.socialSchedules || []) as any[]),
        ].filter(event => isCalendarEventInFilter(event, tabFilter));

        const todayEventIds = new Set<number | string>();
        const weekEventIds = new Set<number | string>();
        const venueNames = new Set<string>();

        rawEvents.forEach((event) => {
            const dates = getCalendarEventDateStrings(event);
            if (dates.includes(todayStr)) todayEventIds.add(event.id);
            if (dates.some(date => date >= todayStr && date <= weekEndStr)) weekEventIds.add(event.id);

            const venue = getCalendarEventVenue(event).trim();
            if (venue) venueNames.add(venue);
        });

        return {
            todayCount: todayEventIds.size,
            weekCount: weekEventIds.size,
            venueCount: venueNames.size,
            todayLabel: `${now.getMonth() + 1}.${now.getDate()}`,
        };
    }, [calendarData, tabFilter, danceScope]);

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
    const todayScrollRunIdRef = useRef(0);
    const mountTimeRef = useRef(Date.now());
    const lastCalendarEntryKeyRef = useRef<string | null>(null);
    // [Fix] useEffect([currentMonth])가 마운트/재진입 직후 shouldScrollToToday를 덮어쓰는 것을 방지
    const skipCurrentMonthEffectRef = useRef(true);

    useLayoutEffect(() => {
        if ('scrollRestoration' in window.history) {
            window.history.scrollRestoration = 'manual';
        }
    }, []);

    // 바텀 내비게이션 재클릭 등 라우트 재진입 감지 → scroll useLayoutEffect보다 먼저 선언해야 순서 보장
    useLayoutEffect(() => {
        const params = new URLSearchParams(location.search);
        const entryKey = [
            location.pathname,
            params.get('nav') || '',
            params.get('scrollToToday') === 'true' ? 'today' : '',
            params.get('id') || '',
            params.get('highlightOnly') || '',
        ].join('|');

        const isFirstEntry = lastCalendarEntryKeyRef.current === null;
        const isRouteReentry = isFirstEntry || lastCalendarEntryKeyRef.current !== entryKey;
        lastCalendarEntryKeyRef.current = entryKey;

        if (!isRouteReentry) return;

        initialJumpDoneRef.current = false;
        userInteractedRef.current = false;
        shouldScrollToTodayRef.current = displayMode === 'calendar';
        skipCurrentMonthEffectRef.current = true;

        if (displayMode !== 'calendar') {
            initialJumpDoneRef.current = true;
            shouldScrollToTodayRef.current = false;
            if (containerRef.current) containerRef.current.style.visibility = 'visible';
            return;
        }

        // React state 배치로 인해 state 대신 ref로 직접 DOM 숨김
        if (containerRef.current) containerRef.current.style.visibility = 'hidden';
    }, [displayMode, location.pathname, location.search]);

    useEffect(() => {
        const handleInteraction = (e: Event) => {
            const isAutoTodayScrollPending = shouldScrollToTodayRef.current || !initialJumpDoneRef.current;
            if (Date.now() - mountTimeRef.current < 1500 && !isAutoTodayScrollPending) return;
            const target = e.target as HTMLElement;
            if (target.closest('button') || target.closest('a') || target.getAttribute('role') === 'button') {
                return;
            }
            todayScrollRunIdRef.current += 1;
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
        const isAnyModalOpen = showRegisterModal || showCalendarNavigator || eventModal.showEditModal || eventModal.showPasswordModal || !!eventModal.selectedEvent;

        if (isAnyModalOpen) {
            // [Fix] overflow:hidden 방식으로 스크롤 잠금
            // position:fixed 방식은 body 레이아웃을 변경하여 좌표계와 워프 로직이 깨지므로 사용하지 않음
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
    }, [showRegisterModal, showCalendarNavigator, eventModal.showEditModal, eventModal.showPasswordModal, eventModal.selectedEvent]);


    // [Precision Fix] 캘린더 위치 및 높이 사전 계산기 (Self-Healing Logic)
    const calendarMetrics = useMemo(() => {
        const today = new Date();
        const firstDay = (new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).getDay() + 6) % 7;
        const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
        const totalWeeks = Math.ceil((daysInMonth + firstDay) / 7);

        const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
        // [Dynamic Fix] window.innerWidth(스크롤바 포함) 대신 clientWidth(스크롤바 제외) 사용
        // 실제 CSS Grid가 사용하는 가용 너비와 100% 일치시킴
        const vw = typeof document !== 'undefined' ? document.documentElement.clientWidth : 650;
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

        const eventsByDate: Record<string, number> = {};

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
            if (event.event_dates && event.event_dates.length > 0) {
                const isClass = event.category && ['class', 'regular', 'club'].includes(event.category.toLowerCase());
                const sortedDates = [...event.event_dates].sort();
                event.event_dates.forEach((d: string) => {
                    const dateStr = getLocalStr(d);
                    if (!dateStr) return;
                    if (isClass && dateStr !== getLocalStr(sortedDates[0])) return;
                    addToDate(eventsByDate, dateStr);
                });
            } else {
                const startStr = event.start_date || event.date || event.schedule_date;
                const endStr = event.end_date || event.date || event.schedule_date;
                const startDate = startStr ? new Date(startStr) : null;
                const endDate = endStr ? new Date(endStr) : null;

                if (startDate && endDate && !isNaN(startDate.getTime()) && !isNaN(endDate.getTime())) {
                    const curr = new Date(startDate);
                    let limit = 0;
                    while (curr <= endDate && limit < 365) {
                        const dateStr = `${curr.getFullYear()}-${String(curr.getMonth() + 1).padStart(2, '0')}-${String(curr.getDate()).padStart(2, '0')}`;
                        addToDate(eventsByDate, dateStr);
                        curr.setDate(curr.getDate() + 1);
                        limit++;
                    }
                } else {
                    const dateStr = getLocalStr(startStr);
                    if (dateStr) addToDate(eventsByDate, dateStr);
                }
            }
        });

        let sumPrecedingHeight = 0;
        let cumulativePageHeight = 0;
        const rowGap = vw <= 430 ? 4 : 5;
        const minCellHeight = vw <= 430 ? 30 : 112;
        const dayHeaderHeight = vw <= 430 ? 18 : 28;
        const eventChipHeight = vw <= 430 ? 64 : 68;
        const eventGap = vw <= 430 ? 3 : 4;
        const isSameMonth = currentMonth.getFullYear() === today.getFullYear() &&
            currentMonth.getMonth() === today.getMonth();
        const todayWeekIndex = Math.floor((today.getDate() + firstDay - 1) / 7);

        const containerPaddingTop = 12;

        for (let w = 0; w < totalWeeks; w++) {
            let maxDayHeight = minCellHeight;
            for (let d = 0; d < 7; d++) {
                const dayOffset = (w * 7) + d - firstDay;
                if (dayOffset >= 0 && dayOffset < daysInMonth) {
                    const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), dayOffset + 1);
                    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
                    const eventCount = eventsByDate[dateStr] || 0;
                    const dayHeight = Math.max(
                        minCellHeight,
                        dayHeaderHeight + eventCount * eventChipHeight + Math.max(0, eventCount - 1) * eventGap + 12
                    );
                    if (dayHeight > maxDayHeight) maxDayHeight = dayHeight;
                }
            }

            if (isSameMonth && w < todayWeekIndex) {
                sumPrecedingHeight += (maxDayHeight + rowGap);
            }

            cumulativePageHeight += maxDayHeight;
            if (w < totalWeeks - 1) cumulativePageHeight += rowGap;
        }

        let finalScrollTargetY = 0;
        if (isSameMonth) {
            finalScrollTargetY = containerPaddingTop + sumPrecedingHeight;
        }

        const lastRowExtraPadding = 36;

        return {
            targetY: finalScrollTargetY,
            totalHeight: cumulativePageHeight + containerPaddingTop + lastRowExtraPadding,
            isSameMonth,
            debugTitleHeight: eventChipHeight
        };
    }, [currentMonth, calendarData, tabFilter, danceScope]);

    const handleScrollToToday = useCallback((behavior: 'smooth' | 'auto' | 'instant' = 'smooth', forced = false, onDone?: () => void) => {
        if (!forced && userInteractedRef.current) { onDone?.(); return; }
        if (!calendarMetrics.isSameMonth && !forced) { onDone?.(); return; }

        let retryCount = 0;
        let didFinish = false;
        const maxRetries = 14;
        const runId = ++todayScrollRunIdRef.current;
        const isCurrentRun = () => todayScrollRunIdRef.current === runId;

        const finish = () => {
            if (didFinish) return;
            didFinish = true;
            onDone?.();
        };

        const computeTarget = () => {
            const gridEl = document.querySelector('[data-active-month="true"] .calendar-grid-container');
            const todayEl = document.querySelector('.calendar-cell-fullscreen.is-today');
            const navHeaderEl = document.querySelector('.calendar-live-sticky-controls')
                || document.querySelector('.shell-header.global-header-fixed');
            const gridRect = getSafeRect(gridEl);

            if (!gridRect) return null;
            if (!todayEl && retryCount < maxRetries) return null;

            const navRect = getSafeRect(navHeaderEl);
            const headerBottom = navRect ? navRect.bottom : 0;
            const gridAbsoluteTop = gridRect.top + window.scrollY;

            if (todayEl) {
                const todayRect = getSafeRect(todayEl);
                if (todayRect) {
                    const finalY = (todayRect.top + window.scrollY) - gridAbsoluteTop;
                    return Math.max(0, gridAbsoluteTop + finalY - headerBottom);
                }
                if (retryCount < maxRetries) return null;
            }

            return Math.max(0, gridAbsoluteTop + calendarMetrics.targetY - headerBottom);
        };

        const performWarp = () => {
            if (!isCurrentRun()) {
                finish();
                return;
            }

            const scrollTarget = computeTarget();
            if (scrollTarget === null) {
                if (retryCount >= maxRetries) {
                    finish();
                    return;
                }
                retryCount++;
                requestAnimationFrame(performWarp);
                return;
            }

            const scrollToComputedTarget = (scrollBehavior: ScrollBehavior) => {
                if (!isCurrentRun()) return;
                const nextTarget = computeTarget();
                if (nextTarget === null) return;
                if (Math.abs(window.scrollY - nextTarget) > 2) {
                    window.scrollTo({ top: nextTarget, behavior: scrollBehavior });
                }
            };

            window.scrollTo({ top: scrollTarget, behavior: behavior as ScrollBehavior });

            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    if (!isCurrentRun()) {
                        finish();
                        return;
                    }
                    scrollToComputedTarget('auto');
                    [140, 360, 760].forEach((delay) => {
                        window.setTimeout(() => scrollToComputedTarget('auto'), delay);
                    });
                    finish();
                });
            });
        };

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                if (!isCurrentRun()) {
                    finish();
                    return;
                }
                performWarp();
            });
        });

    }, [calendarMetrics]);




    useLayoutEffect(() => {
        // [Modal Guard] 모달 열림 상태에서는 body가 position:fixed이므로 워프 스킵
        const isAnyModalOpen = showRegisterModal || eventModal.showEditModal || eventModal.showPasswordModal || !!eventModal.selectedEvent;
        if (isAnyModalOpen) return;

        // 리스트/지도 모드는 오늘 위치 워프 대상이 아니므로 숨김 상태만 즉시 해제한다.
        if (displayMode !== 'calendar') {
            initialJumpDoneRef.current = true;
            shouldScrollToTodayRef.current = false;
            if (containerRef.current) containerRef.current.style.visibility = 'visible';
            return;
        }

        if (calendarData && (!initialJumpDoneRef.current || shouldScrollToTodayRef.current)) {
            const showPage = () => {
                if (containerRef.current) containerRef.current.style.visibility = 'visible';
            };

            if (!initialJumpDoneRef.current) {
                initialJumpDoneRef.current = true;
                showPage();
                return;
            }

            shouldScrollToTodayRef.current = false;
            if (calendarMetrics.isSameMonth) {
                handleScrollToToday('instant', true, showPage);
            } else {
                showPage();
            }
        }
    }, [calendarMetrics.isSameMonth, !!calendarData, handleScrollToToday, tabFilter, calendarMetrics.targetY, location.key, displayMode]);

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

    const moveCalendarToToday = useCallback(() => {
        userInteractedRef.current = false;
        const today = new Date();
        const isSameMonth = currentMonth.getFullYear() === today.getFullYear() &&
            currentMonth.getMonth() === today.getMonth();

        if (isSameMonth) {
            shouldScrollToTodayRef.current = true;
            handleScrollToToday('instant', true);
        } else {
            shouldScrollToTodayRef.current = true;
            handleMonthChange(new Date(today.getFullYear(), today.getMonth(), 1));
        }
    }, [currentMonth, handleMonthChange, handleScrollToToday]);

    const moveToToday = useCallback(() => {
        if (displayMode === 'list') {
            const today = new Date();
            shouldScrollToTodayRef.current = false;
            userInteractedRef.current = false;
            setCurrentMonth(prev => {
                if (prev.getFullYear() === today.getFullYear() && prev.getMonth() === today.getMonth()) return prev;
                return new Date(today.getFullYear(), today.getMonth(), 1);
            });
            setListTodayScrollSignal(signal => signal + 1);
            return;
        }

        moveCalendarToToday();
    }, [displayMode, moveCalendarToToday]);

    useEffect(() => {
        const urlParams = new URLSearchParams(location.search);
        const nextMode = normalizeCalendarDisplayMode(urlParams.get('view'));
        if (nextMode !== displayMode) {
            setDisplayMode(nextMode);
        }

        if (urlParams.get('scrollToToday') !== 'true') {
            scrollToTodayConsumedRef.current = false;
            return;
        }
        if (scrollToTodayConsumedRef.current) return;
        scrollToTodayConsumedRef.current = true;

        setDisplayMode('calendar');
        userInteractedRef.current = false;
        shouldScrollToTodayRef.current = true;

        const frame = requestAnimationFrame(() => {
            moveCalendarToToday();
        });

        return () => cancelAnimationFrame(frame);
    }, [location.search, moveCalendarToToday]);

    const handleNavigatorMonthSelect = useCallback((monthIndex: number) => {
        setShowCalendarNavigator(false);
        handleMonthChange(new Date(navigatorYear, monthIndex, 1));
    }, [handleMonthChange, navigatorYear]);

    const handleNavigatorToday = useCallback(() => {
        setShowCalendarNavigator(false);
        moveToToday();
    }, [moveToToday]);

    const handleTabClick = (filter: 'all' | 'social-events' | 'classes') => {
        if (displayMode === 'list') {
            setTabFilter(filter);
            return;
        }

        const today = new Date();
        const isTodayMonth = currentMonth.getFullYear() === today.getFullYear() &&
            currentMonth.getMonth() === today.getMonth();

        if (isTodayMonth) {
            shouldScrollToTodayRef.current = true;
            userInteractedRef.current = false;
        }
        setTabFilter(filter);

        if (isTodayMonth && tabFilter === filter) {
            handleScrollToToday('instant', true);
        }
    };

    const handleDanceScopeClick = (scope: CalendarDanceScope) => {
        if (scope === danceScope) return;

        setDanceScope(scope);
        setSelectedDate(null);

        const nextParams = new URLSearchParams(location.search);
        nextParams.set('dance', scope);
        nextParams.set('view', displayMode);
        nextParams.delete('scrollToToday');
        nextParams.delete('nav');
        navigate({ pathname: location.pathname, search: nextParams.toString() }, { replace: false });

        if (displayMode === 'calendar') {
            userInteractedRef.current = false;
            shouldScrollToTodayRef.current = true;
        } else {
            window.scrollTo({ top: 0, behavior: 'instant' });
        }
    };

    useEffect(() => {
        const urlParams = new URLSearchParams(location.search);
        const nextScope = normalizeVisibleDanceScope(urlParams.get('dance'), isAdmin);
        if (nextScope !== danceScope) {
            setDanceScope(nextScope);
            setSelectedDate(null);
        }
        if (isAuthCheckComplete && !isAdmin && urlParams.has('dance')) {
            urlParams.delete('dance');
            navigate({ pathname: location.pathname, search: urlParams.toString() }, { replace: true });
        }
    }, [danceScope, isAdmin, isAuthCheckComplete, location.pathname, location.search, navigate]);

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
        const handleOpenCalendarNavigator = () => {
            setNavigatorYear(currentMonth.getFullYear());
            setShowCalendarNavigator(true);
        };
        const handlePrevMonth = () => {
            handleNavigateMonth('prev');
        };
        const handleNextMonth = () => {
            handleNavigateMonth('next');
        };

        window.addEventListener('setFullscreenMode', handleSetFullscreenMode);
        window.addEventListener('openCalendarSearch', handleOpenCalendarSearch);
        window.addEventListener('openCalendarNavigator', handleOpenCalendarNavigator);
        window.addEventListener('prevMonth', handlePrevMonth);
        window.addEventListener('nextMonth', handleNextMonth);
        window.addEventListener('goToToday', moveToToday);

        return () => {
            window.removeEventListener('setFullscreenMode', handleSetFullscreenMode);
            window.removeEventListener('openCalendarSearch', handleOpenCalendarSearch);
            window.removeEventListener('openCalendarNavigator', handleOpenCalendarNavigator);
            window.removeEventListener('prevMonth', handlePrevMonth);
            window.removeEventListener('nextMonth', handleNextMonth);
            window.removeEventListener('goToToday', moveToToday);
        };
    }, [navigate, handleNavigateMonth, currentMonth, moveToToday]);

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
            <section className={`calendar-live-shell calendar-live-shell--${displayMode}`}>
                <div className={`calendar-live-sticky-controls ${displayMode === 'calendar' ? 'has-weekdays' : ''}`}>
                    <header className="calendar-live-topbar">
                        <button
                            type="button"
                            className="calendar-live-topbar-title"
                            onClick={() => {
                                setNavigatorYear(currentMonth.getFullYear());
                                setShowCalendarNavigator(true);
                            }}
                            aria-label={`${currentMonth.getFullYear()}년 ${currentMonth.getMonth() + 1}월 선택`}
                        >
                            <span>{displayMode === 'calendar' ? '월간 캘린더' : displayMode === 'list' ? 'List View' : 'Map View'}</span>
                            <strong>{currentMonth.getFullYear()}.{String(currentMonth.getMonth() + 1).padStart(2, '0')}</strong>
                        </button>

                        <div className="calendar-live-toolbar">
                            <div className="calendar-view-switch" aria-label="캘린더 보기 방식">
                                <button
                                    className={`calendar-tab-btn calendar-tab-btn--view ${displayMode === 'calendar' ? 'active' : ''}`}
                                    onClick={() => handleSetDisplayMode('calendar')}
                                    title="캘린더 보기"
                                >
                                    캘린더
                                </button>
                                <button
                                    className={`calendar-tab-btn calendar-tab-btn--view ${displayMode === 'list' ? 'active' : ''}`}
                                    onClick={() => handleSetDisplayMode('list')}
                                    title="리스트 보기"
                                >
                                    리스트
                                </button>
                                <button
                                    className={`calendar-tab-btn calendar-tab-btn--view ${displayMode === 'map' ? 'active' : ''}`}
                                    onClick={() => handleSetDisplayMode('map')}
                                    title="지도 보기"
                                >
                                    지도
                                </button>
                            </div>
                            <button
                                type="button"
                                className="calendar-live-today-btn"
                                onClick={moveToToday}
                            >
                                오늘
                            </button>
                        </div>
                    </header>

                    <div className="calendar-dance-scope-switch" aria-label="장르 선택">
                        {visibleDanceScopeOptions.map((option) => (
                            <button
                                key={option.key}
                                type="button"
                                className={`calendar-dance-scope-btn ${danceScope === option.key ? 'active' : ''}`}
                                onClick={() => handleDanceScopeClick(option.key)}
                                title={option.desc}
                            >
                                <strong>{option.label}</strong>
                                <span>{option.desc}</span>
                            </button>
                        ))}
                    </div>

                    <div className="calendar-filter-switch" aria-label="캘린더 필터">
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

                    {displayMode === 'calendar' && (
                        <div className="calendar-sticky-weekdays" aria-hidden="true">
                            {CALENDAR_WEEKDAY_LABELS.map((dayLabel, index) => (
                                <span key={dayLabel} className="calendar-sticky-weekday-item">
                                    <span className="calendar-sticky-weekday-text">{dayLabel}</span>
                                    {scrollWeekDateLabels[index] && (
                                        <em className="calendar-sticky-date-text">{scrollWeekDateLabels[index]}</em>
                                    )}
                                </span>
                            ))}
                        </div>
                    )}
                </div>

                <section className="calendar-page-overview" aria-label="캘린더 요약">
                    <div className="calendar-page-overview-card">
                        <span>오늘 일정</span>
                        <strong>{calendarPageStats.todayCount}</strong>
                    </div>
                    <div className="calendar-page-overview-card">
                        <span>선택 범위</span>
                        <strong>{calendarPageStats.weekCount}</strong>
                    </div>
                    <div className="calendar-page-overview-card">
                        <span>장소</span>
                        <strong>{calendarPageStats.venueCount}</strong>
                    </div>
                    <div className="calendar-page-overview-card">
                        <span>필터</span>
                        <strong>{getDanceScopeLabel(danceScope)} · {tabFilter === 'all' ? '전체' : tabFilter === 'social-events' ? '소셜&행사' : '강습'}</strong>
                    </div>
                </section>

                {displayMode === 'map' && (
                    <CalendarMapView
                        danceScope={danceScope}
                        onEventClick={handleCalendarMapEventClick}
                    />
                )}

                {displayMode === 'list' && (
                    <div className="calendar-page-main calendar-page-main--list">
                        <CalendarListView
                            events={listViewData.data?.events || []}
                            socialSchedules={listViewData.data?.socialSchedules || []}
                            tabFilter={tabFilter}
                            danceScope={danceScope}
                            onEventClick={(event) => eventModal.setSelectedEvent(event as any)}
                            isLoading={listViewData.isLoading}
                            todayScrollSignal={listTodayScrollSignal}
                        />
                    </div>
                )}

                <div
                    className="calendar-page-main"
                    style={{ minHeight: calendarMetrics.totalHeight, display: (displayMode === 'list' || displayMode === 'map') ? 'none' : undefined }}
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
                        danceScope={danceScope}
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
            </section>

            {showCalendarNavigator && (
                <div
                    className="calendar-navigator-overlay"
                    role="presentation"
                    onMouseDown={(event) => {
                        if (event.target === event.currentTarget) {
                            setShowCalendarNavigator(false);
                        }
                    }}
                >
                    <section
                        className="calendar-navigator-panel"
                        role="dialog"
                        aria-modal="true"
                        aria-label="달력 월 선택"
                    >
                        <header className="calendar-navigator-header">
                            <button
                                type="button"
                                className="calendar-navigator-icon-btn"
                                onClick={() => setNavigatorYear((year) => year - 1)}
                                aria-label="이전 해"
                            >
                                <i className="ri-arrow-left-s-line" />
                            </button>
                            <div className="calendar-navigator-title">
                                <span>이동할 달 선택</span>
                                <strong>{navigatorYear}</strong>
                            </div>
                            <button
                                type="button"
                                className="calendar-navigator-icon-btn"
                                onClick={() => setNavigatorYear((year) => year + 1)}
                                aria-label="다음 해"
                            >
                                <i className="ri-arrow-right-s-line" />
                            </button>
                            <button
                                type="button"
                                className="calendar-navigator-close"
                                onClick={() => setShowCalendarNavigator(false)}
                                aria-label="닫기"
                            >
                                <i className="ri-close-line" />
                            </button>
                        </header>
                        <div className="calendar-navigator-month-grid">
                            {CALENDAR_MONTH_LABELS.map((monthLabel, monthIndex) => {
                                const today = new Date();
                                const isCurrentMonth = navigatorYear === currentMonth.getFullYear() && monthIndex === currentMonth.getMonth();
                                const isTodayMonth = navigatorYear === today.getFullYear() && monthIndex === today.getMonth();

                                return (
                                    <button
                                        key={monthLabel}
                                        type="button"
                                        className={`calendar-navigator-month-btn ${isCurrentMonth ? 'is-current' : ''} ${isTodayMonth ? 'is-today-month' : ''}`}
                                        onClick={() => handleNavigatorMonthSelect(monthIndex)}
                                        aria-current={isCurrentMonth ? 'date' : undefined}
                                    >
                                        <span>{monthLabel}</span>
                                        {isTodayMonth && <em>오늘</em>}
                                    </button>
                                );
                            })}
                        </div>
                        <footer className="calendar-navigator-footer">
                            <button type="button" onClick={handleNavigatorToday}>
                                오늘로 이동
                            </button>
                            <button type="button" onClick={() => setShowCalendarNavigator(false)}>
                                닫기
                            </button>
                        </footer>
                    </section>
                </div>
            )}

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
                            searchMode="all"
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
