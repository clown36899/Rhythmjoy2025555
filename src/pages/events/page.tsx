import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, MouseEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useModalActions } from '../../contexts/ModalContext';
import { useSetPageAction } from '../../contexts/PageActionContext';
import { useEventsQuery } from '../../hooks/queries/useEventsQuery';
import { useUserInteractions } from '../../hooks/useUserInteractions';
import { queryClient } from '../../lib/queryClient';
import '../../styles/domains/events.css';
import { getCardThumbnail, getEventThumbnail } from '../../utils/getEventThumbnail';
import {
  getDanceGenreLabel,
  getDanceScopeLabel,
  getDanceTagLabel,
  getVisibleDanceScopeOptions,
  inferDanceTaxonomy,
  isEventInDanceScope,
  normalizeVisibleDanceScope,
} from '../../utils/danceTaxonomy';
import { getLocalDateString, seededRandom } from '../v2/utils/eventListUtils';
import { useEventActions } from '../v2/hooks/useEventActions';
import type { Event } from '../v2/utils/eventListUtils';
import './events.css';

const EventRegistrationModal = lazy(() => import('../../components/EventRegistrationModal'));

type GenreGroups = {
  social: string[];
  event: string[];
  class: string[];
  club: string[];
};

type EventsInfoSectionKey = 'event' | 'class' | 'club' | 'social';
type EventsInfoSectionTone = EventsInfoSectionKey;

type EventsInfoSectionProps = {
  title: string;
  sectionKey: string;
  icon: string;
  tone: EventsInfoSectionTone;
  count: number;
  events: Event[];
  headerControls?: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  favoriteEventIds: Set<number | string>;
  onEventClick: (event: Event) => void;
  onToggleFavorite: (eventId: number | string, event?: MouseEvent) => void;
};

type EventsInfoCategory = EventsInfoSectionKey;
type EventsInfoSortOrder = 'random' | 'date';
type EventsInfoActivityFilter = 'all' | EventsInfoSectionKey;

const eventsInfoSections: Array<{ key: EventsInfoSectionKey; title: string; icon: string; tone: EventsInfoSectionTone }> = [
  { key: 'event', title: '행사', icon: 'ri-fire-fill', tone: 'event' },
  { key: 'class', title: '강습', icon: 'ri-calendar-check-fill', tone: 'class' },
  { key: 'club', title: '동호회', icon: 'ri-team-fill', tone: 'club' },
  { key: 'social', title: '소셜', icon: 'ri-music-2-fill', tone: 'social' },
];

const EVENTS_INFO_RAIL_DRAG_THRESHOLD_PX = 8;

