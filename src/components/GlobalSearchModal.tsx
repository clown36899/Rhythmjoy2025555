import { useState, useEffect, memo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import EventDetailModal from '../pages/v2/components/EventDetailModal';
import LocalLoading from './LocalLoading';
import VenueDetailModal from '../pages/practice/components/VenueDetailModal';
import ShopDetailModal from '../pages/shopping/components/ShopDetailModal';
import type { Event } from '../lib/supabase';
import type { Shop } from '../pages/shopping/page';
import { useModalHistory } from '../hooks/useModalHistory';
import { getOptimizedImageUrl } from '../utils/getEventThumbnail';
import './GlobalSearchModal.css';

interface SearchResult {
    id: string;
    title: string;
    description?: string;
    type: 'event' | 'practice_room' | 'shopping' | 'social_place' | 'board_post';
    thumbnail?: string;
    date?: string;
    category?: string;
}

interface GlobalSearchModalProps {
    isOpen: boolean;
    onClose: () => void;
    searchQuery?: string;
}

const EVENT_CATEGORIES = [
    { key: 'event', label: '행사' },
    { key: 'class', label: '강습' },
    { key: 'club', label: '동호회' },
    { key: 'social', label: '소셜' },
];

const SEARCH_SCOPES = [
    { key: 'events', label: '행사' },
    { key: 'venues', label: '장소' },
    { key: 'shopping', label: '쇼핑' },
    { key: 'board', label: '게시판' },
];

export default memo(function GlobalSearchModal({ isOpen, onClose, searchQuery: initialQuery = '' }: GlobalSearchModalProps) {
    const [localQuery, setLocalQuery] = useState(initialQuery);
    const [includePast, setIncludePast] = useState(false);
    const [activeScopes, setActiveScopes] = useState<Set<string>>(new Set(['events', 'venues', 'shopping', 'board']));
    const [activeCategoryFilter, setActiveCategoryFilter] = useState<string | null>(null);
    const [results, setResults] = useState<{
        events: SearchResult[];
        venues: SearchResult[];
        shopping: SearchResult[];
        board_posts: SearchResult[];
    }>({ events: [], venues: [], shopping: [], board_posts: [] });
    const [loading, setLoading] = useState(false);
    const lastSearchKey = useRef('');

    const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
    const [selectedShop, setSelectedShop] = useState<Shop | null>(null);
    const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null);
    const [showEventDetail, setShowEventDetail] = useState(false);
    const [showShopDetail, setShowShopDetail] = useState(false);

    useEffect(() => { setLocalQuery(initialQuery); }, [initialQuery]);

    useEffect(() => {
        if (!isOpen) return;
        if (localQuery.trim() === '') {
            setResults({ events: [], venues: [], shopping: [], board_posts: [] });
            return;
        }

        const key = `${localQuery}|${includePast}|${[...activeScopes].sort().join(',')}`;
        if (key === lastSearchKey.current) return;

        const timer = setTimeout(() => {
            lastSearchKey.current = key;
            performSearch(localQuery);
        }, 400);

        return () => clearTimeout(timer);
    }, [isOpen, localQuery, includePast, activeScopes]);

    const toggleScope = (scope: string) => {
        setActiveScopes(prev => {
            const next = new Set(prev);
            if (next.has(scope)) {
                if (next.size === 1) return prev;
                next.delete(scope);
            } else {
                next.add(scope);
            }
            return next;
        });
    };

    const performSearch = async (query: string) => {
        setLoading(true);
        const searchTerm = query.toLowerCase();
        const cleanQuery = query.replace(/\s+/g, '').toLowerCase();
        const wildcardQuery = cleanQuery.split('').join('%');
        const today = new Date().toISOString().slice(0, 10);

        try {
            const promises: Promise<any>[] = [];

            if (activeScopes.has('events')) {
                let q = supabase
                    .from('events')
                    .select('id, title, description, image_thumbnail, start_date, date, end_date, category')
                    .or(`title.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%,title.ilike.%${wildcardQuery}%,description.ilike.%${wildcardQuery}%`)
                    .limit(20);
                if (!includePast) {
                    q = q.or(`end_date.gte.${today},date.gte.${today}`);
                }
                promises.push(q.then(r => ({ type: 'events', data: r.data, error: r.error })));
            } else {
                promises.push(Promise.resolve({ type: 'events', data: [], error: null }));
            }

            if (activeScopes.has('venues')) {
                promises.push(
                    supabase.from('venues')
                        .select('id, name, description, images, address, category')
                        .or(`name.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%,address.ilike.%${searchTerm}%,name.ilike.%${wildcardQuery}%,description.ilike.%${wildcardQuery}%`)
                        .limit(10)
                        .then(r => ({ type: 'venues', data: r.data, error: r.error }))
                );
            } else {
                promises.push(Promise.resolve({ type: 'venues', data: [], error: null }));
            }

            if (activeScopes.has('shopping')) {
                promises.push(
                    supabase.from('shops')
                        .select('id, name, description, logo_url')
                        .or(`name.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%,name.ilike.%${wildcardQuery}%,description.ilike.%${wildcardQuery}%`)
                        .limit(10)
                        .then(r => ({ type: 'shopping', data: r.data, error: r.error }))
                );
            } else {
                promises.push(Promise.resolve({ type: 'shopping', data: [], error: null }));
            }

            if (activeScopes.has('board')) {
                promises.push(
                    supabase.from('board_posts')
                        .select('id, title, content, author_nickname')
                        .or(`title.ilike.%${searchTerm}%,content.ilike.%${searchTerm}%,title.ilike.%${wildcardQuery}%,content.ilike.%${wildcardQuery}%`)
                        .limit(10)
                        .then(r => ({ type: 'board', data: r.data, error: r.error }))
                );
            } else {
                promises.push(Promise.resolve({ type: 'board', data: [], error: null }));
            }

            const [eventsRes, venuesRes, shoppingRes, boardRes] = await Promise.all(promises);

            setResults({
                events: (eventsRes.data || []).map((e: any) => ({
                    id: e.id,
                    title: e.title,
                    description: e.description,
                    type: 'event' as const,
                    thumbnail: e.image_thumbnail,
                    date: e.start_date || e.date,
                    category: e.category,
                })),
                venues: (venuesRes.data || []).map((p: any) => ({
                    id: String(p.id),
                    title: p.name,
                    description: p.description,
                    type: 'practice_room' as const,
                    thumbnail: getOptimizedImageUrl(Array.isArray(p.images) ? p.images[0] : typeof p.images === 'string' ? JSON.parse(p.images)[0] : undefined, 100)
                })),
                shopping: (shoppingRes.data || []).map((s: any) => ({
                    id: String(s.id),
                    title: s.name,
                    description: s.description,
                    type: 'shopping' as const,
                    thumbnail: s.logo_url
                })),
                board_posts: (boardRes.data || []).map((bp: any) => ({
                    id: String(bp.id),
                    title: bp.title,
                    description: bp.content,
                    type: 'board_post' as const,
                }))
            });
        } catch (error) {
            console.error('Search error:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleResultClick = async (result: SearchResult) => {
        try {
            switch (result.type) {
                case 'event': {
                    const { data } = await supabase.from('events').select('*').eq('id', result.id).maybeSingle();
                    if (data) { setSelectedEvent(data as Event); setShowEventDetail(true); }
                    break;
                }
                case 'practice_room': {
                    setSelectedVenueId(result.id);
                    break;
                }
                case 'shopping': {
                    const { data } = await supabase.from('shops').select('*').eq('id', result.id).maybeSingle();
                    if (data) { setSelectedShop(data as Shop); setShowShopDetail(true); }
                    break;
                }
                case 'social_place': {
                    window.location.href = `/social?id=${result.id}`;
                    break;
                }
                case 'board_post': {
                    window.location.href = `/board/${result.id}`;
                    break;
                }
            }
        } catch (error) {
            console.error('상세 정보 조회 오류:', error);
        }
    };

    const handleCloseDetailModals = () => {
        setShowEventDetail(false);
        setShowShopDetail(false);
        setSelectedEvent(null);
        setSelectedShop(null);
        setSelectedVenueId(null);
    };

    const getCategoryLabel = (cat?: string) => {
        switch (cat) {
            case 'class': return '강습';
            case 'club': return '동호회';
            case 'social': return '소셜';
            case 'event': return '행사';
            default: return '';
        }
    };

    const filteredEvents = activeCategoryFilter
        ? results.events.filter(e => e.category === activeCategoryFilter)
        : results.events;

    const totalResults = filteredEvents.length + results.venues.length +
        results.shopping.length + results.board_posts.length;

    useModalHistory(isOpen, onClose);

    if (!isOpen) return null;

    return createPortal(
        <div className="search-modal-overlay" onClick={onClose}>
            <div className="search-modal-container" onClick={(e) => e.stopPropagation()}>

                {/* 검색 입력 */}
                <div className="search-modal-header">
                    <div className="search-modal-input-wrapper">
                        <i className="ri-search-line search-input-icon"></i>
                        <input
                            type="text"
                            value={localQuery}
                            onChange={(e) => setLocalQuery(e.target.value)}
                            placeholder="이벤트, 연습실, 소셜, 쇼핑 검색..."
                            className="search-input"
                            autoFocus
                        />
                    </div>
                    <button onClick={onClose} className="search-modal-close">
                        <i className="ri-close-line"></i>
                    </button>
                </div>

                {/* 검색 옵션 바 — 범위 칩 + 과거 포함 토글 */}
                <div className="search-options-bar">
                    <div className="search-scope-chips">
                        {SEARCH_SCOPES.map(({ key, label }) => (
                            <button
                                key={key}
                                className={`search-chip ${activeScopes.has(key) ? 'is-active' : ''}`}
                                onClick={() => toggleScope(key)}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                    {activeScopes.has('events') && (
                        <label className="search-toggle">
                            <input
                                type="checkbox"
                                checked={includePast}
                                onChange={e => setIncludePast(e.target.checked)}
                            />
                            <span>과거 포함</span>
                        </label>
                    )}
                </div>

                {/* 행사 카테고리 필터 */}
                {activeScopes.has('events') && results.events.length > 0 && (
                    <div className="search-category-bar">
                        <button
                            className={`search-cat-chip ${activeCategoryFilter === null ? 'is-active' : ''}`}
                            onClick={() => setActiveCategoryFilter(null)}
                        >
                            전체 {results.events.length}
                        </button>
                        {EVENT_CATEGORIES
                            .filter(c => results.events.some(e => e.category === c.key))
                            .map(({ key, label }) => (
                                <button
                                    key={key}
                                    className={`search-cat-chip cat-${key} ${activeCategoryFilter === key ? 'is-active' : ''}`}
                                    onClick={() => setActiveCategoryFilter(prev => prev === key ? null : key)}
                                >
                                    {label} {results.events.filter(e => e.category === key).length}
                                </button>
                            ))}
                    </div>
                )}

                <div className="search-modal-content">
                    {loading ? (
                        <div className="search-loading">
                            <LocalLoading message="검색 중..." size="md" />
                        </div>
                    ) : localQuery.trim() === '' ? (
                        <div className="search-empty">
                            <i className="ri-search-line"></i>
                            <p>검색어를 입력해주세요.</p>
                        </div>
                    ) : totalResults === 0 ? (
                        <div className="search-empty">
                            <i className="ri-search-line"></i>
                            <p>"{localQuery}"에 대한 검색 결과가 없습니다.</p>
                        </div>
                    ) : (
                        <>
                            {filteredEvents.length > 0 && (
                                <div className="search-section">
                                    <h3 className="search-section-title">
                                        행사
                                        <span className="search-section-count">{filteredEvents.length}</span>
                                        {!includePast && <span className="search-future-badge">미래만</span>}
                                    </h3>
                                    <div className="search-results-grid">
                                        {filteredEvents.map((result) => (
                                            <div key={result.id} className="search-result-item" onClick={() => handleResultClick(result)}>
                                                {result.thumbnail && (
                                                    <img src={result.thumbnail} alt={result.title} className="search-result-image" />
                                                )}
                                                <div className="search-result-info">
                                                    <div className="search-result-meta">
                                                        {result.category && (
                                                            <span className={`search-cat-badge cat-${result.category}`}>
                                                                {getCategoryLabel(result.category)}
                                                            </span>
                                                        )}
                                                        {result.date && (
                                                            <span className="search-result-date">
                                                                {new Date(result.date).toLocaleDateString('ko-KR')}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <h4 className="search-result-title">{result.title}</h4>
                                                    {result.description && (
                                                        <p className="search-result-description">{result.description}</p>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {results.venues.length > 0 && (
                                <div className="search-section">
                                    <h3 className="search-section-title">장소 안내 <span className="search-section-count">{results.venues.length}</span></h3>
                                    <div className="search-results-grid">
                                        {results.venues.map((result) => (
                                            <div key={result.id} className="search-result-item" onClick={() => handleResultClick(result)}>
                                                {result.thumbnail && (
                                                    <img src={result.thumbnail} alt={result.title} className="search-result-image" />
                                                )}
                                                <div className="search-result-info">
                                                    <h4 className="search-result-title">{result.title}</h4>
                                                    {result.description && <p className="search-result-description">{result.description}</p>}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {results.shopping.length > 0 && (
                                <div className="search-section">
                                    <h3 className="search-section-title">쇼핑 <span className="search-section-count">{results.shopping.length}</span></h3>
                                    <div className="search-results-grid">
                                        {results.shopping.map((result) => (
                                            <div key={result.id} className="search-result-item" onClick={() => handleResultClick(result)}>
                                                {result.thumbnail && (
                                                    <img src={result.thumbnail} alt={result.title} className="search-result-image" />
                                                )}
                                                <div className="search-result-info">
                                                    <h4 className="search-result-title">{result.title}</h4>
                                                    {result.description && <p className="search-result-description">{result.description}</p>}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {results.board_posts.length > 0 && (
                                <div className="search-section">
                                    <h3 className="search-section-title">자유게시판 <span className="search-section-count">{results.board_posts.length}</span></h3>
                                    <div className="search-results-grid">
                                        {results.board_posts.map((result) => (
                                            <div key={result.id} className="search-result-item" onClick={() => handleResultClick(result)}>
                                                <div className="search-result-info">
                                                    <h4 className="search-result-title">{result.title}</h4>
                                                    {result.description && <p className="search-result-description">{result.description}</p>}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            {selectedVenueId && (
                <VenueDetailModal venueId={selectedVenueId} onClose={handleCloseDetailModals} />
            )}

            {showEventDetail && selectedEvent && (
                <EventDetailModal
                    event={selectedEvent}
                    isOpen={showEventDetail}
                    onClose={handleCloseDetailModals}
                    onEdit={() => { }}
                    onDelete={() => { }}
                    isAdminMode={false}
                />
            )}

            {showShopDetail && selectedShop && (
                <ShopDetailModal
                    shop={selectedShop}
                    isOpen={showShopDetail}
                    onClose={handleCloseDetailModals}
                    onUpdate={() => { }}
                />
            )}
        </div>,
        document.body
    );
});
