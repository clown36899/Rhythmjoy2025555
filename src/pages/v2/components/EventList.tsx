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
import { useHomeSectionVisibility } from "./EventList/hooks/useHomeSectionVisibility";
import { useNebFilterSettings } from "./EventList/hooks/useNebFilterSettings";

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
  const sectionVisibility = useHomeSectionVisibility();
  const nebFilterSettings = useNebFilterSettings();

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

  // 3.65 Newly Registered Events — NEB 광고 섹션 (관리자 설정 기반)
  const newlyRegisteredEvents = useMemo(() => {
    const {
      sort_by,
      time_window_hours,
      max_items,
      use_fallback,
      include_genres,
    } = nebFilterSettings;

    const now = new Date();
    const windowAgo = new Date(now.getTime() - time_window_hours * 60 * 60 * 1000);
    const todayStr = getLocalDateString();

    const isEligible = (event: Event) => {
      // 장르 필터: 이벤트의 장르 중 하나라도 포함 장르 목록에 있으면 통과
      const eventGenres = (event.genre || '').split(',').map(g => g.trim()).filter(Boolean);
      // 장르가 없는 이벤트는 제외
      if (eventGenres.length === 0) return false;
      if (!eventGenres.some(g => include_genres.includes(g))) return false;

      // 미래/오늘 일정만 포함
      const eventEndDate = event.end_date || event.date || "";
      if (eventEndDate < todayStr) return false;

      return true;
    };

    if (sort_by === 'date') {
      // 이벤트 날짜 임박순
      return events
        .filter(isEligible)
        .sort((a, b) => {
          const da = a.date || a.start_date || '';
          const db = b.date || b.start_date || '';
          return da.localeCompare(db);
        })
        .slice(0, max_items);
    }

    // 등록일 기준
    const withinWindow = events.filter(event => {
      if (!isEligible(event) || !event.created_at) return false;
      return new Date(event.created_at) > windowAgo;
    }).sort((a, b) => new Date(b.created_at!).getTime() - new Date(a.created_at!).getTime());

    if (use_fallback && withinWindow.length < max_items) {
      const fallback = events
        .filter(isEligible)
        .sort((a, b) => new Date(b.created_at!).getTime() - new Date(a.created_at!).getTime())
        .slice(0, max_items);
      const seenIds = new Set(withinWindow.map(e => e.id));
      const combined = [...withinWindow];
      for (const e of fallback) {
        if (!seenIds.has(e.id)) {
          combined.push(e);
          if (combined.length >= max_items) break;
        }
      }
      return combined;
    }

    return withinWindow.slice(0, max_items);
  }, [events, nebFilterSettings]);

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
          socialSchedules={events
            .filter(e => e.category === 'social' || e.category === 'event')
            .map(e => ({
              id: e.id,
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
            } as any))}
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
          sectionVisibility={sectionVisibility}
        />
      )}


      <React.Suspense fallback={null}>
        <VenueSelectModal
          isOpen={isVenueModalOpen}
          onClose={() => setIsVenueModalOpen(false)}
          onSelect={(venue: { name: string; link?: string }) => {
            window.dispatchEvent(new CustomEvent('venue_selected', { detail: venue }));
          }}
          onManualInput={(name: string, link: string, address?: string) => {
            window.dispatchEvent(new CustomEvent('venue_manual_input', { detail: { name, link, address } }));
          }}
        />
      </React.Suspense>
    </div>
  );
};

export default EventList;