const normalizeActivityFilter = (value: string | null): EventsInfoActivityFilter => {
  return value === 'event' || value === 'class' || value === 'club' || value === 'social' ? value : 'all';
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
  if (
    event.category === 'club' ||
    event.category === 'club_lesson' ||
    event.category === 'club_regular'
  ) {
    return 'club';
  }

  if (event.category === 'social') {
    return 'social';
  }

  const explicit = (event as Event & { activity_type?: string | null }).activity_type;
  if (explicit === 'social') return 'social';
  if (explicit === 'class' || explicit === 'event') return explicit;

  if (event.category === 'class') return 'class';
  if (event.category === 'regular') return 'class';
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

  const shuffled = [...items];
  const random = seededRandom(randomSeed + items.length * 9973);
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
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
  if (category === 'club') return '동호회';
  if (category === 'social') return '소셜';
  if (category === 'class') return '강습';
  return '행사';
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
  const clubGenres = new Set<string>();

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
      if (category === 'club') clubGenres.add(genre);
    });

    const taxonomyGenre = getEventGenreLabel(event);
    if (taxonomyGenre && taxonomyGenre !== '장르 미정') {
      if (category === 'social') socialGenres.add(taxonomyGenre);
      if (category === 'event') eventGenres.add(taxonomyGenre);
      if (category === 'class') classGenres.add(taxonomyGenre);
      if (category === 'club') clubGenres.add(taxonomyGenre);
    }
  });

  const sortKo = (a: string, b: string) => a.localeCompare(b, 'ko');

  return {
    social: Array.from(socialGenres).sort(sortKo),
    event: Array.from(eventGenres).sort(sortKo),
    class: Array.from(classGenres).sort(sortKo),
    club: Array.from(clubGenres).sort(sortKo),
  };
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
  const displayCategory = getEventsInfoCategory(event);

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
  events,
  headerControls,
  actionLabel,
  onAction,
  favoriteEventIds,
  onEventClick,
  onToggleFavorite,
}: EventsInfoSectionProps) {
  const railRef = useRef<HTMLDivElement | null>(null);
  const railDragRef = useRef({
    isPointerDown: false,
    didDrag: false,
    suppressNextClick: false,
    pointerId: -1,
    startX: 0,
    scrollLeft: 0,
  });
  const [railProgress, setRailProgress] = useState({ offset: 0, size: 1, scrollable: false });
  const [isRailDragging, setIsRailDragging] = useState(false);

  const syncRailProgress = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return;

    const maxScroll = Math.max(rail.scrollWidth - rail.clientWidth, 0);
    const scrollable = maxScroll > 1;
    const size = scrollable ? Math.max(rail.clientWidth / rail.scrollWidth, 0.18) : 1;
    const offset = scrollable ? (rail.scrollLeft / maxScroll) * (1 - size) : 0;

    setRailProgress((current) => {
      if (
        current.scrollable === scrollable &&
        Math.abs(current.size - size) < 0.002 &&
        Math.abs(current.offset - offset) < 0.002
      ) {
        return current;
      }
      return { offset, size, scrollable };
    });
  }, []);

  useEffect(() => {
    syncRailProgress();
    window.addEventListener('resize', syncRailProgress);
    return () => window.removeEventListener('resize', syncRailProgress);
  }, [events.length, syncRailProgress]);

  const scrollRail = useCallback((direction: -1 | 1) => {
    const rail = railRef.current;
    if (!rail) return;

    rail.scrollBy({
      left: direction * Math.max(rail.clientWidth * 0.82, 260),
      behavior: 'smooth',
    });

    window.setTimeout(syncRailProgress, 260);
  }, [syncRailProgress]);

  const handleRailPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'mouse') return;
    if ((event.target as HTMLElement).closest('button')) return;

    const rail = railRef.current;
    if (!rail) return;

    railDragRef.current = {
      isPointerDown: true,
      didDrag: false,
      suppressNextClick: false,
      pointerId: event.pointerId,
      startX: event.clientX,
      scrollLeft: rail.scrollLeft,
    };

  }, []);

  const handleRailPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = railDragRef.current;
    const rail = railRef.current;
    if (!drag.isPointerDown || drag.pointerId !== event.pointerId || !rail) return;

    const deltaX = event.clientX - drag.startX;
    if (!drag.didDrag && Math.abs(deltaX) < EVENTS_INFO_RAIL_DRAG_THRESHOLD_PX) {
      return;
    }

    if (!drag.didDrag) {
      drag.didDrag = true;
      drag.suppressNextClick = true;
      if (!rail.hasPointerCapture(event.pointerId)) {
        rail.setPointerCapture(event.pointerId);
      }
      setIsRailDragging(true);
    }

    event.preventDefault();
    rail.scrollLeft = drag.scrollLeft - deltaX;
    syncRailProgress();
  }, [syncRailProgress]);

  const handleRailPointerEnd = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const rail = railRef.current;
    const drag = railDragRef.current;
    if (!drag.isPointerDown || drag.pointerId !== event.pointerId) return;

    drag.isPointerDown = false;
    if (rail?.hasPointerCapture(event.pointerId)) {
      rail.releasePointerCapture(event.pointerId);
    }
    setIsRailDragging(false);

    if (drag.didDrag) {
      window.setTimeout(() => {
        railDragRef.current.didDrag = false;
        railDragRef.current.suppressNextClick = false;
      }, 350);
    }
  }, []);

  const handleRailClickCapture = useCallback((event: MouseEvent<HTMLDivElement>) => {
    if (!railDragRef.current.suppressNextClick) return;
    event.preventDefault();
    event.stopPropagation();
    railDragRef.current.didDrag = false;
    railDragRef.current.suppressNextClick = false;
  }, []);

  const progressStyle = {
    '--events-info-progress-size': `${railProgress.size * 100}%`,
    '--events-info-progress-offset': `${railProgress.offset * 100}%`,
  } as CSSProperties;

  return (
    <section className={`events-info-section is-${tone}`} data-section-key={sectionKey}>
      <div className="events-info-section-head">
        <div className="events-info-section-title">
          <i className={icon} />
          <strong>{title}</strong>
          <b>{count}</b>
        </div>
        {(headerControls || onAction) && (
          <div className="events-info-section-actions">
            {headerControls}
            {onAction && (
              <button type="button" onClick={onAction}>
                {actionLabel || '보기'}
                <i className="ri-arrow-right-s-line" />
              </button>
            )}
          </div>
        )}
      </div>

      <div className="events-info-card-rail-wrap">
        {railProgress.scrollable && (
          <button
            type="button"
            className="events-info-rail-nav events-info-rail-nav--prev"
            onClick={() => scrollRail(-1)}
            aria-label={`${title} 이전 항목 보기`}
          >
            <i className="ri-arrow-left-s-line" />
          </button>
        )}
        <div
          className={`events-info-card-rail ${isRailDragging ? 'is-dragging' : ''}`}
          ref={railRef}
          onScroll={syncRailProgress}
          onPointerDown={handleRailPointerDown}
          onPointerMove={handleRailPointerMove}
          onPointerUp={handleRailPointerEnd}
          onPointerCancel={handleRailPointerEnd}
          onClickCapture={handleRailClickCapture}
        >
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
        {railProgress.scrollable && (
          <button
            type="button"
            className="events-info-rail-nav events-info-rail-nav--next"
            onClick={() => scrollRail(1)}
            aria-label={`${title} 다음 항목 보기`}
          >
            <i className="ri-arrow-right-s-line" />
          </button>
        )}
      </div>

      {events.length > 0 && railProgress.scrollable && (
        <div className="events-info-rail-progress" aria-hidden="true" style={progressStyle}>
          <span />
        </div>
      )}
    </section>
  );
}

