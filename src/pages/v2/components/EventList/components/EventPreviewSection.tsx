import React, { useMemo } from "react";
// Styles
// Styles
// import "../../../styles/EventListSections.css"; // Migrated to events.css

import PracticeRoomBanner from "../../PracticeRoomBanner";
import ShoppingBanner from "../../ShoppingBanner";
import type { Event } from "../../../utils/eventListUtils";
import type { SocialSchedule } from "../../../../social/types";
import { UnifiedScheduleSection } from "../../UnifiedScheduleSection";
import { EventPreviewRow } from "./EventPreviewRow";
import { NewEventsBanner } from "../../NewEventsBanner";


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
    newlyRegisteredEvents,
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
        <div className="ELS-section">
            {/* 1. New Unified Schedule Section (Test Mode) */}
            <UnifiedScheduleSection
                todaySchedules={todaySocialSchedules || []}
                futureSchedules={thisWeekSocialSchedules || []}
                onEventClick={onEventClick}
                onRefresh={refreshSocialSchedules}
            />

            {/* 1.5 Newly Registered Events Section (24 hours) */}
            {newlyRegisteredEvents.length > 0 && (
                <NewEventsBanner
                    events={newlyRegisteredEvents}
                    onEventClick={onEventClick}
                    defaultThumbnailClass={defaultThumbnailClass}
                    defaultThumbnailEvent={defaultThumbnailEvent}
                />
            )}

            {/* 2. Global Scope Switcher */}
            <div className="ELS-scopeSwitcherContainer">
                <div className="ELS-scopeSwitcher" data-scope={showGlobal ? "overseas" : "domestic"}>
                    <div className="ELS-scopeIndicator" />
                    <button
                        className={`ELS-scopeBtn manual-label-wrapper ${!showGlobal ? 'is-active' : ''}`}
                        onClick={() => setShowGlobal(false)}
                    >
                        <i className="ri-map-pin-2-line"></i>
                        <span className="translated-part">Domestic</span>
                        <span className="fixed-part ko" translate="no">국내 행사</span>
                        <span className="fixed-part en" translate="no">Domestic</span>
                    </button>
                    <button
                        className={`ELS-scopeBtn manual-label-wrapper ${showGlobal ? 'is-active' : ''}`}
                        onClick={() => setShowGlobal(true)}
                    >
                        <i className="ri-earth-line"></i>
                        <span className="translated-part">Global</span>
                        <span className="fixed-part ko" translate="no">국외 행사</span>
                        <span className="fixed-part en" translate="no">Global</span>
                    </button>
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
                <EventPreviewRow
                    title="즐겨찾기한 내 이벤트"
                    // icon="ri-star-fill"
                    // iconColor="#ffffff"
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

            {/* 6. Events Rows (Domestic or Overseas based on Global Scope) */}
            <EventPreviewRow
                title={showGlobal ? 'Global Events' : '예정된 행사'}
                // icon="ri-fire-fill" 
                // iconColor={showGlobal ? "#3b82f6" : "#f97316"}
                count={showGlobal ? overseasEvents.length : domesticEvents.length}
                viewAllUrl={!showGlobal ? "/calendar" : undefined}
                viewAllLabel="달력보기"
                genres={!showGlobal ? ['전체', ...allGenresStructured.event] : undefined}
                selectedGenre={selectedEventGenre}
                onGenreChange={(g) => setGenreParam('event_genre', g)}
                renderGenreLabel={renderGenreLabel}
                events={showGlobal ? overseasEvents : domesticEvents.filter(e => !selectedEventGenre || e.genre?.includes(selectedEventGenre))}
                onEventClick={onEventClick}
                onEventHover={onEventHover}
                highlightEventId={highlightEvent?.id}
                defaultThumbnailClass={defaultThumbnailClass}
                defaultThumbnailEvent={defaultThumbnailEvent}
                effectiveFavoriteIds={effectiveFavoriteIds}
                handleToggleFavorite={handleToggleFavorite}
            />

            {/* 7. Classes Row */}
            {!showGlobal && (
                <EventPreviewRow
                    title="강습"
                    // icon="ri-calendar-check-fill"
                    // iconColor="#10b981"
                    count={regularClasses.length}
                    viewAllUrl="/calendar?category=classes&scrollToToday=true"
                    viewAllLabel="달력보기"
                    genres={['전체', ...allGenresStructured.class]}
                    selectedGenre={selectedClassGenre}
                    onGenreChange={(g) => setGenreParam('class_genre', g)}
                    renderGenreLabel={renderGenreLabel}
                    events={regularClasses.filter(shouldShowClass).filter(e => !selectedClassGenre || e.genre?.includes(selectedClassGenre))}
                    onEventClick={onEventClick}
                    onEventHover={onEventHover}
                    highlightEventId={highlightEvent?.id}
                    defaultThumbnailClass={defaultThumbnailClass}
                    defaultThumbnailEvent={defaultThumbnailEvent}
                    effectiveFavoriteIds={effectiveFavoriteIds}
                    handleToggleFavorite={handleToggleFavorite}
                />
            )}

            {/* 8. Club Lesson Row */}
            {!showGlobal && (
                <EventPreviewRow
                    title="동호회 강습"
                    // icon="ri-group-fill"
                    // iconColor="#9ca3af" // Default color or custom
                    count={clubLessons.length}
                    viewAllUrl="/social"
                    viewAllLabel="이벤트등록"
                    genres={['전체', ...allGenresStructured.club]}
                    selectedGenre={selectedClubGenre}
                    onGenreChange={(g) => setGenreParam('club_genre', g)}
                    renderGenreLabel={renderGenreLabel}
                    events={clubLessons.filter(shouldShowClass).filter(e => !selectedClubGenre || e.genre?.includes(selectedClubGenre))}
                    onEventClick={onEventClick}
                    onEventHover={onEventHover}
                    highlightEventId={highlightEvent?.id}
                    defaultThumbnailClass={defaultThumbnailClass}
                    defaultThumbnailEvent={defaultThumbnailEvent}
                    effectiveFavoriteIds={effectiveFavoriteIds}
                    handleToggleFavorite={handleToggleFavorite}
                />
            )}

            {/* 9. Club Regular Class Row */}
            {!showGlobal && clubRegularClasses.length > 0 && (
                <EventPreviewRow
                    title="동호회 정규강습"
                    // icon="ri-group-2-fill"
                    // iconColor="#9ca3af"
                    count={clubRegularClasses.length}
                    events={clubRegularClasses.filter(shouldShowClass)}
                    onEventClick={onEventClick}
                    onEventHover={onEventHover}
                    highlightEventId={highlightEvent?.id}
                    defaultThumbnailClass={defaultThumbnailClass}
                    defaultThumbnailEvent={defaultThumbnailEvent}
                    effectiveFavoriteIds={effectiveFavoriteIds}
                    handleToggleFavorite={handleToggleFavorite}
                />
            )}

            {/* 10. Slot B: Random Banner (Shopping or Practice Room) */}
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
