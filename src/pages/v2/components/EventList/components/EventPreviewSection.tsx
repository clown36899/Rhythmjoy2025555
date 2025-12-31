import React, { useMemo } from "react";
// Styles
import "../../../styles/EventListSections.css";
import "../../../styles/HorizontalScrollNav.css";

import BillboardSection from "../../BillboardSection";
import TodaySocial from "../../../../social/components/TodaySocial";
import AllSocialSchedules from "../../../../social/components/AllSocialSchedules";
import { HorizontalScrollNav } from "../../HorizontalScrollNav";
import PracticeRoomBanner from "../../PracticeRoomBanner";
import ShoppingBanner from "../../ShoppingBanner";
import type { Event } from "../../../utils/eventListUtils";
import { EventCard } from "../../EventCard";
import type { SocialSchedule } from "../../../../social/types";

interface EventPreviewSectionProps {
    isSocialSchedulesLoading: boolean;
    todaySocialSchedules: SocialSchedule[];
    thisWeekSocialSchedules: SocialSchedule[];
    refreshSocialSchedules: () => Promise<void>;
    futureEvents: Event[];
    regularClasses: Event[];
    clubLessons: Event[];
    clubRegularClasses: Event[];
    favoriteEventsList: Event[];
    events: Event[];
    allGenres: string[];
    allGenresStructured: { class: string[]; club: string[]; event: string[] };
    selectedEventGenre: string | null;
    selectedClassGenre: string | null;
    selectedClubGenre: string | null;
    onEventClick: (event: Event) => void;
    onEventHover?: (id: number | null) => void;
    highlightEvent: { id: number } | null;
    defaultThumbnailClass: string;
    defaultThumbnailEvent: string;
    effectiveFavoriteIds: Set<number>;
    handleToggleFavorite: (id: number, e: React.MouseEvent) => void;
    searchParams: URLSearchParams;
    setSearchParams: (params: URLSearchParams) => void;
    onSectionViewModeChange: (mode: 'preview' | 'viewAll-events' | 'viewAll-classes') => void;
}

