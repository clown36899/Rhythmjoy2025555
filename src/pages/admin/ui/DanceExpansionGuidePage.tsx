import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/cafe24Client';
import { getDanceCollectionScopeExclusionReason, inferDanceTaxonomy } from '../../../utils/danceTaxonomy';
import './DanceExpansionGuidePage.css';

type FamilyKey = 'all' | 'partner' | 'street' | 'art' | 'commercial' | 'unknown';
type GenreFamilyKey = Exclude<FamilyKey, 'all'>;
type ActivityKey = 'all' | 'class' | 'social' | 'event' | 'recruit';

interface FamilyOption {
  key: FamilyKey;
  label: string;
  desc: string;
}

interface ActivityOption {
  key: ActivityKey;
  label: string;
  icon: string;
}

interface GenreOption {
  key: string;
  label: string;
  family: GenreFamilyKey;
}

interface SampleEvent {
  id: number | string;
  title: string;
  family: GenreFamilyKey;
  familyLabel?: string;
  genre: string;
  genreLabel?: string;
  subgenre?: string;
  activity: Exclude<ActivityKey, 'all'>;
  tags: string[];
  date: string;
  time: string;
  venue: string;
  area: string;
  deadline?: string;
  imageTone: 'blue' | 'green' | 'amber' | 'rose' | 'violet' | 'cyan';
  note: string;
  posterUrl?: string | null;
  sourceUrl?: string | null;
  isLive?: boolean;
}

interface ScrapedEventRow {
  id: string;
  keyword?: string | null;
  source_url?: string | null;
  poster_url?: string | null;
  structured_data?: {
    date?: string | null;
    day?: string | null;
    title?: string | null;
    event_type?: string | null;
    activity_type?: ActivityKey | null;
    activity_label?: string | null;
    genre_family?: FamilyKey | null;
    genre_family_label?: string | null;
    dance_genre?: string | null;
    dance_genre_label?: string | null;
    tags?: string[] | null;
    tag_labels?: string[] | null;
    times?: string[] | null;
    location?: string | null;
    address?: string | null;
    fee?: string | null;
    note?: string | null;
  } | null;
}

interface CalendarEventRow {
  id: number | string;
  title?: string | null;
  date?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  time?: string | null;
  location?: string | null;
  venue_name?: string | null;
  address?: string | null;
  category?: string | null;
  genre?: string | null;
  description?: string | null;
  image?: string | null;
  image_thumbnail?: string | null;
  image_medium?: string | null;
  image_full?: string | null;
  dance_scope?: string | null;
  dance_genre?: string | null;
  activity_type?: ActivityKey | null;
  dance_tags?: string[] | null;
}

const familyOptions: FamilyOption[] = [
  { key: 'all', label: '전체 계열', desc: '모든 장르' },
  { key: 'partner', label: '커플·파트너', desc: '스윙, 살사, 탱고, 바차타' },
  { key: 'street', label: '스트릿', desc: '힙합, 왁킹, 팝핑' },
  { key: 'unknown', label: '장르 미정', desc: '분류 검토 필요' },
];

const activityOptions: ActivityOption[] = [
  { key: 'all', label: '전체', icon: 'ri-apps-2-line' },
  { key: 'class', label: '강습', icon: 'ri-graduation-cap-line' },
  { key: 'social', label: '소셜', icon: 'ri-music-2-line' },
  { key: 'event', label: '행사', icon: 'ri-calendar-event-line' },
  { key: 'recruit', label: '모집', icon: 'ri-user-search-line' },
];

const genreOptions: GenreOption[] = [
  { key: 'swing', label: '스윙', family: 'partner' },
  { key: 'lindyhop', label: '린디합', family: 'partner' },
  { key: 'jitterbug', label: '지터벅', family: 'partner' },
  { key: 'balboa', label: '발보아', family: 'partner' },
  { key: 'blues', label: '블루스', family: 'partner' },
  { key: 'solojazz', label: '솔로재즈', family: 'partner' },
  { key: 'salsa', label: '살사', family: 'partner' },
  { key: 'bachata', label: '바차타', family: 'partner' },
  { key: 'tango', label: '탱고', family: 'partner' },
  { key: 'wcs', label: 'WCS', family: 'partner' },
  { key: 'hiphop', label: '힙합', family: 'street' },
  { key: 'waacking', label: '왁킹', family: 'street' },
  { key: 'popping', label: '팝핑', family: 'street' },
  { key: 'locking', label: '락킹', family: 'street' },
  { key: 'house', label: '하우스', family: 'street' },
  { key: 'breaking', label: '브레이킹', family: 'street' },
  { key: 'krump', label: '크럼프', family: 'street' },
];

