import React, { useMemo } from "react";
import type { Event as AppEvent } from "../../../lib/supabase";
import { getCardThumbnail } from "../../../utils/getEventThumbnail";

interface CalendarListViewProps {
    events: AppEvent[];
    socialSchedules: any[];
    tabFilter: 'all' | 'social-events' | 'classes';
    onEventClick: (event: AppEvent) => void;
    isLoading?: boolean;
}

function getEventDate(e: AppEvent): string {
    return e.start_date || e.date || "";
}

function getCategoryLabel(e: AppEvent): { label: string; cls: string } {
    const cat = e.category || "";
    if (cat === "social") return { label: "소셜", cls: "list-badge--social" };
    if (cat === "class") return { label: "강습", cls: "list-badge--class" };
    if (cat === "club") return { label: "동호회", cls: "list-badge--club" };
    return { label: "행사", cls: "list-badge--event" };
}

function formatDate(dateStr: string): string {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    const days = ["일", "월", "화", "수", "목", "금", "토"];
    return `${d.getMonth() + 1}/${d.getDate()}(${days[d.getDay()]})`;
}

export default function CalendarListView({ events, socialSchedules, tabFilter, onEventClick, isLoading }: CalendarListViewProps) {
    if (isLoading) return (
        <div className="cal-list-empty">
            <i className="ri-loader-4-line" style={{ animation: 'spin 1s linear infinite' }} />
            <p>불러오는 중...</p>
        </div>
    );
    const today = new Date().toLocaleDateString('en-CA');

    const filtered = useMemo(() => {
        const allItems: AppEvent[] = [];

        // 이벤트 필터링 (end_date 또는 date가 오늘 이상인 것)
        events.forEach(e => {
            const startDate = getEventDate(e);
            if (startDate < today) return;
            if (tabFilter === 'social-events' && e.category === 'class') return;
            if (tabFilter === 'classes' && e.category !== 'class') return;
            allItems.push(e);
        });

        // 소셜 스케줄 (social-events 또는 all일 때만)
        if (tabFilter !== 'classes') {
            socialSchedules.forEach(s => {
                const dateStr = s.date || s.start_date || "";
                if (dateStr < today) return;
                allItems.push({ ...s, _isSocial: true } as any);
            });
        }

        // 날짜순 정렬
        return allItems.sort((a, b) => {
            const da = getEventDate(a);
            const db = getEventDate(b);
            return da.localeCompare(db);
        });
    }, [events, socialSchedules, tabFilter, today]);

    // 날짜별 그룹핑
    const grouped = useMemo(() => {
        const map = new Map<string, AppEvent[]>();
        filtered.forEach(e => {
            const d = getEventDate(e);
            if (!map.has(d)) map.set(d, []);
            map.get(d)!.push(e);
        });
        return Array.from(map.entries());
    }, [filtered]);

    if (filtered.length === 0) {
        return (
            <div className="cal-list-empty">
                <i className="ri-calendar-line" />
                <p>표시할 이벤트가 없습니다</p>
            </div>
        );
    }

    return (
        <div className="cal-list-container">
            {grouped.map(([dateStr, items]) => (
                <div key={dateStr} className="cal-list-group">
                    <div className="cal-list-date-header">{formatDate(dateStr)}</div>
                    {items.map(e => {
                        const thumb = getCardThumbnail(e as any);
                        const { label, cls } = getCategoryLabel(e);
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
                                    <span className={`cal-list-badge ${cls}`}>{label}</span>
                                    <p className="cal-list-card__title">{e.title}</p>
                                    {e.location && (
                                        <p className="cal-list-card__loc">
                                            <i className="ri-map-pin-line" />{e.location}
                                        </p>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            ))}
        </div>
    );
}
