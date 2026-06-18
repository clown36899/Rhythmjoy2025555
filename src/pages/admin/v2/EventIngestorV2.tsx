import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import ImageCropModal from '../../../components/ImageCropModal';
import EventEditModal from './components/EventEditModal';
import { useAuth } from '../../../contexts/AuthContext';
import { cafe24 as prodClient } from '../../../lib/cafe24Client';
import { fetchCafe24Events } from '../../../lib/cafe24EventsApi';
import {
  detectIngestorActivity,
  getIngestorActivityLabel,
  getIngestorGenreMeta,
  getIngestorTagLabel,
  getIngestorTags,
  mapIngestorEvent,
  titleLooksDuplicate,
  toMapSafeVenueName,
  type MappedIngestorEvent,
  type VenueRecord,
} from './utils/ingestorMapping';
const VenueSelectModal = React.lazy(() => import('../../v2/components/VenueSelectModal'));
import './EventIngestorV2.css';

interface ScrapedEvent {
  id: string;
  keyword?: string;
  source_url: string;
  poster_url?: string | null;
  extracted_text: string;
  structured_data: {
    date: string;
    day?: string;
    title: string;
    status: string;
    djs?: string[];
    times?: string[];
    location?: string;
    address?: string;
    venue_id?: string | number | null;
    venue_name?: string | null;
    location_link?: string | null;
    fee?: string;
    note?: string;
    event_type?: '소셜' | '파티/행사' | '강습' | null;
    activity_type?: 'class' | 'social' | 'event' | 'recruit' | null;
    activity_label?: string;
    dance_scope?: 'swing' | 'salsa' | 'bachata' | 'tango' | 'street' | 'unknown' | null;
    dance_scope_label?: string;
    genre_family?: 'partner' | 'street' | 'art' | 'commercial' | 'unknown' | null;
    genre_family_label?: string;
    dance_genre?: string | null;
    dance_genre_label?: string;
    tags?: string[];
    tag_labels?: string[];
    _duplicate?: {
      reason?: string;
      existingId?: string;
      existingTitle?: string;
      existingDate?: string;
      existingSourceUrl?: string;
      target?: 'scraped_events' | 'events';
      detected_at?: string;
    };
  };
  is_collected?: boolean;
  status?: 'ignored' | 'collected' | 'pending' | 'duplicate';
  display_no?: number | null;
  created_at?: string;
  updated_at?: string;
}

type TabKey = 'new' | 'collected' | 'duplicate';
type ScopeFilter = 'all' | 'swing' | 'salsa' | 'bachata' | 'tango' | 'street';
type CalendarLayoutMode = 'compact' | 'expanded' | 'horizontal';
type CalendarItemKind = TabKey | 'db';
type IngestorViewMode = 'list' | 'calendar';

interface OperationalEvent {
  id: string | number;
  title?: string | null;
  date?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  event_dates?: string[] | null;
  time?: string | null;
  location?: string | null;
  venue_name?: string | null;
  organizer?: string | null;
  link1?: string | null;
  image?: string | null;
  image_micro?: string | null;
  image_thumbnail?: string | null;
  image_medium?: string | null;
  image_full?: string | null;
}

interface TangoSceneEvent {
  id: string;
  title: string;
  date?: string;
  startKst?: string;
  endKst?: string;
  venue?: string;
  djName?: string;
  entranceFee?: string;
  sourceUrl?: string;
}

interface TangoSceneMap {
  generatedAt: string;
  generatedFor: string;
  counts: {
    today: number;
    week: number;
    month: number;
  };
  health?: {
    calendarOk: boolean;
    failedRanges?: Array<{ label: string; error: string }>;
  };
  candidateWrite?: {
    saved: number;
    imageBacked: number;
    skippedNoPoster: number;
    total: number;
    reason?: string;
  };
  todayEvents: TangoSceneEvent[];
  weekEvents: TangoSceneEvent[];
  venueCandidates: Array<{
    name: string;
    count: number;
    firstSeen?: string;
    lastSeen?: string;
    mapStatus?: string;
    topTitles?: Array<{ name: string; count: number }>;
  }>;
  monthTopTitles: Array<{ name: string; count: number }>;
  sources: Array<{
    id: string;
    name: string;
    url: string;
    role: string;
    policy: string;
    note?: string;
  }>;
  knownMajorEvents: Array<{
    name: string;
    date: string;
    venue: string;
    sourceUrl: string;
    role: string;
  }>;
}

const SCOPE_FILTER_OPTIONS: Array<{ key: ScopeFilter; label: string; description: string }> = [
  { key: 'all', label: '전체 장르', description: '수집 후보 전체' },
  { key: 'swing', label: '스윙', description: '안정 자동 수집' },
  { key: 'tango', label: '탱고', description: '씬맵 + 후보' },
  { key: 'salsa', label: '살사', description: '확장 조사' },
  { key: 'bachata', label: '바차타', description: '확장 조사' },
  { key: 'street', label: '스트릿', description: '확장 조사' },
];

interface CalendarCandidateItem {
  id: string;
  eventId: string;
  tab: CalendarItemKind;
  source: 'candidate' | 'db';
  date: string;
  title: string;
  keyword?: string;
  location?: string;
  time?: string;
  sourceUrl?: string;
  imageUrl?: string;
}

const CALENDAR_PAGE_SIZE = 500;
const CALENDAR_HIDDEN_STORAGE_KEY = 'event-ingestor-v2-calendar-hidden-v1';
const OPERATIONAL_ASSET_ORIGIN = 'https://swingenjoy.com';
const CALENDAR_TAB_LABELS: Record<CalendarItemKind, string> = {
  new: '신규',
  collected: '완료',
  duplicate: '중복',
  db: '운영DB',
};
const CALENDAR_CANDIDATE_TABS: TabKey[] = ['new', 'collected'];
const CALENDAR_FILTER_TABS: CalendarItemKind[] = ['new', 'collected', 'db'];
const CALENDAR_LAYOUT_LABELS: Record<CalendarLayoutMode, string> = {
  compact: '압축',
  expanded: '펼침',
  horizontal: '가로형',
};
const CALENDAR_WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

const isCalendarDateKey = (value?: string | null): value is string => (
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
);

const toCalendarDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getCalendarMonthDays = (monthDate: Date) => {
  const first = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const last = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
  const cursor = new Date(first);
  cursor.setDate(first.getDate() - first.getDay());

  const end = new Date(last);
  end.setDate(last.getDate() + (6 - last.getDay()));

  const days: Date[] = [];
  while (cursor <= end) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
};

const getCalendarCandidateId = (id: string | number) => `candidate:${id}`;

const resolveProductionAssetUrl = (value?: string | null) => {
  const url = String(value || '').trim();
  if (!url) return '';
  if (/^https?:\/\//i.test(url) || url.startsWith('data:image')) return url;
  if (url.startsWith('/uploads/')) return `${OPERATIONAL_ASSET_ORIGIN}${url}`;
  return url;
};

const getOperationalImageUrl = (event: OperationalEvent) => resolveProductionAssetUrl(
  event.image_thumbnail || event.image_medium || event.image || event.image_full || event.image_micro
);

const normalizeCalendarUrlKey = (value?: string | null) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw, OPERATIONAL_ASSET_ORIGIN);
    url.hash = '';
    url.search = '';
    return `${url.hostname.toLowerCase()}${url.pathname.replace(/\/+$/, '').toLowerCase()}`;
  } catch {
    return raw.split('#')[0].split('?')[0].replace(/\/+$/, '').toLowerCase();
  }
};

const normalizeCalendarTextKey = (value?: string | null) => (
  String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/dj\s*/gi, '')
    .replace(/[^\w가-힣]+/g, '')
);

const addCalendarDuplicateKeys = (keys: Set<string>, item: Pick<CalendarCandidateItem, 'date' | 'sourceUrl' | 'imageUrl' | 'title' | 'location'>) => {
  const sourceKey = normalizeCalendarUrlKey(item.sourceUrl);
  if (sourceKey) keys.add(`${item.date}|source|${sourceKey}`);

  const imageKey = normalizeCalendarUrlKey(item.imageUrl);
  if (imageKey) keys.add(`${item.date}|image|${imageKey}`);

  const titleKey = normalizeCalendarTextKey(item.title);
  const locationKey = normalizeCalendarTextKey(item.location);
  if (titleKey.length >= 4 && locationKey.length >= 2) {
    keys.add(`${item.date}|title-location|${titleKey}|${locationKey}`);
  }
};

const isCalendarDuplicateOfCandidate = (keys: Set<string>, item: Pick<CalendarCandidateItem, 'date' | 'sourceUrl' | 'imageUrl' | 'title' | 'location'>) => {
  const checks: string[] = [];
  const sourceKey = normalizeCalendarUrlKey(item.sourceUrl);
  if (sourceKey) checks.push(`${item.date}|source|${sourceKey}`);

  const imageKey = normalizeCalendarUrlKey(item.imageUrl);
  if (imageKey) checks.push(`${item.date}|image|${imageKey}`);

  const titleKey = normalizeCalendarTextKey(item.title);
  const locationKey = normalizeCalendarTextKey(item.location);
  if (titleKey.length >= 4 && locationKey.length >= 2) {
    checks.push(`${item.date}|title-location|${titleKey}|${locationKey}`);
  }

  return checks.some(key => keys.has(key));
};

