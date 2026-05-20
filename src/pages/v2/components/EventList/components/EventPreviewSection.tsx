import React, { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
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

interface HomeRoutePreviewHubProps {
    socialData: { imageUrl: string; title: string; location: string }[];
    futureEvents: Event[];
    regularClasses: Event[];
}

interface HomeNewEventsDesktopSplitProps {
    events: Event[];
    onEventClick: (event: Event) => void;
    defaultThumbnailClass: string;
    defaultThumbnailEvent: string;
}

const getPreviewImage = (event?: Event) => event ? getCardThumbnail(event) : undefined;

const getHomeEventDateText = (event: Event) => {
    if (event.event_dates && event.event_dates.length > 0) {
        return formatEventDate(event.event_dates[0]) + (event.event_dates.length > 1 ? " ..." : "");
    }

    const startDate = event.start_date || event.date;
    const endDate = event.end_date || event.date;
    if (!startDate && !endDate) return "날짜 미정";
    if (startDate && endDate && startDate !== endDate) {
        return `${formatEventDate(startDate)}~${formatEventDate(endDate)}`;
    }

    return formatEventDate(startDate || endDate || "");
};

const getHomeEventLocationText = (event: Event) => event.location || event.place_name || "장소 미정";

const getHomeEventKindText = (event: Event) => {
    if (event.category === "class" || event.is_class) return "강습";
    return event.genre || "행사";
};

const HomeNewEventsDesktopSplit: React.FC<HomeNewEventsDesktopSplitProps> = ({
    events,
    onEventClick,
    defaultThumbnailClass,
    defaultThumbnailEvent,
}) => {
    const navigate = useNavigate();
    const [activeIndex, setActiveIndex] = useState(() => {
        if (!events || events.length === 0) return 0;
        return Math.floor(Math.random() * events.length);
    });
    const safeActiveIndex = events.length > 0 ? activeIndex % events.length : 0;
    const featuredEvent = events[safeActiveIndex] || events[0];
    const queueEvents = featuredEvent
        ? [featuredEvent, ...events.filter(event => event.id !== featuredEvent.id)].slice(0, 4)
        : events.slice(0, 4);
    const venueCount = new Set(events.map(getHomeEventLocationText).filter(location => location !== "장소 미정")).size;

    return (
        <section className="home-neb-desktop-layout" aria-label="신규 이벤트 광고">
            <div className="home-neb-main-slot">
                <NewEventsBanner
                    events={events}
                    onEventClick={onEventClick}
                    defaultThumbnailClass={defaultThumbnailClass}
                    defaultThumbnailEvent={defaultThumbnailEvent}
                    currentIndex={safeActiveIndex}
                    onCurrentIndexChange={setActiveIndex}
                />
            </div>

            <aside className="home-neb-side-panel" aria-label="신규 이벤트 목록">
                <div className="home-neb-side-head">
                    <span>신규 큐</span>
                    <strong>{events.length}개 노출중</strong>
                </div>

                {featuredEvent && (
                    <button
                        type="button"
                        className="home-neb-feature-card"
                        onClick={() => onEventClick(featuredEvent)}
                    >
                        <span className="home-neb-feature-kicker">{getHomeEventKindText(featuredEvent)}</span>
                        <strong>{featuredEvent.title}</strong>
                        <em>
                            {getHomeEventDateText(featuredEvent)} · {getHomeEventLocationText(featuredEvent)}
                        </em>
                    </button>
                )}

                <div className="home-neb-side-stats" aria-label="신규 이벤트 요약">
                    <span>
                        <b>{events.length}</b>
                        <em>신규</em>
                    </span>
                    <span>
                        <b>{venueCount}</b>
                        <em>장소</em>
                    </span>
                </div>

                <div className="home-neb-queue-list">
                    {queueEvents.map((event, index) => (
                        <button
                            type="button"
                            key={event.id}
                            className="home-neb-queue-item"
                            onClick={() => onEventClick(event)}
                        >
                            <span className="home-neb-queue-rank">{index + 1}</span>
                            <span className="home-neb-queue-copy">
                                <strong>{event.title}</strong>
                                <em>{getHomeEventDateText(event)} · {getHomeEventLocationText(event)}</em>
                            </span>
                        </button>
                    ))}
                </div>

                <button
                    type="button"
                    className="home-neb-calendar-link"
                    onClick={() => navigate("/calendar?scrollToToday=true")}
                >
                    캘린더에서 보기
                    <i className="ri-arrow-right-line" />
                </button>
            </aside>
        </section>
    );
};

const HomeRoutePreviewHub: React.FC<HomeRoutePreviewHubProps> = ({ socialData, futureEvents, regularClasses }) => {
    const navigate = useNavigate();
    const featuredSocial = socialData[0];
    const featuredEvent = futureEvents[0];
    const featuredClass = regularClasses[0];

    const routes = [
        {
            key: 'calendar',
            label: '캘린더',
            meta: '소셜&행사 / 강습',
            target: '/calendar',
            image: featuredSocial?.imageUrl || getPreviewImage(featuredEvent),
            icon: 'ri-calendar-event-line',
            accent: 'green',
        },
        {
            key: 'events',
            label: '강습&행사정보',
            meta: `${futureEvents.length} 행사 · ${regularClasses.length} 강습`,
            target: '/events',
            image: getPreviewImage(featuredEvent) || getPreviewImage(featuredClass),
            icon: 'ri-stack-line',
            accent: 'amber',
        },
        {
            key: 'board',
            label: '자유게시판',
            meta: '말머리와 반응',
            target: '/board?category=free',
            icon: 'ri-chat-3-line',
            accent: 'blue',
        },
        {
            key: 'places',
            label: '장소',
            meta: '분류 · 지역 · 지도',
            target: '/places',
            icon: 'ri-map-pin-2-line',
            accent: 'violet',
        },
        {
            key: 'forum',
            label: '포럼',
            meta: '도구형 허브',
            target: '/forum',
            icon: 'ri-layout-grid-line',
            accent: 'pink',
        },
        {
            key: 'shopping',
            label: '쇼핑',
            meta: '스윙 아이템',
            target: '/shopping',
            icon: 'ri-shopping-bag-3-line',
            accent: 'emerald',
        },
    ];

    return (
        <section className="home-route-preview-hub" aria-label="주요 메뉴 미리보기">
            <div className="home-route-preview-head">
                <strong>주요 메뉴</strong>
                <span>각 영역의 실제 페이지로 바로 이동</span>
            </div>
            <div className="home-route-preview-grid">
                {routes.map((route) => (
                    <button
                        key={route.key}
                        type="button"
                        className={`home-route-card is-${route.accent}`}
                        onClick={() => navigate(route.target)}
                    >
                        <span className="home-route-card-media">
                            {route.image ? (
                                <img src={route.image} alt="" loading="lazy" draggable={false} />
                            ) : (
                                <i className={route.icon} />
                            )}
                        </span>
                        <span className="home-route-card-copy">
                            <strong>{route.label}</strong>
                            <em>{route.meta}</em>
                        </span>
                        <i className="ri-arrow-right-s-line home-route-card-arrow" />
                    </button>
                ))}
            </div>
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
            {vis.show_new_events_banner && newlyRegisteredEvents.length > 0 && (
                <HomeNewEventsDesktopSplit
                    events={newlyRegisteredEvents}
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

            <HomeRoutePreviewHub
                socialData={recentSocialData}
                futureEvents={futureEvents}
                regularClasses={regularClasses}
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
