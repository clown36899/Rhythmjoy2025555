import { useMemo, type CSSProperties } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useEventsQuery } from '../../hooks/queries/useEventsQuery';
import { getCardThumbnail, getEventDisplayImage } from '../../utils/getEventThumbnail';
import { getDayName, getLocalDateString, type Event } from '../v2/utils/eventListUtils';
import './HomeMenuHubTestPage.css';

type PreviewCard = {
  id: string;
  title: string;
  date: string;
  image: string;
};

type HubMenuItem = {
  id: string;
  label: string;
  subLabel: string;
  icon: string;
  to: string;
  accent: string;
  meta?: string;
  variant?: 'lesson-stack';
};

const MENU_GRID_AREAS: Record<string, string> = {
  home: 'home',
  calendar: 'calendar',
  events: 'events',
  board: 'board',
  places: 'places',
  'forum-media': 'media',
  library: 'library',
  links: 'links',
  'tempo-tool': 'tempo',
  shopping: 'shopping',
  guide: 'guide',
};

const FALLBACK_LESSON_CARDS: PreviewCard[] = [
  {
    id: 'fallback-lesson-1',
    title: '스윙 강습',
    date: '이번 주',
    image: '/icons/guest_class_icon_v4.png',
  },
  {
    id: 'fallback-lesson-2',
    title: '원데이 클래스',
    date: '모집중',
    image: '/icons/guest_class_icon_v3.jpg',
  },
  {
    id: 'fallback-lesson-3',
    title: '정규반',
    date: '오픈',
    image: '/default-thumbnails/default_medium.webp',
  },
];

const isLocalPreviewHost = () => {
  if (typeof window === 'undefined') return false;
  return ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
};

const getPrimaryDate = (event: Event) => {
  const today = getLocalDateString();
  const eventDates = Array.isArray(event.event_dates) ? [...event.event_dates].sort() : [];
  const nextEventDate = eventDates.find((date) => date >= today);
  return nextEventDate || event.start_date || event.date || event.end_date || '';
};

const isUpcoming = (event: Event) => {
  const today = getLocalDateString();
  const endDate = event.end_date || event.start_date || event.date;
  if (!endDate) return true;
  return endDate >= today;
};

const getSearchText = (event: Event) => [
  event.category,
  event.activity_type,
  event.genre,
  event.title,
  event.description,
].filter(Boolean).join(' ').toLowerCase();

const isLessonEvent = (event: Event) => {
  const category = String(event.category || '').toLowerCase();
  const activityType = String(event.activity_type || '').toLowerCase();
  const text = getSearchText(event);

  return (
    category === 'class' ||
    category === 'regular' ||
    category === 'club_lesson' ||
    category === 'club_regular' ||
    activityType === 'class' ||
    text.includes('강습') ||
    text.includes('워크샵') ||
    text.includes('workshop')
  );
};

const formatDateBadge = (date: string) => {
  if (!date) return '날짜 미정';
  const [, month, day] = date.split('-');
  const dayName = getDayName(date);
  if (!month || !day) return date;
  return `${Number(month)}.${Number(day)} ${dayName}`;
};

const toPreviewCard = (event: Event, index: number): PreviewCard => ({
  id: String(event.id || `lesson-${index}`),
  title: event.title || '강습 안내',
  date: formatDateBadge(getPrimaryDate(event)),
  image: getEventDisplayImage(event, FALLBACK_LESSON_CARDS[index % FALLBACK_LESSON_CARDS.length].image),
});

function LessonStack({ cards }: { cards: PreviewCard[] }) {
  return (
    <div className="hmh-lesson-stack" aria-hidden="true">
      {cards.slice(0, 3).map((card, index) => (
        <figure className={`hmh-lesson-card hmh-lesson-card--${index + 1}`} key={card.id}>
          <img src={card.image} alt="" draggable={false} />
        </figure>
      ))}
    </div>
  );
}