const tagLabels: Record<string, string> = {
  audition: '오디션',
  team_recruit: '팀원모집',
  crew_recruit: '크루모집',
  participant: '참가자모집',
  choreo: '코레오',
  technique: '테크닉',
  basic: '베이직',
  partnering: '파트너링',
  freestyle: '프리스타일',
  workshop: '워크샵',
  party: '파티',
  battle: '배틀',
  dj: 'DJ',
  performance: '공연',
  open_class: '오픈클래스',
  cover: '커버',
};

const familyLabelMap = Object.fromEntries(familyOptions.map((family) => [family.key, family.label]));

const sampleEvents: SampleEvent[] = [
  {
    id: 1,
    title: '금요 린디합 소셜 with DJ Hazel',
    family: 'partner',
    genre: 'swing',
    subgenre: '린디합',
    activity: 'social',
    tags: ['dj', 'party'],
    date: '5.22 금',
    time: '20:00',
    venue: '스윙타임바',
    area: '홍대',
    imageTone: 'green',
    note: '소셜이 핵심인 장르는 별도 탭에서 바로 확인',
  },
  {
    id: 2,
    title: '솔로재즈 코레오 4주 입문반',
    family: 'partner',
    genre: 'swing',
    subgenre: '솔로재즈',
    activity: 'class',
    tags: ['choreo', 'basic'],
    date: '5.26 화',
    time: '19:30',
    venue: '봉천살롱',
    area: '봉천',
    imageTone: 'blue',
    note: '코레오는 장르가 아니라 강습 주제로 태그 처리',
  },
  {
    id: 3,
    title: '바차타 센슈얼 파트너링 특강',
    family: 'partner',
    genre: 'bachata',
    subgenre: '센슈얼',
    activity: 'class',
    tags: ['partnering', 'workshop'],
    date: '5.30 토',
    time: '16:00',
    venue: '라틴스팟',
    area: '강남',
    imageTone: 'amber',
    note: '파트너댄스 안에서도 소장르와 수업 주제 분리',
  },
  {
    id: 4,
    title: '왁킹 퍼포먼스팀 오디션',
    family: 'street',
    genre: 'waacking',
    activity: 'recruit',
    tags: ['audition', 'team_recruit', 'choreo'],
    date: '6.01 월',
    time: '18:00',
    venue: '무브먼트 스튜디오',
    area: '신촌',
    deadline: 'D-5',
    imageTone: 'rose',
    note: '모집 탭에서 마감 상태와 모집 태그를 강조',
  },
  {
    id: 5,
    title: '힙합 프리스타일 세션 & 미니 배틀',
    family: 'street',
    genre: 'hiphop',
    activity: 'event',
    tags: ['freestyle', 'battle'],
    date: '6.06 토',
    time: '17:00',
    venue: '언더그라운드 홀',
    area: '성수',
    imageTone: 'violet',
    note: '배틀은 메인 탭이 아니라 행사 안의 태그',
  },
  {
    id: 6,
    title: '팝핑 애니메이션 테크닉 워크샵',
    family: 'street',
    genre: 'popping',
    subgenre: '애니메이션',
    activity: 'class',
    tags: ['technique', 'workshop'],
    date: '6.07 일',
    time: '14:00',
    venue: '오브젝트 댄스랩',
    area: '합정',
    imageTone: 'cyan',
    note: '워크샵은 강습/행사 맥락에 따라 태그로 보조',
  },
  {
    id: 7,
    title: '탱고 프랙티카 & 밀롱가 나이트',
    family: 'partner',
    genre: 'tango',
    activity: 'social',
    tags: ['party', 'partnering'],
    date: '6.12 금',
    time: '21:00',
    venue: '아브라소 탱고',
    area: '이태원',
    imageTone: 'green',
    note: '소셜 문화가 있는 파트너댄스도 같은 구조로 수용',
  },
  {
    id: 8,
    title: '락킹 크루 정기 멤버 모집',
    family: 'street',
    genre: 'locking',
    activity: 'recruit',
    tags: ['crew_recruit', 'freestyle'],
    date: '상시',
    time: '마감 전',
    venue: '락스텝 크루룸',
    area: '건대',
    deadline: '상시',
    imageTone: 'rose',
    note: '상시 모집도 일정형 카드와 구분 가능',
  },
  {
    id: 9,
    title: '살사 온투 소셜 나이트',
    family: 'partner',
    genre: 'salsa',
    subgenre: 'On2',
    activity: 'social',
    tags: ['party', 'dj'],
    date: '6.14 일',
    time: '20:30',
    venue: '라틴스팟',
    area: '강남',
    imageTone: 'amber',
    note: '확장 파트너 장르는 살사·탱고·바차타까지만 노출',
  },
  {
    id: 10,
    title: '올스타일 배틀 참가자 모집',
    family: 'street',
    genre: 'hiphop',
    activity: 'recruit',
    tags: ['participant', 'battle'],
    date: '6.21 일',
    time: '접수 중',
    venue: '언더그라운드 홀',
    area: '성수',
    deadline: 'D-10',
    imageTone: 'amber',
    note: '참가자 모집은 행사 태그가 아니라 모집 분류로 분리',
  },
];

