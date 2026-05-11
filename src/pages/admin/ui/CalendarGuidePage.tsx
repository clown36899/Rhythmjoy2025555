import { useMemo, useState } from 'react';
import './CalendarGuidePage.css';

type PreviewMode = 'compare' | 'desktop' | 'mobile';
type CalendarFilter = 'all' | 'social-events' | 'classes';
type ThemeMode = 'dark' | 'light';

interface CalendarEventSample {
  id: string;
  title: string;
  date?: string;
  start_date?: string;
  end_date?: string;
  event_dates?: string[];
  category: string;
  location: string;
  venue_name?: string | null;
  address?: string | null;
  image_micro?: string;
  image_thumbnail?: string;
  image_medium?: string;
  venue_id?: string | null;
  scope?: string;
}

const dayEvents: Record<number, CalendarEventSample[]> = {
  9: [
    { id: 'sample-9-1', title: 'Friday Lindy Social', date: '2026-05-09', category: 'social', location: '스윙타임바', venue_name: '스윙타임바', image_thumbnail: '/scraped/swingtime_260306_poster.png' },
  ],
  11: [
    { id: 'sample-11-1', title: '초급 린디합 정규반', date: '2026-05-11', category: 'class', location: '해피홀', venue_name: '해피홀', image_thumbnail: '/scraped/happyhall_260304_poster.jpg' },
    { id: 'sample-11-2', title: 'Slow Jam Social', date: '2026-05-11', category: 'social', location: '스윙타임바', venue_name: '스윙타임바', image_thumbnail: '/scraped/poster_swingtimebar_1776693421534.jpg' },
    { id: 'sample-11-3', title: 'DJ Night: Classic Swing', date: '2026-05-11', category: 'event', location: '사당 연습실', venue_name: '사당 연습실', image_thumbnail: '/scraped/swingtaun_260411_dj_lovely.jpg' },
  ],
  13: [
    { id: 'sample-13-1', title: 'Balboa Practice', date: '2026-05-13', category: 'event', location: '홍대 스튜디오', venue_name: '홍대 스튜디오', image_thumbnail: '/scraped/swf_260309_balboa.jpg' },
  ],
  16: [
    { id: 'sample-16-1', title: 'SNL Jazz Social', date: '2026-05-16', category: 'social', location: '해피홀', venue_name: '해피홀', image_thumbnail: '/scraped/poster_hh_openparty_260411.webp' },
    { id: 'sample-16-2', title: 'Beginner Workshop', date: '2026-05-16', category: 'class', location: '무브홀', venue_name: '무브홀', image_thumbnail: '/scraped/swf_260215_workshop.jpg' },
  ],
  21: [
    { id: 'sample-21-1', title: 'Swing Exchange Prep', date: '2026-05-21', category: 'event', location: '마포 라운지', venue_name: '마포 라운지', image_thumbnail: '/scraped/seoul_lindyfest_2026.png' },
  ],
};

const weekDays = ['월', '화', '수', '목', '금', '토', '일'];
const mobileDates = [8, 9, 10, 11, 12, 13, 14];
const upcomingEvents = [11, 13, 16, 21].flatMap((day) => dayEvents[day]);
const monthGridDays = [
  ...Array.from({ length: 4 }, () => null),
  ...Array.from({ length: 31 }, (_, index) => index + 1),
];
const calendarEventTotal = Object.values(dayEvents).reduce((total, events) => total + events.length, 0);

const categoryLabels: Record<string, string> = {
  class: '강습',
  regular: '강습',
  social: '소셜',
  event: '행사',
  club: '동호회',
};

const calendarFilters: Array<{ value: CalendarFilter; label: string }> = [
  { value: 'all', label: '전체' },
  { value: 'social-events', label: '소셜&행사' },
  { value: 'classes', label: '강습' },
];

