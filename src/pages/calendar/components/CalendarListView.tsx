import React, { useEffect, useMemo, useRef } from "react";
import type { Event as AppEvent } from "../../../lib/supabase";
import { getCardThumbnail } from "../../../utils/getEventThumbnail";
import { isEventInDanceScope, type DanceScope } from "../../../utils/danceTaxonomy";

interface CalendarListViewProps {
    events: AppEvent[];
    socialSchedules: any[];
    tabFilter: 'all' | 'social-events' | 'classes';
    danceScope?: DanceScope | string;
    onEventClick: (event: AppEvent) => void;
    isLoading?: boolean;
    todayScrollSignal?: number;
}

function getEventDate(e: AppEvent): string {
    return e.start_date || e.date || "";
}

function getExplicitEventDates(e: AppEvent): string[] {
    if (!Array.isArray(e.event_dates) || e.event_dates.length === 0) return [];

    return Array.from(
        new Set(
            e.event_dates
                .map((date) => String(date || "").substring(0, 10))
                .filter(Boolean)
        )
    ).sort();
}

function getEventListDate(e: AppEvent): string {
    const explicitDates = getExplicitEventDates(e);
    if (explicitDates.length > 0) {
        return explicitDates[0];
    }

    return getEventDate(e);
}

function getCategoryLabel(e: AppEvent): { label: string; cls: string } {
    const cat = e.category || "";
    if (cat === "social") return { label: "소셜", cls: "list-badge--social" };
    if (cat === "class") return { label: "강습", cls: "list-badge--class" };
    if (cat === "club") return { label: "동호회", cls: "list-badge--club" };
    return { label: "행사", cls: "list-badge--event" };
}

function getPlaceText(e: AppEvent): string {
    return e.venue_name || e.place_name || e.location || e.address || "장소 정보 없음";
}

function formatDate(dateStr: string): string {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    const days = ["일", "월", "화", "수", "목", "금", "토"];
    return `${d.getMonth() + 1}/${d.getDate()}(${days[d.getDay()]})`;
}

export default function CalendarListView({ events, socialSchedules, tabFilter, danceScope = 'swing', onEventClick, isLoading, todayScrollSignal = 0 }: CalendarListViewProps) {
    const today = new Date().toLocaleDateString('en-CA');
    const containerRef = useRef<HTMLDivElement | null>(null);

    const filtered = useMemo(() => {
        const allItems: AppEvent[] = [];

        // 이벤트 필터링: 리스트도 캘린더와 같은 시작 날짜 기준으로만 노출한다.
        events.forEach(e => {
            const listDate = getEventListDate(e);
            if (!listDate || listDate < today) return;
            if (!isEventInDanceScope(e as any, danceScope)) return;
            if (tabFilter === 'social-events' && ['class', 'regular', 'club'].includes(String(e.category).toLowerCase())) return;
            if (tabFilter === 'classes' && !['class', 'regular', 'club'].includes(String(e.category).toLowerCase())) return;
            allItems.push(e);
        });

        // 소셜 스케줄 (social-events 또는 all일 때만)
        if (tabFilter !== 'classes') {
            socialSchedules.forEach(s => {
                const dateStr = s.date || s.start_date || "";
                if (dateStr < today) return;
                if (!isEventInDanceScope(s as any, danceScope)) return;
                allItems.push({ ...s, _isSocial: true } as any);
            });
        }

        // 날짜순 정렬
        return allItems.sort((a, b) => {
            const da = getEventListDate(a);
            const db = getEventListDate(b);
            return da.localeCompare(db);
        });
    }, [danceScope, events, socialSchedules, tabFilter, today]);

    // 날짜별 그룹핑
    const grouped = useMemo(() => {
        const map = new Map<string, AppEvent[]>();
        filtered.forEach(e => {
            const d = getEventListDate(e);
            if (!map.has(d)) map.set(d, []);
            map.get(d)!.push(e);
        });
        return Array.from(map.entries());
    }, [filtered]);

    useEffect(() => {
        if (!todayScrollSignal || isLoading || grouped.length === 0) return;

        const frame = requestAnimationFrame(() => {
            const container = containerRef.current;
            if (!container) return;

            const dateGroups = Array.from(container.querySelectorAll<HTMLElement>('[data-list-date]'));
            const todayGroup = dateGroups.find(group => group.dataset.listDate === today);
            const nextUpcomingGroup = dateGroups.find(group => (group.dataset.listDate || '') >= today);
            const target = todayGroup || nextUpcomingGroup || dateGroups[0];
            if (!target || !target.isConnected) return;

            const stickyControls = document.querySelector<HTMLElement>('.calendar-live-sticky-controls');
            const stickyBottom = stickyControls?.isConnected ? stickyControls.getBoundingClientRect().bottom : 0;
            const targetY = target.getBoundingClientRect().top + window.scrollY - stickyBottom - 10;
            window.scrollTo({ top: Math.max(0, targetY), behavior: 'instant' });
        });

        return () => cancelAnimationFrame(frame);
    }, [grouped, isLoading, today, todayScrollSignal]);

    if (isLoading) return (
        <div className="cal-list-empty">
            <i className="ri-loader-4-line" style={{ animation: 'spin 1s linear infinite' }} />
            <p>불러오는 중...</p>
        </div>
    );

    if (filtered.length === 0) {
        return (
            <div className="cal-list-empty">
                <i className="ri-calendar-line" />
                <p>표시할 이벤트가 없습니다</p>
            </div>
        );
    }

    return (
        <div className="cal-list-container" ref={containerRef}>
            {grouped.map(([dateStr, items]) => (
                <div key={dateStr} className="cal-list-group" data-list-date={dateStr}>
                    <div className="cal-list-date-header">{formatDate(dateStr)}</div>
                    {items.map(e => {
                        const thumb = getCardThumbnail(e as any);
                        const { label, cls } = getCategoryLabel(e);
                        const place = getPlaceText(e);
                        return (
                            <div
                                key={e.id}
                                className="cal-list-card"
                                onClick={() => onEventClick(e)}
                            >
                                {thumb && (
                                    <img
                                        className="cal-list-card__img"
                                        src={thumb}
                                        alt={e.title}
                                        loading="lazy"
                                    />
                                )}
                                <div className="cal-list-card__body">
                                    <p className="cal-list-card__loc">
                                        <i className="ri-map-pin-line" />{place}
                                    </p>
                                    <p className="cal-list-card__title">{e.title}</p>
                                    <span className={`cal-list-badge ${cls}`}>{label}</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            ))}
        </div>
    );
}
