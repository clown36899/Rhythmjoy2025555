import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
// Styles
// Styles
// import "../../../styles/EventListSections.css"; // Migrated to events.css

import type { Event } from "../../../utils/eventListUtils";
import type { SocialSchedule } from "../../../../social/types";
import type { HomeSectionVisibility } from "../hooks/useHomeSectionVisibility";
import { DEFAULT_HOME_SECTION_VISIBILITY } from "../hooks/useHomeSectionVisibility";

import { EventPreviewRow } from "./EventPreviewRow";
import { NewEventsBanner } from "../../NewEventsBanner";
import {
    calendarDanceScopeOptions,
    getVisibleDanceScopeOptions,
    normalizeVisibleDanceScope,
} from "../../../../../utils/danceTaxonomy";
import { NEB_MAX_ITEMS } from "../hooks/useNebFilterSettings";
import {
    selectHomeAdDisplayEvents,
} from "../utils/homeAdPriority";
import {
    getTodaySchedulePlaceLabel,
    getTodaySchedulePrimaryText,
    getTodayScheduleWeekdayLabel,
    shouldShowTodaySchedulePlaceLine,
} from "../utils/todayScheduleDisplay";


interface EventPreviewSectionProps {
    isSocialSchedulesLoading: boolean;
    todayCalendarSchedules: SocialSchedule[];
    todaySocialSchedules: SocialSchedule[];
    thisWeekSocialSchedules: SocialSchedule[];
    refreshSocialSchedules: () => Promise<void>;
    socialSchedules?: SocialSchedule[]; // 👈 전체 원본 리스트 추가 (통합 섹션용)
    futureEvents: Event[];
    regularClasses: Event[];
    clubLessons: Event[];
    clubRegularClasses: Event[];
    newlyRegisteredEvents: Event[]; // 👈 신규 등록 이벤트 (24시간)
    homeAdMaxItems: number;
    benefitEventUnreadCount: number;
    onBenefitEventsOpen: () => void;
    favoriteEventsList: Event[];
    // events: Event[]; // Removed for BillboardSection

    onEventClick: (event: Event) => void;
    onEventHover?: (id: number | string | null) => void;
    highlightEvent: { id: number | string } | null;
    defaultThumbnailClass: string;
    defaultThumbnailEvent: string;
    effectiveFavoriteIds: Set<number | string>;
    handleToggleFavorite: (id: number | string, e: React.MouseEvent) => void;
    searchParams: URLSearchParams;
    setSearchParams: (params: URLSearchParams) => void;
    sectionVisibility?: HomeSectionVisibility;
    // onSectionViewModeChange: (mode: 'preview' | 'viewAll-events' | 'viewAll-classes') => void;
}

interface HomeNewEventsDesktopSplitProps {
    danceScope: HomeAdDanceScope;
    onDanceScopeChange: (scope: HomeAdDanceScope) => void;
    events: Event[];
    todaySchedules: SocialSchedule[];
    onEventClick: (event: Event) => void;
    defaultThumbnailClass: string;
    defaultThumbnailEvent: string;
    maxItems: number;
    benefitEventUnreadCount: number;
    onBenefitEventsOpen: () => void;
}

type HomeAdDanceScope = (typeof calendarDanceScopeOptions)[number]["key"];

const getTodayMonthDayLabel = () => {
    const today = new Date();
    return `${today.getMonth() + 1}월 ${today.getDate()}일`;
};

