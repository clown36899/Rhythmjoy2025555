import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../../../../contexts/AuthContext";
// Styles
// Styles
// import "../../../styles/EventListSections.css"; // Migrated to events.css

import type { Event } from "../../../utils/eventListUtils";
import type { SocialSchedule } from "../../../../social/types";
import type { HomeSectionVisibility } from "../hooks/useHomeSectionVisibility";
import { DEFAULT_HOME_SECTION_VISIBILITY } from "../hooks/useHomeSectionVisibility";

import { EventPreviewRow } from "./EventPreviewRow";
import { NewEventsBanner } from "../../NewEventsBanner";
import { getCardThumbnail } from "../../../../../utils/getEventThumbnail";
import { formatEventDate } from "../../../../../utils/dateUtils";
import {
    calendarDanceScopeOptions,
    getDanceScopeLabel,
    getVisibleDanceScopeOptions,
    inferDanceScopeForEvent,
    normalizeDanceScope,
    normalizeVisibleDanceScope,
} from "../../../../../utils/danceTaxonomy";
import { showComingSoonNotice } from "../../../../../utils/appNotice";
import { NEB_MAX_ITEMS } from "../hooks/useNebFilterSettings";


interface EventPreviewSectionProps {
    isSocialSchedulesLoading: boolean;
    todaySocialSchedules: SocialSchedule[];
    thisWeekSocialSchedules: SocialSchedule[];
    refreshSocialSchedules: () => Promise<void>;
    socialSchedules?: SocialSchedule[]; // 👈 전체 원본 리스트 추가 (통합 섹션용)
    futureEvents: Event[];
    regularClasses: Event[];
    clubLessons: Event[];
    clubRegularClasses: Event[];
    newlyRegisteredEvents: Event[]; // 👈 신규 등록 이벤트 (24시간)
    homeAdCandidateEvents: Event[];
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
    events: Event[];
    fallbackEvents: Event[];
    onEventClick: (event: Event) => void;
    defaultThumbnailClass: string;
    defaultThumbnailEvent: string;
}

type HomeAdDanceScope = (typeof calendarDanceScopeOptions)[number]["key"];

const HOME_AD_DANCE_SCOPE_KEY = "home_ad_dance_scope";
const HOME_AD_MIN_SELECTED_COUNT = 2;

const getHomeAdEventScope = (event: Event): HomeAdDanceScope => {
    return normalizeDanceScope((event as Event & { dance_scope?: string | null }).dance_scope || inferDanceScopeForEvent(event as any));
};

const isHomeAdDanceScope = (value: string | null): value is HomeAdDanceScope => {
    return calendarDanceScopeOptions.some((option) => option.key === value);
};

const mergeUniqueEvents = (...groups: Event[][]) => {
    const seen = new Set<number | string>();
    const merged: Event[] = [];
    groups.flat().forEach((event) => {
        if (seen.has(event.id)) return;
        seen.add(event.id);
        merged.push(event);
    });
    return merged;
};

const normalizeHomeAdKeyPart = (value?: string | null) => value?.trim().replace(/\s+/g, " ").toLowerCase() || "";

const getHomeAdVenueKey = (event: Event) => {
    const venueId = normalizeHomeAdKeyPart(event.venue_id);
    if (venueId) return `venue:${venueId}`;

    const venueName = normalizeHomeAdKeyPart(event.venue_name || event.location || event.place_name);
    if (venueName) return `place:${venueName}`;

    return "";
};

const getHomeAdDedupeKey = (event: Event) => {
    const userId = event.user_id?.trim();
    const venueKey = getHomeAdVenueKey(event);
    if (userId) return venueKey ? `user:${userId}|${venueKey}` : `user:${userId}`;

    const organizerName = event.organizer_name?.trim() || event.organizer?.trim();
    if (organizerName) {
        const organizerKey = `organizer:${organizerName.toLowerCase()}`;
        return venueKey ? `${organizerKey}|${venueKey}` : organizerKey;
    }

    return `event:${event.id}`;
};

const limitHomeAdOnePerAuthorVenue = (events: Event[]) => {
    const seenKeys = new Set<string>();
    const filtered: Event[] = [];

    for (const event of events) {
        const dedupeKey = getHomeAdDedupeKey(event);
        if (seenKeys.has(dedupeKey)) continue;
        seenKeys.add(dedupeKey);
        filtered.push(event);
    }

    return filtered;
};