const getCategoryLabel = (event: CalendarEventSample) => categoryLabels[event.category] || event.category;
const getEventPlace = (event: CalendarEventSample) => event.venue_name || event.location || event.address || '';
const getEventImage = (event: CalendarEventSample) => event.image_thumbnail || event.image_medium || event.image_micro || '';
const isClassEvent = (event: CalendarEventSample) => ['class', 'regular', 'club'].includes(event.category?.toLowerCase());
const isVisibleForCalendarFilter = (event: CalendarEventSample, filter: CalendarFilter) => {
  if (filter === 'classes') return isClassEvent(event);
  if (filter === 'social-events') return !isClassEvent(event);
  return true;
};
const getFilteredEvents = (filter: CalendarFilter) => Object.values(dayEvents)
  .flatMap((events) => events)
  .filter((event) => isVisibleForCalendarFilter(event, filter));
const getFilteredDayEvents = (day: number, filter: CalendarFilter) => (dayEvents[day] || [])
  .filter((event) => isVisibleForCalendarFilter(event, filter));
const getCalendarFilterLabel = (filter: CalendarFilter) => calendarFilters.find((item) => item.value === filter)?.label || '전체';
const getEventTone = (event: CalendarEventSample) => {
  if (event.category === 'class' || event.category === 'regular') return 'blue';
  if (event.category === 'social') return 'green';
  if (event.category === 'club') return 'violet';
  return 'amber';
};
const getDateLabel = (event: CalendarEventSample) => {
  const date = event.start_date || event.date || event.event_dates?.[0];
  if (!date) return '';
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return `${parsed.getMonth() + 1}.${parsed.getDate()} ${weekDays[(parsed.getDay() + 6) % 7]}`;
};

const getInitialPreviewMode = (): PreviewMode => {
  if (typeof window !== 'undefined' && window.innerWidth <= 720) return 'mobile';
  return 'compare';
};

