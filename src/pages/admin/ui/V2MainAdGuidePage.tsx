import { useMemo, useState, type CSSProperties } from 'react';
import './V2MainAdGuidePage.css';

type PreviewMode = 'compare' | 'desktop' | 'mobile';
type ThemeMode = 'dark' | 'light';
type RouteTone = 'social' | 'event' | 'class';
type SecondaryMenuKey = 'calendar' | 'events' | 'board' | 'places' | 'forum' | 'shopping';
type SecondaryDestinationKey = Exclude<SecondaryMenuKey, 'calendar' | 'board'>;

interface NebEventSample {
  id: number;
  title: string;
  date?: string;
  start_date?: string | null;
  end_date?: string | null;
  event_dates?: string[] | null;
  category: string;
  genre?: string | null;
  location: string;
  venue_name?: string | null;
  image?: string;
  image_thumbnail?: string;
  image_medium?: string;
  image_full?: string;
  created_at: string;
  scope?: string;
}

interface RoutePreviewSample {
  key: RouteTone;
  label: string;
  count: number;
  target: string;
  legacyTarget?: string;
  behavior: string;
  source: string;
  events: NebEventSample[];
}

interface PracticeRoomSample {
  id: string;
  name: string;
  address: string;
  category: string;
  image: string;
}

interface ShopSample {
  id: number;
  name: string;
  description: string;
  logo_url: string;
  website_url: string;
}

interface BoardPostSample {
  id: number;
  title: string;
  prefix: string;
  prefixColor: string;
  views: number;
  comments: number;
  likes: number;
}

interface SecondaryMenuSample {
  key: SecondaryMenuKey;
  label: string;
  target: string;
  summary: string;
  icon: string;
  color: string;
  active?: boolean;
}

interface ForumToolSample {
  id: string;
  title: string;
  description: string;
  icon: string;
  path: string;
  color: string;
}

const nebSettings = {
  sortBy: '등록일 기준',
  timeWindowHours: 72,
  maxItems: 6,
  useFallback: true,
  includeGenres: ['워크샵', '파티', '대회', '라이브밴드', '린디합', '솔로재즈', '발보아', '블루스', '팀원모집', '소셜', '기타'],
};

const nebEvents: NebEventSample[] = [
  {
    id: 957,
    title: '발보아소셜 DJ신지 금요일엔드림발♥',
    date: '2026-05-15',
    category: 'social',
    genre: 'DJ,소셜',
    location: '인더무드(신림)',
    venue_name: '인더무드(신림)',
    image_thumbnail: 'https://mkoryudscamnopvxdelk.supabase.co/storage/v1/object/public/images/social-events/1778510667703_u4jco/thumbnail.webp',
    created_at: '2026-05-11T14:44:21.953358+00:00',
    scope: 'domestic',
  },
  {
    id: 956,
    title: '발보아소셜 DJ충하 일요일도드림발♥',
    date: '2026-05-17',
    category: 'social',
    genre: 'DJ,소셜',
    location: '인더무드(신림)',
    venue_name: '인더무드(신림)',
    image_thumbnail: 'https://mkoryudscamnopvxdelk.supabase.co/storage/v1/object/public/images/social-events/1778510531629_u1jby/thumbnail.webp',
    created_at: '2026-05-11T14:42:05.937895+00:00',
    scope: 'domestic',
  },
  {
    id: 955,
    title: '다이나믹 발보아 - The Series - Pure-Bal',
    date: '2026-05-17',
    start_date: '2026-05-17',
    end_date: '2026-05-17',
    category: 'class',
    genre: '발보아',
    location: '리듬앤조이 연습실',
    venue_name: '리듬앤조이 연습실',
    image_thumbnail: 'https://mkoryudscamnopvxdelk.supabase.co/storage/v1/object/public/images/event-posters/1778493361211_hr3nn/thumbnail.webp',
    created_at: '2026-05-11T09:56:01.84+00:00',
    scope: 'domestic',
  },
  {
    id: 954,
    title: '붐바스틱 솔로 워크샵!',
    date: '2026-05-19',
    start_date: '2026-05-19',
    end_date: '2026-05-19',
    category: 'club',
    genre: '솔로재즈',
    location: '봉천살롱',
    venue_name: '봉천살롱',
    image_thumbnail: 'https://mkoryudscamnopvxdelk.supabase.co/storage/v1/object/public/images/event-posters/1778493210902_yt6i1/thumbnail.webp',
    created_at: '2026-05-11T09:53:31.68+00:00',
    scope: 'domestic',
  },
  {
    id: 953,
    title: '다이나믹 발보아 - 패턴&스타일링',
    date: '2026-05-18',
    start_date: '2026-05-18',
    end_date: '2026-05-18',
    category: 'class',
    genre: '발보아',
    location: '소셜클럽(합정)',
    venue_name: '소셜클럽(합정)',
    image_thumbnail: 'https://mkoryudscamnopvxdelk.supabase.co/storage/v1/object/public/images/event-posters/1778493045317_809ty/thumbnail.webp',
    created_at: '2026-05-11T09:50:46.011+00:00',
    scope: 'domestic',
  },
  {
    id: 952,
    title: 'Balboa in Social Club (DJ 아드리안)',
    date: '2026-05-13',
    category: 'social',
    genre: 'DJ,소셜',
    location: '소셜클럽(합정)',
    venue_name: '소셜클럽(합정)',
    image_thumbnail: 'https://mkoryudscamnopvxdelk.supabase.co/storage/v1/object/public/images/social-events/1778492782706_24ru4/thumbnail.webp',
    created_at: '2026-05-11T09:46:23.517956+00:00',
    scope: 'domestic',
  },
];