const getHomeAdDateLabel = (event?: Event) => {
    if (!event) return "날짜 미정";
    if (event.event_dates && event.event_dates.length > 0) {
        return formatEventDate(event.event_dates[0]) + (event.event_dates.length > 1 ? " ..." : "");
    }
    const startDate = event.start_date || event.date;
    const endDate = event.end_date || event.date;
    if (!startDate) return "날짜 미정";
    if (endDate && endDate !== startDate) return `${formatEventDate(startDate)}~${formatEventDate(endDate)}`;
    return formatEventDate(startDate);
};

const getHomeAdPlaceLabel = (event?: Event) => {
    if (!event) return "장소 미정";
    return event.location || event.place_name || "장소 미정";
};

const HomeNewEventsDesktopSplit: React.FC<HomeNewEventsDesktopSplitProps> = ({
    events,
    fallbackEvents,
    onEventClick,
    defaultThumbnailClass,
    defaultThumbnailEvent,
}) => {
    const { isAdmin } = useAuth();
    const visibleDanceScopeOptions = useMemo(() => getVisibleDanceScopeOptions(true), []);
    const [preferredScope, setPreferredScope] = useState<HomeAdDanceScope>(() => {
        if (typeof window === "undefined") return "swing";
        const saved = window.localStorage.getItem(HOME_AD_DANCE_SCOPE_KEY);
        return isHomeAdDanceScope(saved) ? normalizeVisibleDanceScope(saved, false) : "swing";
    });
    useEffect(() => {
        if (preferredScope !== "swing") {
            setPreferredScope("swing");
        }
    }, [preferredScope]);
    useEffect(() => {
        if (typeof window === "undefined") return;
        const saved = window.localStorage.getItem(HOME_AD_DANCE_SCOPE_KEY);
        if (isHomeAdDanceScope(saved) && saved === "swing") setPreferredScope(saved);
    }, []);
    const visibleEvents = useMemo(() => {
        if (isAdmin) return events;
        return events.filter((event) => getHomeAdEventScope(event) === "swing");
    }, [events, isAdmin]);
    const visibleFallbackEvents = useMemo(() => {
        if (isAdmin) return fallbackEvents;
        return fallbackEvents.filter((event) => getHomeAdEventScope(event) === "swing");
    }, [fallbackEvents, isAdmin]);
    const selectedScopeEvents = useMemo(() => {
        const primarySelected = visibleEvents.filter((event) => getHomeAdEventScope(event) === preferredScope);
        const fallbackSelected = visibleFallbackEvents.filter((event) => getHomeAdEventScope(event) === preferredScope);
        return mergeUniqueEvents(primarySelected, fallbackSelected);
    }, [preferredScope, visibleEvents, visibleFallbackEvents]);
    const selectedScopeAdEvents = useMemo(() => limitHomeAdOnePerAuthorVenue(selectedScopeEvents), [selectedScopeEvents]);
    const displayEvents = useMemo(() => {
        const nextEvents = selectedScopeAdEvents.length >= HOME_AD_MIN_SELECTED_COUNT
            ? selectedScopeAdEvents
            : limitHomeAdOnePerAuthorVenue(mergeUniqueEvents(
                selectedScopeAdEvents,
                mergeUniqueEvents(visibleEvents, visibleFallbackEvents).filter((event) => getHomeAdEventScope(event) !== preferredScope),
            ));
        return nextEvents.slice(0, NEB_MAX_ITEMS);
    }, [preferredScope, selectedScopeAdEvents, visibleEvents, visibleFallbackEvents]);
    const isFallbackMixed = selectedScopeAdEvents.length < HOME_AD_MIN_SELECTED_COUNT && displayEvents.length > selectedScopeAdEvents.length;
    const [activeIndex, setActiveIndex] = useState(() => {
        if (!displayEvents || displayEvents.length === 0) return 0;
        return Math.floor(Math.random() * displayEvents.length);
    });
    const displayEventKey = useMemo(() => displayEvents.map((event) => event.id).join("|"), [displayEvents]);
    useEffect(() => {
        if (typeof window !== "undefined") {
            window.localStorage.setItem(HOME_AD_DANCE_SCOPE_KEY, "swing");
        }
    }, [preferredScope]);
    const handleScopeClick = (scope: HomeAdDanceScope) => {
        if (scope !== "swing") {
            showComingSoonNotice();
            return;
        }

        setPreferredScope(scope);
    };
    useEffect(() => {
        if (displayEvents.length === 0) {
            setActiveIndex(0);
            return;
        }
        setActiveIndex(0);
    }, [displayEventKey, preferredScope, displayEvents.length]);
    const safeActiveIndex = displayEvents.length > 0 ? activeIndex % displayEvents.length : 0;
    const featuredEvent = displayEvents[safeActiveIndex] || displayEvents[0];
    const nextEvents = displayEvents
        .filter((event) => event.id !== featuredEvent?.id)
        .slice(0, 4);

    if (displayEvents.length === 0) return null;

    return (
        <section className="home-neb-standard-layout" aria-label="신규 이벤트 광고">
            {visibleDanceScopeOptions.length > 1 && (
            <div className="home-neb-admin-scope-strip" aria-label="메인 광고 장르 선택">
                {visibleDanceScopeOptions.map((option) => (
                    <button
                        key={option.key}
                        type="button"
                        className={[
                            preferredScope === option.key ? "is-active" : "",
                            option.key !== "swing" ? "is-preparing" : "",
                        ].filter(Boolean).join(" ")}
                        onClick={() => handleScopeClick(option.key)}
                    >
                        {option.label}
                    </button>
                ))}
            </div>
            )}
            <div className="home-neb-desktop-grid">
                <div className="home-neb-hero-pane">
                    <NewEventsBanner
                        events={displayEvents}
                        onEventClick={onEventClick}
                        defaultThumbnailClass={defaultThumbnailClass}
                        defaultThumbnailEvent={defaultThumbnailEvent}
                        currentIndex={safeActiveIndex}
                        onCurrentIndexChange={setActiveIndex}
                    />
                </div>

                <aside className="home-neb-side-panel" aria-label="신규 이벤트 요약">
                    <div className="home-neb-side-head">
                        <span>{getDanceScopeLabel(getHomeAdEventScope(featuredEvent))}</span>
                        <strong>지금 노출 중</strong>
                    </div>

                    <button
                        type="button"
                        className="home-neb-feature-summary"
                        onClick={() => featuredEvent && onEventClick(featuredEvent)}
                    >
                        <span className="home-neb-feature-thumb">
                            {featuredEvent && (
                                <img
                                    src={getCardThumbnail(featuredEvent) || defaultThumbnailEvent}
                                    alt=""
                                    loading="eager"
                                    decoding="async"
                                />
                            )}
                        </span>
                        <span className="home-neb-feature-copy">
                            <em>{featuredEvent?.category === "class" ? "강습" : "행사"}</em>
                            <strong>{featuredEvent?.title}</strong>
                            <small>
                                <i className="ri-map-pin-line" />
                                {getHomeAdPlaceLabel(featuredEvent)}
                            </small>
                            <small>
                                <i className="ri-calendar-line" />
                                {getHomeAdDateLabel(featuredEvent)}
                            </small>
                        </span>
                    </button>

                    {nextEvents.length > 0 && (
                        <div className="home-neb-next-list">
                            <div className="home-neb-next-title">
                                <strong>다음 후보</strong>
                                <span>{displayEvents.length}개 중 일부</span>
                            </div>
                            {nextEvents.map((event, index) => (
                                <button
                                    key={event.id}
                                    type="button"
                                    className="home-neb-next-item"
                                    onClick={() => setActiveIndex(displayEvents.findIndex((item) => item.id === event.id))}
                                >
                                    <em>{index + 1}</em>
                                    <span>
                                        <strong>{event.title}</strong>
                                        <small>{getHomeAdDateLabel(event)} · {getHomeAdPlaceLabel(event)}</small>
                                    </span>
                                    <i className="ri-arrow-right-s-line" />
                                </button>
                            ))}
                        </div>
                    )}
                </aside>
            </div>
            {isAdmin && isFallbackMixed && (
                <p className="home-neb-admin-scope-note">
                    {getDanceScopeLabel(preferredScope)} 후보가 적어 다른 장르를 함께 노출 중
                </p>
            )}
        </section>
    );
};

export const EventPreviewSection: React.FC<EventPreviewSectionProps> = ({
    todaySocialSchedules,
    thisWeekSocialSchedules,
    refreshSocialSchedules,
    socialSchedules,
    futureEvents,
    regularClasses,
    clubLessons,
    clubRegularClasses,
    newlyRegisteredEvents,
    homeAdCandidateEvents,
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
            {vis.show_new_events_banner && (newlyRegisteredEvents.length > 0 || homeAdCandidateEvents.length > 0) && (
                <HomeNewEventsDesktopSplit
                    events={newlyRegisteredEvents}
                    fallbackEvents={homeAdCandidateEvents}
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
