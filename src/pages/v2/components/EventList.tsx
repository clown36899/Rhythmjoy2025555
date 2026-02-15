import React, { useMemo, useCallback, useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../../../contexts/AuthContext";
import { supabase } from "../../../lib/supabase";

// Components
import LocalLoading from "../../../components/LocalLoading";
// import GlobalLoadingOverlay from "../../../components/GlobalLoadingOverlay"; // Remove unused

// Hooks
import { useEventsQuery } from "../../../hooks/queries/useEventsQuery";
// Removed useSocialSchedulesQuery
import { useUserInteractions } from "../../../hooks/useUserInteractions";
import { useEventFilters } from "./EventList/hooks/useEventFilters";
import { useBoardStaticData } from "../../../contexts/BoardDataContext";
import { useRandomizedEvents } from "./EventList/hooks/useRandomizedEvents";

// Styles
import "../../../styles/domains/events.css";
// import "../styles/EventListSections.css"; // Migrated to events.css
// import "../styles/EventCard.css"; // Will be migrated next

// Sub-components
import { EventFavoritesView } from "./EventList/components/EventFavoritesView";
import { MyEventsView } from "./EventList/components/MyEventsView";
import { EventPreviewSection } from "./EventList/components/EventPreviewSection";
import { EventHorizontalListView } from "./EventList/components/EventHorizontalListView";
const VenueSelectModal = React.lazy(() => import("./VenueSelectModal"));

// Utils
import {
  getLocalDateString,
  getKSTDay,
  sortEvents
} from "../utils/eventListUtils";
import type { Event } from "../utils/eventListUtils";

interface EventListProps {
  currentMonth?: Date;
  onMonthChange?: (date: Date) => void;
  selectedDate: Date | null;
  onEventClick?: (event: Event) => void;
  calendarMode: 'collapsed' | 'expanded' | 'fullscreen';
  isAdminMode?: boolean;
  adminType?: "super" | "sub" | null;
  highlightEvent?: { id: number | string } | null;
  onEventHover?: (event: Event | null) => void;
  onSectionViewModeChange: (mode: 'preview' | 'viewAll-events' | 'viewAll-classes') => void;
}

const EventList: React.FC<EventListProps> = ({
  currentMonth,
  selectedDate,
  onEventClick,
  calendarMode,
  isAdminMode = false,
  highlightEvent,
  onEventHover,
  // onSectionViewModeChange // Unused
}) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();

  // [Fix] 랜덤 시드 고정 - 사이트 진입/새로고침 시에만 한 번 생성되도록 변경
  const [randomSeed] = useState(() => Math.floor(Math.random() * 1000000));

  // 1. Data Fetching Hook (TanStack Query)
  const { data: events = [], isLoading: loading, refetch: refetchEvents } = useEventsQuery();
  const fetchEvents = useCallback(async () => {
    await refetchEvents();
  }, [refetchEvents]);

  // 2. Removed Social Schedules Hook (All integrated into events)

  // 3.5 Genre Weights from BoardDataContext
  const { data: boardData } = useBoardStaticData();
  const genreWeights = boardData?.genre_weights || null;

  // 3.6 Memoized Randomized Lists (Moved to custom hook for cleanliness and re-randomization on menu click)
  const {
    randomizedFutureEvents,
    randomizedRegularClasses,
    randomizedClubLessons,
    randomizedClubRegularClasses
  } = useRandomizedEvents({
    events,
    genreWeights
  });

  // 3.65 Newly Registered Events (72 hours)
  const newlyRegisteredEvents = useMemo(() => {
    const now = new Date();
    const seventyTwoHoursAgo = new Date(now.getTime() - 72 * 60 * 60 * 1000);

    return events.filter(event => {
      // 소셜 스케줄(통합 이벤트)은 신규 등록 섹션에서 제외
      if (event.is_social_integrated) return false;
      if (typeof event.id === 'string' && event.id.startsWith('social-')) return false;

      if (!event.created_at) return false;
      const created = new Date(event.created_at);
      const isWithin72Hours = created > seventyTwoHoursAgo;

      // 🎯 [NEW FILTER] 제외 조건: 이미 지난 이벤트는 표시하지 않음
      const todayStr = getLocalDateString();
      const eventDate = event.end_date || event.date || "";
      const isFutureEvent = eventDate >= todayStr;

      // 🎯 [UPDATE] 라이브밴드 장르는 72시간 제한 없이 계속 노출 (단, 미래 이벤트여야 함)
      const isLiveBand = event.genre?.includes('라이브밴드');
      const isSocial = event.category === 'social';

      // [Request] 소셜 카테고리는 '라이브밴드'인 경우에만 노출 (DJ 등 제외)
      if (isSocial && !isLiveBand) return false;

      return (isWithin72Hours || isLiveBand) && isFutureEvent;
    }).sort((a, b) => {
      // 최신 등록순으로 정렬
      const timeA = new Date(a.created_at!).getTime();
      const timeB = new Date(b.created_at!).getTime();
      return timeB - timeA;
    });
  }, [events]);

  // 3.7 Realtime Subscription to sync data immediately
  useEffect(() => {
    const channel = supabase
      .channel('v2-event-list-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'events' },
        () => {
          fetchEvents();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchEvents]);

  // 4. Derived States (Genres, etc.)
  const allGenres = useMemo(() => {
    const genres = new Set<string>();
    events.forEach((event) => {
      if (event.genre) {
        event.genre.split(",").forEach((g) => {
          const trimmed = g.trim();
          if (trimmed) genres.add(trimmed);
        });
      }
    });
    return Array.from(genres).sort();
  }, [events]);

  const allGenresStructured = useMemo(() => {
    const today = getLocalDateString();

    const classGenres = new Set<string>();
    const clubGenres = new Set<string>();
    const eventGenres = new Set<string>();

    events.forEach(event => {
      // 장르가 있어야 함
      if (event.genre) {
        // 종료 여부 확인 (종료된 것도 편집 시에는 추천에 뜨는 게 좋을 수 있으나, 기존 로직 따름: 유효한 것만)
        const endDate = event.end_date || event.date;
        const isValid = !endDate || endDate >= today;

        if (isValid) {
          if (event.category === 'class') {
            event.genre.split(',').forEach(g => classGenres.add(g.trim()));
          } else if (event.category === 'club') {
            event.genre.split(',').forEach(g => {
              const trimmed = g.trim();
              if (!trimmed.includes('정규강습')) {
                clubGenres.add(trimmed);
              }
            });
          } else if (event.category === 'event') {
            event.genre.split(',').forEach(g => eventGenres.add(g.trim()));
          }
        }
      }
    });

    return {
      class: Array.from(classGenres).sort((a, b) => a.localeCompare(b, "ko")),
      club: Array.from(clubGenres).sort((a, b) => a.localeCompare(b, "ko")),
      event: Array.from(eventGenres).sort((a, b) => a.localeCompare(b, "ko"))
    };
  }, [events]);

  // 5. Filtering Logic
  const view = searchParams.get('view');

  // 전체보기 모드일 경우 카테고리 강제 설정
  const selectedCategory = useMemo(() => {
    if (view === 'viewAll-events') return 'event';
    if (view === 'viewAll-classes') return 'class';
    return searchParams.get("category") || "all";
  }, [view, searchParams]);
  const selectedGenre = searchParams.get("genre") || null;
  const searchTerm = searchParams.get("search") || "";
  const selectedWeekday = searchParams.get("weekday") ? parseInt(searchParams.get("weekday")!) : null;
  const sortBy = (searchParams.get("sort") as "random" | "time" | "title") || "time";

  const { sortedEvents } = useEventFilters({
    events,
    selectedDate,
    currentMonth,
    viewMode: calendarMode === 'fullscreen' ? 'month' : 'month',
    selectedCategory,
    selectedGenre,
    searchTerm,
    selectedWeekday,
    sortBy,
    seed: randomSeed
  });

  // Venue Modal State
  const [isVenueModalOpen, setIsVenueModalOpen] = useState(false);

  // Favorite Handlers using useUserInteractions
  const { interactions, toggleEventFavorite } = useUserInteractions(user?.id || null);

  // Convert API array to Set for fast O(1) lookups
  const favoriteEventIds = useMemo<Set<number>>(() => {
    if (!interactions?.event_favorites) return new Set<number>();
    return new Set(interactions.event_favorites.map(id => Number(id)));
  }, [interactions?.event_favorites]);

  const handleToggleFavorite = useCallback(async (eventId: number | string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();

    if (!user) {
      window.dispatchEvent(new CustomEvent('openLoginModal', {
        detail: { message: '즐겨찾기는 로그인 후 이용 가능합니다.' }
      }));
      return;
    }

    try {
      await toggleEventFavorite(eventId);
    } catch (err) {
      console.error('Error toggling favorite:', err);
    }
  }, [user, toggleEventFavorite]);


  if (loading && events.length === 0) {
    return <LocalLoading message="이벤트를 불러오는 중..." />;
  }

  return (
    <div className="no-select evt-flex-col-full">

      {view === 'favorites' ? (
        <EventFavoritesView
          favoritesTab={searchParams.get('favTab') || 'events'}
          setFavoritesTab={(tab) => {
            const p = new URLSearchParams(searchParams);
            p.set('favTab', tab);
            setSearchParams(p);
          }}
          futureFavorites={events.filter(e => favoriteEventIds.has(Number(e.id)) && (e.end_date || e.date || "") >= getLocalDateString())}
          pastFavorites={events.filter(e => favoriteEventIds.has(Number(e.id)) && (e.end_date || e.date || "") < getLocalDateString())}
          favoritedBoardPosts={[]}
          favoriteSocialGroups={[]}
          favoritePracticeRooms={[]}
          favoriteShops={[]}
          pastEventsViewMode="grid-2"
          setPastEventsViewMode={() => { }}
          onEventClick={(e) => onEventClick?.(e)}
          onEventHover={(id) => {
            if (id === null) onEventHover?.(null);
            else onEventHover?.(events.find(ev => String(ev.id) === String(id)) ?? null);
          }}
          highlightEvent={highlightEvent ?? null}
          selectedDate={selectedDate}
          defaultThumbnailClass="default-class"
          defaultThumbnailEvent="default-event"
          effectiveFavoriteIds={favoriteEventIds}
          handleToggleFavorite={handleToggleFavorite}
          handleRemoveFavoriteBoardPost={() => { }}
          handleRemoveSocialGroupFavorite={() => { }}
          handleRemovePracticeRoomFavorite={() => { }}
          handleRemoveShopFavorite={() => { }}
          isAdminMode={isAdminMode}
        />
      ) : view === 'my-events' ? (
        <MyEventsView
          myEvents={{
            future: events.filter(e => e.user_id === user?.id && (e.end_date || e.date || "") >= getLocalDateString()),
            past: events.filter(e => e.user_id === user?.id && (e.end_date || e.date || "") < getLocalDateString()),
            all: events.filter(e => e.user_id === user?.id)
          }}
          onEventClick={(e) => onEventClick?.(e)}
          onEventHover={(id) => {
            if (id === null) onEventHover?.(null);
            else onEventHover?.(events.find(ev => String(ev.id) === String(id)) ?? null);
          }}
          highlightEvent={highlightEvent ?? null}
          selectedDate={selectedDate}
          defaultThumbnailClass="default-class"
          defaultThumbnailEvent="default-event"
          effectiveFavoriteIds={favoriteEventIds}
          handleToggleFavorite={handleToggleFavorite}
        />
      ) : (view === 'viewAll-events' || view === 'viewAll-classes' || searchTerm.trim() || selectedDate || (selectedCategory !== 'all' && selectedCategory !== 'none')) ? (
        <EventHorizontalListView
          events={view?.startsWith('viewAll')
            ? sortEvents(
              events.filter(e => e.category === (view === 'viewAll-events' ? 'event' : 'class') && (e.end_date || e.date || "") >= getLocalDateString()),
              'random',
              false,
              null,
              false,
              randomSeed
            )
            : sortedEvents}
          onEventClick={(e: Event) => onEventClick?.(e)}
          defaultThumbnailEvent="default-event"
        />
      ) : (
        <EventPreviewSection
          isSocialSchedulesLoading={loading}
          todaySocialSchedules={(() => {
            const todayStr = getLocalDateString();

            // A. All Socials from 'events' table
            // Condition: (category='social') OR (category='event' AND !group_id)
            const todaySocials = events
              .filter(e => {
                const eDate = e.date || "";
                if (eDate < todayStr || (e.start_date || eDate) > todayStr) return false; // Date Filtering

                if (e.category === 'social') return true;
                if (e.category === 'event') return true;
                return false;
              })
              .map(e => ({
                id: e.id, // ✅ ID 접두어 제거 (모두 events 테이블 ID 사용)
                group_id: e.group_id || -1,
                title: e.title,
                date: e.date,
                start_time: e.time,
                place_name: e.location,
                image_url: e.image,
                image_medium: e.image_medium || e.image,
                image_thumbnail: e.image_thumbnail || e.image,
                user_id: e.user_id,
                created_at: e.created_at,
                updated_at: '',
                description: e.description,
                board_users: e.board_users,
                is_mapped_event: true,
                scope: e.scope,
                category: e.category // Pass category if needed
              } as any));

            // No need to fetch from old socialSchedules anymore

            // 🎯 Sort: Domestic First, Global Last
            todaySocials.sort((a, b) => {
              const isGlobalA = a.scope === 'overseas';
              const isGlobalB = b.scope === 'overseas';
              if (isGlobalA !== isGlobalB) return isGlobalA ? 1 : -1;

              // Same scope: Sort by Time (start_time)
              // If start_time is missing, fallback to empty string (top)
              const timeA = a.start_time || '';
              const timeB = b.start_time || '';
              return timeA.localeCompare(timeB);
            });

            return todaySocials;
          })()}
          thisWeekSocialSchedules={(() => {
            const todayStr = getLocalDateString();
            const kstDay = getKSTDay();
            const daysFromMonday = kstDay === 0 ? 6 : kstDay - 1;

            // Calculate Week Range for Filter (Mon - Next Next Sun, 2 weeks)
            const todayDate = new Date(todayStr);
            const weekStart = new Date(todayDate);
            weekStart.setDate(todayDate.getDate() - daysFromMonday);

            // 2 weeks after Monday of this week
            const twoWeeksLater = new Date(weekStart);
            twoWeeksLater.setDate(weekStart.getDate() + 13); // +13 = Next Sunday

            const weekStartStr = getLocalDateString(weekStart);
            const twoWeeksEndStr = getLocalDateString(twoWeeksLater);

            // Fetch 2 weeks of events (social + event)
            const weekSocials = events
              .filter(e => {
                const eDate = e.date || "";
                // Include this week AND next week
                if (eDate < weekStartStr || eDate > twoWeeksEndStr) return false;

                if (e.category === 'social') return true;
                if (e.category === 'event') return true;
                return false;
              })
              .map(e => ({
                id: e.id, // ✅ ID 접두어 제거
                group_id: e.group_id || -1,
                title: e.title,
                date: e.date,
                start_time: e.time,
                place_name: e.location,
                image_url: e.image,
                image_medium: e.image_medium || e.image,
                image_thumbnail: e.image_thumbnail || e.image,
                user_id: e.user_id,
                created_at: e.created_at,
                updated_at: '',
                description: e.description,
                board_users: e.board_users,
                is_mapped_event: true,
                scope: e.scope,
                category: e.category
              } as any));

            // 🎯 Sort: Domestic First, Global Last + Date/Time
            weekSocials.sort((a, b) => {
              const isGlobalA = a.scope === 'overseas';
              const isGlobalB = b.scope === 'overseas';
              if (isGlobalA !== isGlobalB) return isGlobalA ? 1 : -1;

              // Same scope: Sort by Date then Time
              const dateA = a.date || '';
              const dateB = b.date || '';
              if (dateA !== dateB) return dateA.localeCompare(dateB);

              const timeA = a.start_time || '';
              const timeB = b.start_time || '';
              return timeA.localeCompare(timeB);
            });

            return weekSocials;
          })()}
          refreshSocialSchedules={fetchEvents}
          futureEvents={randomizedFutureEvents}
          regularClasses={randomizedRegularClasses}
          clubLessons={randomizedClubLessons}
          clubRegularClasses={randomizedClubRegularClasses}
          newlyRegisteredEvents={newlyRegisteredEvents}
          favoriteEventsList={events.filter(e => favoriteEventIds.has(Number(e.id)))}
          // events={events} // Removed
          allGenres={allGenres}
          allGenresStructured={allGenresStructured}
          selectedEventGenre={searchParams.get('event_genre')}
          selectedClassGenre={searchParams.get('class_genre')}
          selectedClubGenre={searchParams.get('club_genre')}
          onEventClick={onEventClick || (() => { })}
          onEventHover={(id) => {
            if (!onEventHover) return;
            if (id === null) { onEventHover(null); return; }
            const found = events.find(ev => String(ev.id) === String(id));
            onEventHover(found ?? null);
          }}
          highlightEvent={highlightEvent ?? null}
          defaultThumbnailClass="default-class"
          defaultThumbnailEvent="default-event"
          effectiveFavoriteIds={favoriteEventIds}
          handleToggleFavorite={handleToggleFavorite}
          searchParams={searchParams}
          setSearchParams={setSearchParams}
        />
      )}


      <React.Suspense fallback={null}>
        <VenueSelectModal
          isOpen={isVenueModalOpen}
          onClose={() => setIsVenueModalOpen(false)}
          onSelect={(venue: { name: string; link?: string }) => {
            window.dispatchEvent(new CustomEvent('venue_selected', { detail: venue }));
          }}
          onManualInput={(name: string, link: string) => {
            window.dispatchEvent(new CustomEvent('venue_manual_input', { detail: { name, link } }));
          }}
        />
      </React.Suspense>
    </div>
  );
};

export default EventList;