const socialPreviewEvents: NebEventSample[] = [
  {
    id: 943,
    title: 'DJ 메이저 | 경성홀 화요 소셜 (DJ 메이저)',
    date: '2026-05-12',
    category: 'social',
    genre: '소셜',
    location: '경성홀',
    venue_name: '경성홀',
    image_thumbnail: 'https://mkoryudscamnopvxdelk.supabase.co/storage/v1/object/public/images/social-events/1778217160630_l1ufu/thumbnail.webp',
    image_full: 'https://mkoryudscamnopvxdelk.supabase.co/storage/v1/object/public/images/social-events/1778217160630_l1ufu/full.webp',
    created_at: '2026-05-08T05:12:41.04479+00:00',
  },
  {
    id: 947,
    title: 'DJ 안토니',
    date: '2026-05-12',
    category: 'social',
    genre: 'DJ,소셜',
    location: '봉천살롱',
    image_thumbnail: 'https://mkoryudscamnopvxdelk.supabase.co/storage/v1/object/public/images/social-events/1778461369674_o3x3c/thumbnail.webp',
    image_full: 'https://mkoryudscamnopvxdelk.supabase.co/storage/v1/object/public/images/social-events/1778461369674_o3x3c/full.webp',
    created_at: '2026-05-11T01:02:50.872571+00:00',
  },
  {
    id: 952,
    title: 'Balboa in Social Club (DJ 아드리안)',
    date: '2026-05-13',
    category: 'social',
    genre: 'DJ,소셜',
    location: '소셜클럽(합정)',
    image_thumbnail: 'https://mkoryudscamnopvxdelk.supabase.co/storage/v1/object/public/images/social-events/1778492782706_24ru4/thumbnail.webp',
    image_full: 'https://mkoryudscamnopvxdelk.supabase.co/storage/v1/object/public/images/social-events/1778492782706_24ru4/full.webp',
    created_at: '2026-05-11T09:46:23.517956+00:00',
  },
];

const eventPreviewEvents: NebEventSample[] = [
  {
    id: 777,
    title: '바다제:바라던 바다스윙 제주',
    date: '2026-05-22',
    start_date: '2026-05-22',
    end_date: '2026-05-24',
    event_dates: ['2026-05-22', '2026-05-23', '2026-05-24'],
    category: 'event',
    genre: '파티,기타',
    location: '서귀포월드컵리조트',
    venue_name: '서귀포월드컵리조트',
    image_thumbnail: 'https://mkoryudscamnopvxdelk.supabase.co/storage/v1/object/public/images/event-posters/1773969103892_0vh80/thumbnail.webp',
    image_full: 'https://mkoryudscamnopvxdelk.supabase.co/storage/v1/object/public/images/event-posters/1773969103892_0vh80/full.webp',
    created_at: '2026-03-20T01:11:45.074+00:00',
  },
  {
    id: 862,
    title: '서울 블루스 댄스 페스티벌 2026',
    date: '2026-05-28',
    start_date: '2026-05-28',
    end_date: '2026-05-31',
    event_dates: ['2026-05-28', '2026-05-29', '2026-05-30', '2026-05-31'],
    category: 'event',
    genre: '파티',
    location: '서울',
    venue_name: '서울',
    image_thumbnail: 'https://mkoryudscamnopvxdelk.supabase.co/storage/v1/object/public/images/social-events/1776087844666_sxk77/thumbnail.webp',
    image_full: 'https://mkoryudscamnopvxdelk.supabase.co/storage/v1/object/public/images/social-events/1776087844666_sxk77/full.webp',
    created_at: '2026-04-13T13:44:05.312842+00:00',
  },
  {
    id: 933,
    title: 'DJ 파인 | 스윙타임빠 토요 소셜',
    date: '2026-05-30',
    category: 'event',
    genre: 'DJ,소셜',
    location: '스윙타임바',
    venue_name: '스윙타임바',
    image_thumbnail: 'https://mkoryudscamnopvxdelk.supabase.co/storage/v1/object/public/images/social-events/1777943964014_iqewl/thumbnail.webp',
    image_full: 'https://mkoryudscamnopvxdelk.supabase.co/storage/v1/object/public/images/social-events/1777943964014_iqewl/full.webp',
    created_at: '2026-05-05T01:19:25.403728+00:00',
  },
];