const getCalendarDateLabel = (dateKey: string) => {
  if (!isCalendarDateKey(dateKey)) return dateKey;
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const weekday = CALENDAR_WEEKDAY_LABELS[date.getDay()] || '';
  return `${year}년 ${month}월 ${day}일 (${weekday})`;
};

const isLocalIngestorBypass = () => (
  typeof window !== 'undefined'
  && ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)
);

const EventIngestorV2: React.FC = () => {
  const { isAdmin, isAuthCheckComplete } = useAuth();
  const [scrapedEvents, setScrapedEvents] = useState<ScrapedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('new');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkProgress, setBulkProgress] = useState<string | null>(null);
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>('all');
  const [activityFilter, setActivityFilter] = useState<'전체' | '강습' | '소셜' | '행사' | '모집'>('전체');
  const [familyFilter, setFamilyFilter] = useState<'all' | 'partner' | 'street' | 'art' | 'commercial' | 'unknown'>('all');
  const [tagFilter, setTagFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [tabCounts, setTabCounts] = useState<{ new: number; collected: number; duplicate: number }>({ new: 0, collected: 0, duplicate: 0 });
  const [venues, setVenues] = useState<VenueRecord[]>([]);
  const [tangoSceneMap, setTangoSceneMap] = useState<TangoSceneMap | null>(null);
  const [tangoSceneLoading, setTangoSceneLoading] = useState(false);
  const [tangoSceneError, setTangoSceneError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<IngestorViewMode>('list');
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const [calendarEventsByTab, setCalendarEventsByTab] = useState<Record<TabKey, ScrapedEvent[]>>({
    new: [],
    collected: [],
    duplicate: [],
  });
  const [operationalCalendarEvents, setOperationalCalendarEvents] = useState<OperationalEvent[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [operationalLoading, setOperationalLoading] = useState(false);
  const [calendarTabFilters, setCalendarTabFilters] = useState<Record<CalendarItemKind, boolean>>({
    new: true,
    collected: true,
    duplicate: true,
    db: true,
  });
  const [calendarLayoutMode, setCalendarLayoutMode] = useState<CalendarLayoutMode>('compact');
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(null);
  const [hiddenCalendarIds, setHiddenCalendarIds] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(CALENDAR_HIDDEN_STORAGE_KEY);
      return new Set(saved ? JSON.parse(saved) : []);
    } catch {
      return new Set();
    }
  });

  // Modals
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isCropModalOpen, setIsCropModalOpen] = useState(false);
  const [isVenueModalOpen, setIsVenueModalOpen] = useState(false);
  const [venueTargetId, setVenueTargetId] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<ScrapedEvent | null>(null);
  const [zoomImage, setZoomImage] = useState<string | null>(null);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [cropKey, setCropKey] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const listRequestSeq = useRef(0);
  const localIngestorBypass = isLocalIngestorBypass();
  const canAccessIngestor = isAdmin || localIngestorBypass;
  const isIngestorAuthReady = isAuthCheckComplete || localIngestorBypass;

  const getAdminRequestHeaders = useCallback(async (withJson = false): Promise<Record<string, string>> => {
    if (localIngestorBypass) {
      return withJson ? { 'Content-Type': 'application/json' } : {};
    }
    const { data } = await prodClient.auth.getSession();
    const token = data.session?.access_token;
    return {
      ...(withJson ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }, [localIngestorBypass]);

  useEffect(() => {
    try {
      localStorage.setItem(CALENDAR_HIDDEN_STORAGE_KEY, JSON.stringify(Array.from(hiddenCalendarIds)));
    } catch (err) {
      console.warn('인제스터 달력 숨김 저장 실패:', err);
    }
  }, [hiddenCalendarIds]);

  const resetSecondaryFilters = () => {
    setActivityFilter('전체');
    setFamilyFilter('all');
    setTagFilter('all');
  };

  const buildScrapedEventsUrl = (page: number, tab: TabKey, scope: ScopeFilter, pageSize?: number) => {
    const params = new URLSearchParams({ page: String(page), tab });
    if (pageSize) params.set('pageSize', String(pageSize));
    if (scope !== 'all') params.set('scope', scope);
    return `/api/scraped-events?${params.toString()}`;
  };

  const fetchScrapedEvents = async (page = 1, tab = activeTab, scope = scopeFilter) => {
    if (!isIngestorAuthReady || !canAccessIngestor) {
      setLoading(false);
      return;
    }

    const requestSeq = listRequestSeq.current + 1;
    listRequestSeq.current = requestSeq;

    try {
      setLoading(true);
      setListError(null);
      const res = await fetch(buildScrapedEventsUrl(page, tab, scope), {
        headers: await getAdminRequestHeaders(),
        cache: 'no-store',
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `데이터를 불러오지 못했습니다. (${res.status})`);
      }
      const json = await res.json();
      if (requestSeq !== listRequestSeq.current) return;
      setScrapedEvents(json.data || json);
      setTotalCount(json.total || 0);
      setCurrentPage(page);
    } catch (err) {
      console.error(err);
      if (requestSeq === listRequestSeq.current) {
        setScrapedEvents([]);
        setTotalCount(0);
        setListError(err instanceof Error ? err.message : '데이터를 불러오지 못했습니다.');
      }
    } finally {
      if (requestSeq === listRequestSeq.current) setLoading(false);
    }
  };

  const fetchTabCounts = async (scope = scopeFilter) => {
    if (!isIngestorAuthReady || !canAccessIngestor) {
      setTabCounts({ new: 0, collected: 0, duplicate: 0 });
      return;
    }

    try {
      const scopeQuery = scope === 'all' ? '' : `&scope=${scope}`;
      const headers = await getAdminRequestHeaders();
      const [resNew, resCollected, resDuplicate] = await Promise.all([
        fetch(`/api/scraped-events?page=1&tab=new${scopeQuery}`, { headers, cache: 'no-store' }),
        fetch(`/api/scraped-events?page=1&tab=collected${scopeQuery}`, { headers, cache: 'no-store' }),
        fetch(`/api/scraped-events?page=1&tab=duplicate${scopeQuery}`, { headers, cache: 'no-store' }),
      ]);
      const [jsonNew, jsonCollected, jsonDuplicate] = await Promise.all([resNew.json(), resCollected.json(), resDuplicate.json()]);
      setTabCounts({ new: jsonNew.total || 0, collected: jsonCollected.total || 0, duplicate: jsonDuplicate.total || 0 });
    } catch (err) {
      console.error('탭 카운트 로드 실패:', err);
    }
  };

  const handleTabChange = (tab: TabKey) => {
    setViewMode('list');
    setActiveTab(tab);
    setSelectedIds(new Set());
    setCurrentPage(1);
    resetSecondaryFilters();
    if (tab === activeTab) {
      void fetchScrapedEvents(1, tab, scopeFilter);
      void fetchTabCounts(scopeFilter);
    }
  };

  const handleScopeChange = (scope: ScopeFilter) => {
    setScopeFilter(scope);
    setSelectedIds(new Set());
    setCurrentPage(1);
    resetSecondaryFilters();
    if (scope === scopeFilter) {
      void fetchScrapedEvents(1, activeTab, scope);
      void fetchTabCounts(scope);
    }
  };

  const fetchAllCalendarTabEvents = useCallback(async (tab: TabKey, scope: ScopeFilter, headers: Record<string, string>) => {
    const all: ScrapedEvent[] = [];
    let page = 1;
    let total = 0;

    do {
      const res = await fetch(buildScrapedEventsUrl(page, tab, scope, CALENDAR_PAGE_SIZE), { headers, cache: 'no-store' });
      if (!res.ok) throw new Error(`${CALENDAR_TAB_LABELS[tab]} 달력 데이터를 불러오지 못했습니다.`);
      const json = await res.json();
      const data = (json.data || json || []) as ScrapedEvent[];
      all.push(...data);
      total = Number(json.total || data.length);
      if (data.length === 0) break;
      page += 1;
    } while (all.length < total);

    return all;
  }, []);

  const fetchOperationalCalendarEvents = useCallback(async (scope: ScopeFilter, month: Date) => {
    const days = getCalendarMonthDays(month);
    const start = toCalendarDateKey(days[0]);
    const end = toCalendarDateKey(days[days.length - 1]);
    return fetchCafe24Events({
      start,
      end,
      scope: scope === 'all' ? undefined : scope,
      limit: 3000,
    }) as Promise<OperationalEvent[]>;
  }, []);

  const refreshOperationalEvents = useCallback(async (scope = scopeFilter, month = calendarMonth) => {
    if (!isIngestorAuthReady || !canAccessIngestor) {
      setOperationalCalendarEvents([]);
      setOperationalLoading(false);
      return;
    }

    try {
      setOperationalLoading(true);
      setOperationalCalendarEvents(await fetchOperationalCalendarEvents(scope, month));
    } catch (err) {
      console.error('운영 DB 이벤트 로드 실패:', err);
      setOperationalCalendarEvents([]);
    } finally {
      setOperationalLoading(false);
    }
  }, [calendarMonth, canAccessIngestor, fetchOperationalCalendarEvents, isIngestorAuthReady, scopeFilter]);

  const refreshCalendarEvents = useCallback(async (scope = scopeFilter, month = calendarMonth) => {
    if (!isIngestorAuthReady || !canAccessIngestor) {
      setCalendarEventsByTab({ new: [], collected: [], duplicate: [] });
      setCalendarLoading(false);
      return;
    }

    try {
      setCalendarLoading(true);
      const headers = await getAdminRequestHeaders();
      const [newResult, collectedResult] = await Promise.allSettled([
        fetchAllCalendarTabEvents('new', scope, headers),
        fetchAllCalendarTabEvents('collected', scope, headers),
      ]);

      const readResult = <T,>(result: PromiseSettledResult<T>, fallback: T) => {
        if (result.status === 'fulfilled') return result.value;
        console.error('달력 데이터 일부 로드 실패:', result.reason);
        return fallback;
      };

      setCalendarEventsByTab({
        new: readResult(newResult, [] as ScrapedEvent[]),
        collected: readResult(collectedResult, [] as ScrapedEvent[]),
        duplicate: [],
      });
    } catch (err) {
      console.error('달력 데이터 로드 실패:', err);
    } finally {
      setCalendarLoading(false);
    }
  }, [calendarMonth, canAccessIngestor, fetchAllCalendarTabEvents, getAdminRequestHeaders, isIngestorAuthReady, scopeFilter]);

  useEffect(() => {
    if (!isIngestorAuthReady || !canAccessIngestor) return;
    fetchScrapedEvents(1, activeTab, scopeFilter);
    fetchTabCounts(scopeFilter);
  }, [activeTab, scopeFilter, canAccessIngestor, isIngestorAuthReady]);

  useEffect(() => {
    if (viewMode !== 'calendar') return;
    refreshCalendarEvents(scopeFilter, calendarMonth);
  }, [calendarMonth, refreshCalendarEvents, scopeFilter, viewMode]);

  useEffect(() => {
    if (viewMode !== 'list' && viewMode !== 'calendar') return;
    refreshOperationalEvents(scopeFilter, calendarMonth);
  }, [calendarMonth, refreshOperationalEvents, scopeFilter, viewMode]);

  useEffect(() => {
    if (!isIngestorAuthReady || !canAccessIngestor) {
      setVenues([]);
      return;
    }
    const fetchVenues = async () => {
      const { data, error } = await prodClient
        .from('venues')
        .select('id, name, address, map_url')
        .eq('is_active', true);
      if (error) {
        console.error('장소 목록 로드 실패:', error);
        return;
      }
      setVenues((data || []) as VenueRecord[]);
    };
    fetchVenues();
  }, [canAccessIngestor, isIngestorAuthReady]);

  useEffect(() => {
    if (!isIngestorAuthReady || !canAccessIngestor) return;
    if (scopeFilter !== 'tango') return;

    let alive = true;
    const fetchTangoSceneMap = async () => {
      try {
        setTangoSceneLoading(true);
        setTangoSceneError(null);
        const res = await fetch('/api/tango-scene-map');
        if (!res.ok) throw new Error(`탱고 씬맵 로드 실패 (${res.status})`);
        const json = await res.json();
        if (alive) setTangoSceneMap(json);
      } catch (err: any) {
        if (alive) setTangoSceneError(err?.message || '탱고 씬맵 로드 실패');
      } finally {
        if (alive) setTangoSceneLoading(false);
      }
    };

    fetchTangoSceneMap();
    return () => { alive = false; };
  }, [scopeFilter, canAccessIngestor, isIngestorAuthReady]);

  const scopeLocalCounts = useMemo(() => {
    const counts = new Map<ScopeFilter, number>();
    scrapedEvents.forEach((event) => {
      const meta = getIngestorGenreMeta(event);
      const scope = (event.structured_data?.dance_scope || meta.scope || 'swing') as ScopeFilter;
      if (scope !== 'all' && SCOPE_FILTER_OPTIONS.some((option) => option.key === scope)) {
        counts.set(scope, (counts.get(scope) || 0) + 1);
      }
    });
    return counts;
  }, [scrapedEvents]);

  const familyOptions = useMemo(() => {
    const counts = new Map<string, { label: string; count: number }>();
    scrapedEvents.forEach((event) => {
      const meta = getIngestorGenreMeta(event);
      const scope = event.structured_data?.dance_scope || meta.scope || 'swing';
      if (scopeFilter !== 'all' && scope !== scopeFilter) return;
      if (activityFilter !== '전체' && getIngestorActivityLabel(event) !== activityFilter) return;
      counts.set(meta.family, { label: meta.familyLabel, count: (counts.get(meta.family)?.count || 0) + 1 });
    });
    const order = ['partner', 'street', 'art', 'commercial', 'unknown'];
    return order
      .filter((key) => counts.has(key))
      .map((key) => ({ key, ...(counts.get(key) as { label: string; count: number }) }));
  }, [activityFilter, scopeFilter, scrapedEvents]);

  const tagOptions = useMemo(() => {
    const counts = new Map<string, number>();
    scrapedEvents.forEach((event) => {
      const meta = getIngestorGenreMeta(event);
      const scope = event.structured_data?.dance_scope || meta.scope || 'swing';
      if (scopeFilter !== 'all' && scope !== scopeFilter) return;
      if (activityFilter !== '전체' && getIngestorActivityLabel(event) !== activityFilter) return;
      if (familyFilter !== 'all' && meta.family !== familyFilter) return;
      getIngestorTags(event).forEach((tag) => counts.set(tag, (counts.get(tag) || 0) + 1));
    });
    return Array.from(counts.entries())
      .map(([key, count]) => ({ key, label: getIngestorTagLabel(key), count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'ko'));
  }, [activityFilter, familyFilter, scopeFilter, scrapedEvents]);

  useEffect(() => {
    if (familyFilter !== 'all' && !familyOptions.some((option) => option.key === familyFilter)) {
      setFamilyFilter('all');
    }
  }, [familyFilter, familyOptions]);

  useEffect(() => {
    if (tagFilter !== 'all' && !tagOptions.some((option) => option.key === tagFilter)) {
      setTagFilter('all');
    }
  }, [tagFilter, tagOptions]);

  const filteredEvents = useMemo(() => {
    return scrapedEvents.filter((event) => {
      const meta = getIngestorGenreMeta(event);
      const scope = event.structured_data?.dance_scope || meta.scope || 'swing';
      if (scopeFilter !== 'all' && scope !== scopeFilter) return false;
      if (activityFilter !== '전체' && getIngestorActivityLabel(event) !== activityFilter) return false;
      if (familyFilter !== 'all' && meta.family !== familyFilter) return false;
      if (tagFilter !== 'all' && !getIngestorTags(event).includes(tagFilter)) return false;
      return true;
    });
  }, [activityFilter, familyFilter, scopeFilter, scrapedEvents, tagFilter]);

  const visibleFilteredEvents = filteredEvents;

  const calendarItems = useMemo(() => {
    const rangeDays = getCalendarMonthDays(calendarMonth);
    const rangeStart = toCalendarDateKey(rangeDays[0]);
    const rangeEnd = toCalendarDateKey(rangeDays[rangeDays.length - 1]);
    const candidateItems = CALENDAR_CANDIDATE_TABS.flatMap((tab) => (
      calendarEventsByTab[tab]
        .filter(event => isCalendarDateKey(event.structured_data?.date) && event.structured_data.date >= rangeStart && event.structured_data.date <= rangeEnd)
        .map((event): CalendarCandidateItem => ({
          id: getCalendarCandidateId(event.id),
          eventId: event.id,
          tab,
          source: 'candidate',
          date: event.structured_data.date,
          title: event.structured_data.title || event.id,
          keyword: event.keyword,
          location: event.structured_data.location || event.structured_data.venue_name || undefined,
          time: event.structured_data.times?.[0],
          sourceUrl: event.source_url,
          imageUrl: resolveProductionAssetUrl(event.poster_url) || undefined,
        }))
    ));

    const candidateDuplicateKeys = new Set<string>();
    candidateItems.forEach(item => addCalendarDuplicateKeys(candidateDuplicateKeys, item));

    const dbItems = operationalCalendarEvents.flatMap((event) => {
      const eventDates = Array.isArray(event.event_dates) ? event.event_dates : [];
      const fallbackDate = event.start_date || event.date;
      const dateKeys = Array.from(new Set(
        [...eventDates, fallbackDate].filter((date): date is string => isCalendarDateKey(date))
      )).filter(date => date >= rangeStart && date <= rangeEnd);
      return dateKeys
        .map((date): CalendarCandidateItem => ({
          id: `db:${event.id}:${date}`,
          eventId: String(event.id),
          tab: 'db',
          source: 'db',
          date,
          title: event.title || '제목 없음',
          keyword: event.organizer || undefined,
          location: event.location || event.venue_name || undefined,
          time: event.time ? String(event.time).slice(0, 5) : undefined,
          sourceUrl: event.link1 || undefined,
          imageUrl: getOperationalImageUrl(event) || undefined,
        }))
        .filter(item => !isCalendarDuplicateOfCandidate(candidateDuplicateKeys, item));
    });

    return [...candidateItems, ...dbItems];
  }, [calendarEventsByTab, calendarMonth, operationalCalendarEvents]);

  const calendarCounts = useMemo(() => {
    return calendarItems.reduce<Record<CalendarItemKind, number>>((acc, item) => {
      acc[item.tab] += 1;
      return acc;
    }, { new: 0, collected: 0, duplicate: 0, db: 0 });
  }, [calendarItems]);

  const visibleCalendarItems = useMemo(() => (
    calendarItems.filter(item => calendarTabFilters[item.tab] && !hiddenCalendarIds.has(item.id))
  ), [calendarItems, calendarTabFilters, hiddenCalendarIds]);

  const calendarItemsByDate = useMemo(() => {
    const order: Record<CalendarItemKind, number> = { new: 0, collected: 1, duplicate: 2, db: 3 };
    const map = new Map<string, CalendarCandidateItem[]>();
    visibleCalendarItems.forEach(item => {
      const list = map.get(item.date) || [];
      list.push(item);
      map.set(item.date, list);
    });
    map.forEach(list => {
      list.sort((a, b) => order[a.tab] - order[b.tab] || a.title.localeCompare(b.title, 'ko'));
    });
    return map;
  }, [visibleCalendarItems]);

  const selectedCalendarDateItems = useMemo(() => {
    if (!selectedCalendarDate) return [];
    const order: Record<CalendarItemKind, number> = { new: 0, collected: 1, duplicate: 2, db: 3 };
    return calendarItems
      .filter(item => item.date === selectedCalendarDate && !hiddenCalendarIds.has(item.id))
      .sort((a, b) => order[a.tab] - order[b.tab] || a.title.localeCompare(b.title, 'ko'));
  }, [calendarItems, hiddenCalendarIds, selectedCalendarDate]);

  const operationalListItems = useMemo(() => (
    calendarItems
      .filter(item => item.source === 'db' && item.date.startsWith(`${calendarMonth.getFullYear()}-${String(calendarMonth.getMonth() + 1).padStart(2, '0')}`))
      .sort((a, b) => b.date.localeCompare(a.date) || String(b.time || '').localeCompare(String(a.time || '')) || a.title.localeCompare(b.title, 'ko'))
  ), [calendarItems, calendarMonth]);

  const calendarDays = useMemo(() => getCalendarMonthDays(calendarMonth), [calendarMonth]);
  const calendarMonthLabel = `${calendarMonth.getFullYear()}년 ${calendarMonth.getMonth() + 1}월`;
  const todayKey = toCalendarDateKey(new Date());

  const handleCalendarMonthShift = useCallback((offset: number) => {
    setCalendarMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + offset, 1));
  }, []);

  const handleCalendarToday = useCallback(() => {
    const today = new Date();
    setCalendarMonth(new Date(today.getFullYear(), today.getMonth(), 1));
  }, []);

  const toggleCalendarTabFilter = useCallback((tab: CalendarItemKind) => {
    setCalendarTabFilters(prev => ({ ...prev, [tab]: !prev[tab] }));
  }, []);

  const hideCalendarItem = useCallback((item: CalendarCandidateItem) => {
    setHiddenCalendarIds(prev => {
      const next = new Set(prev);
      next.add(item.id);
      return next;
    });
  }, []);

  const clearHiddenCalendarItems = useCallback(() => {
    setHiddenCalendarIds(new Set());
  }, []);

  const openCalendarDay = useCallback((dateKey: string) => {
    setSelectedCalendarDate(dateKey);
  }, []);

  const handleCalendarItemClick = useCallback((item: CalendarCandidateItem) => {
    if (item.source === 'db') {
      if (item.sourceUrl) window.open(item.sourceUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    if (item.tab !== activeTab) {
      setActiveTab(item.tab as TabKey);
      setSelectedIds(new Set([item.eventId]));
      setCurrentPage(1);
      setViewMode('list');
      return;
    }

    setSelectedIds(prev => {
      const next = new Set(prev);
      next.add(item.eventId);
      return next;
    });
    window.setTimeout(() => {
      document.getElementById(`ingestor-v2-row-${item.eventId}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }, 0);
  }, [activeTab]);

  const handleCalendarDetailItemClick = useCallback((item: CalendarCandidateItem) => {
    handleCalendarItemClick(item);
    setSelectedCalendarDate(null);
  }, [handleCalendarItemClick]);

  const tangoPreviewEvents = useMemo(() => {
    if (!tangoSceneMap) return [];
    return tangoSceneMap.todayEvents.length ? tangoSceneMap.todayEvents : tangoSceneMap.weekEvents.slice(0, 6);
  }, [tangoSceneMap]);

  const handleUpdateStatus = async (id: string, updates: Partial<ScrapedEvent>) => {
    try {
      setProcessingId(id);
      const target = scrapedEvents.find(e => e.id === id);
      if (!target) return;

      const payload = { ...target, ...updates };
      const res = await fetch('/api/scraped-events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error('상태 업데이트 실패');

      const normalizedUpdates = updates.is_collected ? { ...updates, status: 'collected' as ScrapedEvent['status'] } : updates;
      setScrapedEvents(prev => {
        const updated = prev.map(e => e.id === id ? { ...e, ...normalizedUpdates } : e);
        if ((activeTab === 'new' || activeTab === 'duplicate') && normalizedUpdates.is_collected) {
          return updated.filter(e => e.id !== id);
        }
        return updated;
      });
      await fetchTabCounts();
      await Promise.all([refreshCalendarEvents(), refreshOperationalEvents()]);
    } catch (err) {
      console.error(err);
      alert('업데이트 중 에러 발생');
    } finally {
      setProcessingId(null);
    }
  };

  const handleRestoreDuplicate = async (event: ScrapedEvent) => {
    const cleanStructuredData = { ...(event.structured_data || {}) };
    delete cleanStructuredData._duplicate;
    await handleUpdateStatus(event.id, {
      is_collected: false,
      status: 'pending',
      structured_data: cleanStructuredData as ScrapedEvent['structured_data'],
    });
    if (activeTab === 'duplicate') {
      setScrapedEvents(prev => prev.filter(e => e.id !== event.id));
    }
  };

  // V1 방식: 장소 필드 수정 후 scraped-events에 저장
  const handleUpdateVenueField = async (id: string, location: string, address: string, venue_id: any, location_link = '') => {
    const mapSafeLocation = toMapSafeVenueName(location);
    console.log('[IngestorV2] handleUpdateVenueField:', { id, location: mapSafeLocation, address, venue_id, location_link });
    setScrapedEvents(prev => prev.map(e => {
      if (e.id !== id) return e;
      return { ...e, structured_data: { ...e.structured_data, location: mapSafeLocation, venue_name: mapSafeLocation, address, venue_id, location_link } };
    }));

    try {
      const target = scrapedEvents.find(e => e.id === id);
      console.log('[IngestorV2] target found:', !!target, target?.id);
      if (!target) return;
      const updated = {
        ...target,
        structured_data: { ...target.structured_data, location: mapSafeLocation, venue_name: mapSafeLocation, address, venue_id, location_link }
      };
      const res = await fetch('/api/scraped-events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
      console.log('[IngestorV2] 장소 저장 응답:', res.status);
    } catch (err) {
      console.error('장소 저장 실패:', err);
    }
  };

  const handleVenueSelect = (venue: any) => {
    if (!venueTargetId) return;
    handleUpdateVenueField(venueTargetId, venue.name, venue.address, venue.id, venue.map_url || '');
    setIsVenueModalOpen(false);
    setVenueTargetId(null);
  };

  const openVenueModal = (id: string) => {
    setVenueTargetId(id);
    setIsVenueModalOpen(true);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === visibleFilteredEvents.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(visibleFilteredEvents.map(e => e.id)));
    }
  };

  const handleBulkIgnore = async () => {
    if (!selectedIds.size) return;
    if (!confirm(`${selectedIds.size}개를 삭제할까요?`)) return;
    setBulkProgress(`제외 처리 중... (0/${selectedIds.size})`);
    const ids = Array.from(selectedIds);
    await fetch('/api/scraped-events', {
      method: 'DELETE',
      headers: await getAdminRequestHeaders(true),
      body: JSON.stringify({ ids }),
    });
    setScrapedEvents(prev => prev.filter(e => !selectedIds.has(e.id)));
    setSelectedIds(new Set());
    setBulkProgress(null);
    await fetchTabCounts();
    await Promise.all([refreshCalendarEvents(), refreshOperationalEvents()]);
  };

  const handleBulkCollect = async () => {
    if (!selectedIds.size) return;
    setBulkProgress(`완료 처리 중... (0/${selectedIds.size})`);
    let i = 0;
    for (const id of selectedIds) {
      await handleUpdateStatus(id, { is_collected: true });
      setBulkProgress(`완료 처리 중... (${++i}/${selectedIds.size})`);
    }
    // 탭이 'new'면 완료 처리된 항목 즉시 제거
    if (activeTab === 'new') {
      setScrapedEvents(prev => prev.filter(e => !selectedIds.has(e.id)));
    }
    setSelectedIds(new Set());
    setBulkProgress(null);
    await fetchTabCounts();
    await Promise.all([refreshCalendarEvents(), refreshOperationalEvents()]);
  };

  const registerEventToProd = async (event: ScrapedEvent): Promise<string> => {
    const sd = event.structured_data;

    // extracted_text는 목록 조회 시 제외되므로 등록 시 별도 조회
    let extractedText = event.extracted_text || '';
    if (!extractedText) {
      const { data: full } = await prodClient.from('scraped_events' as any).select('extracted_text').eq('id', event.id).maybeSingle();
      extractedText = (full as any)?.extracted_text || '';
    }

    const formattedTitle = sd.djs?.length
      ? `DJ ${sd.djs.join(', ')} | ${sd.title}`
      : sd.title;
    const mapped = mapIngestorEvent(event, venues);

    const insertPayload = {
        title: formattedTitle,
        date: sd.date,
        start_date: sd.date,
        end_date: sd.date,
        time: mapped.time,
        location: mapped.location,
        address: mapped.address,
        venue_id: mapped.venue_id,
        venue_name: mapped.venue_name,
        location_link: mapped.location_link,
        image: event.poster_url || null,
        image_micro: null,
        image_thumbnail: null,
        image_medium: null,
        image_full: null,
        storage_path: null,
        description: extractedText,
        category: mapped.category,
        scope: 'domestic',
        link1: event.source_url || '',
        link_name1: event.keyword || '',
        genre: mapped.genre,
        dance_scope: mapped.dance_scope,
        dance_genre: mapped.dance_genre,
        activity_type: mapped.activity_type,
        dance_tags: mapped.dance_tags,
        group_id: mapped.group_id,
      } as any;

    const duplicate = await findRegisteredDuplicate(event, formattedTitle, mapped);
    const registerRes = await fetch('/api/ingestor-register-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scrapedEventId: event.id,
        eventData: insertPayload,
        scrapedStructuredData: event.structured_data,
        existingEventId: duplicate?.id || null,
      }),
    });
    const registerJson = await registerRes.json().catch(() => ({}));
    if (!registerRes.ok) {
      throw new Error(registerJson.error || '운영 DB 등록에 실패했습니다.');
    }

    if (duplicate) {
      console.log(`[IngestorV2] 운영 DB 중복 이벤트 이미지/완료 상태 보정: ${event.id} → ${duplicate.id} (${duplicate.title})`);
    }

    return registerJson.event?.id || duplicate?.id;
  };

  const findRegisteredDuplicate = async (event: ScrapedEvent, formattedTitle: string, mapped: MappedIngestorEvent) => {
    const date = event.structured_data.date;
    if (!date) return null;
    const { data, error } = await prodClient
      .from('events')
      .select('id,title,date,start_date,end_date,location,venue_name,venue_id,link1')
      .or(`date.eq.${date},start_date.eq.${date},and(start_date.lte.${date},end_date.gte.${date})`)
      .limit(80);
    if (error) throw error;

    return (data || []).find((row: any) => {
      if (event.source_url && row.link1 === event.source_url) return true;
      const sameVenue = mapped.venue_id && row.venue_id === mapped.venue_id
        || mapped.venue_name && [row.venue_name, row.location].filter(Boolean).some((v: string) => v.includes(mapped.venue_name || '') || (mapped.venue_name || '').includes(v));
      return sameVenue && titleLooksDuplicate(formattedTitle, row.title || '');
    }) || null;
  };

  const handleBulkRegister = async () => {
    if (!selectedIds.size) return;
    const targets = visibleFilteredEvents.filter(e => selectedIds.has(e.id));
    if (!targets.length) {
      alert('현재 필터/탭에서 등록할 선택 항목을 찾지 못했습니다. 목록을 새로고침한 뒤 다시 선택하세요.');
      setSelectedIds(new Set());
      return;
    }

    setBulkProgress(`등록 중... (0/${targets.length})`);
    const errors: string[] = [];
    const successIds = new Set<string>();
    let i = 0;

    for (const event of targets) {
      try {
        await registerEventToProd(event);
        successIds.add(event.id);
      } catch (e: any) {
        errors.push(`${event.structured_data.title}: ${e.message}`);
      }
      i++;
      setBulkProgress(`등록 중... (${i}/${targets.length})`);
    }

    if (activeTab !== 'collected') {
      setScrapedEvents(prev => prev.filter(e => !successIds.has(e.id)));
    }
    setSelectedIds(prev => {
      const next = new Set(prev);
      successIds.forEach(id => next.delete(id));
      return next;
    });
    setBulkProgress(null);
    await fetchTabCounts();
    await Promise.all([refreshCalendarEvents(), refreshOperationalEvents()]);

    if (errors.length) {
      alert(`일괄 등록 결과: ${successIds.size}/${targets.length}개 완료\n\n실패:\n${errors.join('\n')}`);
    } else {
      alert(`${successIds.size}개 등록 완료`);
    }
  };

  const handleRegistrationSuccess = async (id: string) => {
    setIsEditModalOpen(false);
    setSelectedEvent(null);
    await fetchScrapedEvents();
    await Promise.all([refreshCalendarEvents(), refreshOperationalEvents()]);
  };

  if (!isIngestorAuthReady) {
    return <div className="ingestor-v2-container">관리자 권한을 확인하는 중...</div>;
  }

  if (!canAccessIngestor) {
    return (
      <div className="ingestor-v2-container">
        <header className="ingestor-v2-header">
          <h1>수집 데이터 센터 V2</h1>
          <p>관리자 계정으로 로그인한 뒤 사용할 수 있습니다.</p>
        </header>
      </div>
    );
  }

  return (
    <div className="ingestor-v2-container">
      <header className="ingestor-v2-header">
        <h1>수집 데이터 센터 V2 (Data-Centric)</h1>
        <div className="tab-group">
          <button className={activeTab === 'new' ? 'active' : ''} onClick={() => handleTabChange('new')}>신규 {tabCounts.new > 0 && <span className="tab-badge">{tabCounts.new}</span>}</button>
          <button className={activeTab === 'collected' ? 'active' : ''} onClick={() => handleTabChange('collected')}>완료 {tabCounts.collected > 0 && <span className="tab-badge">{tabCounts.collected}</span>}</button>
          <button className={activeTab === 'duplicate' ? 'active' : ''} onClick={() => handleTabChange('duplicate')}>중복 {tabCounts.duplicate > 0 && <span className="tab-badge">{tabCounts.duplicate}</span>}</button>
        </div>
        <div className="ingestor-view-toggle" aria-label="인제스터 보기 방식">
          <button
            type="button"
            className={viewMode === 'list' ? 'active' : ''}
            onClick={() => setViewMode('list')}
            aria-pressed={viewMode === 'list'}
          >
            <i className="ri-list-check-2" aria-hidden="true"></i>
            리스트
          </button>
          <button
            type="button"
            className={viewMode === 'calendar' ? 'active' : ''}
            onClick={() => setViewMode('calendar')}
            aria-pressed={viewMode === 'calendar'}
          >
            <i className="ri-calendar-event-line" aria-hidden="true"></i>
            달력
          </button>
        </div>
        <div className="ingestor-taxonomy-filters">
          <div className="scope-filter-group" aria-label="장르 필터">
            {SCOPE_FILTER_OPTIONS.map(option => (
              <button
                key={option.key}
                className={`scope-filter-btn scope-${option.key} ${scopeFilter === option.key ? 'active' : ''}`}
                onClick={() => handleScopeChange(option.key)}
                title={option.description}
              >
                {option.label}
                <span>
                  {scopeFilter === option.key
                    ? totalCount
                    : option.key === 'all'
                      ? scrapedEvents.length
                      : scopeLocalCounts.get(option.key) || 0}
                </span>
              </button>
            ))}
          </div>

          <div className="type-filter-group" aria-label="활동 분류 필터">
            {(['전체', '강습', '소셜', '행사', '모집'] as const).map(t => (
              <button
                key={t}
                className={`type-filter-btn ${activityFilter === t ? 'active' : ''} type-${t === '전체' ? 'all' : t === '소셜' ? 'social' : t === '강습' ? 'lesson' : t === '모집' ? 'recruit' : 'party'}`}
                onClick={() => { setActivityFilter(t); setFamilyFilter('all'); setTagFilter('all'); setSelectedIds(new Set()); }}
              >
                {t}
              </button>
            ))}
          </div>

          {familyOptions.length > 0 && (
            <div className="family-filter-group" aria-label="장르 계열 필터">
              <button
                className={`family-filter-btn ${familyFilter === 'all' ? 'active' : ''}`}
                onClick={() => { setFamilyFilter('all'); setTagFilter('all'); setSelectedIds(new Set()); }}
              >
                전체 계열
              </button>
              {familyOptions.map(option => (
                <button
                  key={option.key}
                  className={`family-filter-btn ${familyFilter === option.key ? 'active' : ''}`}
                  onClick={() => { setFamilyFilter(option.key as typeof familyFilter); setTagFilter('all'); setSelectedIds(new Set()); }}
                >
                  {option.label} <span>{option.count}</span>
                </button>
              ))}
            </div>
          )}

          {tagOptions.length > 0 && (
            <div className="tag-filter-group" aria-label="수집된 세부 태그 필터">
              <span>세부 태그</span>
              <button
                className={`tag-filter-btn ${tagFilter === 'all' ? 'active' : ''}`}
                onClick={() => { setTagFilter('all'); setSelectedIds(new Set()); }}
              >
                전체
              </button>
              {tagOptions.map(option => (
                <button
                  key={option.key}
                  className={`tag-filter-btn ${tagFilter === option.key ? 'active' : ''}`}
                  onClick={() => { setTagFilter(option.key); setSelectedIds(new Set()); }}
                >
                  {option.label} <em>{option.count}</em>
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      {viewMode === 'calendar' && (
      <section className={`ingestor-v2-calendar-panel mode-${calendarLayoutMode}`} aria-label="인제스터 월간 달력">
        <div className="ingestor-v2-calendar-toolbar">
          <div className="ingestor-v2-calendar-title-wrap">
            <h2>
              <i className="ri-calendar-event-line" aria-hidden="true"></i>
              전체달력 월간보기
              <span>{visibleCalendarItems.length}</span>
              {(calendarLoading || operationalLoading) && <em>로드중</em>}
            </h2>
            <div className="ingestor-v2-calendar-month-nav">
              <button type="button" onClick={() => handleCalendarMonthShift(-1)} aria-label="이전 달" title="이전 달">
                <i className="ri-arrow-left-s-line" aria-hidden="true"></i>
              </button>
              <strong>{calendarMonthLabel}</strong>
              <button type="button" onClick={() => handleCalendarMonthShift(1)} aria-label="다음 달" title="다음 달">
                <i className="ri-arrow-right-s-line" aria-hidden="true"></i>
              </button>
              <button type="button" className="calendar-today-btn" onClick={handleCalendarToday}>오늘</button>
            </div>
            <div className="ingestor-v2-calendar-layout-toggle" aria-label="월간 달력 보기 방식">
              {(['compact', 'expanded', 'horizontal'] as CalendarLayoutMode[]).map(mode => (
                <button
                  key={mode}
                  type="button"
                  className={calendarLayoutMode === mode ? 'active' : ''}
                  onClick={() => setCalendarLayoutMode(mode)}
                  aria-pressed={calendarLayoutMode === mode}
                >
                  {CALENDAR_LAYOUT_LABELS[mode]}
                </button>
              ))}
            </div>
          </div>
          <div className="ingestor-v2-calendar-filters" aria-label="달력 표시 항목">
            {CALENDAR_FILTER_TABS.map(tab => (
              <button
                key={tab}
                type="button"
                className={`calendar-filter filter-${tab} ${calendarTabFilters[tab] ? 'active' : ''}`}
                onClick={() => toggleCalendarTabFilter(tab)}
                aria-pressed={calendarTabFilters[tab]}
              >
                <span aria-hidden="true"></span>
                {CALENDAR_TAB_LABELS[tab]}
                <b>{calendarCounts[tab]}</b>
              </button>
            ))}
            {hiddenCalendarIds.size > 0 && (
              <button type="button" className="calendar-hidden-reset" onClick={clearHiddenCalendarItems}>
                숨김 해제 {hiddenCalendarIds.size}
              </button>
            )}
          </div>
        </div>

        <div className="ingestor-v2-calendar-weekdays">
          {CALENDAR_WEEKDAY_LABELS.map(day => (
            <div key={day}>{day}</div>
          ))}
        </div>
        <div className="ingestor-v2-calendar-grid">
          {calendarDays.map(day => {
            const dateKey = toCalendarDateKey(day);
            const dayItems = calendarItemsByDate.get(dateKey) || [];
            const visibleDayItems = calendarLayoutMode === 'compact' ? dayItems.slice(0, 5) : dayItems;
            const isOutsideMonth = day.getMonth() !== calendarMonth.getMonth();

            return (
              <div
                key={dateKey}
                className={`ingestor-v2-calendar-day ${isOutsideMonth ? 'outside-month' : ''} ${dateKey === todayKey ? 'is-today' : ''}`}
                role="button"
                tabIndex={0}
                onClick={() => openCalendarDay(dateKey)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    openCalendarDay(dateKey);
                  }
                }}
              >
                <div className="calendar-day-head">
                  <span>{day.getDate()}</span>
                  {dayItems.length > 0 && <em>{dayItems.length}</em>}
                </div>
                <div className="calendar-day-list">
                  {visibleDayItems.map(item => (
                    <div
                      key={item.id}
                      className={`calendar-event-item status-${item.tab}`}
                      title={`${CALENDAR_TAB_LABELS[item.tab]} · ${item.title}`}
                    >
                      <button
                        type="button"
                        className={`calendar-event-thumb ${item.imageUrl ? '' : 'is-empty'}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (item.imageUrl) {
                            setZoomImage(item.imageUrl);
                          }
                        }}
                        aria-label={item.imageUrl ? `${item.title} 이미지 크게보기` : `${item.title} 이미지 없음`}
                        title={item.imageUrl ? '이미지 크게보기' : '이미지 없음'}
                      >
                        {item.imageUrl ? (
                          <img src={item.imageUrl} alt="" loading="lazy" />
                        ) : (
                          <i className="ri-image-line" aria-hidden="true"></i>
                        )}
                      </button>
                      <button
                        type="button"
                        className="calendar-event-main"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleCalendarItemClick(item);
                        }}
                      >
                        <span>{CALENDAR_TAB_LABELS[item.tab]}</span>
                        <strong>{item.time ? `${item.time} ` : ''}{item.title}</strong>
                      </button>
                      <button
                        type="button"
                        className="calendar-event-hide"
                        onClick={(event) => {
                          event.stopPropagation();
                          hideCalendarItem(item);
                        }}
                        aria-label={`${item.title} 숨기기`}
                        title="숨김"
                      >
                        <i className="ri-eye-off-line" aria-hidden="true"></i>
                      </button>
                    </div>
                  ))}
                  {calendarLayoutMode === 'compact' && dayItems.length > visibleDayItems.length && (
                    <div className="calendar-more-count">+{dayItems.length - visibleDayItems.length}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
      )}

      {viewMode === 'calendar' && selectedCalendarDate && (
        <div className="calendar-day-modal-overlay" onClick={() => setSelectedCalendarDate(null)}>
          <div className="calendar-day-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="calendar-day-modal-head">
              <div>
                <span>일자별 전체보기</span>
                <h3>
                  {getCalendarDateLabel(selectedCalendarDate)}
                  <em>{selectedCalendarDateItems.length}</em>
                </h3>
              </div>
              <button type="button" onClick={() => setSelectedCalendarDate(null)} aria-label="닫기">
                <i className="ri-close-line" aria-hidden="true"></i>
              </button>
            </div>
            <div className="calendar-day-modal-list">
              {selectedCalendarDateItems.length > 0 ? selectedCalendarDateItems.map(item => (
                <div key={item.id} className={`calendar-day-modal-item status-${item.tab}`}>
                  <button
                    type="button"
                    className={`modal-item-thumb ${item.imageUrl ? '' : 'is-empty'}`}
                    onClick={() => item.imageUrl && setZoomImage(item.imageUrl)}
                    aria-label={item.imageUrl ? `${item.title} 이미지 크게보기` : '이미지 없음'}
                  >
                    {item.imageUrl ? <img src={item.imageUrl} alt="" loading="lazy" /> : <i className="ri-image-line" aria-hidden="true"></i>}
                  </button>
                  <button type="button" className="modal-item-main" onClick={() => handleCalendarDetailItemClick(item)}>
                    <span>{CALENDAR_TAB_LABELS[item.tab]}</span>
                    <strong>{item.time ? `${item.time} ` : ''}{item.title}</strong>
                    <em>{[item.location, item.keyword].filter(Boolean).join(' · ') || '상세 정보 없음'}</em>
                  </button>
                  {item.sourceUrl && (
                    <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" onClick={(event) => event.stopPropagation()}>
                      원본
                    </a>
                  )}
                  <button
                    type="button"
                    className="modal-item-hide"
                    onClick={() => hideCalendarItem(item)}
                    aria-label={`${item.title} 숨기기`}
                  >
                    <i className="ri-eye-off-line" aria-hidden="true"></i>
                  </button>
                </div>
              )) : (
                <div className="calendar-day-modal-empty">표시할 항목이 없습니다.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {viewMode === 'list' && scopeFilter === 'tango' && (
        <section className="tango-scene-panel" aria-label="탱고 씬맵">
          <div className="tango-scene-panel-head">
            <div>
              <span className="tango-scene-kicker">Tango Scene Map</span>
              <h2>탱고 라이브 일정과 장소 흐름</h2>
              <p>반복 밀롱가 허브는 후보 저장보다 씬 지도로 먼저 관리합니다. 공식 포스터가 확인된 대회/페스티벌만 행사 후보로 승격합니다.</p>
            </div>
            <div className="tango-scene-actions">
              <a href="https://ktnow.kr/" target="_blank" rel="noopener noreferrer">Tango NOW</a>
              <a href="https://tangocalendar.kr/" target="_blank" rel="noopener noreferrer">Tango Calendar</a>
            </div>
          </div>

          {tangoSceneLoading && <div className="tango-scene-status">탱고 씬맵을 불러오는 중...</div>}
          {tangoSceneError && <div className="tango-scene-status is-error">{tangoSceneError}</div>}

          {tangoSceneMap && (
            <>
              <div className="tango-scene-metrics">
                <div>
                  <strong>{tangoSceneMap.counts.today}</strong>
                  <span>오늘 일정</span>
                </div>
                <div>
                  <strong>{tangoSceneMap.counts.week}</strong>
                  <span>이번주 일정</span>
                </div>
                <div>
                  <strong>{tangoSceneMap.counts.month}</strong>
                  <span>이번달 일정</span>
                </div>
                <div>
                  <strong>{tangoSceneMap.venueCandidates.length}</strong>
                  <span>장소 후보</span>
                </div>
              </div>

              {tangoSceneMap.health && !tangoSceneMap.health.calendarOk && (
                <div className="tango-scene-status is-warning">
                  일부 범위 수집 실패: {tangoSceneMap.health.failedRanges?.map(item => `${item.label}(${item.error})`).join(', ')}
                </div>
              )}

              <div className="tango-scene-grid">
                <div className="tango-scene-card">
                  <div className="tango-scene-card-title">
                    <strong>{tangoSceneMap.todayEvents.length ? '오늘 탱고 일정' : '이번주 탱고 일정'}</strong>
                    <span>{tangoSceneMap.generatedFor}</span>
                  </div>
                  <div className="tango-live-list">
                    {tangoPreviewEvents.length ? tangoPreviewEvents.map(event => (
                      <a key={event.id} href={event.sourceUrl || 'https://tangocalendar.kr/'} target="_blank" rel="noopener noreferrer" className="tango-live-item">
                        <strong>{event.title}</strong>
                        <span>{event.startKst || event.date || '날짜 미정'}</span>
                        <em>{event.venue || '장소 미정'}{event.djName ? ` · DJ ${event.djName}` : ''}{event.entranceFee ? ` · ${event.entranceFee}` : ''}</em>
                      </a>
                    )) : (
                      <div className="tango-scene-empty">표시할 라이브 일정이 없습니다.</div>
                    )}
                  </div>
                </div>

                <div className="tango-scene-card">
                  <div className="tango-scene-card-title">
                    <strong>상위 장소 흐름</strong>
                    <span>venue density</span>
                  </div>
                  <div className="tango-venue-list">
                    {tangoSceneMap.venueCandidates.slice(0, 8).map(venue => (
                      <div key={venue.name} className="tango-venue-item">
                        <strong>{venue.name}</strong>
                        <span>{venue.count}회</span>
                        <em>{venue.topTitles?.slice(0, 2).map(item => item.name).join(', ') || '대표 일정 확인 필요'}</em>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="tango-scene-card">
                  <div className="tango-scene-card-title">
                    <strong>소스 정책</strong>
                    <span>{tangoSceneMap.sources.length} sources</span>
                  </div>
                  <div className="tango-source-list">
                    {tangoSceneMap.sources.map(source => (
                      <a key={source.id} href={source.url} target="_blank" rel="noopener noreferrer">
                        <strong>{source.name}</strong>
                        <span>{source.role}</span>
                        <em>{source.policy}</em>
                      </a>
                    ))}
                  </div>
                </div>

                <div className="tango-scene-card">
                  <div className="tango-scene-card-title">
                    <strong>공식 행사 축</strong>
                    <span>candidate axes</span>
                  </div>
                  <div className="tango-major-list">
                    {tangoSceneMap.knownMajorEvents.map(event => (
                      <a key={event.sourceUrl} href={event.sourceUrl} target="_blank" rel="noopener noreferrer">
                        <strong>{event.name}</strong>
                        <span>{event.date} · {event.venue}</span>
                      </a>
                    ))}
                  </div>
                </div>
              </div>

              {tangoSceneMap.candidateWrite && (
                <div className="tango-scene-note">
                  <strong>후보 저장 정책</strong>
                  <span>{tangoSceneMap.candidateWrite.reason}</span>
                  <em>이번주 허브 일정 {tangoSceneMap.candidateWrite.total}건 중 이미지 기반 저장 후보 {tangoSceneMap.candidateWrite.imageBacked}건</em>
                </div>
              )}
            </>
          )}
        </section>
      )}

      {/* 일괄 액션 바 */}
      {viewMode === 'list' && selectedIds.size > 0 && (
        <div className="bulk-action-bar">
          <span className="bulk-count">{selectedIds.size}개 선택됨</span>
          {bulkProgress ? (
            <span className="bulk-progress">{bulkProgress}</span>
          ) : (
            <>
              <button className="bulk-btn bulk-btn-ignore" onClick={handleBulkIgnore}>일괄 제외</button>
              {activeTab !== 'collected' && (
                <button className="bulk-btn bulk-btn-collect" onClick={handleBulkCollect}>일괄 완료(이미등록)</button>
              )}
              <button className="bulk-btn bulk-btn-register" onClick={handleBulkRegister}>
                {activeTab === 'collected' ? '일괄 등록/재등록' : '일괄 등록'}
              </button>
            </>
          )}
        </div>
      )}

      {viewMode === 'list' && (loading ? (
        <div className="loading-state">데이터를 불러오는 중...</div>
      ) : (
        <>
          <section className="candidate-list-panel" aria-label="수집 후보 리스트">
            <div className="candidate-list-head">
              <div>
                <span>수집 후보</span>
                <h2>
                  {CALENDAR_TAB_LABELS[activeTab]} 리스트
                  <em>{visibleFilteredEvents.length}</em>
                  {totalCount !== visibleFilteredEvents.length && <b>전체 {totalCount}</b>}
                </h2>
              </div>
              <button type="button" className="candidate-list-refresh" onClick={() => fetchScrapedEvents(1, activeTab, scopeFilter)}>
                <i className="ri-refresh-line" aria-hidden="true"></i>
                새로고침
              </button>
            </div>
            {listError && (
              <div className="list-error-banner">
                <strong>리스트 API 연결 실패</strong>
                <span>{listError}</span>
              </div>
            )}
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>
                      <input
                        type="checkbox"
                        checked={visibleFilteredEvents.length > 0 && selectedIds.size === visibleFilteredEvents.length}
                        onChange={toggleSelectAll}
                      />
                    </th>
                    <th style={{ width: 32, textAlign: 'center', color: '#888', fontSize: '0.75rem' }}>#</th>
                    <th>미리보기</th>
                    <th>날짜 / 제목</th>
                    <th>장소</th>
                    <th>출처</th>
                    <th>액션</th>
                  </tr>
                </thead>
                <tbody>
              {visibleFilteredEvents.map((event) => {
                const activity = detectIngestorActivity(event);
                const activityLabel = getIngestorActivityLabel(event);
                const genreMeta = getIngestorGenreMeta(event);
                const rowTags = getIngestorTags(event);
                const posterUrl = resolveProductionAssetUrl(event.poster_url);

                return (
                <tr id={`ingestor-v2-row-${event.id}`} key={event.id} className={`${processingId === event.id ? 'row-processing' : ''} ${selectedIds.has(event.id) ? 'row-selected' : ''}`}>
                  <td className="col-check">
                    <input type="checkbox" checked={selectedIds.has(event.id)} onChange={() => toggleSelect(event.id)} />
                  </td>
                  <td
                    style={{ textAlign: 'center', fontSize: '0.75rem', color: '#888', fontWeight: 700, minWidth: 28 }}
                    title={event.display_no ? `표시번호 #${event.display_no}` : `DB ID: ${event.id}`}
                  >
                    {event.display_no ? `#${event.display_no}` : event.id.slice(0, 6)}
                  </td>
                  <td className="col-preview col-clickable" onClick={() => toggleSelect(event.id)}>
                    {posterUrl ? (
                      <div className="thumbnail-box" onClick={e => { e.stopPropagation(); setZoomImage(posterUrl); }}>
                        <img src={posterUrl} alt="thumbnail" loading="lazy" />
                        <span className="zoom-hint">🔍 크게보기</span>
                      </div>
                    ) : <div className="no-image">이미지 미수집</div>}
                  </td>
                  <td className="col-info col-clickable" onClick={() => toggleSelect(event.id)}>
                    <div className="row-date-line">
                      <span className="row-date">{event.structured_data.date} ({event.structured_data.day || '요일미정'})</span>
                      <span className={`event-type-badge type-badge-${activity}`}>{activityLabel}</span>
                    </div>
                    <div className="row-title">{event.structured_data.title}</div>
                    <div className="row-taxonomy">
                      <span>{genreMeta.familyLabel}</span>
                      <span>{genreMeta.genreLabel}</span>
                      {rowTags.slice(0, 4).map((tag) => (
                        <em key={tag}>{getIngestorTagLabel(tag)}</em>
                      ))}
                    </div>
                    {activeTab === 'duplicate' && event.structured_data._duplicate && (
                      <div className="duplicate-match-card">
                        <div className="duplicate-match-head">
                          <strong>중복 후보</strong>
                          <span>{event.structured_data._duplicate.target === 'events' ? '캘린더 등록DB' : '수집DB'} #{event.structured_data._duplicate.existingId}</span>
                        </div>
                        <div className="duplicate-match-title">
                          {event.structured_data._duplicate.existingTitle || '기존 제목 확인 필요'}
                        </div>
                        <div className="duplicate-match-meta">
                          <span>{event.structured_data._duplicate.existingDate || '날짜 미기록'}</span>
                          <span>{event.structured_data._duplicate.reason || '사유 미기록'}</span>
                        </div>
                        {event.structured_data._duplicate.existingSourceUrl && (
                          <a
                            href={event.structured_data._duplicate.existingSourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                          >
                            기존 원본 열기
                          </a>
                        )}
                      </div>
                    )}
                    <div className="row-keyword">출처 키워드: {event.keyword}</div>
                  </td>
                  <td className="col-venue">
                    <div className="venue-cell">
                      <span>{event.structured_data.location || '장소미정'}</span>
                      <button className="btn-venue-pin" onClick={() => openVenueModal(event.id)} title="장소 수정">📍</button>
                    </div>
                    {event.structured_data.address && (
                      <div className="venue-addr">{event.structured_data.address}</div>
                    )}
                  </td>
                  <td className="col-source">
                    <a href={event.source_url} target="_blank" rel="noopener noreferrer" className="btn-source-link">
                      🌏 원본
                    </a>
                  </td>
                  <td className="col-actions">
                    <div className="btn-group">
                      <button className="btn-register" onClick={() => { setSelectedEvent(event); setIsEditModalOpen(true); }}>등록</button>
                      <button className="btn-crop" onClick={async () => {
                        setSelectedEvent(event);
                        if (posterUrl) {
                          try {
                            const res = await fetch(posterUrl);
                            const blob = await res.blob();
                            const reader = new FileReader();
                            reader.onloadend = () => { setCropImageSrc(reader.result as string); setIsCropModalOpen(true); };
                            reader.readAsDataURL(blob);
                          } catch { setCropImageSrc(posterUrl); setIsCropModalOpen(true); }
                        } else { setCropImageSrc(null); setIsCropModalOpen(true); }
                      }}>이미지</button>
                      {activeTab === 'duplicate' && (
                        <button className="btn-restore" onClick={() => handleRestoreDuplicate(event)}>신규전환</button>
                      )}
                      <button className="btn-dismiss" onClick={async () => {
                        if (!confirm(`"${event.structured_data.title}" 을 삭제할까요?`)) return;
                        await fetch('/api/scraped-events', {
                          method: 'DELETE',
                          headers: await getAdminRequestHeaders(true),
                          body: JSON.stringify({ id: event.id }),
                        });
                        setScrapedEvents(prev => prev.filter(e => e.id !== event.id));
                        setSelectedIds(prev => {
                          if (!prev.has(event.id)) return prev;
                          const next = new Set(prev);
                          next.delete(event.id);
                          return next;
                        });
                        await fetchTabCounts();
                        await Promise.all([refreshCalendarEvents(), refreshOperationalEvents()]);
                      }}>제외</button>
                    </div>
                  </td>
                </tr>
                );
              })}
                </tbody>
              </table>
              {visibleFilteredEvents.length === 0 && (
                <div className="empty-state">
                  {listError
                    ? '리스트 데이터를 다시 불러오지 못했습니다. 로컬 DB 연결 또는 운영 DB 터널을 확인하세요.'
                    : scopeFilter === 'tango'
                      ? '탱고 DB 후보는 비어 있습니다. 위 씬맵에서 라이브 일정과 장소 흐름을 확인하세요.'
                      : '해당 탭에 데이터가 없습니다.'}
                </div>
              )}
            </div>
          </section>

          <section className="operational-db-panel" aria-label="운영 DB 리스트">
            <div className="operational-db-head">
              <div>
                <span>Operational DB</span>
                <h2>
                  운영 DB 리스트
                  <em>{operationalListItems.length}</em>
                  {operationalLoading && <b>로드중</b>}
                </h2>
              </div>
              <div className="ingestor-v2-calendar-month-nav">
                <button type="button" onClick={() => handleCalendarMonthShift(-1)} aria-label="이전 달" title="이전 달">
                  <i className="ri-arrow-left-s-line" aria-hidden="true"></i>
                </button>
                <strong>{calendarMonthLabel}</strong>
                <button type="button" onClick={() => handleCalendarMonthShift(1)} aria-label="다음 달" title="다음 달">
                  <i className="ri-arrow-right-s-line" aria-hidden="true"></i>
                </button>
                <button type="button" className="calendar-today-btn" onClick={handleCalendarToday}>오늘</button>
              </div>
            </div>

            <div className="operational-db-table-wrap">
              <table className="operational-db-table">
                <thead>
                  <tr>
                    <th>이미지</th>
                    <th>날짜 / 제목</th>
                    <th>장소</th>
                    <th>출처</th>
                  </tr>
                </thead>
                <tbody>
                  {operationalListItems.map(item => (
                    <tr key={item.id}>
                      <td className="operational-db-image-cell">
                        {item.imageUrl ? (
                          <button type="button" className="operational-db-thumb" onClick={() => setZoomImage(item.imageUrl || null)}>
                            <img src={item.imageUrl} alt="" loading="lazy" />
                            <span>크게</span>
                          </button>
                        ) : (
                          <div className="operational-db-no-image">이미지 없음</div>
                        )}
                      </td>
                      <td>
                        <div className="operational-db-title-cell">
                          <span>{item.date}{item.time ? ` · ${item.time}` : ''}</span>
                          <strong>{item.title}</strong>
                          <em>{item.keyword || '운영 DB'}</em>
                        </div>
                      </td>
                      <td>
                        <div className="operational-db-location">{item.location || '장소미정'}</div>
                      </td>
                      <td>
                        {item.sourceUrl ? (
                          <a className="operational-db-link" href={item.sourceUrl} target="_blank" rel="noopener noreferrer">원본</a>
                        ) : (
                          <span className="operational-db-muted">없음</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!operationalLoading && operationalListItems.length === 0 && (
                <div className="operational-db-empty">해당 월 운영 DB 이벤트가 없습니다.</div>
              )}
            </div>
          </section>
        </>
      ))}

      {/* Lightbox Zoom */}
      {zoomImage && (
        <div className="lightbox-overlay" onClick={() => setZoomImage(null)}>
          <div className="lightbox-content">
            <img src={zoomImage} alt="zoom" />
            <button className="lightbox-close-btn">닫기</button>
          </div>
        </div>
      )}

      {/* Modals */}
      {selectedEvent && (
        <>
            <EventEditModal
                isOpen={isEditModalOpen}
                onClose={() => { setIsEditModalOpen(false); setSelectedEvent(null); }}
                event={selectedEvent}
                venues={venues}
                onSuccess={handleRegistrationSuccess}
            />
            <ImageCropModal
                key={cropKey}
                isOpen={isCropModalOpen}
                onClose={() => { setIsCropModalOpen(false); setSelectedEvent(null); setCropImageSrc(null); }}
                imageUrl={cropImageSrc || ''}
                onChangeImage={() => fileInputRef.current?.click()}
                onImageUpdate={(file) => {
                    const reader = new FileReader();
                    reader.onloadend = () => {
                        setCropImageSrc(reader.result as string);
                        setCropKey(k => k + 1); // 모달 리마운트해서 내부 상태 초기화
                    };
                    reader.readAsDataURL(file);
                }}
                onCropComplete={async (_file, previewUrl) => {
                    try {
                        const target = scrapedEvents.find(e => e.id === selectedEvent.id);
                        console.log('[ImageSave] target:', target?.id, '| previewUrl length:', previewUrl?.length);
                        if (!target) { console.error('[ImageSave] target not found'); return; }
                        const body = { ...target, imageData: previewUrl };
                        console.log('[ImageSave] POST body keys:', Object.keys(body));
                        const res = await fetch('/api/scraped-events', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(body),
                        });
                        const result = await res.json();
                        console.log('[ImageSave] response:', res.status, result);
                        if (!res.ok) throw new Error(result?.error || '이미지 저장 실패');
                        await fetchScrapedEvents();
                        console.log('[ImageSave] 완료');
                    } catch (err: any) {
                        console.error('[ImageSave] 실패:', err);
                        alert(`이미지 저장 실패: ${err.message}`);
                    }
                    setIsCropModalOpen(false);
                    setSelectedEvent(null);
                    setCropImageSrc(null);
                }}
            />
        </>
      )}

      {/* 페이지네이션 */}
      {totalCount > 30 && (
        <div className="pagination">
          <button disabled={currentPage === 1} onClick={() => fetchScrapedEvents(currentPage - 1)}>◀</button>
          <span>{currentPage} / {Math.ceil(totalCount / 30)} 페이지 ({totalCount}건)</span>
          <button disabled={currentPage >= Math.ceil(totalCount / 30)} onClick={() => fetchScrapedEvents(currentPage + 1)}>▶</button>
        </div>
      )}

      {/* 이미지 파일 선택용 hidden input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          console.log('[FileInput] 파일 선택됨:', file.name, file.size);
          // 모달 닫기 → 이미지 교체 → 다시 열기 (isOpen false→true 보장하여 크롭상태 리셋)
          setIsCropModalOpen(false);
          const reader = new FileReader();
          reader.onloadend = () => {
            console.log('[FileInput] DataURL 변환 완료, 모달 재오픈');
            setCropImageSrc(reader.result as string);
            setCropKey(k => k + 1);
            setIsCropModalOpen(true);
          };
          reader.readAsDataURL(file);
          e.target.value = '';
        }}
      />

      {/* 장소 선택 모달 (V1 방식: scraped_events에 바로 저장) */}
      <React.Suspense fallback={null}>
        <VenueSelectModal
          isOpen={isVenueModalOpen}
          onClose={() => { setIsVenueModalOpen(false); setVenueTargetId(null); }}
          onSelect={handleVenueSelect}
          onManualInput={(name, _link, addr) => {
            console.log('[IngestorV2] onManualInput 호출:', { name, _link, addr, venueTargetId });
            if (!venueTargetId) { console.warn('[IngestorV2] venueTargetId가 null! 적용 불가'); return; }
            handleUpdateVenueField(venueTargetId, name, addr || '', null, _link || '');
            setIsVenueModalOpen(false);
            setVenueTargetId(null);
          }}
        />
      </React.Suspense>
    </div>
  );
};

export default EventIngestorV2;
