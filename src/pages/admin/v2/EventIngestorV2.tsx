import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import ImageCropModal from '../../../components/ImageCropModal';
import EventEditModal from './components/EventEditModal';
import { createResizedImages } from '../../../utils/imageResize';
import { supabase as prodSupabase } from '../../../lib/supabase';
const VenueSelectModal = React.lazy(() => import('../../v2/components/VenueSelectModal'));
import './EventIngestorV2.css';

type EventType = '소셜' | '파티/행사' | '강습';

function detectEventType(event: { structured_data: { title?: string; event_type?: EventType | null }; extracted_text?: string; keyword?: string }): EventType {
  if (event.structured_data.event_type) return event.structured_data.event_type;
  const text = `${event.structured_data.title || ''} ${event.extracted_text || ''} ${event.keyword || ''}`.toLowerCase();
  if (/수업|강습|레슨|lesson|workshop|워크샵|class/.test(text)) return '강습';
  if (/소셜/.test(text)) return '소셜';
  return '파티/행사';
}


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
    fee?: string;
    note?: string;
    event_type?: '소셜' | '파티/행사' | '강습' | null;
  };
  is_collected?: boolean;
  status?: 'ignored' | 'collected' | 'pending';
  created_at?: string;
  updated_at?: string;
}

const EventIngestorV2: React.FC = () => {
  const { user } = useAuth();
  const [scrapedEvents, setScrapedEvents] = useState<ScrapedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'new' | 'collected'>('new');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkProgress, setBulkProgress] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<'전체' | '소셜' | '파티/행사' | '강습'>('전체');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [tabCounts, setTabCounts] = useState<{ new: number; collected: number }>({ new: 0, collected: 0 });

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

  const fetchScrapedEvents = async (page = 1, tab = activeTab) => {
    try {
      setLoading(true);
      const res = await fetch(`/.netlify/functions/scraped-events?page=${page}&tab=${tab}`);
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

  const fetchTabCounts = async () => {
    try {
      const [resNew, resCollected] = await Promise.all([
        fetch('/.netlify/functions/scraped-events?page=1&tab=new'),
        fetch('/.netlify/functions/scraped-events?page=1&tab=collected'),
      ]);
      const [jsonNew, jsonCollected] = await Promise.all([resNew.json(), resCollected.json()]);
      setTabCounts({ new: jsonNew.total || 0, collected: jsonCollected.total || 0 });
    } catch (err) {
      console.error('탭 카운트 로드 실패:', err);
    }
  };

  useEffect(() => {
    fetchScrapedEvents(1, activeTab);
    fetchTabCounts();
  }, [activeTab]);

  const filteredEvents = useMemo(() => {
    // 서버에서 tab 기준으로 이미 필터됨 — typeFilter만 클라이언트에서 적용
    if (typeFilter === '전체') return scrapedEvents;
    return scrapedEvents.filter(e => detectEventType(e) === typeFilter);
  }, [scrapedEvents, typeFilter]);

  const handleUpdateStatus = async (id: string, updates: Partial<ScrapedEvent>) => {
    try {
      setProcessingId(id);
      const target = scrapedEvents.find(e => e.id === id);
      if (!target) return;

      const payload = { ...target, ...updates };
      const res = await fetch('/.netlify/functions/scraped-events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error('상태 업데이트 실패');

      setScrapedEvents(prev => prev.map(e => e.id === id ? { ...e, ...updates } : e));
      fetchTabCounts();
    } catch (err) {
      console.error(err);
      alert('업데이트 중 에러 발생');
    } finally {
      setProcessingId(null);
    }
  };

  // V1 방식: 장소 필드 수정 후 scraped-events에 저장
  const handleUpdateVenueField = async (id: string, location: string, address: string, venue_id: any) => {
    console.log('[IngestorV2] handleUpdateVenueField:', { id, location, address, venue_id });
    setScrapedEvents(prev => prev.map(e => {
      if (e.id !== id) return e;
      return { ...e, structured_data: { ...e.structured_data, location, address, venue_id } };
    }));

    try {
      const target = scrapedEvents.find(e => e.id === id);
      console.log('[IngestorV2] target found:', !!target, target?.id);
      if (!target) return;
      const updated = {
        ...target,
        structured_data: { ...target.structured_data, location, address, venue_id }
      };
      const res = await fetch('/.netlify/functions/scraped-events', {
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
    handleUpdateVenueField(venueTargetId, venue.name, venue.address, venue.id);
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
      next.has(id) ? next.delete(id) : next.add(id);
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
    await fetch('/.netlify/functions/scraped-events', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
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
    setSelectedIds(new Set());
    setBulkProgress(null);
  };

  const registerEventToProd = async (event: ScrapedEvent): Promise<string> => {
    const sd = event.structured_data;
    let imageUrls: any = {};
    let storagePath: string | null = null;

    if (event.poster_url) {
      try {
        const imgRes = await fetch(event.poster_url);
        const imgBlob = await imgRes.blob();
        const imgFile = new File([imgBlob], 'poster.png', { type: imgBlob.type });
        const imageFiles = await createResizedImages(imgFile);
        const timestamp = Date.now();
        const folderName = `${timestamp}_${Math.random().toString(36).substring(2, 7)}`;
        storagePath = `social-events/${folderName}`;
        const upload = async (size: string, file: File) => {
          const path = `${storagePath}/${size}.webp`;
          const { error } = await prodSupabase.storage.from('images').upload(path, file, { contentType: 'image/webp', upsert: true });
          if (error) throw error;
          return prodSupabase.storage.from('images').getPublicUrl(path).data.publicUrl;
        };
        const [micro, thumb, med, full] = await Promise.all([
          upload('micro', imageFiles.micro),
          upload('thumbnail', imageFiles.thumbnail),
          upload('medium', imageFiles.medium),
          upload('full', imageFiles.full),
        ]);
        imageUrls = { micro, thumb, med, full };
      } catch (e) {
        console.error('[BulkRegister] 이미지 처리 실패, 이미지 없이 계속:', e);
      }
    }

    const formattedTitle = sd.djs?.length
      ? `DJ ${sd.djs.join(', ')} | ${sd.title}`
      : sd.title;

    const { data: result, error } = await prodSupabase
      .from('events')
      .insert([{
        title: formattedTitle,
        date: sd.date,
        start_date: sd.date,
        location: sd.location || '',
        address: sd.address || '',
        venue_id: sd.venue_id || null,
        venue_name: sd.location || null,
        image: imageUrls.full || event.poster_url || null,
        image_micro: imageUrls.micro || null,
        image_thumbnail: imageUrls.thumb || null,
        image_medium: imageUrls.med || null,
        image_full: imageUrls.full || null,
        storage_path: storagePath,
        description: event.extracted_text,
        category: 'event',
        scope: 'domestic',
        link1: event.source_url || '',
        link_name1: event.keyword || '',
        genre: 'DJ,소셜',
        user_id: '508e4c9e-b180-4c0f-aa98-3e99562a147a',
        group_id: 2,
      }])
      .select()
      .maybeSingle();

    if (error) throw error;

    await fetch('/.netlify/functions/scraped-events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...event, is_collected: true }),
    });

    return result?.id;
  };

  const handleBulkRegister = async () => {
    if (!selectedIds.size) return;
    const targets = filteredEvents.filter(e => selectedIds.has(e.id));
    setBulkProgress(`등록 중... (0/${targets.length})`);
    const errors: string[] = [];
    let i = 0;
    for (const event of targets) {
      try {
        await registerEventToProd(event);
        setBulkProgress(`등록 중... (${++i}/${targets.length})`);
      } catch (e: any) {
        errors.push(`${event.structured_data.title}: ${e.message}`);
        i++;
      }
    }
    setSelectedIds(new Set());
    await fetchScrapedEvents();
    setBulkProgress(null);
    if (errors.length) alert(`일부 실패:\n${errors.join('\n')}`);
    else alert(`${targets.length}개 등록 완료`);
  };

  const handleRegistrationSuccess = async (id: string) => {
    setIsEditModalOpen(false);
    setSelectedEvent(null);
    await fetchScrapedEvents();
  };

  return (
    <div className="ingestor-v2-container">
      <header className="ingestor-v2-header">
        <h1>수집 데이터 센터 V2 (Data-Centric)</h1>
        <div className="tab-group">
          <button className={activeTab === 'new' ? 'active' : ''} onClick={() => { setActiveTab('new'); setSelectedIds(new Set()); }}>신규 {tabCounts.new > 0 && <span className="tab-badge">{tabCounts.new}</span>}</button>
          <button className={activeTab === 'collected' ? 'active' : ''} onClick={() => { setActiveTab('collected'); setSelectedIds(new Set()); }}>완료 {tabCounts.collected > 0 && <span className="tab-badge">{tabCounts.collected}</span>}</button>
        </div>
        <div className="type-filter-group">
          {(['전체', '소셜', '파티/행사', '강습'] as const).map(t => (
            <button key={t} className={`type-filter-btn ${typeFilter === t ? 'active' : ''} type-${t === '전체' ? 'all' : t === '소셜' ? 'social' : t === '파티/행사' ? 'party' : 'lesson'}`} onClick={() => { setTypeFilter(t); setSelectedIds(new Set()); }}>{t}</button>
          ))}
        </div>
      </header>

      {/* 일괄 액션 바 */}
      {selectedIds.size > 0 && (
        <div className="bulk-action-bar">
          <span className="bulk-count">{selectedIds.size}개 선택됨</span>
          {bulkProgress ? (
            <span className="bulk-progress">{bulkProgress}</span>
          ) : (
            <>
              <button className="bulk-btn bulk-btn-ignore" onClick={handleBulkIgnore}>일괄 제외</button>
              <button className="bulk-btn bulk-btn-collect" onClick={handleBulkCollect}>일괄 완료(이미등록)</button>
              {activeTab === 'new' && (
                <button className="bulk-btn bulk-btn-register" onClick={handleBulkRegister}>일괄 등록</button>
              )}
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
                <th>미리보기</th>
                <th>날짜 / 제목</th>
                <th>장소</th>
                <th>출처</th>
                <th>액션</th>
              </tr>
            </thead>
            <tbody>
              {filteredEvents.map(event => (
                <tr key={event.id} className={`${processingId === event.id ? 'row-processing' : ''} ${selectedIds.has(event.id) ? 'row-selected' : ''}`}>
                  <td className="col-check">
                    <input type="checkbox" checked={selectedIds.has(event.id)} onChange={() => toggleSelect(event.id)} />
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
                      <span className={`event-type-badge type-badge-${detectEventType(event) === '소셜' ? 'social' : detectEventType(event) === '강습' ? 'lesson' : 'party'}`}>{detectEventType(event)}</span>
                    </div>
                    <div className="row-title">{event.structured_data.title}</div>
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
                      <button className="btn-dismiss" onClick={async () => {
                        if (!confirm(`"${event.structured_data.title}" 을 삭제할까요?`)) return;
                        await fetch('/.netlify/functions/scraped-events', {
                          method: 'DELETE',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ id: event.id }),
                        });
                        setScrapedEvents(prev => prev.filter(e => e.id !== event.id));
                      }}>제외</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredEvents.length === 0 && <div className="empty-state">해당 탭에 데이터가 없습니다.</div>}
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
                        const res = await fetch('/.netlify/functions/scraped-events', {
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
            handleUpdateVenueField(venueTargetId, name, addr || '', null);
            setIsVenueModalOpen(false);
            setVenueTargetId(null);
          }}
        />
      </React.Suspense>
    </div>
  );
};

export default EventIngestorV2;