const classPreviewEvents: NebEventSample[] = [
  {
    id: 839,
    title: '랄라&써니 리빌드업 I 신촌',
    date: '2026-05-16',
    start_date: '2026-05-16',
    end_date: '2026-05-30',
    event_dates: ['2026-05-16', '2026-05-23', '2026-05-30'],
    category: 'class',
    genre: '린디합',
    location: '신촌 한걸음 연습실',
    venue_name: '신촌 한걸음 연습실',
    image_thumbnail: 'https://mkoryudscamnopvxdelk.supabase.co/storage/v1/object/public/images/event-posters/1775615392102_khen9/thumbnail.webp',
    image_full: 'https://mkoryudscamnopvxdelk.supabase.co/storage/v1/object/public/images/event-posters/1775615392102_khen9/full.webp',
    created_at: '2026-04-08T02:29:52.938+00:00',
  },
  nebEvents[2],
  nebEvents[4],
];

const routePreviewSamples: RoutePreviewSample[] = [
  {
    key: 'social',
    label: '소셜정보',
    count: 17,
    target: '/calendar?category=social&scrollToToday=true',
    behavior: '달력의 소셜 탭으로 바로 이동',
    source: 'HomeNavButtonsSection.handleSocialClick',
    events: socialPreviewEvents,
  },
  {
    key: 'event',
    label: '행사정보',
    count: 13,
    target: '/events',
    legacyTarget: '.ELS-section--upcoming',
    behavior: '행사 전용 페이지로 이동',
    source: '신규 라우트 권장',
    events: eventPreviewEvents,
  },
  {
    key: 'class',
    label: '강습정보',
    count: 9,
    target: '/classes',
    legacyTarget: '.ELS-section--classes',
    behavior: '강습 전용 페이지로 이동',
    source: '신규 라우트 권장',
    events: classPreviewEvents,
  },
];

const secondaryMenuItems = [
  {
    key: 'calendar',
    label: '캘린더',
    target: '/calendar',
    summary: '소셜&행사 / 강습 필터 유지',
    icon: 'ri-calendar-event-line',
    color: '#2fbf86',
    active: true,
  },
  {
    key: 'events',
    label: '강습&행사정보',
    target: '/events',
    summary: '기존 행사/강습 섹션을 통합',
    icon: 'ri-stack-line',
    color: '#d8a02d',
  },
  {
    key: 'board',
    label: '자유게시판',
    target: '/board',
    summary: '말머리와 반응을 우선 노출',
    icon: 'ri-chat-3-line',
    color: '#4f83ff',
  },
  {
    key: 'places',
    label: '장소',
    target: '/places',
    summary: '지도와 장소 리스트를 함께',
    icon: 'ri-map-pin-2-line',
    color: '#a779ff',
  },
  {
    key: 'forum',
    label: '포럼',
    target: '/forum',
    summary: '도구형 허브 메뉴 유지',
    icon: 'ri-layout-grid-line',
    color: '#ec4899',
  },
  {
    key: 'shopping',
    label: '쇼핑',
    target: '/shopping',
    summary: '실제 쇼핑 배너 데이터 사용',
    icon: 'ri-shopping-bag-3-line',
    color: '#10b981',
  },
] satisfies SecondaryMenuSample[];

const forumTools: ForumToolSample[] = [
  {
    id: 'library',
    title: '라이브러리',
    description: '자료 보관소',
    icon: 'ri-book-open-line',
    path: '/board?category=history',
    color: '#3b82f6',
  },
  {
    id: 'links',
    title: '사이트 모음',
    description: '유용한 관련 링크',
    icon: 'ri-earth-line',
    path: '/links',
    color: '#10b981',
  },
  {
    id: 'bpm-tapper',
    title: 'BPM 측정기',
    description: '실시간 비트 측정',
    icon: 'ri-pulse-line',
    path: '/bpm-tapper',
    color: '#ec4899',
  },
  {
    id: 'metronome',
    title: '메트로놈',
    description: '고정밀 리듬 연주',
    icon: 'ri-timer-flash-line',
    path: '/metronome',
    color: '#f59e0b',
  },
];

const secondaryDestinationItems = secondaryMenuItems.filter(
  (item): item is SecondaryMenuSample & { key: SecondaryDestinationKey } => !['calendar', 'board'].includes(item.key)
);

const practiceRooms: PracticeRoomSample[] = [
  {
    id: '242b2bd1-d3a5-442f-b886-1e1d38a6edf8',
    name: '리듬앤조이 연습실',
    address: '동작구 남부순환로 2077 지하2',
    category: '연습실',
    image: 'https://mkoryudscamnopvxdelk.supabase.co/storage/v1/object/public/images/venue-images/242b2bd1-d3a5-442f-b886-1e1d38a6edf8/0.webp',
  },
  {
    id: '2e037616-5387-4044-9aab-65b7be1b948b',
    name: '사당연습실 라이언밀크 (구.디아트)',
    address: '서울 동작구 동작대로 49 호암빌딩 지하1층',
    category: '연습실',
    image: 'https://mkoryudscamnopvxdelk.supabase.co/storage/v1/object/public/images/venue-images/2e037616-5387-4044-9aab-65b7be1b948b/0.webp',
  },
  {
    id: '766270f8-8d32-494e-964d-0738ef7bdb2e',
    name: '더그라운즈 연습실',
    address: '서울 서초구 효령로2길 10 지하1층',
    category: '연습실',
    image: 'https://mkoryudscamnopvxdelk.supabase.co/storage/v1/object/public/images/venue-images/766270f8-8d32-494e-964d-0738ef7bdb2e/0.webp',
  },
];

