import React, { useMemo, useRef } from "react";
// Styles
// Styles
// import "../../../styles/EventListSections.css"; // Migrated to events.css

import PracticeRoomBanner from "../../PracticeRoomBanner";
import ShoppingBanner from "../../ShoppingBanner";
import type { Event } from "../../../utils/eventListUtils";
import type { SocialSchedule } from "../../../../social/types";
import { UnifiedScheduleSection } from "../../UnifiedScheduleSection";
import { QuickNoticeInput } from "../../../../../components/QuickNoticeInput";
import { EventPreviewRow } from "./EventPreviewRow";
import { NewEventsBanner } from "../../NewEventsBanner";
import { HomeNavButtonsSection } from "../../HomeNavButtonsSection";
import { getCardThumbnail } from "../../../../../utils/getEventThumbnail";


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
    socialSchedules,
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

    // Extract real images for HomeNavButtonsSection (안정화: 데이터가 실제로 바뀔 때만 재셔플)
    const socialImagesRef = useRef<string[]>([]);
    const socialImagesCountRef = useRef<number>(-1);
    const recentSocialImages = useMemo(() => {
        const list = socialSchedules || [];
        const images = list
            .filter(s => s.category === 'social')
            .filter(s => s.image_url || s.image_thumbnail || s.image_medium || s.image)
            .map(s => getCardThumbnail(s as any))
            .filter(Boolean) as string[];
        // 이미지 개수가 동일하면 이전 셔플 결과 재사용 (깜빡임 방지)
        if (images.length === socialImagesCountRef.current && socialImagesRef.current.length > 0) {
            return socialImagesRef.current;
        }
        // Fisher-Yates 셔플로 랜덤 정렬
        for (let i = images.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [images[i], images[j]] = [images[j], images[i]];
        }
        const result = images.slice(0, 10);
        socialImagesRef.current = result;
        socialImagesCountRef.current = images.length;
        return result;
    }, [socialSchedules]);

    const recentEventImages = useMemo(() => {
        return futureEvents
            .filter(e => !e.scope || e.scope === 'domestic')
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
            {newlyRegisteredEvents.length > 0 && (
                <NewEventsBanner
                    events={newlyRegisteredEvents}
                    onEventClick={onEventClick}
                    defaultThumbnailClass={defaultThumbnailClass}
                    defaultThumbnailEvent={defaultThumbnailEvent}
                />
            )}

            {/* 0. Home Navigation Buttons (New) */}
            <HomeNavButtonsSection
                socialImages={recentSocialImages}
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

            {/* Quick Notice Input */}
            <QuickNoticeInput />

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
                <div className="ELS-banner-wrapper">
                    <ShoppingBanner />
                </div>
            ) : (
                <div className="ELS-banner-wrapper">
                    <PracticeRoomBanner />
                </div>
            )}

            {/* 5. Favorites (Horizontal) */}
            {favoriteEventsList.length > 0 && (
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

            {/* 6. Events Rows (Domestic or Overseas based on Global Scope) */}
            <EventPreviewRow
                title={showGlobal ? 'Global Events' : '예정된 행사'}
                icon={showGlobal ? "ri-earth-line" : "ri-fire-fill"}
                className={showGlobal ? "ELS-section--global" : "ELS-section--upcoming"}
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
                    icon="ri-calendar-check-fill"
                    className="ELS-section--classes"
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
                    icon="ri-group-fill"
                    className="ELS-section--club-lessons"
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
                    icon="ri-group-2-fill"
                    className="ELS-section--club-regular"
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
            <div className="ELS-banner-wrapper">
                {isBannerSwapped ? (
                    <PracticeRoomBanner />
                ) : (
                    <ShoppingBanner />
                )}
            </div>
        </div >
    );
};
