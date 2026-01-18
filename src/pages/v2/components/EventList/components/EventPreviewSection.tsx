import React, { useMemo } from "react";
// Styles
import "../../../styles/EventListSections.css";
import "../../../styles/HorizontalScrollNav.css";

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
    // events: Event[]; // Removed for BillboardSection
    allGenres: string[];
    allGenresStructured: { class: string[]; club: string[]; event: string[] };
    selectedEventGenre: string | null;
    selectedClassGenre: string | null;
    selectedClubGenre: string | null;
    onEventClick: (event: Event) => void;
    onEventHover?: (id: number | string | null) => void;
    highlightEvent: { id: number | string } | null;
    defaultThumbnailClass: string;
    defaultThumbnailEvent: string;
    effectiveFavoriteIds: Set<number | string>;
    handleToggleFavorite: (id: number | string, e: React.MouseEvent) => void;
    searchParams: URLSearchParams;
    setSearchParams: (params: URLSearchParams) => void;
    // onSectionViewModeChange: (mode: 'preview' | 'viewAll-events' | 'viewAll-classes') => void;
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
    // events, // Removed
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
}) => {


    // 장르 라벨 렌더러 - '전체'와 '대회'만 Double-Span 적용
    const renderGenreLabel = (genre: string) => {
        // '전체' 특별 처리
        if (genre === '전체') {
            return (
                <span className="manual-label-wrapper">
                    <span className="translated-part">All</span>
                    <span className="fixed-part ko" translate="no">전체</span>
                    <span className="fixed-part en" translate="no">All</span>
                </span>
            );
        }
        // '대회' 특별 처리
        if (genre === '대회') {
            return (
                <span className="manual-label-wrapper">
                    <span className="translated-part">Competition</span>
                    <span className="fixed-part ko" translate="no">대회</span>
                    <span className="fixed-part en" translate="no">Competition</span>
                </span>
            );
        }
        // 나머지는 그냥 일반 텍스트 (Google Translate가 번역)
        return <span>{genre}</span>;
    };

    // 배너 위치 랜덤화를 위한 상태 (새로고침 시마다 결정)
    const isBannerSwapped = useMemo(() => Math.random() > 0.5, []);

    const setGenreParam = (key: string, val: string | null) => {
        const p = new URLSearchParams(searchParams);
        if (val) p.set(key, val);
        else p.delete(key);
        setSearchParams(p);
    };

    // State for Global Section Toggle
    const [showGlobal, setShowGlobal] = React.useState(false);

    // Split events by scope
    const domesticEvents = React.useMemo(() =>
        futureEvents.filter(e => !e.scope || e.scope === 'domestic'),
        [futureEvents]);

    const overseasEvents = React.useMemo(() =>
        futureEvents.filter(e => e.scope === 'overseas'),
        [futureEvents]);

    // 강습 노출 필터 로직: 시작일이 지났으면 노출하지 않음 (Today > StartDate -> Hide)
    // 4,6,7일 수업이어도 오늘(5일)이면 미노출. 오늘(4일)이면 노출.
    const shouldShowClass = (e: Event) => {
        const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD local
        let startDate = e.start_date || e.date;
        if (e.event_dates && e.event_dates.length > 0) {
            const sorted = [...e.event_dates].sort();
            startDate = sorted[0];
        }
        if (!startDate) return true;
        // 오늘이 시작일보다 크면(지났으면) 숨김
        // today(5) > start(4) -> true -> Hide
        // today(4) > start(4) -> false -> Show
        return !(today > startDate);
    };

    return (
        <div className="evt-preview-section">
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

            {/* 3.5. Beginner Section - Starting Swing Dance */}
            <div className="evt-v2-section evt-v2-section-beginner" style={{ margin: '20px 16px' }}>
                <div
                    onClick={() => window.location.href = '/social?scrollTo=practice-section'}
                    style={{
                        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                        borderRadius: '16px',
                        padding: '24px',
                        cursor: 'pointer',
                        transition: 'all 0.3s ease',
                        position: 'relative',
                        overflow: 'hidden'
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-2px)';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)';
                    }}
                >
                    {/* Decorative background elements */}
                    <div style={{
                        position: 'absolute',
                        top: '-50px',
                        right: '-50px',
                        width: '150px',
                        height: '150px',
                        background: 'rgba(255, 255, 255, 0.1)',
                        borderRadius: '50%',
                        pointerEvents: 'none'
                    }} />
                    <div style={{
                        position: 'absolute',
                        bottom: '-30px',
                        left: '-30px',
                        width: '100px',
                        height: '100px',
                        background: 'rgba(255, 255, 255, 0.1)',
                        borderRadius: '50%',
                        pointerEvents: 'none'
                    }} />

                    <div style={{ position: 'relative', zIndex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px' }}>
                            <i className="ri-rocket-line" style={{
                                fontSize: '28px',
                                color: '#fff',
                                marginRight: '12px',
                                animation: 'bounce 2s infinite'
                            }}></i>
                            <h3 style={{
                                margin: 0,
                                color: '#fff',
                                fontSize: 'clamp(0.1rem, 4vw, 1.5rem)',
                                fontWeight: '700',
                                letterSpacing: '-0.5px'
                            }}>
                                스윙댄스를 처음 시작하려면!!!
                            </h3>
                        </div>
                        <p style={{
                            margin: '0 0 16px 0',
                            color: 'rgba(255, 255, 255, 0.9)',
                            fontSize: 'clamp(0.1rem, 3vw, 1.5rem)',
                            lineHeight: '1.6'
                        }}>
                            한번도 안춰본 분들을 위한 동호회 정보를 확인해보세요
                        </p>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            color: '#fff',
                            fontSize: '15px',
                            fontWeight: '600'
                        }}>
                            <span>동호회 둘러보기</span>
                            <i className="ri-arrow-right-line" style={{ marginLeft: '8px', fontSize: '18px' }}></i>
                        </div>
                    </div>
                </div>
            </div>

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
                        <div className="manual-label-wrapper" style={{ justifyContent: 'flex-start' }}>
                            <i className="ri-star-fill" style={{ color: '#ffffff', marginRight: 'min(1vw, 6px)' }}></i>
                            <span className="translated-part">My Favorite Events</span>
                            <span className="fixed-part ko" translate="no">즐겨찾기한 내 이벤트</span>
                            <span className="fixed-part en" translate="no">My Favorites</span>
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
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start' }}>
                        <i className="ri-fire-fill" style={{ color: '#f97316', marginRight: 'min(1vw, 6px)' }}></i>
                        <span>{showGlobal ? 'Global Events' : '예정된 행사'}</span>
                        <span className="evt-v2-count" style={{ marginLeft: 'min(1vw, 6px)' }}>
                            {showGlobal ? overseasEvents.length : domesticEvents.length}
                        </span>

                        {/* Global Toggle Button */}
                        <button
                            onClick={() => setShowGlobal(!showGlobal)}
                            className={`manual-label-wrapper evt-genre-btn ${showGlobal ? 'active' : ''}`}
                            style={{
                                marginLeft: '12px',
                                padding: '6px 14px',
                                fontSize: '13px',
                                background: showGlobal ? 'linear-gradient(135deg, #2563eb 0%, #4f46e5 100%)' : '#ffffff',
                                color: showGlobal ? '#ffffff' : '#64748b',
                                border: showGlobal ? '1px solid transparent' : '1px solid #e2e8f0',
                                borderRadius: '24px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                cursor: 'pointer',
                                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                boxShadow: showGlobal ? '0 4px 12px rgba(37, 99, 235, 0.3)' : '0 1px 2px rgba(0,0,0,0.05)',
                                fontWeight: 500
                            }}
                        >
                            <i className="ri-earth-line" style={{ fontSize: '16px', fontWeight: 'normal' }}></i>
                            {showGlobal ? (
                                <>
                                    <span className="translated-part">Global</span>
                                    <span className="fixed-part ko" translate="no">국외</span>
                                    <span className="fixed-part en" translate="no">Global</span>
                                </>
                            ) : (
                                <>
                                    <span className="translated-part">Korea</span>
                                    <span className="fixed-part ko" translate="no">국내</span>
                                    <span className="fixed-part en" translate="no">Korea</span>
                                </>
                            )}
                            <i className={`ri-arrow-down-s-line evt-global-chevron ${showGlobal ? 'open' : ''}`} style={{ transition: 'transform 0.3s ease' }}></i>
                        </button>
                    </div>

                    {!showGlobal && (
                        <button onClick={() => window.location.href = '/calendar?category=social'} className="evt-view-all-btn manual-label-wrapper">
                            <i className="ri-calendar-event-line" style={{ marginRight: 'min(0.5vw, 4px)' }}></i>
                            <span className="translated-part">Calendar</span>
                            <span className="fixed-part ko" translate="no">전체달력</span>
                            <span className="fixed-part en" translate="no">Calendar</span>
                            <i className="ri-arrow-right-s-line" style={{ marginLeft: 'min(0.5vw, 4px)' }}></i>
                        </button>
                    )}
                </div>

                {/* Genre Filters (Domestic Only) */}
                {!showGlobal && (
                    <div className="evt-v2-genre-wrap">
                        {['전체', ...allGenresStructured.event].map(g => (
                            <button
                                key={g}
                                className={`evt-genre-btn ${((selectedEventGenre || '전체') === g) ? 'active' : ''}`}
                                onClick={() => setGenreParam('event_genre', g === '전체' ? null : g)}
                            >
                                {renderGenreLabel(g)}
                            </button>
                        ))}
                    </div>
                )}

                {/* Events List (Switched) */}
                <HorizontalScrollNav>
                    <div className="evt-v2-horizontal-scroll">
                        {showGlobal ? (
                            // Overseas Events
                            overseasEvents.length > 0 ? (
                                overseasEvents.map(e => (
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
                                ))
                            ) : (
                                <div className="evt-v2-empty" style={{ padding: '20px', width: '100%', textAlign: 'center' }}>
                                    등록된 국외 행사가 없습니다.
                                </div>
                            )
                        ) : (
                            // Domestic Events
                            domesticEvents.filter(e => !selectedEventGenre || e.genre?.includes(selectedEventGenre)).map(e => (
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
                            ))
                        )}
                    </div>
                </HorizontalScrollNav>
            </div>

            {/* 7. Classes Horizontal */}
            <div className="evt-v2-section evt-v2-section-classes">
                <div className="evt-v2-section-title">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start' }}>
                        <i className="ri-calendar-check-fill" style={{ color: '#10b981', marginRight: 'min(1vw, 6px)' }}></i>
                        <span>강습</span>
                        <span className="evt-v2-count" style={{ marginLeft: 'min(1vw, 6px)' }}>{regularClasses.length}</span>
                    </div>
                    <button onClick={() => window.location.href = '/calendar?category=classes&scrollToToday=true'} className="evt-view-all-btn manual-label-wrapper">
                        <i className="ri-calendar-event-line" style={{ marginRight: 'min(0.5vw, 4px)' }}></i>
                        <span className="translated-part">Calendar</span>
                        <span className="fixed-part ko" translate="no">전체달력</span>
                        <span className="fixed-part en" translate="no">Calendar</span>
                        <i className="ri-arrow-right-s-line" style={{ marginLeft: 'min(0.5vw, 4px)' }}></i>
                    </button>
                </div>

                <div className="evt-v2-genre-wrap">
                    {['전체', ...allGenresStructured.class].map(g => (
                        <button
                            key={g}
                            className={`evt-genre-btn ${((selectedClassGenre || '전체') === g) ? 'active' : ''}`}
                            onClick={() => setGenreParam('class_genre', g === '전체' ? null : g)}
                        >
                            {renderGenreLabel(g)}
                        </button>
                    ))}
                </div>

                <HorizontalScrollNav>
                    <div className="evt-v2-horizontal-scroll">
                        {regularClasses
                            .filter(shouldShowClass) // 시작일 지난 강습 숨김
                            .filter(e => !selectedClassGenre || e.genre?.includes(selectedClassGenre))
                            .map(e => (
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
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start' }}>
                        <i className="ri-group-fill" style={{ marginRight: 'min(1vw, 6px)' }}></i>
                        <span>동호회 강습</span>
                        <span className="evt-v2-count" style={{ marginLeft: 'min(1vw, 6px)' }}>{clubLessons.length}</span>
                    </div>
                    <button onClick={() => window.location.href = '/social'} className="evt-view-all-btn manual-label-wrapper">
                        <span className="translated-part">Register Event</span>
                        <span className="fixed-part ko" translate="no">이벤트등록</span>
                        <span className="fixed-part en" translate="no">Register</span>
                        <i className="ri-arrow-right-s-line" style={{ marginLeft: 'min(0.5vw, 4px)' }}></i>
                    </button>
                </div>

                <div className="evt-v2-genre-wrap">
                    {['전체', ...allGenresStructured.club].map(g => (
                        <button
                            key={g}
                            className={`evt-genre-btn ${((selectedClubGenre || '전체') === g) ? 'active' : ''}`}
                            onClick={() => setGenreParam('club_genre', g === '전체' ? null : g)}
                        >
                            {renderGenreLabel(g)}
                        </button>
                    ))}
                </div>

                <HorizontalScrollNav>
                    <div className="evt-v2-horizontal-scroll">
                        {clubLessons
                            .filter(shouldShowClass) // 시작일 지난 강습 숨김
                            .filter(e => !selectedClubGenre || e.genre?.includes(selectedClubGenre))
                            .map(event => (
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
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start' }}>
                        <i className="ri-group-2-fill" style={{ marginRight: 'min(1vw, 6px)' }}></i>
                        <span>동호회 정규강습</span>
                        <span className="evt-v2-count" style={{ marginLeft: 'min(1vw, 6px)' }}>{clubRegularClasses.length}</span>
                    </div>
                </div>

                <HorizontalScrollNav>
                    <div className="evt-v2-horizontal-scroll">
                        {clubRegularClasses
                            .filter(shouldShowClass) // 시작일 지난 강습 숨김
                            .map(e => (
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
        </div >
    );
};
