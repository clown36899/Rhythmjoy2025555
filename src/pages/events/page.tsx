import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import type { MouseEvent, ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useModalActions } from '../../contexts/ModalContext';
import { useSetPageAction } from '../../contexts/PageActionContext';
import { useEventsQuery } from '../../hooks/queries/useEventsQuery';
import { useUserInteractions } from '../../hooks/useUserInteractions';
import '../../styles/domains/events.css';
import { getCardThumbnail, getEventThumbnail } from '../../utils/getEventThumbnail';
import { getLocalDateString, sortEvents } from '../v2/utils/eventListUtils';
import type { Event } from '../v2/utils/eventListUtils';
import './events.css';

const EventRegistrationModal = lazy(() => import('../../components/EventRegistrationModal'));

type GenreGroups = {
  class: string[];
  club: string[];
  event: string[];
};

type EventsInfoSectionTone = 'event' | 'class' | 'club' | 'regular';

type EventsInfoSectionProps = {
  title: string;
  sectionKey: string;
  icon: string;
  tone: EventsInfoSectionTone;
  count: number;
  genres: string[];
  selectedGenre: string | null;
  onGenreChange: (genre: string | null) => void;
  renderGenreLabel: (genre: string) => ReactNode;
  events: Event[];
  actionLabel: string;
  onAction: () => void;
  rightElement?: ReactNode;
  favoriteEventIds: Set<number | string>;
  onEventClick: (event: Event) => void;
  onToggleFavorite: (eventId: number | string, event?: MouseEvent) => void;
};

const shouldShowClass = (event: Event) => {
  const today = getLocalDateString();
  let startDate = event.start_date || event.date;

  if (event.event_dates && event.event_dates.length > 0) {
    startDate = [...event.event_dates].sort()[0];
  }

  if (!startDate) return true;
  return !(today > startDate);
};

const isFutureEvent = (event: Event) => (event.end_date || event.date || '') >= getLocalDateString();

const getEventDateText = (event: Event) => {
  const date = event.event_dates?.[0] || event.start_date || event.date;
  if (!date) return '날짜 미정';

  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;

  const week = ['일', '월', '화', '수', '목', '금', '토'][parsed.getDay()];
  const text = `${parsed.getMonth() + 1}.${parsed.getDate()} ${week}`;
  return event.category === 'class' || event.category === 'club' ? `${text} 시작` : text;
};

const getEventPlace = (event: Event) => {
  return event.venue_name || event.place_name || event.location || event.address || '장소 정보 없음';
};

const getEventCategoryLabel = (event: Event) => {
  if (event.category === 'class') return '강습';
  if (event.category === 'club') return '동호회';
  if (event.category === 'social') return '소셜';
  return '행사';
};

const buildGenreGroups = (events: Event[]): GenreGroups => {
  const today = getLocalDateString();
  const classGenres = new Set<string>();
  const clubGenres = new Set<string>();
  const eventGenres = new Set<string>();

  events.forEach((event) => {
    if (!event.genre) return;
    const endDate = event.end_date || event.date;
    if (endDate && endDate < today) return;

    event.genre.split(',').forEach((rawGenre) => {
      const genre = rawGenre.trim();
      if (!genre) return;

      if (event.category === 'class') classGenres.add(genre);
      if (event.category === 'club' && !genre.includes('정규강습')) clubGenres.add(genre);
      if (event.category === 'event') eventGenres.add(genre);
    });
  });

  const sortKo = (a: string, b: string) => a.localeCompare(b, 'ko');

  return {
    class: Array.from(classGenres).sort(sortKo),
    club: Array.from(clubGenres).sort(sortKo),
    event: Array.from(eventGenres).sort(sortKo),
  };
};

const renderGenreLabel = (genre: string) => {
  if (genre === '전체') {
    return (
      <span className="manual-label-wrapper">
        <span className="translated-part">All</span>
        <span className="fixed-part ko" translate="no">전체</span>
        <span className="fixed-part en" translate="no">All</span>
      </span>
    );
  }

  if (genre === '대회') {
    return (
      <span className="manual-label-wrapper">
        <span className="translated-part">Competition</span>
        <span className="fixed-part ko" translate="no">대회</span>
        <span className="fixed-part en" translate="no">Competition</span>
      </span>
    );
  }

  return <span>{genre}</span>;
};

function EventsInfoThumb({ event }: { event: Event }) {
  const src = getCardThumbnail(event) || getEventThumbnail(event);

  return (
    <span className="events-info-card-thumb">
      <img
        src={src}
        alt=""
        loading="lazy"
        draggable={false}
        onError={(e) => {
          e.currentTarget.src = getEventThumbnail(null);
        }}
      />
    </span>
  );
}