export default function EventsInfoPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, isAdmin, isAuthCheckComplete, signInWithKakao } = useAuth();
  const { openModal, closeModal, updateModalProps } = useModalActions();
  const { data: events = [], isLoading, refetch } = useEventsQuery();
  const { interactions, toggleEventFavorite } = useUserInteractions(user?.id || null);
  const { handleDeleteClick } = useEventActions({
    adminType: isAdmin ? 'super' : null,
    user,
    signInWithKakao,
  });

  const [sortOrder, setSortOrder] = useState<EventsInfoSortOrder>('random');
  const [showRegistrationModal, setShowRegistrationModal] = useState(false);
  const [registrationDate, setRegistrationDate] = useState<Date | null>(null);
  const [selectedDetailEvent, setSelectedDetailEvent] = useState<Event | null>(null);
  const openedDetailEventIdRef = useRef<string | number | null>(null);
  const [randomSeed] = useState(() => Math.floor(Math.random() * 1000000));

  const favoriteEventIds = useMemo<Set<number | string>>(() => {
    return new Set((interactions?.event_favorites || []).map((id) => Number(id)));
  }, [interactions?.event_favorites]);

  const visibleDanceScopeOptions = useMemo(() => getVisibleDanceScopeOptions(true), []);
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

  const primaryScopedEvents = useMemo(() => {
    return danceScopedEvents.filter((event) => {
      const category = getEventsInfoCategory(event);
      return category === 'event' || category === 'class' || category === 'club' || category === 'social';
    });
  }, [danceScopedEvents]);

  const activityScopedEvents = useMemo(() => {
    if (selectedActivity === 'all') return primaryScopedEvents;
    return primaryScopedEvents.filter((event) => getEventsInfoCategory(event) === selectedActivity);
  }, [primaryScopedEvents, selectedActivity]);

  const scopedEvents = useMemo(() => {
    return activityScopedEvents
      .filter((event) => !selectedTag || getEventDanceTags(event).includes(selectedTag));
  }, [activityScopedEvents, selectedTag]);

  const dynamicTags = useMemo(() => {
    const tags = new Set<string>();
    activityScopedEvents.forEach((event) => getEventDanceTags(event).forEach((tag) => tags.add(tag)));
    return Array.from(tags).sort((a, b) => getDanceTagLabel(a).localeCompare(getDanceTagLabel(b), 'ko'));
  }, [activityScopedEvents]);

  const genreGroups = useMemo(() => {
    return buildGenreGroups(scopedEvents);
  }, [scopedEvents]);

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

  const handleDanceScopeClick = useCallback((scope: typeof visibleDanceScopeOptions[number]['key']) => {
    if (!isAdmin && scope !== 'swing') {
      window.alert('준비중');
      return;
    }

    setFilterParam('dance', scope === 'swing' ? null : scope);
  }, [isAdmin, setFilterParam]);

  useEffect(() => {
    if (!isAuthCheckComplete || isAdmin || !searchParams.has('dance')) return;
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('dance');
    setSearchParams(nextParams, { replace: true });
  }, [isAdmin, isAuthCheckComplete, searchParams, setSearchParams]);

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

  const clubItems = useMemo(() => {
    return sortEventsInfoItems(
      scopedEvents.filter((event) => getEventsInfoCategory(event) === 'club'),
      sortOrder,
      randomSeed
    );
  }, [randomSeed, scopedEvents, sortOrder]);

  const socialItems = useMemo(() => {
    return sortEventsInfoItems(
      scopedEvents.filter((event) => getEventsInfoCategory(event) === 'social'),
      sortOrder,
      randomSeed
    );
  }, [randomSeed, scopedEvents, sortOrder]);

  const filteredFutureEvents = useMemo(() => {
    return eventItems;
  }, [eventItems]);

  const filteredRegularClasses = useMemo(() => {
    return regularClasses.filter(shouldShowClass);
  }, [regularClasses]);

  const filteredClubItems = useMemo(() => {
    return clubItems.filter(shouldShowClass);
  }, [clubItems]);

  const filteredSocialItems = useMemo(() => {
    return socialItems;
  }, [socialItems]);

  const hasVisibleEvents = filteredFutureEvents.length > 0 || filteredRegularClasses.length > 0 || filteredClubItems.length > 0 || filteredSocialItems.length > 0;

  const handleToggleFavorite = useCallback(async (eventId: number | string, event?: MouseEvent) => {
    event?.stopPropagation();

    if (!user) {
      openModal('login', { message: '즐겨찾기는 로그인 후 이용 가능합니다.' });
      return;
    }

    await toggleEventFavorite(eventId);
  }, [openModal, toggleEventFavorite, user]);

  const closeEventDetailModal = useCallback(() => {
    setSelectedDetailEvent(null);
    closeModal('eventDetail');
  }, [closeModal]);

  const removeDeletedEventFromEventsCache = useCallback((eventId: number | string) => {
    const rawId = String(eventId).replace('social-', '');
    const numericId = Number(rawId);
    const candidateIds = new Set([
      rawId,
      Number.isFinite(numericId) && numericId > 10000000 ? String(numericId - 10000000) : rawId,
    ]);

    queryClient.setQueriesData({ queryKey: ['events'] }, (oldData: unknown) => {
      if (!Array.isArray(oldData)) return oldData;
      return oldData.filter((item: Event) => {
        const itemId = String(item.id).replace('social-', '');
        return !candidateIds.has(itemId);
      });
    });
  }, []);

  useEffect(() => {
    if (!selectedDetailEvent) return;

    const selectedId = String(selectedDetailEvent.id).replace('social-', '');
    const handleDeleted = (nativeEvent: globalThis.Event) => {
      const deletedEventId = (nativeEvent as CustomEvent<{ eventId?: number | string }>).detail?.eventId;
      if (deletedEventId === undefined || deletedEventId === null) return;

      const deletedId = String(deletedEventId).replace('social-', '');
      const numericDeletedId = Number(deletedId);
      const candidateIds = new Set([
        deletedId,
        Number.isFinite(numericDeletedId) && numericDeletedId > 10000000 ? String(numericDeletedId - 10000000) : deletedId,
      ]);

      if (!candidateIds.has(selectedId)) return;

      removeDeletedEventFromEventsCache(deletedEventId);
      closeEventDetailModal();
      void refetch();
    };

    window.addEventListener('eventDeleted', handleDeleted);
    return () => window.removeEventListener('eventDeleted', handleDeleted);
  }, [closeEventDetailModal, refetch, removeDeletedEventFromEventsCache, selectedDetailEvent]);

  const eventDetailModalProps = useMemo(() => {
    if (!selectedDetailEvent) return null;

    return {
      event: selectedDetailEvent,
      onEdit: () => {},
      onDelete: async (eventFromModal: Event, clickEvent?: MouseEvent) => {
        const targetEvent = eventFromModal?.id ? eventFromModal : selectedDetailEvent;
        const success = await handleDeleteClick(targetEvent as any, clickEvent as any);
        if (success) {
          removeDeletedEventFromEventsCache(targetEvent.id);
          closeEventDetailModal();
          void refetch();
        }
      },
      isAdminMode: isAdmin,
      currentUserId: user?.id,
      isFavorite: favoriteEventIds.has(Number(selectedDetailEvent.id)),
      onToggleFavorite: (clickEvent: MouseEvent) => handleToggleFavorite(selectedDetailEvent.id, clickEvent),
      onClose: closeEventDetailModal,
      allGenres: {
        class: [...genreGroups.class, ...genreGroups.club],
        event: [...genreGroups.social, ...genreGroups.event],
      },
    };
  }, [
    closeEventDetailModal,
    favoriteEventIds,
    genreGroups.class,
    genreGroups.club,
    genreGroups.event,
    genreGroups.social,
    handleDeleteClick,
    handleToggleFavorite,
    isAdmin,
    refetch,
    removeDeletedEventFromEventsCache,
    selectedDetailEvent,
    user?.id,
  ]);

  useEffect(() => {
    if (!eventDetailModalProps || !selectedDetailEvent) {
      openedDetailEventIdRef.current = null;
      return;
    }

    const eventId = selectedDetailEvent.id;
    if (openedDetailEventIdRef.current === eventId) {
      updateModalProps('eventDetail', eventDetailModalProps);
      return;
    }

    openedDetailEventIdRef.current = eventId;
    openModal('eventDetail', eventDetailModalProps);
  }, [eventDetailModalProps, openModal, selectedDetailEvent, updateModalProps]);

  const handleEventClick = useCallback((event: Event) => {
    setSelectedDetailEvent(event);
  }, []);

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
        onSelectOneDay: () => {
          closeModal('registrationChoice');
          openModal('oneDayRecruitRegistration');
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
              className={[
                selectedDanceScope === option.key ? 'is-active' : '',
                !isAdmin && option.key !== 'swing' ? 'is-preparing' : '',
              ].filter(Boolean).join(' ')}
              onClick={() => handleDanceScopeClick(option.key)}
            >
              <strong>{option.label}</strong>
              <span>{option.desc}</span>
            </button>
          ))}
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
              {`${getDanceScopeLabel(selectedDanceScope)} 범위에 표시할 행사/강습/동호회/소셜이 없습니다.`}
            </div>
          ) : eventsInfoSections
            .filter((section) => selectedActivity === 'all' || selectedActivity === section.key)
            .filter((section) => {
              if (selectedActivity !== 'all') return true;
              if (section.key === 'event') return eventItems.length > 0;
              if (section.key === 'class') return regularClasses.filter(shouldShowClass).length > 0;
              if (section.key === 'club') return clubItems.filter(shouldShowClass).length > 0;
              if (section.key === 'social') return socialItems.length > 0;
              return false;
            })
            .map((section) => {
              const sectionEvents = section.key === 'event'
                ? filteredFutureEvents
                : section.key === 'class'
                  ? filteredRegularClasses
                  : section.key === 'club'
                    ? filteredClubItems
                    : filteredSocialItems;
              const sectionCount = section.key === 'event'
                ? eventItems.length
                : section.key === 'class'
                  ? regularClasses.filter(shouldShowClass).length
                  : section.key === 'club'
                    ? clubItems.filter(shouldShowClass).length
                    : socialItems.length;

              return (
                <EventsInfoSection
                  key={section.key}
                  title={section.title}
                  sectionKey={section.key === 'event' ? 'events' : section.key}
                  icon={section.icon}
                  tone={section.tone}
                  count={sectionCount}
                  events={sectionEvents}
                  headerControls={section.key === 'event' ? (
                    <button
                      type="button"
                      className={`events-info-sort-btn ${sortOrder === 'date' ? 'is-active' : ''}`}
                      onClick={() => setSortOrder((order) => order === 'date' ? 'random' : 'date')}
                      title={sortOrder === 'date' ? '시간순 정렬 중' : '랜덤 정렬 중'}
                    >
                      <i className={sortOrder === 'date' ? 'ri-sort-asc' : 'ri-shuffle-line'} />
                      {sortOrder === 'date' ? '시간순' : '랜덤'}
                    </button>
                  ) : null}
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