function ModeSwitch({ mode, onModeChange }: { mode: PreviewMode; onModeChange: (mode: PreviewMode) => void }) {
  return (
    <div className="cgp-mode-switch" role="tablist" aria-label="preview mode">
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
    <div className="cgp-theme-switch" role="tablist" aria-label="color theme">
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

function EventThumbnail({ event, className = '' }: { event: CalendarEventSample; className?: string }) {
  const image = getEventImage(event);

  return (
    <span className={`cgp-thumb ${className}`}>
      {image ? <img src={image} alt="" loading="lazy" draggable={false} /> : null}
    </span>
  );
}

function CalendarFilterTabs({ filter, onFilterChange, compact = false }: {
  filter: CalendarFilter;
  onFilterChange: (filter: CalendarFilter) => void;
  compact?: boolean;
}) {
  return (
    <div className={compact ? 'cgp-mobile-category-tabs' : 'cgp-category-tabs'} aria-label="calendar category filter">
      {calendarFilters.map((item) => (
        <button
          key={item.value}
          type="button"
          className={filter === item.value ? 'is-active' : ''}
          onClick={() => onFilterChange(item.value)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function DayCell({ day, filter }: { day: number | null; filter: CalendarFilter }) {
  if (!day) {
    return <span className="cgp-day-cell is-empty" aria-hidden="true" />;
  }

  const events = getFilteredDayEvents(day, filter);
  const isToday = day === 11;

  return (
    <button type="button" className={`cgp-day-cell ${isToday ? 'is-today' : ''} ${events.length ? 'has-events' : ''}`}>
      <span className="cgp-day-cell-top">
        <span className="cgp-day-number">{day}</span>
        {events.length > 0 && <span className="cgp-day-count">{events.length}</span>}
      </span>
      <span className="cgp-day-events">
        {events.slice(0, 3).map((event) => (
          <span key={event.id} className={`cgp-event-chip cgp-event-chip--${getEventTone(event)}`}>
            <EventThumbnail event={event} className="cgp-event-chip-thumb" />
            <span className="cgp-event-chip-copy">
              <strong>{getEventPlace(event)}</strong>
              <span>{event.title}</span>
            </span>
          </span>
        ))}
      </span>
    </button>
  );
}

function DesktopCalendarPreview({ filter, onFilterChange }: {
  filter: CalendarFilter;
  onFilterChange: (filter: CalendarFilter) => void;
}) {
  const filteredEvents = getFilteredEvents(filter);
  const todayCount = getFilteredDayEvents(11, filter).length;
  const placeCount = new Set(filteredEvents.map(getEventPlace).filter(Boolean)).size;

  return (
    <section className="cgp-desktop-preview" aria-label="desktop calendar preview">
      <div className="cgp-calendar-shell">
        <header className="cgp-topbar">
          <div>
            <span>월간 캘린더</span>
            <strong>2026.05</strong>
          </div>
          <div className="cgp-toolbar">
            <div className="cgp-segment">
              <button type="button" className="is-active">캘린더</button>
              <button type="button">리스트</button>
              <button type="button">지도</button>
            </div>
            <button type="button" className="cgp-today-btn">오늘</button>
          </div>
        </header>

        <CalendarFilterTabs filter={filter} onFilterChange={onFilterChange} />

        <div className="cgp-summary-row">
          <div>
            <span>오늘 일정</span>
            <strong>{todayCount}</strong>
          </div>
          <div>
            <span>선택 범위</span>
            <strong>{filteredEvents.length}</strong>
          </div>
          <div>
            <span>장소</span>
            <strong>{placeCount}</strong>
          </div>
          <div>
            <span>필터</span>
            <strong>{getCalendarFilterLabel(filter)}</strong>
          </div>
        </div>

        <div className="cgp-desktop-layout cgp-desktop-layout--calendar">
          <section className="cgp-month-panel cgp-month-panel--wide">
            <div className="cgp-month-head">
              {weekDays.map((day) => (
                <span key={day}>{day}</span>
              ))}
            </div>
            <div className="cgp-month-grid">
              {monthGridDays.map((day, index) => (
                <DayCell key={day ?? `empty-${index}`} day={day} filter={filter} />
              ))}
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}

function MobileMonthDay({ day, filter }: { day: number | null; filter: CalendarFilter }) {
  if (!day) {
    return <span className="cgp-mobile-day-cell is-empty" aria-hidden="true" />;
  }

  const events = getFilteredDayEvents(day, filter);
  const isToday = day === 11;

  return (
    <button type="button" className={`cgp-mobile-day-cell ${isToday ? 'is-today' : ''} ${events.length ? 'has-events' : ''}`}>
      <span className="cgp-mobile-day-cell-head">
        <strong>{day}</strong>
        {events.length > 0 && <em>{events.length}</em>}
      </span>

      {events.length > 0 && (
        <span className="cgp-mobile-day-events">
          {events.map((event) => (
            <span key={event.id} className="cgp-mobile-day-event">
              <img src={getEventImage(event)} alt="" loading="lazy" draggable={false} />
              <span>
                <strong>{getEventPlace(event)}</strong>
                <em>{event.title}</em>
              </span>
            </span>
          ))}
        </span>
      )}
    </button>
  );
}

function MobileCalendarPreview({ filter, onFilterChange }: {
  filter: CalendarFilter;
  onFilterChange: (filter: CalendarFilter) => void;
}) {
  const filteredEvents = getFilteredEvents(filter);

  return (
    <section className="cgp-mobile-frame cgp-mobile-frame--calendar" aria-label="mobile calendar preview">
      <header className="cgp-mobile-header">
        <button type="button" aria-label="menu">
          <i className="ri-menu-line" />
        </button>
        <strong className="cgp-mobile-title-date">
          <span>2026.05</span>
          <em>캘린더</em>
        </strong>
        <button type="button" aria-label="search">
          <i className="ri-search-line" />
        </button>
      </header>

      <div className="cgp-mobile-mode">
        {['캘린더', '리스트', '지도'].map((item, index) => (
          <button key={item} type="button" className={index === 0 ? 'is-active' : ''}>{item}</button>
        ))}
      </div>

      <CalendarFilterTabs filter={filter} onFilterChange={onFilterChange} compact />

      <section className="cgp-mobile-month-card cgp-mobile-month-card--dense">
        <div className="cgp-mobile-month-title">
          <span>월간 보기</span>
          <strong>{getCalendarFilterLabel(filter)} {filteredEvents.length}개</strong>
        </div>

        <div className="cgp-mobile-month-head">
          {weekDays.map((day) => (
            <span key={day}>{day}</span>
          ))}
        </div>

        <div className="cgp-mobile-month-grid">
          {monthGridDays.map((day, index) => (
            <MobileMonthDay key={day ?? `mobile-empty-${index}`} day={day} filter={filter} />
          ))}
        </div>
      </section>
    </section>
  );
}

function DesktopListPreview() {
  return (
    <section className="cgp-desktop-preview" aria-label="desktop list preview">
      <div className="cgp-calendar-shell">
        <header className="cgp-topbar">
          <div>
            <span>List View</span>
            <strong>일정 리스트</strong>
          </div>
          <div className="cgp-toolbar">
            <div className="cgp-segment">
              <button type="button">캘린더</button>
              <button type="button" className="is-active">리스트</button>
              <button type="button">지도</button>
            </div>
            <button type="button" className="cgp-today-btn">오늘 이후</button>
          </div>
        </header>

        <div className="cgp-list-layout">
          <aside className="cgp-list-filter">
            {['전체 일정', '소셜', '강습', '연습', '워크샵'].map((item, index) => (
              <button key={item} type="button" className={index === 0 ? 'is-active' : ''}>
                {item}
              </button>
            ))}
          </aside>

          <div className="cgp-desktop-list-panel">
            {upcomingEvents.map((event) => (
              <article key={event.id} className="cgp-list-row">
                <div className="cgp-list-date">
                  <strong>{getDateLabel(event).split(' ')[0]}</strong>
                  <span>{getDateLabel(event).split(' ')[1]}</span>
                </div>
                <EventThumbnail event={event} className="cgp-list-thumb" />
                <div className="cgp-list-main">
                  <span>{getEventPlace(event)}</span>
                  <strong>{event.title}</strong>
                  <small>{getCategoryLabel(event)}</small>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function MobileListPreview() {
  return (
    <section className="cgp-mobile-frame cgp-mobile-frame--list" aria-label="mobile list preview">
      <header className="cgp-mobile-header">
        <button type="button" aria-label="menu">
          <i className="ri-menu-line" />
        </button>
        <strong>리스트</strong>
        <button type="button" aria-label="search">
          <i className="ri-search-line" />
        </button>
      </header>

      <div className="cgp-mobile-mode">
        {['캘린더', '리스트', '지도'].map((item, index) => (
          <button key={item} type="button" className={index === 1 ? 'is-active' : ''}>{item}</button>
        ))}
      </div>

      <div className="cgp-mobile-chip-row">
        {['전체', '오늘 이후', '소셜', '강습'].map((item, index) => (
          <button key={item} type="button" className={index === 1 ? 'is-active' : ''}>{item}</button>
        ))}
      </div>

      <div className="cgp-mobile-list">
        {upcomingEvents.slice(0, 5).map((event) => (
          <article key={event.id} className="cgp-mobile-event cgp-mobile-event--list">
            <EventThumbnail event={event} className="cgp-mobile-card-thumb" />
            <div>
              <span>{getEventPlace(event)}</span>
              <strong>{event.title}</strong>
              <em>{getDateLabel(event)} · {getCategoryLabel(event)}</em>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function DesktopMapPreview() {
  const todayEvents = dayEvents[11];

  return (
    <section className="cgp-desktop-preview" aria-label="desktop map preview">
      <div className="cgp-calendar-shell">
        <header className="cgp-topbar">
          <div>
            <span>Map View</span>
            <strong>지도에서 일정 보기</strong>
          </div>
          <div className="cgp-toolbar">
            <div className="cgp-segment">
              <button type="button">캘린더</button>
              <button type="button">리스트</button>
              <button type="button" className="is-active">지도</button>
            </div>
            <button type="button" className="cgp-today-btn">5.11</button>
          </div>
        </header>

        <div className="cgp-map-layout">
          <section className="cgp-map-stage">
            <div className="cgp-map-canvas cgp-map-canvas--large" aria-label="desktop map sample">
              <span className="cgp-map-pin cgp-map-pin--a"><img src={getEventImage(todayEvents[0])} alt="" /></span>
              <span className="cgp-map-pin cgp-map-pin--b"><img src={getEventImage(todayEvents[1])} alt="" /></span>
              <span className="cgp-map-pin cgp-map-pin--c"><img src={getEventImage(todayEvents[2])} alt="" /></span>
              <span className="cgp-map-road cgp-map-road--one" />
              <span className="cgp-map-road cgp-map-road--two" />
            </div>
          </section>

          <aside className="cgp-map-sidebar">
            <div className="cgp-panel-title">
              <div>
                <span>오늘 선택됨</span>
                <strong>5월 11일 일정 3개</strong>
              </div>
            </div>
            <div className="cgp-agenda-list">
              {todayEvents.map((event) => (
                <article key={event.id} className="cgp-agenda-card">
                  <EventThumbnail event={event} className="cgp-agenda-thumb" />
                  <div>
                    <span>{getEventPlace(event)}</span>
                    <strong>{event.title}</strong>
                  </div>
                  <em>{getCategoryLabel(event)}</em>
                </article>
              ))}
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}

function MobileMapPreview() {
  const todayEvents = dayEvents[11];

  return (
    <section className="cgp-mobile-frame cgp-mobile-frame--map" aria-label="mobile map preview">
      <header className="cgp-mobile-header">
        <button type="button" aria-label="menu">
          <i className="ri-menu-line" />
        </button>
        <strong>지도</strong>
        <button type="button" aria-label="search">
          <i className="ri-search-line" />
        </button>
      </header>

      <div className="cgp-mobile-mode">
        {['캘린더', '리스트', '지도'].map((item, index) => (
          <button key={item} type="button" className={index === 2 ? 'is-active' : ''}>{item}</button>
        ))}
      </div>

      <div className="cgp-mobile-date-strip">
        {mobileDates.map((date) => (
          <button key={date} type="button" className={date === 11 ? 'is-active' : ''}>
            <span>{weekDays[(date + 3) % 7]}</span>
            <strong>{date}</strong>
          </button>
        ))}
      </div>

      <section className="cgp-mobile-map-card cgp-mobile-map-card--full">
        <div className="cgp-mobile-map-copy">
          <span>오늘 선택됨</span>
          <strong>5월 11일 일정 3개</strong>
        </div>
        <div className="cgp-mobile-map">
          <span className="cgp-map-pin cgp-map-pin--a"><img src={getEventImage(todayEvents[0])} alt="" /></span>
          <span className="cgp-map-pin cgp-map-pin--b"><img src={getEventImage(todayEvents[1])} alt="" /></span>
          <span className="cgp-map-pin cgp-map-pin--c"><img src={getEventImage(todayEvents[2])} alt="" /></span>
        </div>
      </section>

      <div className="cgp-mobile-map-sheet">
        {todayEvents.map((event) => (
          <article key={event.id} className="cgp-mobile-event cgp-mobile-event--with-thumb">
            <EventThumbnail event={event} className="cgp-mobile-card-thumb" />
            <div>
              <span>{getEventPlace(event)}</span>
              <strong>{event.title}</strong>
              <em>{getDateLabel(event)} · {getCategoryLabel(event)}</em>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export default function CalendarGuidePage() {
  const [mode, setMode] = useState<PreviewMode>(getInitialPreviewMode);
  const [calendarFilter, setCalendarFilter] = useState<CalendarFilter>('all');
  const [theme, setTheme] = useState<ThemeMode>('dark');

  const layoutClass = useMemo(() => {
    if (mode === 'desktop') return 'is-desktop-only';
    if (mode === 'mobile') return 'is-mobile-only';
    return 'is-compare';
  }, [mode]);

  return (
    <main className="calendar-guide-page" data-theme={theme}>
      <section className="cgp-hero">
        <div>
          <span className="cgp-kicker">Calendar UI guide</span>
          <h1>캘린더 개선 샘플</h1>
          <p>운영 `/calendar`에 적용하기 전 확인용 화면입니다. 리스트와 지도 각각을 데스크탑/모바일 프레임으로 나눠 실제 사용 흐름을 비교합니다.</p>
        </div>
        <div className="cgp-hero-controls">
          <ModeSwitch mode={mode} onModeChange={setMode} />
          <ThemeSwitch theme={theme} onThemeChange={setTheme} />
        </div>
      </section>

      <section className="cgp-surface-stack">
        <section className="cgp-surface-block">
          <div className="cgp-surface-head">
            <div>
              <span>Calendar view</span>
              <h2>캘린더 뷰 미리보기</h2>
            </div>
            <p>기존 캘린더 이벤트 필드 기준으로 장소와 제목을 먼저 읽는 방식입니다. 지도 이동은 이 모드에 넣지 않습니다.</p>
          </div>

          <div className={`cgp-preview-grid ${layoutClass}`}>
            <div className="cgp-preview-column cgp-preview-column--desktop">
              <div className="cgp-section-label">
                <strong>Desktop</strong>
                <span>월간표 안에 장소와 제목 직접 표시</span>
              </div>
              <DesktopCalendarPreview filter={calendarFilter} onFilterChange={setCalendarFilter} />
            </div>

            <div className="cgp-preview-column cgp-preview-column--mobile">
              <div className="cgp-section-label">
                <strong>Mobile</strong>
                <span>달력 칸 안에 장소/제목/썸네일 표시</span>
              </div>
              <MobileCalendarPreview filter={calendarFilter} onFilterChange={setCalendarFilter} />
            </div>
          </div>
        </section>

        <section className="cgp-surface-block">
          <div className="cgp-surface-head">
            <div>
              <span>List view</span>
              <h2>리스트 뷰 미리보기</h2>
            </div>
            <p>기존 이벤트 필드의 장소와 제목을 먼저 읽고, 날짜와 분류만 보조 정보로 훑는 화면입니다.</p>
          </div>

          <div className={`cgp-preview-grid ${layoutClass}`}>
            <div className="cgp-preview-column cgp-preview-column--desktop">
              <div className="cgp-section-label">
                <strong>Desktop</strong>
                <span>필터 사이드바 + 장소 우선 일정 행</span>
              </div>
              <DesktopListPreview />
            </div>

            <div className="cgp-preview-column cgp-preview-column--mobile">
              <div className="cgp-section-label">
                <strong>Mobile</strong>
                <span>칩 필터 + 장소/제목 중심 카드</span>
              </div>
              <MobileListPreview />
            </div>
          </div>
        </section>

        <section className="cgp-surface-block">
          <div className="cgp-surface-head">
            <div>
              <span>Map view</span>
              <h2>지도 뷰 미리보기</h2>
            </div>
            <p>지도는 고정된 탐색 영역으로 두고, 선택 날짜의 장소와 일정 제목을 옆이나 아래에 붙입니다.</p>
          </div>

          <div className={`cgp-preview-grid ${layoutClass}`}>
            <div className="cgp-preview-column cgp-preview-column--desktop">
              <div className="cgp-section-label">
                <strong>Desktop</strong>
                <span>큰 지도 + 장소/제목 사이드 리스트</span>
              </div>
              <DesktopMapPreview />
            </div>

            <div className="cgp-preview-column cgp-preview-column--mobile">
              <div className="cgp-section-label">
                <strong>Mobile</strong>
                <span>날짜 스트립 + 지도 + 장소 우선 시트</span>
              </div>
              <MobileMapPreview />
            </div>
          </div>
        </section>
      </section>

      <section className="cgp-principles">
        <div>
          <strong>캘린더 독립</strong>
          <p>캘린더 모드는 이벤트를 날짜 칸 안에서 확인하고, 지도 전환을 기본 동작으로 만들지 않습니다.</p>
        </div>
        <div>
          <strong>지도 독립</strong>
          <p>지도는 선택 날짜와 장소 목록을 함께 보여줘 빈 지도 상태를 만들지 않습니다.</p>
        </div>
        <div>
          <strong>기기별 분리</strong>
          <p>데스크탑은 가로 비교, 모바일은 날짜와 현재 위치 기준으로 내려 읽는 흐름을 사용합니다.</p>
        </div>
      </section>
    </main>
  );
}