const swingBars: PracticeRoomSample[] = [
  {
    id: 'bd89ece3-90d2-45d2-919d-dc47574bf9ed',
    name: '경성홀(신촌)',
    address: '서울 마포구 신촌로16길 30 지하 1층',
    category: '스윙바',
    image: 'https://mkoryudscamnopvxdelk.supabase.co/storage/v1/object/public/images/venue-images/bd89ece3-90d2-45d2-919d-dc47574bf9ed/0_thumb.webp',
  },
  {
    id: '6b4391fe-d028-4e4a-bd25-25c6872a6469',
    name: '봉천살롱',
    address: '서울 관악구 남부순환로 1732',
    category: '스윙바',
    image: 'https://mkoryudscamnopvxdelk.supabase.co/storage/v1/object/public/images/venue-images/6b4391fe-d028-4e4a-bd25-25c6872a6469/0.webp',
  },
  {
    id: '38c1691c-1cb1-4247-9d2e-da429c2d3a80',
    name: '소셜클럽(합정)',
    address: '서울 마포구 양화로12길 24 지하1층',
    category: '스윙바',
    image: 'https://mkoryudscamnopvxdelk.supabase.co/storage/v1/object/public/images/venue-images/38c1691c-1cb1-4247-9d2e-da429c2d3a80/0.webp',
  },
];

const placeCategoryFilters = [
  { label: '전체', count: 32 },
  { label: '스윙바', count: 16, active: true },
  { label: '연습실', count: 16 },
];

const placeRegionFilters = [
  { label: '전체', count: 32 },
  { label: '서울', count: 24, active: true },
  { label: '다른 지역', count: 8 },
];

const shops: ShopSample[] = [
  {
    id: 5,
    name: '매로빈',
    description: '2015년부터 스윙댄서들의 옷장을 책임지고 있는 매로빈',
    logo_url: 'https://mkoryudscamnopvxdelk.supabase.co/storage/v1/object/public/images/shop-logos/1766610337357.webp',
    website_url: 'https://www.instagram.com/reel/DNSBHxNPgvs/?igsh=d2luMGp2OG1zM21t',
  },
  {
    id: 3,
    name: '프롬클로이홍',
    description: '빈티지의상, 슈즈, 악세사리, 맞춤의상',
    logo_url: 'https://mkoryudscamnopvxdelk.supabase.co/storage/v1/object/public/images/shop-logos/1766610395311.webp',
    website_url: 'https://www.fromchloehong.co.kr/',
  },
  {
    id: 2,
    name: '로시난테',
    description: '댄스스니커스, 스윙댄스화, 발보아슈즈',
    logo_url: 'https://mkoryudscamnopvxdelk.supabase.co/storage/v1/object/public/images/shop-logos/1766610376672.webp',
    website_url: 'https://rosinanteshoes.com/',
  },
];

const boardPosts: BoardPostSample[] = [
  { id: 78, title: '공지사항', prefix: '공지', prefixColor: '#ef4444', views: 25, comments: 0, likes: 1 },
  { id: 99, title: 'ai를 활용한 수집...', prefix: '잡담', prefixColor: '#10b981', views: 8, comments: 0, likes: 0 },
  { id: 76, title: '라이브러리 메뉴안내', prefix: '잡담', prefixColor: '#10b981', views: 26, comments: 0, likes: 0 },
  { id: 75, title: '오류 신고는 어떻게...?', prefix: '건의', prefixColor: '#3b82f6', views: 16, comments: 1, likes: 1 },
];

const visibleSections = [
  ['신규 이벤트 배너', 'show_new_events_banner'],
  ['즐겨찾기', 'show_favorites'],
  ['예정된 행사', 'show_upcoming_events'],
  ['강습', 'show_classes'],
  ['동호회 강습', 'show_club_lessons'],
  ['동호회 정규강습', 'show_club_regular_classes'],
];

const getInitialPreviewMode = (): PreviewMode => {
  if (typeof window !== 'undefined' && window.innerWidth <= 720) return 'mobile';
  return 'compare';
};

const getEventImage = (event: NebEventSample) => event.image_full || event.image || event.image_medium || event.image_thumbnail || '';
const getEventPlace = (event: NebEventSample) => event.venue_name || event.location;
const getCategoryLabel = (event: NebEventSample) => {
  if (event.category === 'class') return '강습';
  if (event.category === 'club') return '동호회';
  if (event.category === 'social') return '소셜';
  return '행사';
};
const getTone = (event: NebEventSample) => {
  if (event.category === 'class') return 'blue';
  if (event.category === 'club') return 'violet';
  if (event.category === 'social') return 'green';
  return 'amber';
};
const getDateText = (event: NebEventSample) => {
  const date = event.event_dates?.[0] || event.start_date || event.date;
  if (!date) return '';
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  const week = ['일', '월', '화', '수', '목', '금', '토'][parsed.getDay()];
  return `${parsed.getMonth() + 1}.${parsed.getDate()} ${week}`;
};