const HomeTodaySchedulePanel: React.FC<{
    schedules: SocialSchedule[];
    onEventClick: (event: Event) => void;
}> = ({ schedules, onEventClick }) => {
    if (schedules.length === 0) return null;

    const todayMonthDayLabel = getTodayMonthDayLabel();
    const todayWeekdayLabel = getTodayScheduleWeekdayLabel();

    return (
        <section className="home-neb-today-panel" aria-label="오늘 일정">
            <div className="home-neb-today-head">
                <span className="home-neb-today-title">오늘일정{todayWeekdayLabel}</span>
                <span className="home-neb-today-head-meta">
                    <time dateTime={new Date().toISOString().slice(0, 10)}>{todayMonthDayLabel}</time>
                </span>
            </div>
            <div className="home-neb-today-list">
                {schedules.map((schedule, index) => {
                    const place = getTodaySchedulePlaceLabel(schedule);
                    const primaryText = getTodaySchedulePrimaryText(schedule);
                    const showPlaceLine = shouldShowTodaySchedulePlaceLine(schedule);

                    return (
                        <button
                            key={schedule.id}
                            type="button"
                            className="home-neb-today-item"
                            onClick={() => onEventClick(schedule as unknown as Event)}
                        >
                            <i aria-hidden="true">{index + 1}</i>
                            <span>
                                <strong>{primaryText}</strong>
                                {showPlaceLine && <small>장소 : {place}</small>}
                            </span>
                        </button>
                    );
                })}
            </div>
        </section>
    );
};

const HomeNewEventsDesktopSplit: React.FC<HomeNewEventsDesktopSplitProps> = ({
    danceScope,
    onDanceScopeChange,
    events,
    todaySchedules,
    onEventClick,
    defaultThumbnailClass,
    defaultThumbnailEvent,
    maxItems,
    benefitEventUnreadCount,
    onBenefitEventsOpen,
}) => {
    const visibleDanceScopeOptions = useMemo(() => getVisibleDanceScopeOptions(true), []);
    const [headerScopeTarget, setHeaderScopeTarget] = useState<HTMLElement | null>(null);
    const displayEvents = useMemo(() => selectHomeAdDisplayEvents({
        primaryEvents: events,
        maxItems: Math.min(maxItems, NEB_MAX_ITEMS),
    }), [events, maxItems]);
    const [activeIndex, setActiveIndex] = useState(0);
    const displayEventKey = useMemo(() => displayEvents.map((event) => event.id).join("|"), [displayEvents]);
    useEffect(() => {
        if (displayEvents.length === 0) {
            setActiveIndex(0);
            return;
        }
        setActiveIndex(0);
    }, [displayEventKey, danceScope, displayEvents.length]);
    const safeActiveIndex = displayEvents.length > 0 ? activeIndex % displayEvents.length : 0;
    const shouldShowScopeStrip = visibleDanceScopeOptions.length > 1;

    useEffect(() => {
        if (!shouldShowScopeStrip || typeof document === "undefined") return;
        setHeaderScopeTarget(document.getElementById("home-neb-header-scope-target"));
    }, [shouldShowScopeStrip]);

    const renderScopeStrip = (variant: "inline" | "header") => (
        <div
            className={`home-neb-admin-scope-strip home-neb-admin-scope-strip--${variant}`}
            aria-label="메인 광고 장르 선택"
        >
            {visibleDanceScopeOptions.map((option) => (
                <button
                    key={option.key}
                    type="button"
                    className={[
                        danceScope === option.key ? "is-active" : "",
                    ].filter(Boolean).join(" ")}
                    onClick={() => onDanceScopeChange(option.key)}
                    aria-pressed={danceScope === option.key}
                    disabled={!option.publicAvailable}
                    aria-label={option.publicAvailable ? option.label : `${option.label} 준비중`}
                    draggable={false}
                >
                    {option.label}{!option.publicAvailable && <span className="home-neb-scope-pending"> 준비중</span>}
                </button>
            ))}
        </div>
    );


    return (
        <section className="home-neb-standard-layout" aria-label="신규 이벤트 광고">
            {shouldShowScopeStrip && renderScopeStrip("inline")}
            {shouldShowScopeStrip && headerScopeTarget && createPortal(renderScopeStrip("header"), headerScopeTarget)}
            <div className={`home-neb-desktop-grid ${todaySchedules.length > 0 ? "" : "home-neb-desktop-grid--single"}`}>
                <div className="home-neb-hero-pane">
                    <NewEventsBanner
                        events={displayEvents}
                        danceScope={danceScope}
                        onEventClick={onEventClick}
                        defaultThumbnailClass={defaultThumbnailClass}
                        defaultThumbnailEvent={defaultThumbnailEvent}
                        currentIndex={safeActiveIndex}
                        onCurrentIndexChange={setActiveIndex}
                        todaySchedules={todaySchedules}
                        benefitEventUnreadCount={benefitEventUnreadCount}
                        onBenefitEventsOpen={onBenefitEventsOpen}
                    />
                </div>

                {todaySchedules.length > 0 && (
                    <aside className="home-neb-side-panel home-neb-side-panel--today-only" aria-label="오늘 일정">
                        <HomeTodaySchedulePanel
                            schedules={todaySchedules}
                            onEventClick={onEventClick}
                        />
                    </aside>
                )}
            </div>
        </section>
    );
};