const genreLabelMap = Object.fromEntries(genreOptions.map((genre) => [genre.key, genre.label]));
const activityLabelMap = Object.fromEntries(activityOptions.map((activity) => [activity.key, activity.label]));
const tagPriority = Object.keys(tagLabels);

function getTagLabel(tag?: string | null) {
  if (!tag) return '기타';
  return tagLabels[tag] || tag.replaceAll('_', ' ');
}

function normalizeFamily(value: string | null | undefined): GenreFamilyKey {
  if (value === 'partner' || value === 'street' || value === 'art' || value === 'commercial') return value;
  return 'unknown';
}

function isEventWithinCollectionScope(event: SampleEvent) {
  return !getDanceCollectionScopeExclusionReason({
    genre_family: event.family,
    dance_genre: event.genre,
    genre_family_label: event.familyLabel,
    dance_genre_label: event.genreLabel,
  });
}

function normalizePosterUrl(url: string | null | undefined) {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('/storage/v1/object/public/')) {
    return url.replace(/^\/storage\/v1\/object\/public\//, '/uploads/');
  }
  return url;
}

function formatDateLabel(date: string | null | undefined, day?: string | null) {
  if (!date) return '날짜 미정';
  const [, , month, dateOfMonth] = date.match(/^(\d{4})-(\d{2})-(\d{2})$/) || [];
  const compactDate = month && dateOfMonth ? `${Number(month)}.${Number(dateOfMonth)}` : date;
  return day ? `${compactDate} ${day}` : compactDate;
}

function getTone(seed: string, family: GenreFamilyKey): SampleEvent['imageTone'] {
  if (family === 'partner') return 'green';
  if (family === 'street') return 'violet';
  if (family === 'art') return 'cyan';
  if (family === 'commercial') return 'rose';
  const tones: SampleEvent['imageTone'][] = ['blue', 'green', 'amber', 'rose', 'violet', 'cyan'];
  return tones[Math.abs([...seed].reduce((sum, char) => sum + char.charCodeAt(0), 0)) % tones.length];
}