function ModeSwitch({ mode, onModeChange }: { mode: PreviewMode; onModeChange: (mode: PreviewMode) => void }) {
  return (
    <div className="v2ag-mode-switch" role="tablist" aria-label="preview mode">
      {[
        ['compare', '비교'],
        ['desktop', '데스크탑'],
        ['mobile', '모바일'],
      ].map(([value, label]) => (
        <button
          key={value}
          type="button"
          className={mode === value ? 'is-active' : ''}
          onClick={() => onModeChange(value as PreviewMode)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function ThemeSwitch({ theme, onThemeChange }: { theme: ThemeMode; onThemeChange: (theme: ThemeMode) => void }) {
  return (
    <div className="v2ag-theme-switch" role="tablist" aria-label="color theme">
      {[
        ['dark', '블랙'],
        ['light', '화이트'],
      ].map(([value, label]) => (
        <button
          key={value}
          type="button"
          className={theme === value ? 'is-active' : ''}
          onClick={() => onThemeChange(value as ThemeMode)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function EventThumb({ event, className = '' }: { event: NebEventSample; className?: string }) {
  return (
    <span className={`v2ag-thumb ${className}`}>
      <img src={getEventImage(event)} alt="" loading="lazy" draggable={false} />
    </span>
  );
}

function EventMeta({ event }: { event: NebEventSample }) {
  return (
    <div className="v2ag-event-meta">
      <span><i className="ri-map-pin-line" />{getEventPlace(event)}</span>
      <span><i className="ri-calendar-line" />{getDateText(event)}</span>
      <span><i className="ri-price-tag-3-line" />{event.genre || getCategoryLabel(event)}</span>
    </div>
  );
}

function NebSlide({ event, active = false }: { event: NebEventSample; active?: boolean }) {
  return (
    <article className={`v2ag-neb-slide v2ag-neb-slide--${getTone(event)} ${active ? 'is-active' : ''}`}>
      <div className="v2ag-neb-image-wrap">
        <img src={getEventImage(event)} alt="" loading="lazy" draggable={false} />
        <span>{getCategoryLabel(event)}</span>
      </div>
      <div className="v2ag-neb-content">
        <EventThumb event={event} className="v2ag-neb-mini" />
        <div>
          <em>{event.genre || getCategoryLabel(event)}</em>
          <EventMeta event={event} />
          <strong>{event.title}</strong>
        </div>
      </div>
    </article>
  );
}

function StackedRouteImages({ sample }: { sample: RoutePreviewSample }) {
  return (
    <div className="v2ag-route-stack" aria-hidden="true">
      {sample.events.slice(0, 3).map((event, index) => (
        <span key={event.id} className={index === 2 ? 'is-front' : ''}>
          <img src={getEventImage(event)} alt="" loading="lazy" draggable={false} />
          {index === 2 && (
            <b>
              <small>{getEventPlace(event)}</small>
              {event.title}
            </b>
          )}
        </span>
      ))}
    </div>
  );
}

function HomeNavPreviewButton({ sample }: { sample: RoutePreviewSample }) {
  return (
    <article className={`v2ag-nav-button v2ag-nav-button--${sample.key}`}>
      <div className="v2ag-nav-bubble">{sample.label}</div>
      <StackedRouteImages sample={sample} />
      <div className="v2ag-nav-copy">
        <strong>{sample.behavior}</strong>
        <span>{sample.target}</span>
        {sample.legacyTarget && <em>기존 하단 스크롤: {sample.legacyTarget}</em>}
      </div>
    </article>
  );
}

function RoutePreviewCard({ sample }: { sample: RoutePreviewSample }) {
  const featured = sample.events[0];

  return (
    <article className={`v2ag-route-card v2ag-route-card--${sample.key}`}>
      <div className="v2ag-route-card-head">
        <span>{sample.label}</span>
        <strong>{sample.count}개</strong>
      </div>
      <div className="v2ag-route-card-body">
        <EventThumb event={featured} className="v2ag-route-card-thumb" />
        <div>
          <em>{sample.source}</em>
          <strong>{featured.title}</strong>
          <span>{getEventPlace(featured)} · {getDateText(featured)}</span>
          {sample.legacyTarget && <small>기존: {sample.legacyTarget}</small>}
        </div>
      </div>
      <div className="v2ag-route-strip">
        {sample.events.map((event) => (
          <img key={event.id} src={getEventImage(event)} alt="" loading="lazy" draggable={false} />
        ))}
      </div>
    </article>
  );
}

function CommercePreviewCard({ type }: { type: 'practice' | 'shopping' }) {
  const isPractice = type === 'practice';
  const items = isPractice ? practiceRooms : shops;

  return (
    <article className={`v2ag-commerce-card v2ag-commerce-card--${type}`}>
      <div className="v2ag-side-head">
        <strong>{isPractice ? '연습실 배너' : '쇼핑 배너'}</strong>
        <span>{isPractice ? 'PracticeRoomBanner' : 'ShoppingBanner'}</span>
      </div>
      <div className="v2ag-commerce-list">
        {items.map((item) => (
          <div key={item.id} className="v2ag-commerce-item">
            <img src={isPractice ? (item as PracticeRoomSample).image : (item as ShopSample).logo_url} alt="" loading="lazy" draggable={false} />
            <div>
              <strong>{item.name}</strong>
              <span>{isPractice ? (item as PracticeRoomSample).address : (item as ShopSample).description}</span>
            </div>
          </div>
        ))}
      </div>
      <p>{isPractice ? '클릭 시 venueDetail 모달을 엽니다.' : '4초 자동 슬라이드와 shopDetail 모달 진입을 갖습니다.'}</p>
    </article>
  );
}

function BoardPreviewCard() {
  return (
    <article className="v2ag-board-card">
      <div className="v2ag-side-head">
        <strong>자유게시판 프리뷰</strong>
        <span>/board?category=free</span>
      </div>
      <div className="v2ag-board-list">
        {boardPosts.map((post) => (
          <div key={post.id}>
            <span style={{ '--post-prefix-color': post.prefixColor } as CSSProperties}>{post.prefix}</span>
            <strong>{post.title}</strong>
            <em>조회 {post.views} · 댓글 {post.comments} · 좋아요 {post.likes}</em>
          </div>
        ))}
      </div>
    </article>
  );
}

function SecondaryMenuDesignBody({ menuKey }: { menuKey: SecondaryDestinationKey }) {
  if (menuKey === 'events') {
    const rows = [eventPreviewEvents[0], classPreviewEvents[0], eventPreviewEvents[1]];

    return (
      <div className="v2ag-menu-event-list">
        <div className="v2ag-menu-tabs" aria-hidden="true">
          <span className="is-active">전체</span>
          <span>행사</span>
          <span>강습</span>
        </div>
        {rows.map((event) => (
          <div key={event.id} className="v2ag-menu-event-row">
            <EventThumb event={event} className="v2ag-menu-event-thumb" />
            <div>
              <strong>{event.title}</strong>
              <em><i className="ri-map-pin-line" />{getEventPlace(event)}</em>
              <span>{getCategoryLabel(event)} · {getDateText(event)}</span>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (menuKey === 'places') {
    const visiblePlaces = swingBars;

    return (
      <div className="v2ag-menu-place">
        <div className="v2ag-menu-place-controls">
          <div className="v2ag-menu-place-cats" aria-hidden="true">
            {placeCategoryFilters.map((filter) => (
              <span key={filter.label} className={filter.active ? 'is-active' : ''}>
                {filter.label}<b>{filter.count}</b>
              </span>
            ))}
          </div>
          <div className="v2ag-menu-place-subcontrols" aria-hidden="true">
            <span className="is-active"><i className="ri-map-2-line" />지도</span>
            <span><i className="ri-list-check" />리스트</span>
          </div>
          <div className="v2ag-menu-place-regions" aria-hidden="true">
            {placeRegionFilters.map((filter) => (
              <span key={filter.label} className={filter.active ? 'is-active' : ''}>
                {filter.label}<b>{filter.count}</b>
              </span>
            ))}
          </div>
        </div>
        <div className="v2ag-menu-place-body">
          <div className="v2ag-menu-map-preview" aria-hidden="true">
            <b>스윙바 · 서울</b>
            <span className="pin-a" />
            <span className="pin-b" />
            <span className="pin-c" />
          </div>
          <div className="v2ag-menu-place-list">
            {visiblePlaces.map((place) => (
              <div key={place.id}>
                <img src={place.image} alt="" loading="lazy" draggable={false} />
                <div>
                  <span className="v2ag-place-category">{place.category}</span>
                  <strong>{place.name}</strong>
                  <em>{place.address}</em>
                  <small><i className="ri-map-pin-2-fill" />네이버 · 구글</small>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (menuKey === 'forum') {
    return (
      <div className="v2ag-menu-forum-grid">
        {forumTools.map((tool) => (
          <button key={tool.id} type="button" style={{ '--forum-color': tool.color } as CSSProperties}>
            <i className={tool.icon} />
            <strong>{tool.title}</strong>
            <span>{tool.description}</span>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="v2ag-menu-shop-grid">
      {shops.map((shop) => (
        <div key={shop.id}>
          <img src={shop.logo_url} alt="" loading="lazy" draggable={false} />
          <strong>{shop.name}</strong>
          <span>{shop.description}</span>
        </div>
      ))}
    </div>
  );
}

function SecondaryMenuDesignSamples({ compact = false }: { compact?: boolean }) {
  return (
    <section className={`v2ag-menu-design-section ${compact ? 'is-compact' : ''}`}>
      <div className="v2ag-side-head">
        <strong>2차 메뉴 목적지 페이지 샘플</strong>
        <span>캘린더와 자유게시판은 별도 UI 가이드에서 확인</span>
      </div>
      <div className="v2ag-menu-design-grid">
        {secondaryDestinationItems.map((item) => (
          <article
            key={item.key}
            className={`v2ag-menu-design-card v2ag-menu-design-card--${item.key}`}
            style={{ '--menu-color': item.color } as CSSProperties}
          >
            <div className="v2ag-menu-design-head">
              <span>
                <i className={item.icon} />
              </span>
              <div>
                <strong>{item.label}</strong>
                <small>{item.target}</small>
              </div>
              <em>{item.summary}</em>
            </div>
            <SecondaryMenuDesignBody menuKey={item.key} />
          </article>
        ))}
      </div>
    </section>
  );
}

function HomeFunctionPanel() {
  return (
    <aside className="v2ag-feature-checks">
      {[
        ['NEB 광고', '최근 등록 이벤트 슬라이드'],
        ['2차 메뉴', '요청한 6개 메뉴로 고정'],
        ['캘린더', '전체/소셜&행사/강습 필터'],
        ['강습&행사', '기존 하단 섹션을 통합 샘플화'],
        ['게시판/장소', '실제 route 프리뷰 유지'],
        ['포럼/쇼핑', '도구 허브와 쇼핑 배너 연결'],
        ['테마/언어', '헤더 우측 로그인 앞'],
      ].map(([label, value]) => (
        <div key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </aside>
  );
}

function HeaderControlsPreview() {
  return (
    <div className="v2ag-app-controls" aria-label="header controls">
      <button type="button" className="v2ag-theme-dot" title="블랙/화이트 모드">
        <i className="ri-sun-line" />
      </button>
      <button type="button" className="v2ag-lang-chip" title="한국어/영어 전환">
        <span>가</span><em>/</em><span>A</span>
      </button>
      <button type="button" className="v2ag-search-dot" title="검색">
        <i className="ri-search-line" />
      </button>
      <button type="button" className="v2ag-login-ghost">로그인</button>
    </div>
  );
}

function SecondaryMenuPreview({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`v2ag-secondary-wrap ${compact ? 'is-compact' : ''}`}>
      <nav className="v2ag-secondary-menu" aria-label="secondary menu preview">
        {secondaryMenuItems.map((item) => (
          <button key={item.target} type="button" className={item.active ? 'is-active' : ''}>
            {item.label}
          </button>
        ))}
      </nav>
      <span className="v2ag-scroll-cue" aria-hidden="true">
        <i className="ri-arrow-right-s-line" />
      </span>
      <span className="v2ag-scroll-rail" aria-hidden="true" />
    </div>
  );
}

function RegisterFabPreview({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`v2ag-register-fab ${compact ? 'is-compact' : ''}`}>
      <span>자율등록(누구나)</span>
      <button type="button" aria-label="자율등록">
        <i className="ri-add-line" />
      </button>
    </div>
  );
}

function AppHeaderPreview({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`v2ag-app-chrome ${compact ? 'is-compact' : ''}`}>
      <header className="v2ag-app-header">
        <button type="button" className="v2ag-menu-icon" aria-label="menu">
          <i className="ri-menu-line" />
        </button>
        <div className="v2ag-brand-lockup">
          <img src="/logo.png" alt="" draggable={false} />
          <div>
            <strong>댄스빌보드</strong>
            <span>swingenjoy.com</span>
          </div>
        </div>
        <HeaderControlsPreview />
      </header>
      <SecondaryMenuPreview compact={compact} />
    </div>
  );
}

function DesktopAdPreview() {
  const featured = nebEvents[0];

  return (
    <section className="v2ag-desktop-preview" aria-label="desktop v2 main preview">
      <div className="v2ag-home-shell">
        <AppHeaderPreview />
        <RegisterFabPreview />

        <header className="v2ag-home-header">
          <div>
            <span>V2 Home Preview Hub</span>
            <strong>메인 프리뷰 광고</strong>
          </div>
          <div className="v2ag-header-actions">
            <button type="button" className="is-active">NEB</button>
            <button type="button">라우트</button>
            <button type="button">배너</button>
          </div>
        </header>

        <section className="v2ag-neb-layout">
          <div className="v2ag-neb-main">
            <div className="v2ag-neb-bar">
              <div>
                <strong>신규 이벤트</strong>
                <span>NEW</span>
                <button type="button" aria-label="노출 기준 안내"><i className="ri-information-line" /></button>
              </div>
              <div>
                <button type="button">모아보기 <i className="ri-arrow-right-s-line" /></button>
                <em>1 / {nebEvents.length}</em>
              </div>
            </div>
            <NebSlide event={featured} active />
            <div className="v2ag-neb-indicators">
              {nebEvents.map((event, index) => (
                <span key={event.id} className={index === 0 ? 'is-active' : ''} />
              ))}
            </div>
          </div>

          <aside className="v2ag-feature-panel">
            <span className="v2ag-kicker-pill">실제 DB 이벤트 #{featured.id}</span>
            <h2>{featured.title}</h2>
            <EventMeta event={featured} />
            <p>운영 `/v2`의 NEB는 최근 등록 이벤트를 먼저 광고하고, 바로 아래에서 다른 라우트와 홈 섹션으로 이어지는 프리뷰 허브가 붙습니다.</p>
            <div className="v2ag-cta-row">
              <button type="button">이벤트 열기</button>
              <button type="button">모아보기</button>
            </div>
          </aside>

          <aside className="v2ag-settings-panel">
            <div className="v2ag-side-head">
              <strong>노출 설정</strong>
              <span>app_settings</span>
            </div>
            <div className="v2ag-setting-list">
              <div><span>섹션</span><strong>ON</strong><em>show_new_events_banner</em></div>
              <div><span>정렬</span><strong>{nebSettings.sortBy}</strong><em>created_at 우선</em></div>
              <div><span>시간창</span><strong>{nebSettings.timeWindowHours}h</strong><em>최근 등록 기준</em></div>
              <div><span>최대</span><strong>{nebSettings.maxItems}개</strong><em>부족 시 최신순 채움</em></div>
            </div>
          </aside>
        </section>

        <section className="v2ag-route-hub">
          <div className="v2ag-side-head">
            <strong>HomeNavButtonsSection</strong>
            <span>캘린더 리스트가 아니라 경로/섹션 프리뷰</span>
          </div>
          <div className="v2ag-home-nav-strip">
            {routePreviewSamples.map((sample) => (
              <HomeNavPreviewButton key={sample.key} sample={sample} />
            ))}
          </div>
          <div className="v2ag-route-card-grid">
            {routePreviewSamples.map((sample) => (
              <RoutePreviewCard key={sample.key} sample={sample} />
            ))}
          </div>
        </section>

        <SecondaryMenuDesignSamples />

        <section className="v2ag-support-grid v2ag-support-grid--routes">
          <div className="v2ag-banner-preview-panel">
            <CommercePreviewCard type="practice" />
            <CommercePreviewCard type="shopping" />
            <BoardPreviewCard />
          </div>
          <HomeFunctionPanel />
        </section>
      </div>
    </section>
  );
}

function MobileAdPreview() {
  const featured = nebEvents[0];

  return (
    <section className="v2ag-mobile-frame" aria-label="mobile v2 main preview">
      <AppHeaderPreview compact />
      <RegisterFabPreview compact />

      <section className="v2ag-mobile-neb">
        <div className="v2ag-mobile-neb-head">
          <div>
            <strong>신규 이벤트</strong>
            <span>1 / {nebEvents.length}</span>
          </div>
          <button type="button">모아보기</button>
        </div>
        <NebSlide event={featured} active />
      </section>

      <section className="v2ag-mobile-route-hub">
        <div className="v2ag-mobile-route-title">
          <strong>바로 보기</strong>
          <span>실제 홈 네비게이션 구조</span>
        </div>
        {routePreviewSamples.map((sample) => (
          <HomeNavPreviewButton key={sample.key} sample={sample} />
        ))}
      </section>

      <SecondaryMenuDesignSamples compact />

      <section className="v2ag-mobile-banners">
        <CommercePreviewCard type="practice" />
        <CommercePreviewCard type="shopping" />
        <BoardPreviewCard />
      </section>
    </section>
  );
}

export default function V2MainAdGuidePage() {
  const [mode, setMode] = useState<PreviewMode>(getInitialPreviewMode);
  const [theme, setTheme] = useState<ThemeMode>('dark');

  const layoutClass = useMemo(() => {
    if (mode === 'desktop') return 'is-desktop-only';
    if (mode === 'mobile') return 'is-mobile-only';
    return 'is-compare';
  }, [mode]);

  return (
    <main className="v2-main-ad-guide-page" data-theme={theme}>
      <section className="v2ag-hero">
        <div>
          <span className="v2ag-page-kicker">V2 main preview UI guide</span>
          <h1>V2 메인 광고/프리뷰 샘플</h1>
          <p>운영 `/v2`의 신규 이벤트 광고는 유지하되, 헤더 아래 2차 메뉴를 요청한 6개 구조로 고정하고 각 메뉴가 이어질 화면 샘플까지 함께 구성했습니다.</p>
        </div>
        <div className="v2ag-hero-controls">
          <ModeSwitch mode={mode} onModeChange={setMode} />
          <ThemeSwitch theme={theme} onThemeChange={setTheme} />
        </div>
      </section>

      <section className={`v2ag-preview-grid ${layoutClass}`}>
        <div className="v2ag-preview-column v2ag-preview-column--desktop">
          <div className="v2ag-section-label">
            <strong>Desktop</strong>
            <span>NEB 광고 + 라우트 프리뷰 + 배너 슬롯</span>
          </div>
          <DesktopAdPreview />
        </div>

        <div className="v2ag-preview-column v2ag-preview-column--mobile">
          <div className="v2ag-section-label">
            <strong>Mobile</strong>
            <span>한 장 광고 뒤에 바로 보이는 경로 프리뷰</span>
          </div>
          <MobileAdPreview />
        </div>
      </section>

      <section className="v2ag-principles">
        <div>
          <strong>원래 기능 기준</strong>
          <p>기존 로고, 검색, 등록 버튼, 헤더 우측 컨트롤, NEB, HomeNavButtonsSection, 배너 슬롯을 한 샘플 안에서 확인합니다.</p>
        </div>
        <div>
          <strong>2차 메뉴 정리</strong>
          <p>캘린더, 강습&행사정보, 자유게시판, 장소, 포럼, 쇼핑 순서로 고정하고 각 메뉴별 세부 디자인을 아래에 붙였습니다.</p>
        </div>
        <div>
          <strong>컨트롤 위치</strong>
          <p>블랙/화이트와 한글/영어 전환은 헤더 우측, 로그인 앞에 두는 안으로 잡았습니다. {visibleSections[0][1]}도 유지합니다.</p>
        </div>
      </section>
    </main>
  );
}