export const EventPreviewSection: React.FC<EventPreviewSectionProps> = ({
    todayCalendarSchedules,
    todaySocialSchedules,
    thisWeekSocialSchedules,
    refreshSocialSchedules,
    socialSchedules,
    futureEvents,
    regularClasses,
    clubLessons,
    clubRegularClasses,
    newlyRegisteredEvents,
    homeAdMaxItems,
    benefitEventUnreadCount,
    onBenefitEventsOpen,
    favoriteEventsList,
    // events, // Removed
    onEventClick,
    onEventHover,
    highlightEvent,
    defaultThumbnailClass,
    defaultThumbnailEvent,
    effectiveFavoriteIds,
    handleToggleFavorite,
    searchParams,
    setSearchParams,
    sectionVisibility = DEFAULT_HOME_SECTION_VISIBILITY,
}) => {
    const vis = sectionVisibility;



    return (
        <div className="ELS-section">
            {/* 1.5 Newly Registered Events Section (24 hours) */}
            {vis.show_new_events_banner && (
                <HomeNewEventsDesktopSplit
                    events={newlyRegisteredEvents}
                    danceScope={normalizeVisibleDanceScope(searchParams.get('dance'))}
                    onDanceScopeChange={(scope) => {
                        const next = new URLSearchParams(searchParams);
                        next.set('dance', scope);
                        next.delete('id');
                        setSearchParams(next);
                    }}
                    maxItems={homeAdMaxItems}
                    benefitEventUnreadCount={benefitEventUnreadCount}
                    onBenefitEventsOpen={onBenefitEventsOpen}
                    todaySchedules={todayCalendarSchedules}
                    onEventClick={onEventClick}
                    defaultThumbnailClass={defaultThumbnailClass}
                    defaultThumbnailEvent={defaultThumbnailEvent}
                />
            )}

            {/* 1. New Unified Schedule Section (Test Mode) - Hidden by User Request 2026-02-23 */}
            {/* 
            <UnifiedScheduleSection
                todaySchedules={todaySocialSchedules || []}
                futureSchedules={thisWeekSocialSchedules || []}
                allSchedules={socialSchedules || []}
                onEventClick={onEventClick as any}
                onRefresh={refreshSocialSchedules}
            /> 
            */}





            {/* 4. Favorites (Horizontal) */}
            {vis.show_favorites && favoriteEventsList.length > 0 && (
                <EventPreviewRow
                    title="즐겨찾기한 내 이벤트"
                    icon="ri-star-fill"
                    className="ELS-section--favorites"
                    events={favoriteEventsList}
                    onEventClick={onEventClick}
                    onEventHover={onEventHover}
                    highlightEventId={highlightEvent?.id}
                    defaultThumbnailClass={defaultThumbnailClass}
                    defaultThumbnailEvent={defaultThumbnailEvent}
                    effectiveFavoriteIds={effectiveFavoriteIds}
                    handleToggleFavorite={handleToggleFavorite}
                />
            )}

        </div >
    );
};