function EventsInfoCard({
  event,
  isFavorite,
  onEventClick,
  onToggleFavorite,
}: {
  event: Event;
  isFavorite: boolean;
  onEventClick: (event: Event) => void;
  onToggleFavorite: (eventId: number | string, event?: MouseEvent) => void;
}) {
  const place = getEventPlace(event);
  const genre = event.genre?.split(',').map((item) => item.trim()).filter(Boolean)[0] || getEventCategoryLabel(event);

  return (
    <article
      className="events-info-card"
      onClick={() => onEventClick(event)}
      data-event-id={event.id}
      data-analytics-id={event.id}
      data-analytics-type={event.category === 'class' ? 'class' : 'event'}
      data-analytics-title={event.title}
      data-analytics-section="events_info_route"
    >
      <EventsInfoThumb event={event} />
      <div className="events-info-card-body">
        <span className="events-info-card-place">
          <i className="ri-map-pin-line" />
          {place}
        </span>
        <strong>{event.title}</strong>
        <div className="events-info-card-meta">
          <span>{genre}</span>
          <span>{getEventDateText(event)}</span>
        </div>
      </div>
      <button
        type="button"
        className={`events-info-card-favorite ${isFavorite ? 'is-active' : ''}`}
        onClick={(clickEvent) => onToggleFavorite(event.id, clickEvent)}
        aria-label={isFavorite ? '즐겨찾기 해제' : '즐겨찾기 추가'}
      >
        <i className={isFavorite ? 'ri-star-fill' : 'ri-star-line'} />
      </button>
    </article>
  );
}

function EventsInfoSection({
  title,
  sectionKey,
  icon,
  tone,
  count,
  genres,
  selectedGenre,
  onGenreChange,
  renderGenreLabel,
  events,
  actionLabel,
  onAction,
  rightElement,
  favoriteEventIds,
  onEventClick,
  onToggleFavorite,
}: EventsInfoSectionProps) {
  return (
    <section className={`events-info-section is-${tone}`} data-section-key={sectionKey}>
      <div className="events-info-section-head">
        <div className="events-info-section-title">
          <i className={icon} />
          <strong>{title}</strong>
          <b>{count}</b>
        </div>
        <div className="events-info-section-actions">
          {rightElement}
          <button type="button" onClick={onAction}>
            {actionLabel}
            <i className="ri-arrow-right-s-line" />
          </button>
        </div>
      </div>

      {genres.length > 0 && (
        <div className="events-info-genre-row" aria-label={`${title} 장르 필터`}>
          {genres.map((genre) => (
            <button
              key={`${title}-${genre}`}
              type="button"
              className={(selectedGenre || '전체') === genre ? 'is-active' : ''}
              onClick={() => onGenreChange(genre === '전체' ? null : genre)}
            >
              {renderGenreLabel(genre)}
            </button>
          ))}
        </div>
      )}

      <div className="events-info-card-rail">
        {events.length > 0 ? (
          events.map((event) => (
            <EventsInfoCard
              key={event.id}
              event={event}
              isFavorite={favoriteEventIds.has(Number(event.id)) || favoriteEventIds.has(event.id)}
              onEventClick={onEventClick}
              onToggleFavorite={onToggleFavorite}
            />
          ))
        ) : (
          <div className="events-info-empty">표시할 항목이 없습니다.</div>
        )}
      </div>
    </section>
  );
}

