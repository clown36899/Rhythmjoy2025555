import React, { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../../../../contexts/AuthContext";
// Styles
// Styles
// import "../../../styles/EventListSections.css"; // Migrated to events.css

import PracticeRoomBanner from "../../PracticeRoomBanner";
import ShoppingBanner from "../../ShoppingBanner";
import type { Event } from "../../../utils/eventListUtils";
import type { SocialSchedule } from "../../../../social/types";
import type { HomeSectionVisibility } from "../hooks/useHomeSectionVisibility";
import { DEFAULT_HOME_SECTION_VISIBILITY } from "../hooks/useHomeSectionVisibility";
import { UnifiedScheduleSection } from "../../UnifiedScheduleSection";

import { EventPreviewRow } from "./EventPreviewRow";
import { NewEventsBanner } from "../../NewEventsBanner";
import { HomeNavButtonsSection } from "../../HomeNavButtonsSection";
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
    const visibleDanceScopeOptions = useMemo(() => getVisibleDanceScopeOptions(isAdmin), [isAdmin]);
    const [preferredScope, setPreferredScope] = useState<HomeAdDanceScope>(() => {
        if (typeof window === "undefined") return "swing";
        const saved = window.localStorage.getItem(HOME_AD_DANCE_SCOPE_KEY);
        return isHomeAdDanceScope(saved) ? normalizeVisibleDanceScope(saved, false) : "swing";
    });
    useEffect(() => {
        if (!isAdmin && preferredScope !== "swing") {
            setPreferredScope("swing");
        }
    }, [isAdmin, preferredScope]);
    useEffect(() => {
        if (!isAdmin || typeof window === "undefined") return;
        const saved = window.localStorage.getItem(HOME_AD_DANCE_SCOPE_KEY);
        if (isHomeAdDanceScope(saved)) setPreferredScope(saved);
    }, [isAdmin]);
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
    const displayEvents = useMemo(() => {
        const nextEvents = selectedScopeEvents.length >= HOME_AD_MIN_SELECTED_COUNT
            ? selectedScopeEvents
            : mergeUniqueEvents(
                selectedScopeEvents,
                mergeUniqueEvents(visibleEvents, visibleFallbackEvents).filter((event) => getHomeAdEventScope(event) !== preferredScope),
            );
        return nextEvents.slice(0, NEB_MAX_ITEMS);
    }, [preferredScope, selectedScopeEvents, visibleEvents, visibleFallbackEvents]);
    const isFallbackMixed = selectedScopeEvents.length < HOME_AD_MIN_SELECTED_COUNT && displayEvents.length > selectedScopeEvents.length;
    const [activeIndex, setActiveIndex] = useState(() => {
        if (!displayEvents || displayEvents.length === 0) return 0;
        return Math.floor(Math.random() * displayEvents.length);
    });
    useEffect(() => {
        if (typeof window !== "undefined") {
            window.localStorage.setItem(HOME_AD_DANCE_SCOPE_KEY, isAdmin ? preferredScope : "swing");
        }
    }, [isAdmin, preferredScope]);
    useEffect(() => {
        if (displayEvents.length === 0) {
            setActiveIndex(0);
            return;
        }
        setActiveIndex((index) => index % displayEvents.length);
    }, [displayEvents.length, preferredScope]);
    const safeActiveIndex = displayEvents.length > 0 ? activeIndex % displayEvents.length : 0;
    const featuredEvent = displayEvents[safeActiveIndex] || displayEvents[0];
    const nextEvents = displayEvents
        .filter((event) => event.id !== featuredEvent?.id)
        .slice(0, 4);

    if (displayEvents.length === 0) return null;

    return (
        <section className="home-neb-standard-layout" aria-label="신규 이벤트 광고">
            {isAdmin && visibleDanceScopeOptions.length > 1 && (
            <div className="home-neb-admin-scope-strip" aria-label="메인 광고 장르 선택">
                {visibleDanceScopeOptions.map((option) => (
                    <button
                        key={option.key}
                        type="button"
                        className={preferredScope === option.key ? "is-active" : ""}
                        onClick={() => setPreferredScope(option.key)}
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



    // Extract real images for HomeNavButtonsSection (안정화: 데이터가 실제로 바뀔 때만 재셔플)
    const socialDataRef = useRef<{ imageUrl: string; title: string; location: string }[]>([]);
    const socialDataCountRef = useRef<number>(-1);
    const recentSocialData = useMemo(() => {
        const list = socialSchedules || [];
        const items = list
            .filter(s => s.category === 'social')
            .map(s => ({
                imageUrl: getCardThumbnail(s as any) || '',
                title: s.title || '',
                location: s.location || s.place_name || ''
            }))
            .filter(item => item.imageUrl) as { imageUrl: string; title: string; location: string }[];

        // 아이템 개수가 동일하면 이전 셔플 결과 재사용 (깜빡임 방지)
        if (items.length === socialDataCountRef.current && socialDataRef.current.length > 0) {
            return socialDataRef.current;
        }

        // Fisher-Yates 셔플로 랜덤 정렬 (안정적인 셔플을 위해 복사본 사용)
        const shuffled = [...items];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }

        const result = shuffled.slice(0, 10);
        socialDataRef.current = result;
        socialDataCountRef.current = items.length;
        return result;
    }, [socialSchedules]);

    const recentEventImages = useMemo(() => {
        return futureEvents
            .filter(e => e.image || e.image_thumbnail || e.image_medium)
            .slice(0, 10)
            .map(e => getCardThumbnail(e))
            .filter(Boolean) as string[];
    }, [futureEvents]);

    const recentClassImages = useMemo(() => {
        return regularClasses
            .filter(e => e.image || e.image_thumbnail || e.image_medium)
            .slice(0, 10)
            .map(e => getCardThumbnail(e))
            .filter(Boolean) as string[];
    }, [regularClasses]);


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

            {/* 0. Home Navigation Buttons (New) */}
            <HomeNavButtonsSection
                socialData={recentSocialData}
                eventImages={recentEventImages}
                classImages={recentClassImages}
            />

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

            {/* 5. Support Grid (Banners) */}
            <div className="ELS-support-grid" style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '16px' }}>
                <PracticeRoomBanner />
                <ShoppingBanner />
            </div>
        </div >
    );
};
