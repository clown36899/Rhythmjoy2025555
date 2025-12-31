import React, { useMemo, useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../../../contexts/AuthContext";
import { supabase } from "../../../lib/supabase";

// Components
import GlobalLoadingOverlay from "../../../components/GlobalLoadingOverlay";

// Hooks
import { useEventsQuery } from "../../../hooks/queries/useEventsQuery";
import { useSocialSchedulesQuery } from "../../../hooks/queries/useSocialSchedulesQuery";
import { useEventFilters } from "./EventList/hooks/useEventFilters";
import { useEventSelection } from "./EventList/hooks/useEventSelection";

// Styles
import "../styles/EventListSections.css";
import "../styles/EventCard.css";

// Sub-components
import { EventFavoritesView } from "./EventList/components/EventFavoritesView";
import { MyEventsView } from "./EventList/components/MyEventsView";
import { EventPreviewSection } from "./EventList/components/EventPreviewSection";
import { EventFilteredGridView } from "./EventList/components/EventFilteredGridView";
import { EventEditModal } from "./EventList/components/EventEditModal";
import VenueSelectModal from "./VenueSelectModal";

// Utils
import {
  getLocalDateString,
  getKSTDay,
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
  highlightEvent?: Event | null;
  onEventHover?: (event: Event | null) => void;
}

const EventList: React.FC<EventListProps> = ({
  currentMonth,
  selectedDate,
  onEventClick,
  calendarMode,
  isAdminMode = false,
  adminType = null,
  highlightEvent,
  onEventHover
}) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();

  // 1. Data Fetching Hook (TanStack Query)
  const { data: events = [], isLoading: loading, refetch: refetchEvents } = useEventsQuery();
  const fetchEvents = useCallback(async () => {
    await refetchEvents();
  }, [refetchEvents]);

  // 2. Social Schedules Hook (TanStack Query)
  const { data: socialSchedules = [], isLoading: socialLoading, refetch: refetchSocial } = useSocialSchedulesQuery();
  const refreshSocial = useCallback(async () => {
    await refetchSocial();
  }, [refetchSocial]);

  // 3. Selection & Interaction Hook
  const {
    eventToEdit,
    setEventToEdit,
    isEditingWithDetail,
    setIsEditingWithDetail,
    isFetchingDetail,
    isDeleting,
    handleDeleteClick
  } = useEventSelection({
    isAdminMode,
    adminType,
    fetchEvents
  });

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

  // 5. Filtering Logic from Hook
  const selectedCategory = searchParams.get("category") || "all";
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
    sortBy
  });

  // Venue Modal State
  const [isVenueModalOpen, setIsVenueModalOpen] = useState(false);

  // Favorite Handlers
  const favoriteEventIds = (window as any).favoriteEventIds || new Set<number>();
  const handleToggleFavorite = useCallback(async (eventId: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    window.dispatchEvent(new CustomEvent('toggleEventFavorite', { detail: { eventId } }));
  }, []);

  // Update logic (moved to EventList for orchestration)
  const handleSaveEvent = async (formData: any, imageFile: File | null) => {
    if (!eventToEdit) return;
    try {
      // 1. Handle Image Upload if needed
      let imageUrl = formData.image;
      if (imageFile) {
        const fileExt = imageFile.name.split('.').pop();
        const fileName = `${Math.random()}.${fileExt}`;
        const filePath = `events/${eventToEdit.id}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('event-images')
          .upload(filePath, imageFile);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('event-images')
          .getPublicUrl(filePath);

        imageUrl = publicUrl;
      }

      // 2. Update DB
      const { error } = await supabase
        .from('events')
        .update({
          title: formData.title,
          genre: formData.genre,
          category: formData.category,
          location: formData.location,
          link1: formData.locationLink,
          start_date: formData.start_date,
          end_date: formData.end_date,
          event_dates: formData.event_dates,
          description: formData.description,
          video_url: formData.videoUrl,
          image: imageUrl,
          organizer: formData.organizerName,
          organizer_phone: formData.organizerPhone,
          show_title_on_billboard: formData.showTitleOnBillboard
        })
        .eq('id', eventToEdit.id);

      if (error) throw error;

      alert("수정되었습니다.");
      setIsEditingWithDetail(false);
      setEventToEdit(null);
      await fetchEvents();
    } catch (err: any) {
      console.error("Error saving event:", err);
      alert(err.message || "수정 중 오류가 발생했습니다.");
    }
  };

  if (loading && events.length === 0) {
    return <GlobalLoadingOverlay isLoading={true} />;
  }

  const view = searchParams.get('view');

  return (
    <div className="no-select evt-flex-col-full">
      {(isDeleting || isFetchingDetail) && createPortal(
        <div className="evt-delete-overlay">
          <div className="evt-loading-spinner-outer">
            <div className="evt-loading-spinner-base evt-loading-spinner-gray"></div>
            <div className="evt-loading-spinner-base evt-loading-spinner-blue evt-animate-spin"></div>
          </div>
          <p className="event-list-deleting-text">{isDeleting ? "삭제 중..." : "데이터 로딩 중..."}</p>
        </div>, document.body
      )}

      {view === 'favorites' ? (
        <EventFavoritesView
          favoritesTab={searchParams.get('favTab') || 'events'}
          setFavoritesTab={(tab) => {
            const p = new URLSearchParams(searchParams);
            p.set('favTab', tab);
            setSearchParams(p);
          }}
          futureFavorites={events.filter(e => favoriteEventIds.has(e.id) && (e.end_date || e.date || "") >= getLocalDateString())}
          pastFavorites={events.filter(e => favoriteEventIds.has(e.id) && (e.end_date || e.date || "") < getLocalDateString())}
          favoritedBoardPosts={[]}
          favoriteSocialGroups={[]}
          favoritePracticeRooms={[]}
          favoriteShops={[]}
          pastEventsViewMode="grid-2"
          setPastEventsViewMode={() => { }}
          onEventClick={(e) => onEventClick?.(e)}
          onEventHover={(id) => {
            if (id === null) onEventHover?.(null);
            else onEventHover?.(events.find(ev => ev.id === id) ?? null);
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
            else onEventHover?.(events.find(ev => ev.id === id) ?? null);
          }}
          highlightEvent={highlightEvent ?? null}
          selectedDate={selectedDate}
          defaultThumbnailClass="default-class"
          defaultThumbnailEvent="default-event"
          effectiveFavoriteIds={favoriteEventIds}
          handleToggleFavorite={handleToggleFavorite}
        />
      ) : (searchTerm.trim() || selectedDate || (selectedCategory !== 'all' && selectedCategory !== 'none')) ? (
        <EventFilteredGridView
          sortedEvents={sortedEvents}
          selectedDate={selectedDate}
          selectedCategory={selectedCategory}
          onEventClick={(e) => onEventClick?.(e)}
          onEventHover={(id) => {
            if (id === null) onEventHover?.(null);
            else onEventHover?.(events.find(ev => ev.id === id) ?? null);
          }}
          highlightEvent={highlightEvent ?? null}
          defaultThumbnailClass="default-class"
          defaultThumbnailEvent="default-event"
          effectiveFavoriteIds={favoriteEventIds}
          handleToggleFavorite={handleToggleFavorite}
          currentMonth={currentMonth}
        />
      ) : (
        <EventPreviewSection
          isSocialSchedulesLoading={socialLoading}
          todaySocialSchedules={(() => {
            const todayStr = getLocalDateString();
            const todayDay = getKSTDay(); // 0-6

            // A. Today's Events (category='event') -> Map to SocialSchedule
            const todayEventsAsSocial = events
              .filter(e => e.category === 'event' && (e.end_date || e.date || "") >= todayStr && (e.start_date || e.date || "") <= todayStr)
              .map(e => ({
                id: e.id * 10000, // Avoid ID collision
                group_id: -1, // Flag as Event
                title: e.title,
                date: e.date,
                start_time: e.time,
                place_name: e.location,
                image_url: e.image,
                image_medium: e.image,
                image_thumbnail: e.image,
                user_id: e.user_id,
                created_at: e.created_at,
                updated_at: '',
                description: e.description,
                board_users: (e as any).board_users, // Preserve author info
              } as any));

            // B. One-time Social Schedules (Date match)
            const oneTimeSocials = socialSchedules.filter(s => s.date && s.date === todayStr);

            // C. Recurring Social Schedules (Day match + No Date)
            const recurringSocials = socialSchedules.filter(s => {
              const hasNoDate = !s.date || s.date.trim() === '';
              const scheduleDay = Number(s.day_of_week);
              return hasNoDate && !isNaN(scheduleDay) && scheduleDay === todayDay;
            });

            // Logic: Always show (A + B). If count < 4, add (C).
            let combined = [...todayEventsAsSocial, ...oneTimeSocials];
            if (combined.length < 4) {
              combined = [...combined, ...recurringSocials];
            }

            return combined;
          })()}
          thisWeekSocialSchedules={(() => {
            const todayStr = getLocalDateString();
            const kstDay = getKSTDay();
            const daysFromMonday = kstDay === 0 ? 6 : kstDay - 1;

            // Calculate Week Range for Filter (Mon - Sun)
            // We need this to pre-filter events so we don't map EVERYTHING
            const todayDate = new Date(todayStr); // Approximate local
            const weekStart = new Date(todayDate);
            weekStart.setDate(todayDate.getDate() - daysFromMonday);
            const weekEnd = new Date(weekStart);
            weekEnd.setDate(weekStart.getDate() + 6);

            const weekStartStr = getLocalDateString(weekStart);
            const weekEndStr = getLocalDateString(weekEnd);

            // A. This Week's Events (category='event') -> Map to SocialSchedule
            const weekEventsAsSocial = events
              .filter(e => {
                if (e.category !== 'event') return false;
                // Event must overlap with this week or be on a specific date
                // Simple check: if date is in range
                const eDate = e.date || "";
                return eDate >= weekStartStr && eDate <= weekEndStr;
              })
              .map(e => ({
                id: e.id * 10000,
                group_id: -1,
                title: e.title,
                date: e.date,
                start_time: e.time,
                place_name: e.location,
                image_url: e.image,
                image_medium: e.image,
                image_thumbnail: e.image,
                user_id: e.user_id,
                created_at: e.created_at,
                updated_at: '',
                description: e.description,
                board_users: (e as any).board_users, // Preserve author info
              } as any));

            // Return combined. AllSocialSchedules will do further fine-grained filtering if needed,
            // but we must pass the source data.
            // Note: We pass ALL socialSchedules because AllSocialSchedules filters them internally.
            // But for Events, we pre-filter and map them.
            return [...weekEventsAsSocial, ...socialSchedules];
          })()}
          refreshSocialSchedules={refreshSocial}
          futureEvents={events.filter(e => e.category === 'event' && (e.end_date || e.date || "") >= getLocalDateString())}
          regularClasses={events.filter(e => e.category === 'class' && (e.end_date || e.date || "") >= getLocalDateString())}
          clubLessons={events.filter(e => e.category === 'club' && !e.genre?.includes('정규강습') && (e.end_date || e.date || "") >= getLocalDateString())}
          clubRegularClasses={events.filter(e => e.category === 'club' && e.genre?.includes('정규강습'))}
          favoriteEventsList={events.filter(e => favoriteEventIds.has(e.id))}
          events={events}
          allGenres={allGenres}
          allGenresStructured={allGenresStructured}
          selectedEventGenre={searchParams.get('event_genre')}
          selectedClassGenre={searchParams.get('class_genre')}
          selectedClubGenre={searchParams.get('club_genre')}
          onEventClick={(e) => onEventClick?.(e)}
          onEventHover={(id: number | null) => {
            if (!onEventHover) return;
            if (id === null) {
              onEventHover(null);
              return;
            }
            const found = events.find(ev => ev.id === id);
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

      {/* Edit Modal */}
      <EventEditModal
        isOpen={isEditingWithDetail}
        onClose={() => setIsEditingWithDetail(false)}
        event={eventToEdit}
        onSave={handleSaveEvent}
        onDelete={handleDeleteClick}
        isAdmin={isAdminMode}
        user={user}
        allGenres={allGenres}
        onOpenVenueModal={() => setIsVenueModalOpen(true)}
      />

      <VenueSelectModal
        isOpen={isVenueModalOpen}
        onClose={() => setIsVenueModalOpen(false)}
        onSelect={(venue: any) => {
          window.dispatchEvent(new CustomEvent('venue_selected', { detail: venue }));
        }}
        onManualInput={(name: string, link: string) => {
          window.dispatchEvent(new CustomEvent('venue_manual_input', { detail: { name, link } }));
        }}
      />
    </div>
  );
};

export default EventList;
