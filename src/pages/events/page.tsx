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
import {
  getDanceActivityLabel,
  getDanceGenreLabel,
  getDanceScopeLabel,
  getDanceTagLabel,
  getVisibleDanceScopeOptions,
  inferDanceTaxonomy,
  isEventInDanceScope,
  normalizeVisibleDanceScope,
  type DanceActivity,
} from '../../utils/danceTaxonomy';
import { getLocalDateString, sortEvents } from '../v2/utils/eventListUtils';
import type { Event } from '../v2/utils/eventListUtils';
import './events.css';

const EventRegistrationModal = lazy(() => import('../../components/EventRegistrationModal'));

type GenreGroups = {
  social: string[];
  event: string[];
  class: string[];
  recruit: string[];
};

type EventsInfoSectionTone = DanceActivity;

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
  actionLabel?: string;
  onAction?: () => void;
  favoriteEventIds: Set<number | string>;
  onEventClick: (event: Event) => void;
  onToggleFavorite: (eventId: number | string, event?: MouseEvent) => void;
};

type EventsInfoCategory = DanceActivity;
type EventsInfoSortOrder = 'random' | 'date';
type EventsInfoActivityFilter = 'all' | DanceActivity;

const eventsInfoActivityOptions: Array<{ key: EventsInfoActivityFilter; label: string; icon: string }> = [
  { key: 'all', label: '전체', icon: 'ri-apps-2-line' },
  { key: 'class', label: '강습', icon: 'ri-graduation-cap-line' },
  { key: 'social', label: '소셜', icon: 'ri-music-2-line' },
  { key: 'event', label: '행사', icon: 'ri-calendar-event-line' },
  { key: 'recruit', label: '모집', icon: 'ri-user-search-line' },
];

const eventsInfoSections: Array<{ key: DanceActivity; title: string; icon: string; tone: EventsInfoSectionTone }> = [
  { key: 'event', title: '행사', icon: 'ri-fire-fill', tone: 'event' },
  { key: 'class', title: '강습', icon: 'ri-calendar-check-fill', tone: 'class' },
  { key: 'social', title: '소셜', icon: 'ri-music-2-fill', tone: 'social' },
  { key: 'recruit', title: '모집', icon: 'ri-user-search-fill', tone: 'recruit' },
];

const isDanceActivity = (value: string | null): value is DanceActivity => {
  return value === 'class' || value === 'social' || value === 'event' || value === 'recruit';
};

const normalizeActivityFilter = (value: string | null): EventsInfoActivityFilter => {
  return value === 'all' || isDanceActivity(value) ? value : 'all';
};

const getEventTaxonomy = (event: Event) => {
  const metadata = event as Event & {
    dance_scope?: string | null;
    dance_genre?: string | null;
    activity_type?: string | null;
    dance_tags?: string[] | null;
  };

  return inferDanceTaxonomy({
    extracted_text: [
      event.title,
      event.genre,
      event.category,
      event.location,
      event.venue_name,
      event.description,
    ].filter(Boolean).join(' '),
    structured_data: {
      title: event.title,
      dance_scope: metadata.dance_scope as any,
      dance_genre: metadata.dance_genre,
      activity_type: metadata.activity_type as any,
      tags: Array.isArray(metadata.dance_tags) ? metadata.dance_tags : null,
      location: event.location || event.venue_name,
      note: event.description,
    },
  });
};

const getEventDanceTags = (event: Event) => {
  const metadata = event as Event & {
    dance_scope?: string | null;
    dance_genre?: string | null;
    activity_type?: string | null;
    dance_tags?: string[] | null;
  };
  const metadataTags = metadata.dance_tags;
  const hasExplicitTaxonomy = Boolean(
    metadata.dance_scope ||
    metadata.dance_genre ||
    metadata.activity_type ||
    (Array.isArray(metadataTags) && metadataTags.length > 0)
  );
  const inferredTags = hasExplicitTaxonomy ? getEventTaxonomy(event).tags : [];
  return Array.from(new Set([...(Array.isArray(metadataTags) ? metadataTags : []), ...inferredTags].filter(Boolean)));
};

const getEventsInfoCategory = (event: Event): EventsInfoCategory => {
  const explicit = (event as Event & { activity_type?: string | null }).activity_type;
  if (isDanceActivity(explicit || null)) return explicit;

  if (event.category === 'class') return 'class';
  if (event.category === 'regular' || event.category === 'club') return 'class';
  if (event.category === 'social') return 'social';
  if (event.category === 'event' || event.category === 'party') return 'event';

  return 'event';
};