function mapScrapedEvent(row: ScrapedEventRow): SampleEvent {
  const sd = row.structured_data || {};
  const inferred = inferDanceTaxonomy({
    keyword: row.keyword,
    source_url: row.source_url,
    structured_data: sd,
  });
  const activity = sd.activity_type && sd.activity_type !== 'all' ? sd.activity_type : inferred.activity_type;
  const family = normalizeFamily(sd.genre_family || inferred.genre_family);
  const genre = sd.dance_genre || inferred.dance_genre || 'unknown';
  const tags = Array.isArray(sd.tags) && sd.tags.length > 0 ? sd.tags.filter(Boolean) : inferred.tags;
  const times = Array.isArray(sd.times) ? sd.times.filter(Boolean) : [];
  const sourceKeyword = row.keyword ? `수집 키워드: ${row.keyword}` : '실제 수집 데이터';

  return {
    id: row.id,
    title: sd.title || '제목 미정',
    family,
    familyLabel: sd.genre_family_label || familyLabelMap[family] || family,
    genre,
    genreLabel: sd.dance_genre_label || inferred.dance_genre_label || genreLabelMap[genre] || genre,
    activity,
    tags,
    date: formatDateLabel(sd.date, sd.day),
    time: times[0] || '시간 미정',
    venue: sd.location || '장소 미정',
    area: sd.address || sd.fee || '지역 미정',
    imageTone: getTone(row.id, family),
    note: sd.note || sourceKeyword,
    posterUrl: normalizePosterUrl(row.poster_url),
    sourceUrl: row.source_url || null,
    isLive: true,
  };
}

function mapCalendarEvent(row: CalendarEventRow): SampleEvent {
  const inferred = inferDanceTaxonomy({
    extracted_text: [
      row.title,
      row.genre,
      row.category,
      row.location,
      row.venue_name,
      row.description,
    ].filter(Boolean).join(' '),
    structured_data: {
      title: row.title,
      dance_scope: row.dance_scope as any,
      dance_genre: row.dance_genre,
      activity_type: row.activity_type as any,
      tags: Array.isArray(row.dance_tags) ? row.dance_tags : null,
      location: row.location || row.venue_name,
      note: row.description,
    },
  });
  const family = normalizeFamily(inferred.genre_family);
  const activity = row.activity_type && row.activity_type !== 'all' ? row.activity_type : inferred.activity_type;
  const genre = row.dance_genre || inferred.dance_genre || 'unknown';
  const date = row.start_date || row.date || '';
  const tags = Array.isArray(row.dance_tags) && row.dance_tags.length > 0 ? row.dance_tags : inferred.tags;

  return {
    id: row.id,
    title: row.title || '제목 미정',
    family,
    familyLabel: familyLabelMap[family] || family,
    genre,
    genreLabel: inferred.dance_genre_label || genreLabelMap[genre] || genre,
    activity,
    tags,
    date: formatDateLabel(date),
    time: row.time || '시간 미정',
    venue: row.venue_name || row.location || '장소 미정',
    area: row.address || row.location || '지역 미정',
    imageTone: getTone(String(row.id), family),
    note: row.description || '로컬 이벤트 DB 데이터',
    posterUrl: normalizePosterUrl(row.image_thumbnail || row.image_medium || row.image_full || row.image),
    sourceUrl: null,
    isLive: true,
  };
}

function getEventGenreLabel(event: SampleEvent) {
  return event.genreLabel || genreLabelMap[event.genre] || event.genre;
}

function SamplePoster({ event }: { event: SampleEvent }) {
  const initials = getEventGenreLabel(event).slice(0, 2) || event.genre.slice(0, 2);
  const posterLabel = event.subgenre || (event.tags[0] ? getTagLabel(event.tags[0]) : 'DANCE');

  return (
    <div className={`deg-poster deg-poster--${event.imageTone}`} aria-hidden="true">
      {event.posterUrl && <img src={event.posterUrl} alt="" loading="lazy" />}
      <span>{activityLabelMap[event.activity]}</span>
      <strong>{initials}</strong>
      <em>{posterLabel}</em>
    </div>
  );
}

