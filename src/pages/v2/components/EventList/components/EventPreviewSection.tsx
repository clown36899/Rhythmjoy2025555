import React, { useMemo, useRef } from "react";
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

            <EventPreviewRow
                title="예정된 행사"
                icon="ri-fire-fill"
                className="ELS-section--upcoming"
                count={futureEvents.length}
                viewAllUrl="/calendar"
                viewAllLabel="달력보기"
                genres={['전체', ...allGenresStructured.event]}
                selectedGenre={selectedEventGenre}
                onGenreChange={(g) => setGenreParam('event_genre', g)}
                renderGenreLabel={renderGenreLabel}
                events={futureEvents.filter(e => !selectedEventGenre || e.genre?.includes(selectedEventGenre))}
                onEventClick={onEventClick}
                onEventHover={onEventHover}
                highlightEventId={highlightEvent?.id}
                defaultThumbnailClass={defaultThumbnailClass}
                defaultThumbnailEvent={defaultThumbnailEvent}
                effectiveFavoriteIds={effectiveFavoriteIds}
                handleToggleFavorite={handleToggleFavorite}
            />

            {/* 7. Classes Row */}
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

            {/* 8. Club Lesson Row */}

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


            {/* 9. Club Regular Class Row */}
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