const shouldShowClass = (event: Event) => {
  const today = getLocalDateString();
  let startDate = event.start_date || event.date;

  if (event.event_dates && event.event_dates.length > 0) {
    const sortedDates = [...event.event_dates].sort();
    startDate = sortedDates.find((date) => date >= today) || sortedDates[0];
  }

  if (!startDate) return true;
  return !(today > startDate);
};

const isFutureEvent = (event: Event) => {
  const today = getLocalDateString();
  if (event.event_dates?.some((date) => date >= today)) return true;
  return (event.end_date || event.start_date || event.date || '') >= today;
};

const getNextRelevantEventDate = (event: Event) => {
  const today = getLocalDateString();
  const candidates = [
    ...(Array.isArray(event.event_dates) ? event.event_dates : []),
    event.start_date || event.date || '',
  ].filter(Boolean).sort();

  return candidates.find((date) => date >= today) || candidates[0] || '';
};

const getEventSortDateValue = (event: Event) => {
  const date = getNextRelevantEventDate(event);
  return `${date} ${event.time || ''}`.trim();
};

const sortEventsInfoItems = (items: Event[], sortOrder: EventsInfoSortOrder, randomSeed: number) => {
  if (sortOrder === 'date') {
    return [...items].sort((a, b) => getEventSortDateValue(a).localeCompare(getEventSortDateValue(b)));
  }

  return sortEvents(items, 'random', false, null, false, randomSeed);
};

const getEventDateText = (event: Event) => {
  const date = getNextRelevantEventDate(event);
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
  const category = getEventsInfoCategory(event);
  return getDanceActivityLabel(category);
};

const getEventGenreLabel = (event: Event) => {
  const existingGenre = event.genre?.split(',').map((item) => item.trim()).filter(Boolean)[0];
  if (existingGenre) return existingGenre;

  const taxonomy = getEventTaxonomy(event);
  if (taxonomy.dance_genre && taxonomy.dance_genre !== 'unknown') return getDanceGenreLabel(taxonomy.dance_genre);
  return getEventCategoryLabel(event);
};