function EventCard({ event }: { event: SampleEvent }) {
  return (
    <article className={`deg-event-card deg-event-card--${event.activity}`}>
      <SamplePoster event={event} />
      <div className="deg-card-body">
        <div className="deg-card-tags">
          <span className={`deg-type-pill deg-type-pill--${event.activity}`}>
            {activityLabelMap[event.activity]}
          </span>
          <span>{getEventGenreLabel(event)}</span>
          {event.deadline && <strong>{event.deadline}</strong>}
          {event.isLive && <b>LIVE</b>}
        </div>
        <h3>{event.title}</h3>
        <p>{event.date} · {event.time}</p>
        <p>{event.venue} · {event.area}</p>
        <div className="deg-detail-tags">
          {event.tags.slice(0, 3).map((item) => (
            <span key={item}>{getTagLabel(item)}</span>
          ))}
        </div>
      </div>
    </article>
  );
}

export default function DanceExpansionGuidePage() {
  const [family, setFamily] = useState<FamilyKey>('all');
  const [activity, setActivity] = useState<ActivityKey>('all');
  const [genre, setGenre] = useState('all');
  const [tag, setTag] = useState('all');
  const [isGenrePanelOpen, setIsGenrePanelOpen] = useState(false);
  const [liveEvents, setLiveEvents] = useState<SampleEvent[]>([]);
  const [isLoadingLiveEvents, setIsLoadingLiveEvents] = useState(true);
  const [liveError, setLiveError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    const fetchLiveEvents = async () => {
      try {
        setIsLoadingLiveEvents(true);
        const { data: eventRows, error: eventError } = await supabase
          .from('events' as any)
          .select('id,title,date,start_date,end_date,time,location,venue_name,address,category,genre,description,image,image_thumbnail,image_medium,image_full,dance_scope,dance_genre,activity_type,dance_tags')
          .not('dance_scope', 'is', null)
          .order('start_date', { ascending: true })
          .limit(160);

        if (eventError) throw eventError;
        if (Array.isArray(eventRows) && eventRows.length > 0) {
          if (!ignore) {
            setLiveEvents(eventRows.map((row) => mapCalendarEvent(row as CalendarEventRow)).filter(isEventWithinCollectionScope));
            setLiveError(null);
          }
          return;
        }

        const res = await fetch('/api/scraped-events?page=1&tab=new');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const rows: ScrapedEventRow[] = Array.isArray(json.data) ? json.data : [];
        if (!ignore) {
          setLiveEvents(rows.map(mapScrapedEvent).filter(isEventWithinCollectionScope));
          setLiveError(null);
        }
      } catch (err: any) {
        if (!ignore) {
          setLiveEvents([]);
          setLiveError(err?.message || '수집 데이터를 불러오지 못했습니다.');
        }
      } finally {
        if (!ignore) setIsLoadingLiveEvents(false);
      }
    };

    fetchLiveEvents();
    return () => { ignore = true; };
  }, []);

  const events = liveEvents.length > 0 ? liveEvents : sampleEvents;
  const isLiveMode = liveEvents.length > 0;

  const familyCounts = useMemo(() => {
    const counts = new Map<FamilyKey, number>();
    events.forEach((event) => counts.set(event.family, (counts.get(event.family) || 0) + 1));
    return counts;
  }, [events]);

  const dataGenreOptions = useMemo(() => {
    if (!isLiveMode) return genreOptions;
    const map = new Map<string, GenreOption>();
    events.forEach((event) => {
      if (!map.has(event.genre)) {
        map.set(event.genre, {
          key: event.genre,
          label: getEventGenreLabel(event),
          family: event.family,
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => {
      const familyOrder = ['partner', 'street', 'unknown'];
      const familyDiff = familyOrder.indexOf(a.family) - familyOrder.indexOf(b.family);
      return familyDiff || a.label.localeCompare(b.label, 'ko');
    });
  }, [events, isLiveMode]);

  const selectableFamilies = useMemo(
    () => familyOptions.filter((option): option is FamilyOption & { key: GenreFamilyKey } => (
      option.key !== 'all' && (!isLiveMode || familyCounts.has(option.key))
    )),
    [familyCounts, isLiveMode],
  );

  const familyPickerOptions = useMemo(
    () => familyOptions.filter((option) => option.key === 'all' || !isLiveMode || familyCounts.has(option.key)),
    [familyCounts, isLiveMode],
  );

  const visibleGenres = useMemo(() => {
    if (family === 'all') return dataGenreOptions;
    return dataGenreOptions.filter((option) => option.family === family);
  }, [dataGenreOptions, family]);

  const genreGroups = useMemo(() => (
    selectableFamilies
      .filter((option) => family === 'all' || option.key === family)
      .map((option) => ({
        ...option,
        genres: dataGenreOptions.filter((item) => item.family === option.key),
      }))
      .filter((group) => group.genres.length > 0)
  ), [dataGenreOptions, family, selectableFamilies]);

  const visibleTags = useMemo(() => {
    const tagCounts = new Map<string, number>();
    events.forEach((event) => {
      if (family !== 'all' && event.family !== family) return;
      if (activity !== 'all' && event.activity !== activity) return;
      if (genre !== 'all' && event.genre !== genre) return;
      event.tags.forEach((item) => tagCounts.set(item, (tagCounts.get(item) || 0) + 1));
    });
    return Array.from(tagCounts.entries())
      .map(([key, count]) => ({ key, label: getTagLabel(key), count }))
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        const aIndex = tagPriority.indexOf(a.key);
        const bIndex = tagPriority.indexOf(b.key);
        if (aIndex !== -1 || bIndex !== -1) {
          return (aIndex === -1 ? Number.MAX_SAFE_INTEGER : aIndex) - (bIndex === -1 ? Number.MAX_SAFE_INTEGER : bIndex);
        }
        return a.label.localeCompare(b.label, 'ko');
      });
  }, [activity, events, family, genre]);

  const filteredEvents = useMemo(() => events.filter((event) => {
    if (family !== 'all' && event.family !== family) return false;
    if (activity !== 'all' && event.activity !== activity) return false;
    if (genre !== 'all' && event.genre !== genre) return false;
    if (tag !== 'all' && !event.tags.includes(tag)) return false;
    return true;
  }), [activity, events, family, genre, tag]);

  useEffect(() => {
    if (family !== 'all' && !familyCounts.has(family)) {
      setFamily('all');
      setGenre('all');
      setTag('all');
    }
  }, [family, familyCounts]);

  useEffect(() => {
    if (genre !== 'all' && !dataGenreOptions.some((option) => option.key === genre)) {
      setGenre('all');
      setTag('all');
    }
  }, [dataGenreOptions, genre]);

  const selectedGenre = dataGenreOptions.find((option) => option.key === genre);
  const selectedFamily = familyOptions.find((option) => option.key === family);
  const selectedGenreLabel = selectedGenre?.label || '전체 장르';
  const selectedFamilyLabel = selectedFamily?.label || '전체 계열';
  const showTagRow = visibleTags.length > 0 && (activity !== 'all' || family !== 'all' || genre !== 'all');

  const handleFamilyChange = (nextFamily: FamilyKey) => {
    setFamily(nextFamily);
    setGenre('all');
    setTag('all');
  };

  const handleActivityChange = (nextActivity: ActivityKey) => {
    setActivity(nextActivity);
    setTag('all');
  };

  const handleGenreChange = (nextGenre: string) => {
    setGenre(nextGenre);
    setTag('all');
  };

  const resetFilters = () => {
    setFamily('all');
    setActivity('all');
    setGenre('all');
    setTag('all');
  };

  return (
    <main className="dance-expansion-guide-page">
      <section className="deg-shell">
        {(isLoadingLiveEvents || liveError) && (
          <div className="deg-live-status" aria-live="polite">
            {isLoadingLiveEvents && <em>불러오는 중</em>}
            {liveError && <em>일부 데이터를 불러오지 못했습니다.</em>}
          </div>
        )}

        <section className="deg-preview-layout">
          <div className="deg-main-panel">
            <div className={`deg-filter-panel ${isGenrePanelOpen ? 'is-genre-open' : ''}`}>
              <div className="deg-filter-head">
                <div className="deg-activity-tabs" aria-label="활동 유형">
                  {activityOptions.map((option) => (
                    <button
                      key={option.key}
                      className={activity === option.key ? 'is-active' : ''}
                      onClick={() => handleActivityChange(option.key)}
                    >
                      <i className={option.icon} />
                      {option.label}
                    </button>
                  ))}
                </div>

                <button
                  className={`deg-genre-trigger ${isGenrePanelOpen ? 'is-open' : ''}`}
                  onClick={() => setIsGenrePanelOpen((prev) => !prev)}
                  aria-expanded={isGenrePanelOpen}
                >
                  <span>장르</span>
                  <strong>{selectedGenreLabel}</strong>
                  <em>{selectedFamilyLabel} · {visibleGenres.length}개</em>
                  <i className="ri-arrow-down-s-line" aria-hidden="true" />
                </button>
              </div>

              {isGenrePanelOpen && (
                <div className="deg-genre-picker">
                  <div className="deg-family-inline" aria-label="장르 계열">
                    {familyPickerOptions.map((option) => (
                      <button
                        key={option.key}
                        className={family === option.key ? 'is-active' : ''}
                        onClick={() => handleFamilyChange(option.key)}
                        disabled={option.key !== 'all' && isLiveMode && !familyCounts.has(option.key)}
                      >
                        <strong>{option.label}</strong>
                        <span>{option.key === 'all' ? option.desc : `${option.desc} · ${familyCounts.get(option.key as FamilyKey) || 0}건`}</span>
                      </button>
                    ))}
                  </div>

                  <div className="deg-genre-groups">
                    <button
                      className={`deg-all-genre ${genre === 'all' ? 'is-active' : ''}`}
                      onClick={() => handleGenreChange('all')}
                    >
                      <strong>전체 장르</strong>
                      <span>현재 계열 안의 모든 장르 보기</span>
                    </button>

                    {genreGroups.map((group) => (
                      <section key={group.key} className="deg-genre-group">
                        <div className="deg-genre-group-title">
                          <strong>{group.label}</strong>
                          <span>{group.desc}</span>
                        </div>
                        <div className="deg-genre-list">
                          {group.genres.map((option) => (
                            <button
                              key={option.key}
                              className={genre === option.key ? 'is-active' : ''}
                              onClick={() => handleGenreChange(option.key)}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                </div>
              )}

              {(family !== 'all' || genre !== 'all' || tag !== 'all') && (
                <div className="deg-active-filters" aria-label="적용된 필터">
                  {family !== 'all' && <span>{selectedFamilyLabel}</span>}
                  {genre !== 'all' && <span>{selectedGenreLabel}</span>}
                  {tag !== 'all' && <span>{getTagLabel(tag)}</span>}
                  <button onClick={resetFilters}>초기화</button>
                </div>
              )}

              {showTagRow && (
                <div className="deg-chip-row deg-chip-row--tags" aria-label="세부 태그 필터">
                  <span className="deg-chip-label">세부 태그</span>
                  <button className={tag === 'all' ? 'is-active' : ''} onClick={() => setTag('all')}>전체</button>
                  {visibleTags.map((item) => (
                    <button
                      key={item.key}
                      className={tag === item.key ? 'is-active' : ''}
                      onClick={() => setTag(item.key)}
                    >
                      <span>{item.label}</span>
                      <em>{item.count}</em>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="deg-card-grid">
              {filteredEvents.map((eventItem) => (
                <EventCard key={eventItem.id} event={eventItem} />
              ))}
            </div>
          </div>

          <aside className="deg-side-panel">
            <div className="deg-mobile-preview" aria-label="빠른 후보 보기">
              <div className="deg-mobile-top">
                <span>댄스빌보드</span>
                <strong>{activityLabelMap[activity]}</strong>
              </div>
              <div className="deg-mobile-filter-pill">
                <span>{selectedGenreLabel}</span>
                <strong>{selectedFamilyLabel}</strong>
              </div>
              <div className="deg-mobile-tabs">
                {activityOptions.slice(1).map((option) => (
                  <span key={option.key} className={activity === option.key ? 'is-active' : ''}>{option.label}</span>
                ))}
              </div>
              <div className="deg-mobile-list">
                {filteredEvents.slice(0, 3).map((eventItem) => (
                  <EventCard key={`mobile-${eventItem.id}`} event={eventItem} />
                ))}
              </div>
            </div>
          </aside>
        </section>
      </section>
    </main>
  );
}