export default function EventsInfoPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, isAdmin } = useAuth();
  const { openModal, closeModal } = useModalActions();
  const { data: events = [], isLoading, refetch } = useEventsQuery();
  const { interactions, toggleEventFavorite } = useUserInteractions(user?.id || null);

  const [eventSortOrder, setEventSortOrder] = useState<'random' | 'date'>('random');
  const [showRegistrationModal, setShowRegistrationModal] = useState(false);
  const [registrationDate, setRegistrationDate] = useState<Date | null>(null);
  const [randomSeed] = useState(() => Math.floor(Math.random() * 1000000));

  const favoriteEventIds = useMemo<Set<number | string>>(() => {
    return new Set((interactions?.event_favorites || []).map((id) => Number(id)));
  }, [interactions?.event_favorites]);

  const genreGroups = useMemo(() => buildGenreGroups(events), [events]);

  const selectedEventGenre = searchParams.get('event_genre');
  const selectedClassGenre = searchParams.get('class_genre');
  const selectedClubGenre = searchParams.get('club_genre');

  const setGenreParam = useCallback((key: string, value: string | null) => {
    const nextParams = new URLSearchParams(searchParams);
    if (value) nextParams.set(key, value);
    else nextParams.delete(key);
    setSearchParams(nextParams, { replace: false });
  }, [searchParams, setSearchParams]);

  const futureEvents = useMemo(() => {
    const filtered = events.filter((event) => event.category === 'event' && isFutureEvent(event));

    if (eventSortOrder === 'date') {
      return [...filtered].sort((a, b) => {
        const dateA = a.start_date || a.date || '';
        const dateB = b.start_date || b.date || '';
        return dateA.localeCompare(dateB);
      });
    }

    return sortEvents(filtered, 'random', false, null, false, randomSeed);
  }, [eventSortOrder, events, randomSeed]);

  const regularClasses = useMemo(() => {
    return sortEvents(
      events.filter((event) => event.category === 'class' && isFutureEvent(event)),
      'random',
      false,
      null,
      false,
      randomSeed
    );
  }, [events, randomSeed]);

  const clubLessons = useMemo(() => {
    return sortEvents(
      events.filter((event) => event.category === 'club' && !event.genre?.includes('정규강습') && isFutureEvent(event)),
      'random',
      false,
      null,
      false,
      randomSeed
    );
  }, [events, randomSeed]);

  const clubRegularClasses = useMemo(() => {
    return sortEvents(
      events.filter((event) => event.category === 'club' && event.genre?.includes('정규강습') && isFutureEvent(event)),
      'random',
      false,
      null,
      false,
      randomSeed
    );
  }, [events, randomSeed]);

  const filteredFutureEvents = useMemo(() => {
    if (!selectedEventGenre) return futureEvents;
    return futureEvents.filter((event) => event.genre?.split(',').map((g) => g.trim()).includes(selectedEventGenre));
  }, [futureEvents, selectedEventGenre]);

  const filteredRegularClasses = useMemo(() => {
    return regularClasses
      .filter(shouldShowClass)
      .filter((event) => !selectedClassGenre || event.genre?.split(',').map((g) => g.trim()).includes(selectedClassGenre));
  }, [regularClasses, selectedClassGenre]);

  const filteredClubLessons = useMemo(() => {
    return clubLessons
      .filter(shouldShowClass)
      .filter((event) => !selectedClubGenre || event.genre?.split(',').map((g) => g.trim()).includes(selectedClubGenre));
  }, [clubLessons, selectedClubGenre]);

  const filteredClubRegularClasses = useMemo(() => {
    return clubRegularClasses
      .filter(shouldShowClass)
      .filter((event) => !selectedClubGenre || event.genre?.split(',').map((g) => g.trim()).includes(selectedClubGenre));
  }, [clubRegularClasses, selectedClubGenre]);

  const handleToggleFavorite = useCallback(async (eventId: number | string, event?: MouseEvent) => {
    event?.stopPropagation();

    if (!user) {
      openModal('login', { message: '즐겨찾기는 로그인 후 이용 가능합니다.' });
      return;
    }

    await toggleEventFavorite(eventId);
  }, [openModal, toggleEventFavorite, user]);

  const handleEventClick = useCallback((event: Event) => {
    openModal('eventDetail', {
      event,
      onEdit: () => {},
      onDelete: () => {},
      isAdminMode: isAdmin,
      currentUserId: user?.id,
      isFavorite: favoriteEventIds.has(Number(event.id)),
      onToggleFavorite: (clickEvent: MouseEvent) => handleToggleFavorite(event.id, clickEvent),
      allGenres: { class: genreGroups.class, event: genreGroups.event },
    });
  }, [favoriteEventIds, genreGroups.class, genreGroups.event, handleToggleFavorite, isAdmin, openModal, user?.id]);

  useSetPageAction(useMemo(() => ({
    icon: 'ri-add-line',
    label: '자율등록(누구나)',
    requireAuth: true,
    onClick: () => {
      openModal('registrationChoice', {
        onSelectMain: () => {
          closeModal('registrationChoice');
          setRegistrationDate(new Date());
          setShowRegistrationModal(true);
        },
        onSelectSocial: () => {
          closeModal('registrationChoice');
          openModal('weeklySocial');
        },
      });
    },
  }), [closeModal, openModal]));

  const summaryItems = [
    { label: '예정된 행사', count: futureEvents.length, icon: 'ri-fire-fill' },
    { label: '강습', count: regularClasses.filter(shouldShowClass).length, icon: 'ri-calendar-check-fill' },
    { label: '동호회 강습', count: clubLessons.filter(shouldShowClass).length, icon: 'ri-group-fill' },
    { label: '동호회 정규강습', count: clubRegularClasses.filter(shouldShowClass).length, icon: 'ri-group-2-fill' },
  ];

  useEffect(() => {
    const section = searchParams.get('section');
    if (!section) return;

    window.requestAnimationFrame(() => {
      const target = document.querySelector(`[data-section-key="${section}"]`);
      target?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
  }, [searchParams, isLoading]);

  return (
    <main className="events-info-page">
      <section className="events-info-hero">
        <div>
          <strong>강습&행사정보</strong>
          <span>메인 하단에 있던 행사와 강습 섹션을 그대로 모아 봅니다.</span>
        </div>
        <button type="button" onClick={() => navigate('/calendar')}>
          <i className="ri-calendar-event-line" />
          캘린더
        </button>
      </section>

      <section className="events-info-summary" aria-label="강습 행사 요약">
        {summaryItems.map((item) => (
          <div key={item.label}>
            <i className={item.icon} />
            <span>{item.label}</span>
            <strong>{item.count}</strong>
          </div>
        ))}
      </section>

      {isLoading && events.length === 0 ? (
        <div className="events-info-state">정보를 불러오는 중입니다...</div>
      ) : (
        <section className="events-info-rows">
          <EventsInfoSection
            title="예정된 행사"
            sectionKey="events"
            icon="ri-fire-fill"
            tone="event"
            count={futureEvents.length}
            genres={['전체', ...genreGroups.event]}
            selectedGenre={selectedEventGenre}
            onGenreChange={(genre) => setGenreParam('event_genre', genre)}
            renderGenreLabel={renderGenreLabel}
            events={filteredFutureEvents}
            actionLabel="달력보기"
            onAction={() => navigate('/calendar')}
            onEventClick={handleEventClick}
            favoriteEventIds={favoriteEventIds}
            onToggleFavorite={handleToggleFavorite}
            rightElement={
              <button
                type="button"
                className={`events-info-sort-btn ${eventSortOrder === 'date' ? 'is-active' : ''}`}
                onClick={() => setEventSortOrder((order) => order === 'date' ? 'random' : 'date')}
                title={eventSortOrder === 'date' ? '날짜순 정렬 중' : '랜덤 정렬 중'}
              >
                <i className={eventSortOrder === 'date' ? 'ri-sort-asc' : 'ri-shuffle-line'} />
                {eventSortOrder === 'date' ? '날짜순' : '랜덤'}
              </button>
            }
          />

          <EventsInfoSection
            title="강습"
            sectionKey="classes"
            icon="ri-calendar-check-fill"
            tone="class"
            count={regularClasses.filter(shouldShowClass).length}
            genres={['전체', ...genreGroups.class]}
            selectedGenre={selectedClassGenre}
            onGenreChange={(genre) => setGenreParam('class_genre', genre)}
            renderGenreLabel={renderGenreLabel}
            events={filteredRegularClasses}
            actionLabel="달력보기"
            onAction={() => navigate('/calendar?category=classes&scrollToToday=true')}
            onEventClick={handleEventClick}
            favoriteEventIds={favoriteEventIds}
            onToggleFavorite={handleToggleFavorite}
          />

          <EventsInfoSection
            title="동호회 강습"
            sectionKey="club-lessons"
            icon="ri-group-fill"
            tone="club"
            count={clubLessons.filter(shouldShowClass).length}
            genres={['전체', ...genreGroups.club]}
            selectedGenre={selectedClubGenre}
            onGenreChange={(genre) => setGenreParam('club_genre', genre)}
            renderGenreLabel={renderGenreLabel}
            events={filteredClubLessons}
            actionLabel="이벤트등록"
            onAction={() => navigate('/social')}
            onEventClick={handleEventClick}
            favoriteEventIds={favoriteEventIds}
            onToggleFavorite={handleToggleFavorite}
          />

          <EventsInfoSection
            title="동호회 정규강습"
            sectionKey="club-regular"
            icon="ri-group-2-fill"
            tone="regular"
            count={clubRegularClasses.filter(shouldShowClass).length}
            genres={['전체', ...genreGroups.club]}
            selectedGenre={selectedClubGenre}
            onGenreChange={(genre) => setGenreParam('club_genre', genre)}
            renderGenreLabel={renderGenreLabel}
            events={filteredClubRegularClasses}
            actionLabel="달력보기"
            onAction={() => navigate('/calendar?category=club&scrollToToday=true')}
            onEventClick={handleEventClick}
            favoriteEventIds={favoriteEventIds}
            onToggleFavorite={handleToggleFavorite}
          />
        </section>
      )}

      {showRegistrationModal && registrationDate && (
        <Suspense fallback={null}>
          <EventRegistrationModal
            isOpen={showRegistrationModal}
            onClose={() => {
              setShowRegistrationModal(false);
              setRegistrationDate(null);
            }}
            selectedDate={registrationDate}
            onEventCreated={async () => {
              setShowRegistrationModal(false);
              setRegistrationDate(null);
              await refetch();
            }}
          />
        </Suspense>
      )}
    </main>
  );
}