const buildGenreGroups = (events: Event[]): GenreGroups => {
  const today = getLocalDateString();
  const socialGenres = new Set<string>();
  const eventGenres = new Set<string>();
  const classGenres = new Set<string>();
  const recruitGenres = new Set<string>();

  events.forEach((event) => {
    const category = getEventsInfoCategory(event);
    const endDate = event.end_date || event.date;
    if (endDate && endDate < today) return;

    (event.genre || '').split(',').forEach((rawGenre) => {
      const genre = rawGenre.trim();
      if (!genre) return;

      if (category === 'social') socialGenres.add(genre);
      if (category === 'event') eventGenres.add(genre);
      if (category === 'class') classGenres.add(genre);
      if (category === 'recruit') recruitGenres.add(genre);
    });

    const taxonomyGenre = getEventGenreLabel(event);
    if (taxonomyGenre && taxonomyGenre !== '장르 미정') {
      if (category === 'social') socialGenres.add(taxonomyGenre);
      if (category === 'event') eventGenres.add(taxonomyGenre);
      if (category === 'class') classGenres.add(taxonomyGenre);
      if (category === 'recruit') recruitGenres.add(taxonomyGenre);
    }
  });

  const sortKo = (a: string, b: string) => a.localeCompare(b, 'ko');

  return {
    social: Array.from(socialGenres).sort(sortKo),
    event: Array.from(eventGenres).sort(sortKo),
    class: Array.from(classGenres).sort(sortKo),
    recruit: Array.from(recruitGenres).sort(sortKo),
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
  const genre = getEventGenreLabel(event);
  const displayCategory = getEventsInfoCategory(event);
  const scopeLabel = getDanceScopeLabel((event as Event & { dance_scope?: string | null }).dance_scope || 'swing');

  return (
    <article
      className="events-info-card"
      onClick={() => onEventClick(event)}
      data-event-id={event.id}
      data-analytics-id={event.id}
      data-analytics-type={displayCategory === 'class' ? 'class' : displayCategory === 'social' ? 'social' : 'event'}
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
          <span>{scopeLabel}</span>
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
        {onAction && (
          <div className="events-info-section-actions">
            <button type="button" onClick={onAction}>
              {actionLabel || '보기'}
              <i className="ri-arrow-right-s-line" />
            </button>
          </div>
        )}
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
  const { user, isAdmin, isAuthCheckComplete } = useAuth();
  const { openModal, closeModal } = useModalActions();
  const { data: events = [], isLoading, refetch } = useEventsQuery();
  const { interactions, toggleEventFavorite } = useUserInteractions(user?.id || null);

  const [sortOrder, setSortOrder] = useState<EventsInfoSortOrder>('random');
  const [showRegistrationModal, setShowRegistrationModal] = useState(false);
  const [registrationDate, setRegistrationDate] = useState<Date | null>(null);
  const [randomSeed] = useState(() => Math.floor(Math.random() * 1000000));

  const favoriteEventIds = useMemo<Set<number | string>>(() => {
    return new Set((interactions?.event_favorites || []).map((id) => Number(id)));
  }, [interactions?.event_favorites]);

  const visibleDanceScopeOptions = useMemo(() => getVisibleDanceScopeOptions(isAdmin), [isAdmin]);
  const selectedDanceScope = normalizeVisibleDanceScope(searchParams.get('dance'), isAdmin);
  const selectedActivity = normalizeActivityFilter(searchParams.get('type'));
  const selectedTag = searchParams.get('tag');

  const futureEvents = useMemo(() => {
    return events.filter(isFutureEvent);
  }, [events]);

  const visibleFutureEvents = useMemo(() => {
    if (isAdmin) return futureEvents;
    return futureEvents.filter((event) => isEventInDanceScope(event, 'swing'));
  }, [futureEvents, isAdmin]);

  const danceScopedEvents = useMemo(() => {
    return visibleFutureEvents.filter((event) => isEventInDanceScope(event, selectedDanceScope));
  }, [selectedDanceScope, visibleFutureEvents]);

  const recruitBaseEvents = useMemo(() => {
    return visibleFutureEvents.filter((event) => getEventsInfoCategory(event) === 'recruit');
  }, [visibleFutureEvents]);

  const activityScopedEvents = useMemo(() => {
    if (selectedActivity === 'recruit') return recruitBaseEvents;
    if (selectedActivity === 'all') return danceScopedEvents;
    return danceScopedEvents.filter((event) => getEventsInfoCategory(event) === selectedActivity);
  }, [danceScopedEvents, recruitBaseEvents, selectedActivity]);

  const scopedEvents = useMemo(() => {
    return activityScopedEvents
      .filter((event) => !selectedTag || getEventDanceTags(event).includes(selectedTag));
  }, [activityScopedEvents, selectedTag]);

  const recruitScopedEvents = useMemo(() => {
    if (selectedActivity !== 'all' && selectedActivity !== 'recruit') return [];
    return recruitBaseEvents
      .filter((event) => !selectedTag || getEventDanceTags(event).includes(selectedTag));
  }, [recruitBaseEvents, selectedActivity, selectedTag]);

  const dynamicTags = useMemo(() => {
    const tags = new Set<string>();
    const tagSource = selectedActivity === 'all'
      ? [...activityScopedEvents, ...recruitBaseEvents]
      : activityScopedEvents;
    tagSource.forEach((event) => getEventDanceTags(event).forEach((tag) => tags.add(tag)));
    return Array.from(tags).sort((a, b) => getDanceTagLabel(a).localeCompare(getDanceTagLabel(b), 'ko'));
  }, [activityScopedEvents, recruitBaseEvents, selectedActivity]);

  const genreGroups = useMemo(() => {
    const scopedGroups = buildGenreGroups(scopedEvents);
    const recruitGroups = buildGenreGroups(recruitScopedEvents);
    return {
      ...scopedGroups,
      recruit: recruitGroups.recruit,
    };
  }, [recruitScopedEvents, scopedEvents]);

  const selectedSocialGenre = searchParams.get('social_genre');
  const selectedEventGenre = searchParams.get('event_genre');
  const selectedClassGenre = searchParams.get('class_genre');
  const selectedRecruitGenre = searchParams.get('recruit_genre');

  const setGenreParam = useCallback((key: string, value: string | null) => {
    const nextParams = new URLSearchParams(searchParams);
    if (value) nextParams.set(key, value);
    else nextParams.delete(key);
    setSearchParams(nextParams, { replace: false });
  }, [searchParams, setSearchParams]);

  const setFilterParam = useCallback((key: string, value: string | null) => {
    const nextParams = new URLSearchParams(searchParams);
    if (value) nextParams.set(key, value);
    else nextParams.delete(key);
    if (key === 'dance' || key === 'type' || key === 'tag') {
      nextParams.delete('event_genre');
      nextParams.delete('class_genre');
      nextParams.delete('social_genre');
      nextParams.delete('recruit_genre');
    }
    setSearchParams(nextParams, { replace: false });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (!isAuthCheckComplete || isAdmin || !searchParams.has('dance')) return;
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('dance');
    setSearchParams(nextParams, { replace: true });
  }, [isAdmin, isAuthCheckComplete, searchParams, setSearchParams]);

  const socialEvents = useMemo(() => {
    return sortEventsInfoItems(
      scopedEvents.filter((event) => getEventsInfoCategory(event) === 'social'),
      sortOrder,
      randomSeed
    );
  }, [randomSeed, scopedEvents, sortOrder]);

  const eventItems = useMemo(() => {
    const filtered = scopedEvents.filter((event) => getEventsInfoCategory(event) === 'event');
    return sortEventsInfoItems(filtered, sortOrder, randomSeed);
  }, [randomSeed, scopedEvents, sortOrder]);

  const regularClasses = useMemo(() => {
    return sortEventsInfoItems(
      scopedEvents.filter((event) => getEventsInfoCategory(event) === 'class'),
      sortOrder,
      randomSeed
    );
  }, [randomSeed, scopedEvents, sortOrder]);

  const recruitEvents = useMemo(() => {
    return sortEventsInfoItems(
      recruitScopedEvents,
      sortOrder,
      randomSeed
    );
  }, [randomSeed, recruitScopedEvents, sortOrder]);

  const filteredSocialEvents = useMemo(() => {
    if (!selectedSocialGenre) return socialEvents;
    return socialEvents.filter((event) => event.genre?.split(',').map((g) => g.trim()).includes(selectedSocialGenre) || getEventGenreLabel(event) === selectedSocialGenre);
  }, [socialEvents, selectedSocialGenre]);

  const filteredFutureEvents = useMemo(() => {
    if (!selectedEventGenre) return eventItems;
    return eventItems.filter((event) => event.genre?.split(',').map((g) => g.trim()).includes(selectedEventGenre) || getEventGenreLabel(event) === selectedEventGenre);
  }, [eventItems, selectedEventGenre]);

  const filteredRegularClasses = useMemo(() => {
    return regularClasses
      .filter(shouldShowClass)
      .filter((event) => !selectedClassGenre || event.genre?.split(',').map((g) => g.trim()).includes(selectedClassGenre) || getEventGenreLabel(event) === selectedClassGenre);
  }, [regularClasses, selectedClassGenre]);

  const filteredRecruitEvents = useMemo(() => {
    return recruitEvents
      .filter(shouldShowClass)
      .filter((event) => !selectedRecruitGenre || event.genre?.split(',').map((g) => g.trim()).includes(selectedRecruitGenre) || getEventGenreLabel(event) === selectedRecruitGenre);
  }, [recruitEvents, selectedRecruitGenre]);

  const hasVisibleEvents = scopedEvents.length > 0 || recruitScopedEvents.length > 0;

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
      allGenres: { class: genreGroups.class, event: [...genreGroups.social, ...genreGroups.event] },
    });
  }, [favoriteEventIds, genreGroups.class, genreGroups.event, genreGroups.social, handleToggleFavorite, isAdmin, openModal, user?.id]);

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

  useEffect(() => {
    const section = searchParams.get('section');
    if (!section) return;

    window.requestAnimationFrame(() => {
      const target = document.querySelector(`[data-section-key="${section}"]`);
      target?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
  }, [searchParams, isLoading]);

  return (
    <main className={`events-info-page ${dynamicTags.length > 0 ? 'has-tag-tabs' : ''}`}>
      <div className="events-info-toolbar" aria-label="행사정보 정렬">
        <div className="events-info-scope-tabs" aria-label="댄스 장르 선택">
          {visibleDanceScopeOptions.map((option) => (
            <button
              key={option.key}
              type="button"
              className={selectedDanceScope === option.key ? 'is-active' : ''}
              onClick={() => setFilterParam('dance', option.key === 'swing' ? null : option.key)}
            >
              <strong>{option.label}</strong>
              <span>{option.desc}</span>
            </button>
          ))}
        </div>

        <div className="events-info-toolbar-bottom">
          <div className="events-info-activity-tabs" aria-label="활동 분류">
            {eventsInfoActivityOptions.map((option) => (
              <button
                key={option.key}
                type="button"
                className={selectedActivity === option.key ? 'is-active' : ''}
                onClick={() => setFilterParam('type', option.key === 'all' ? null : option.key)}
              >
                <i className={option.icon} />
                {option.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            className={`events-info-sort-btn ${sortOrder === 'date' ? 'is-active' : ''}`}
            onClick={() => setSortOrder((order) => order === 'date' ? 'random' : 'date')}
            title={sortOrder === 'date' ? '시간순 정렬 중' : '랜덤 정렬 중'}
          >
            <i className={sortOrder === 'date' ? 'ri-sort-asc' : 'ri-shuffle-line'} />
            {sortOrder === 'date' ? '시간순' : '랜덤'}
          </button>
        </div>

        {dynamicTags.length > 0 && (
          <div className="events-info-tag-tabs" aria-label="세부 태그">
            <button
              type="button"
              className={!selectedTag ? 'is-active' : ''}
              onClick={() => setFilterParam('tag', null)}
            >
              전체태그
            </button>
            {dynamicTags.map((tag) => (
              <button
                key={tag}
                type="button"
                className={selectedTag === tag ? 'is-active' : ''}
                onClick={() => setFilterParam('tag', selectedTag === tag ? null : tag)}
              >
                {getDanceTagLabel(tag)}
              </button>
            ))}
          </div>
        )}
      </div>

      {isLoading && events.length === 0 ? (
        <div className="events-info-state">정보를 불러오는 중입니다...</div>
      ) : (
        <section className="events-info-rows">
          {!hasVisibleEvents ? (
            <div className="events-info-state">
              {selectedActivity === 'recruit'
                ? '표시할 모집 항목이 없습니다.'
                : `${getDanceScopeLabel(selectedDanceScope)} 범위에 표시할 항목이 없습니다.`}
            </div>
          ) : eventsInfoSections
            .filter((section) => selectedActivity === 'all' || selectedActivity === section.key)
            .filter((section) => {
              if (selectedActivity !== 'all') return true;
              if (section.key === 'event') return eventItems.length > 0;
              if (section.key === 'class') return regularClasses.filter(shouldShowClass).length > 0;
              if (section.key === 'social') return socialEvents.length > 0;
              return recruitEvents.filter(shouldShowClass).length > 0;
            })
            .map((section) => {
              const sectionEvents = section.key === 'event'
                ? filteredFutureEvents
                : section.key === 'class'
                  ? filteredRegularClasses
                  : section.key === 'social'
                    ? filteredSocialEvents
                    : filteredRecruitEvents;
              const sectionCount = section.key === 'event'
                ? eventItems.length
                : section.key === 'class'
                  ? regularClasses.filter(shouldShowClass).length
                  : section.key === 'social'
                    ? socialEvents.length
                    : recruitEvents.filter(shouldShowClass).length;
              const genreKey = `${section.key}_genre`;
              const selectedGenre = section.key === 'event'
                ? selectedEventGenre
                : section.key === 'class'
                  ? selectedClassGenre
                  : section.key === 'social'
                    ? selectedSocialGenre
                    : selectedRecruitGenre;

              return (
                <EventsInfoSection
                  key={section.key}
                  title={section.title}
                  sectionKey={section.key === 'event' ? 'events' : section.key}
                  icon={section.icon}
                  tone={section.tone}
                  count={sectionCount}
                  genres={['전체', ...genreGroups[section.key]]}
                  selectedGenre={selectedGenre}
                  onGenreChange={(genre) => setGenreParam(genreKey, genre)}
                  renderGenreLabel={renderGenreLabel}
                  events={sectionEvents}
                  actionLabel="달력보기"
                  onAction={() => navigate(`/calendar?dance=${selectedDanceScope}&scrollToToday=true`)}
                  onEventClick={handleEventClick}
                  favoriteEventIds={favoriteEventIds}
                  onToggleFavorite={handleToggleFavorite}
                />
              );
            })}
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