export const EventPreviewSection: React.FC<EventPreviewSectionProps> = ({
    todaySocialSchedules,
    thisWeekSocialSchedules,
    refreshSocialSchedules,
    futureEvents,
    regularClasses,
    clubLessons,
    clubRegularClasses,
    favoriteEventsList,
    events,
    allGenresStructured,
    selectedEventGenre,
    selectedClassGenre,
    selectedClubGenre,
    onEventClick,
    onEventHover,
    highlightEvent,
    defaultThumbnailClass,
    defaultThumbnailEvent,
    effectiveFavoriteIds,
    handleToggleFavorite,
    searchParams,
    setSearchParams,
    onSectionViewModeChange,
}) => {
    // 배너 위치 랜덤화를 위한 상태 (새로고침 시마다 결정)
    const isBannerSwapped = useMemo(() => Math.random() > 0.5, []);

    const setGenreParam = (key: string, val: string | null) => {
        const p = new URLSearchParams(searchParams);
        if (val) p.set(key, val);
        else p.delete(key);
        setSearchParams(p);
    };

    return (
        <div style={{ paddingBottom: '100px' }}>
            {/* 1. Billboard Section */}
            <BillboardSection events={events as any} />

            {/* 2. Today Social */}
            <TodaySocial
                schedules={todaySocialSchedules}
                onViewAll={() => window.location.href = '/social'}
                onEventClick={onEventClick as any}
                onRefresh={refreshSocialSchedules}
            />

            {/* 3. All Social Schedules (Moved to 2nd position) */}
            <AllSocialSchedules
                schedules={thisWeekSocialSchedules}
                onEventClick={onEventClick as any}
                onRefresh={refreshSocialSchedules}
            />

            {/* 4. Slot A: Random Banner (Practice Room or Shopping) */}
            {isBannerSwapped ? (
                <div style={{ padding: '0 16px', marginTop: '10px' }}>
                    <ShoppingBanner />
                </div>
            ) : (
                <PracticeRoomBanner />
            )}

            {/* 5. Favorites (Horizontal) */}
            {favoriteEventsList.length > 0 && (
                <div className="evt-v2-section evt-v2-section-events">
                    <div className="evt-v2-section-title">
                        <div>
                            <i className="ri-star-fill" style={{ color: '#ffffff' }}></i>
                            <span>즐겨찾기한 내 이벤트</span>
                        </div>
                    </div>
                    <HorizontalScrollNav>
                        <div className="evt-v2-horizontal-scroll">
                            {favoriteEventsList.map(e => (
                                <div key={e.id} className="card-container">
                                    <EventCard
                                        event={e}
                                        onClick={() => onEventClick(e)}
                                        isFavorite={effectiveFavoriteIds.has(e.id)}
                                        onToggleFavorite={(ev: React.MouseEvent) => handleToggleFavorite(e.id, ev)}
                                        defaultThumbnailClass={defaultThumbnailClass}
                                        defaultThumbnailEvent={defaultThumbnailEvent}
                                        isHighlighted={highlightEvent?.id === e.id}
                                        onMouseEnter={(id) => onEventHover?.(id)}
                                        onMouseLeave={() => onEventHover?.(null)}
                                    />
                                </div>
                            ))}
                        </div>
                    </HorizontalScrollNav>
                </div>
            )}

            {/* 6. Events Horizontal */}
            <div className="evt-v2-section evt-v2-section-events">
                <div className="evt-v2-section-title">
                    <div>
                        <i className="ri-calendar-event-fill"></i>
                        <span>예정된 행사</span>
                        <span className="evt-v2-count">{futureEvents.length}</span>
                    </div>
                    <button onClick={() => onSectionViewModeChange('viewAll-events')} className="evt-view-all-btn">
                        전체보기 <i className="ri-arrow-right-s-line"></i>
                    </button>
                </div>

                <div className="evt-v2-genre-wrap">
                    {['전체', ...allGenresStructured.event].map(g => (
                        <button
                            key={g}
                            className={`evt-genre-btn ${((selectedEventGenre || '전체') === g) ? 'active' : ''}`}
                            onClick={() => setGenreParam('event_genre', g === '전체' ? null : g)}
                        >
                            {g}
                        </button>
                    ))}
                </div>

                <HorizontalScrollNav>
                    <div className="evt-v2-horizontal-scroll">
                        {futureEvents.filter(e => !selectedEventGenre || e.genre?.includes(selectedEventGenre)).map(e => (
                            <div key={e.id} className="card-container">
                                <EventCard
                                    event={e}
                                    onClick={() => onEventClick(e)}
                                    defaultThumbnailClass={defaultThumbnailClass}
                                    defaultThumbnailEvent={defaultThumbnailEvent}
                                    onMouseEnter={(id) => onEventHover?.(id)}
                                    onMouseLeave={() => onEventHover?.(null)}
                                    isFavorite={effectiveFavoriteIds.has(e.id)}
                                    onToggleFavorite={(ev: React.MouseEvent) => handleToggleFavorite(e.id, ev)}
                                />
                            </div>
                        ))}
                    </div>
                </HorizontalScrollNav>
            </div>

            {/* 7. Classes Horizontal */}
            <div className="evt-v2-section evt-v2-section-classes">
                <div className="evt-v2-section-title">
                    <div>
                        <i className="ri-calendar-check-fill" style={{ color: '#10b981' }}></i>
                        <span>강습</span>
                        <span className="evt-v2-count">{regularClasses.length}</span>
                    </div>
                    <button onClick={() => window.location.href = '/calendar?scrollToToday=true'} className="evt-view-all-btn">
                        전체달력 <i className="ri-arrow-right-s-line"></i>
                    </button>
                </div>

                <div className="evt-v2-genre-wrap">
                    {['전체', ...allGenresStructured.class].map(g => (
                        <button
                            key={g}
                            className={`evt-genre-btn ${((selectedClassGenre || '전체') === g) ? 'active' : ''}`}
                            onClick={() => setGenreParam('class_genre', g === '전체' ? null : g)}
                        >
                            {g}
                        </button>
                    ))}
                </div>

                <HorizontalScrollNav>
                    <div className="evt-v2-horizontal-scroll">
                        {regularClasses.filter(e => !selectedClassGenre || e.genre?.includes(selectedClassGenre)).map(e => (
                            <div key={e.id} className="card-container">
                                <EventCard
                                    event={e}
                                    onClick={() => onEventClick(e)}
                                    defaultThumbnailClass={defaultThumbnailClass}
                                    defaultThumbnailEvent={defaultThumbnailEvent}
                                    onMouseEnter={(id) => onEventHover?.(id)}
                                    onMouseLeave={() => onEventHover?.(null)}
                                    isFavorite={effectiveFavoriteIds.has(e.id)}
                                    onToggleFavorite={(ev: React.MouseEvent) => handleToggleFavorite(e.id, ev)}
                                />
                            </div>
                        ))}
                    </div>
                </HorizontalScrollNav>
            </div>

            {/* 8. Club Horizontal */}
            <div className="evt-v2-section evt-v2-section-classes">
                <div className="evt-v2-section-title">
                    <div>
                        <i className="ri-group-fill"></i>
                        <span>동호회 강습</span>
                        <span className="evt-v2-count">{clubLessons.length}</span>
                    </div>
                    <button onClick={() => window.location.href = '/social'} className="evt-view-all-btn">
                        이벤트등록 <i className="ri-arrow-right-s-line"></i>
                    </button>
                </div>

                <div className="evt-v2-genre-wrap">
                    {['전체', ...allGenresStructured.club].map(g => (
                        <button
                            key={g}
                            className={`evt-genre-btn ${((selectedClubGenre || '전체') === g) ? 'active' : ''}`}
                            onClick={() => setGenreParam('club_genre', g === '전체' ? null : g)}
                        >
                            {g}
                        </button>
                    ))}
                </div>

                <HorizontalScrollNav>
                    <div className="evt-v2-horizontal-scroll">
                        {clubLessons.filter(e => !selectedClubGenre || e.genre?.includes(selectedClubGenre)).map(event => (
                            <div key={event.id} className="card-container">
                                <EventCard
                                    event={event}
                                    onClick={() => onEventClick?.(event)}
                                    defaultThumbnailClass={defaultThumbnailClass}
                                    defaultThumbnailEvent={defaultThumbnailEvent}
                                    onMouseEnter={(id) => onEventHover?.(id)}
                                    onMouseLeave={() => onEventHover?.(null)}
                                    isFavorite={effectiveFavoriteIds.has(event.id)}
                                    onToggleFavorite={(ev: React.MouseEvent) => handleToggleFavorite(event.id, ev)}
                                />
                            </div>
                        ))}
                        {clubLessons.length === 0 && (
                            <div className="evt-v2-empty" style={{ padding: '20px' }}>진행중인 동호회 강습이 없습니다</div>
                        )}
                    </div>
                </HorizontalScrollNav>
            </div>

            {/* Section 4: 동호회 정규 강습 (Horizontal Scroll) */}
            <div className="evt-v2-section evt-v2-section-club-classes">
                <div className="evt-v2-section-title">
                    <div>
                        <i className="ri-group-2-fill"></i>
                        <span>동호회 정규강습</span>
                        <span className="evt-v2-count">{clubRegularClasses.length}</span>
                    </div>
                </div>

                <HorizontalScrollNav>
                    <div className="evt-v2-horizontal-scroll">
                        {clubRegularClasses.map(e => (
                            <div key={e.id} className="card-container">
                                <EventCard
                                    event={e}
                                    onClick={() => onEventClick(e)}
                                    defaultThumbnailClass={defaultThumbnailClass}
                                    defaultThumbnailEvent={defaultThumbnailEvent}
                                    onMouseEnter={(id) => onEventHover?.(id)}
                                    onMouseLeave={() => onEventHover?.(null)}
                                    isFavorite={effectiveFavoriteIds.has(e.id)}
                                    onToggleFavorite={(ev: React.MouseEvent) => handleToggleFavorite(e.id, ev)}
                                />
                            </div>
                        ))}
                    </div>
                </HorizontalScrollNav>
            </div>

            {/* 9. Slot B: Random Banner (Shopping or Practice Room) */}
            <div style={{ padding: '0 16px', marginTop: '10px' }}>
                {isBannerSwapped ? (
                    <PracticeRoomBanner />
                ) : (
                    <ShoppingBanner />
                )}
            </div>
        </div>
    );
};