export default function HomeMenuHubTestPage() {
  const navigate = useNavigate();
  const { isAdmin, isAuthCheckComplete } = useAuth();
  const { data: events = [] } = useEventsQuery();
  const isLocalPreview = isLocalPreviewHost();

  if (!isLocalPreview && isAuthCheckComplete && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  const eventBuckets = useMemo(() => {
    const upcoming = events
      .filter(isUpcoming)
      .sort((a, b) => getPrimaryDate(a).localeCompare(getPrimaryDate(b)));

    const lessons = upcoming.filter(isLessonEvent);

    return { upcoming, lessons };
  }, [events]);

  const lessonCards = useMemo(() => {
    const liveCards = eventBuckets.lessons
      .filter((event) => Boolean(getCardThumbnail(event)))
      .slice(0, 3)
      .map(toPreviewCard);

    return liveCards.length >= 3
      ? liveCards
      : [...liveCards, ...FALLBACK_LESSON_CARDS].slice(0, 3);
  }, [eventBuckets.lessons]);

  const menuItems = useMemo<HubMenuItem[]>(() => [
    {
      id: 'home',
      label: '홈',
      subLabel: '메인',
      icon: 'ri-home-5-line',
      to: '/',
      accent: '#b9b4ff',
    },
    {
      id: 'calendar',
      label: '캘린더',
      subLabel: '전체 일정',
      icon: 'ri-calendar-event-line',
      to: '/calendar?view=calendar&scrollToToday=true',
      accent: '#22c55e',
    },
    {
      id: 'events',
      label: '강습&행사',
      subLabel: '강습·파티·모집',
      icon: 'ri-book-open-line',
      to: '/events',
      accent: '#38bdf8',
      meta: `${eventBuckets.upcoming.length || lessonCards.length}개`,
      variant: 'lesson-stack',
    },
    {
      id: 'board',
      label: '자유게시판',
      subLabel: '게시판',
      icon: 'ri-chat-3-line',
      to: '/board',
      accent: '#f59e0b',
    },
    {
      id: 'places',
      label: 'map',
      subLabel: '스튜디오·바',
      icon: 'ri-map-pin-2-line',
      to: '/places',
      accent: '#a3e635',
    },
    {
      id: 'forum-media',
      label: 'SNS 아카이브',
      subLabel: '영상·포스트 보관',
      icon: 'ri-movie-2-line',
      to: '/forum/media',
      accent: '#60a5fa',
    },
    {
      id: 'library',
      label: '라이브러리',
      subLabel: '자료 보관소',
      icon: 'ri-bookmark-3-line',
      to: '/board?category=history',
      accent: '#818cf8',
    },
    {
      id: 'links',
      label: '사이트 모음',
      subLabel: '커뮤니티 링크',
      icon: 'ri-earth-line',
      to: '/links',
      accent: '#34d399',
    },
    {
      id: 'tempo-tool',
      label: 'BPM/메트로놈',
      subLabel: '템포 도구',
      icon: 'ri-speed-up-line',
      to: '/tempo-tool',
      accent: '#ec4899',
    },
    {
      id: 'shopping',
      label: '쇼핑',
      subLabel: '댄스 용품',
      icon: 'ri-shopping-bag-3-line',
      to: '/shopping',
      accent: '#fb7185',
    },
    {
      id: 'guide',
      label: '안내',
      subLabel: '사용 안내',
      icon: 'ri-compass-3-line',
      to: '/guide',
      accent: '#c084fc',
    },
  ], [eventBuckets.upcoming.length, lessonCards.length]);

  return (
    <main className="home-menu-hub-test-page no-select">
      <section className="hmh-topbar" aria-label="메뉴 허브 요약">
        <h1>메뉴</h1>
      </section>

      <section className="hmh-menu-grid" aria-label="메인 메뉴">
        {menuItems.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`hmh-menu-tile hmh-menu-tile--${item.id} ${item.variant ? `hmh-menu-tile--${item.variant}` : ''}`.trim()}
            style={{
              '--hmh-accent': item.accent,
              gridArea: MENU_GRID_AREAS[item.id],
            } as CSSProperties}
            onClick={() => navigate(item.to)}
            aria-label={`${item.label}, ${item.subLabel}`}
            data-analytics-id={`home_menu_hub_${item.id}`}
            data-analytics-type="nav_item"
            data-analytics-title={item.label}
            data-analytics-section="home_menu_hub_test"
          >
            <span className="hmh-tile-art">
              {item.variant === 'lesson-stack' ? (
                <LessonStack cards={lessonCards} />
              ) : (
                <i className={item.icon} aria-hidden="true"></i>
              )}
            </span>
            <span className="hmh-tile-copy">
              <strong>{item.label}</strong>
              <em>{item.subLabel}</em>
            </span>
            {item.meta && <span className="hmh-tile-meta">{item.meta}</span>}
          </button>
        ))}
        <div className="hmh-brand-tile" style={{ gridArea: 'brand' }} aria-label="댄스빌보드 로고">
          <img src="/logo.png" alt="댄스빌보드" draggable={false} />
        </div>
      </section>
    </main>
  );
}
