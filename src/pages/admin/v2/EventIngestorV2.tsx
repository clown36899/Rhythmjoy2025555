import React, { useState, useEffect, useRef, useMemo } from 'react';
import ImageCropModal from '../../../components/ImageCropModal';
import EventEditModal from './components/EventEditModal';
import { useAuth } from '../../../contexts/AuthContext';
import { cafe24 as prodClient } from '../../../lib/cafe24Client';
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

const EventIngestorV2: React.FC = () => {
  const { isAdmin, isAuthCheckComplete } = useAuth();
  const [scrapedEvents, setScrapedEvents] = useState<ScrapedEvent[]>([]);
  const [loading, setLoading] = useState(true);
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

  const getAdminRequestHeaders = async (withJson = false): Promise<Record<string, string>> => {
    const { data } = await prodClient.auth.getSession();
    const token = data.session?.access_token;
    return {
      ...(withJson ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  };

  const resetSecondaryFilters = () => {
    setActivityFilter('전체');
    setFamilyFilter('all');
    setTagFilter('all');
  };

  const handleTabChange = (tab: TabKey) => {
    setActiveTab(tab);
    setSelectedIds(new Set());
    setCurrentPage(1);
    resetSecondaryFilters();
  };

  const handleScopeChange = (scope: ScopeFilter) => {
    setScopeFilter(scope);
    setSelectedIds(new Set());
    setCurrentPage(1);
    resetSecondaryFilters();
  };

  const buildScrapedEventsUrl = (page: number, tab: TabKey, scope: ScopeFilter) => {
    const params = new URLSearchParams({ page: String(page), tab });
    if (scope !== 'all') params.set('scope', scope);
    return `/api/scraped-events?${params.toString()}`;
  };

  const fetchScrapedEvents = async (page = 1, tab = activeTab, scope = scopeFilter) => {
    if (!isAuthCheckComplete || !isAdmin) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const res = await fetch(buildScrapedEventsUrl(page, tab, scope), {
        headers: await getAdminRequestHeaders(),
      });
      if (!res.ok) throw new Error('데이터를 불러오지 못했습니다.');
      const json = await res.json();
      setScrapedEvents(json.data || json);
      setTotalCount(json.total || 0);
      setCurrentPage(page);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchTabCounts = async (scope = scopeFilter) => {
    if (!isAuthCheckComplete || !isAdmin) {
      setTabCounts({ new: 0, collected: 0, duplicate: 0 });
      return;
    }

    try {
      const scopeQuery = scope === 'all' ? '' : `&scope=${scope}`;
      const headers = await getAdminRequestHeaders();
      const [resNew, resCollected, resDuplicate] = await Promise.all([
        fetch(`/api/scraped-events?page=1&tab=new${scopeQuery}`, { headers }),
        fetch(`/api/scraped-events?page=1&tab=collected${scopeQuery}`, { headers }),
        fetch(`/api/scraped-events?page=1&tab=duplicate${scopeQuery}`, { headers }),
      ]);
      const [jsonNew, jsonCollected, jsonDuplicate] = await Promise.all([resNew.json(), resCollected.json(), resDuplicate.json()]);
      setTabCounts({ new: jsonNew.total || 0, collected: jsonCollected.total || 0, duplicate: jsonDuplicate.total || 0 });
    } catch (err) {
      console.error('탭 카운트 로드 실패:', err);
    }
  };

  useEffect(() => {
    if (!isAuthCheckComplete || !isAdmin) return;
    fetchScrapedEvents(1, activeTab, scopeFilter);
    fetchTabCounts(scopeFilter);
  }, [activeTab, scopeFilter, isAdmin, isAuthCheckComplete]);

  useEffect(() => {
    if (!isAuthCheckComplete || !isAdmin) {
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
  }, [isAdmin, isAuthCheckComplete]);

  useEffect(() => {
    if (!isAuthCheckComplete || !isAdmin) return;
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
  }, [scopeFilter, isAdmin, isAuthCheckComplete]);

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
      fetchTabCounts();
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
    if (selectedIds.size === filteredEvents.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredEvents.map(e => e.id)));
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
    fetchTabCounts();
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
    const targets = filteredEvents.filter(e => selectedIds.has(e.id));
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
  };

  if (!isAuthCheckComplete) {
    return <div className="ingestor-v2-container">관리자 권한을 확인하는 중...</div>;
  }

  if (!isAdmin) {
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

      {scopeFilter === 'tango' && (
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
      {selectedIds.size > 0 && (
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

      {loading ? (
        <div className="loading-state">데이터를 불러오는 중...</div>
      ) : (
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    checked={filteredEvents.length > 0 && selectedIds.size === filteredEvents.length}
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
              {filteredEvents.map((event) => {
                const activity = detectIngestorActivity(event);
                const activityLabel = getIngestorActivityLabel(event);
                const genreMeta = getIngestorGenreMeta(event);
                const rowTags = getIngestorTags(event);

                return (
                <tr key={event.id} className={`${processingId === event.id ? 'row-processing' : ''} ${selectedIds.has(event.id) ? 'row-selected' : ''}`}>
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
                    {event.poster_url ? (
                      <div className="thumbnail-box" onClick={e => { e.stopPropagation(); setZoomImage(event.poster_url || null); }}>
                        <img src={event.poster_url} alt="thumbnail" loading="lazy" />
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
                        if (event.poster_url) {
                          try {
                            const res = await fetch(event.poster_url);
                            const blob = await res.blob();
                            const reader = new FileReader();
                            reader.onloadend = () => { setCropImageSrc(reader.result as string); setIsCropModalOpen(true); };
                            reader.readAsDataURL(blob);
                          } catch { setCropImageSrc(event.poster_url); setIsCropModalOpen(true); }
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
                      }}>제외</button>
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
          {filteredEvents.length === 0 && (
            <div className="empty-state">
              {scopeFilter === 'tango'
                ? '탱고 DB 후보는 비어 있습니다. 위 씬맵에서 라이브 일정과 장소 흐름을 확인하세요.'
                : '해당 탭에 데이터가 없습니다.'}
            </div>
          )}
        </div>
      )}

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
