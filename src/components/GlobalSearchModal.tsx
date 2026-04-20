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
}

interface GlobalSearchModalProps {
    isOpen: boolean;
    onClose: () => void;
    searchQuery?: string;
}

export default memo(function GlobalSearchModal({ isOpen, onClose, searchQuery: initialQuery = '' }: GlobalSearchModalProps) {
    const [localQuery, setLocalQuery] = useState(initialQuery);
    const [results, setResults] = useState<{
        events: SearchResult[];
        venues: SearchResult[];
        shopping: SearchResult[];
        board_posts: SearchResult[];
    }>({
        events: [],
        venues: [],
        shopping: [],
        board_posts: []
    });
    const [loading, setLoading] = useState(false);
    const lastSearchQuery = useRef('');

    // 상세 모달 상태 관리
    const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
    const [selectedShop, setSelectedShop] = useState<Shop | null>(null);
    const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null);
    const [showEventDetail, setShowEventDetail] = useState(false);
    const [showShopDetail, setShowShopDetail] = useState(false);

    useEffect(() => {
        setLocalQuery(initialQuery);
    }, [initialQuery]);

    useEffect(() => {
        if (!isOpen) return;

        if (localQuery.trim() === '') {
            setResults({ events: [], venues: [], shopping: [], board_posts: [] });
            return;
        }

        if (localQuery === lastSearchQuery.current) return;

        const timer = setTimeout(() => {
            lastSearchQuery.current = localQuery;
            performSearch(localQuery);
        }, 400);

        return () => clearTimeout(timer);
    }, [isOpen, localQuery]);

    const performSearch = async (query: string) => {
        setLoading(true);
        const searchTerm = query.toLowerCase();
        const cleanQuery = query.replace(/\s+/g, '').toLowerCase();
        const wildcardQuery = cleanQuery.split('').join('%'); // '조제빠코' -> '조%제%빠%코'

        try {
            // Search events
            const { data: eventsData, error: eventsError } = await supabase
                .from('events')
                .select('id, title, description, image_thumbnail, start_date')
                .or(`title.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%,title.ilike.%${wildcardQuery}%,description.ilike.%${wildcardQuery}%`)
                .limit(15);

            if (eventsError) {
                console.error('Events search error:', eventsError);
            }

            // 포럼 장소안내 검색 (venues 테이블 전체, 카테고리 무관)
            const { data: venuesData, error: venuesError } = await supabase
                .from('venues')
                .select('id, name, description, images, address, category')
                .or(`name.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%,address.ilike.%${searchTerm}%,name.ilike.%${wildcardQuery}%,description.ilike.%${wildcardQuery}%`)
                .limit(10);

            if (venuesError) {
                console.error('Venues search error:', venuesError);
            }

            // Search shops
            const { data: shopsData, error: shopsError } = await supabase
                .from('shops')
                .select('id, name, description, logo_url')
                .or(`name.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%,name.ilike.%${wildcardQuery}%,description.ilike.%${wildcardQuery}%`)
                .limit(10);

            if (shopsError) {
                console.error('Shops search error:', shopsError);
            }

            // Search board posts
            const { data: boardData, error: boardError } = await supabase
                .from('board_posts')
                .select('id, title, content, author_nickname')
                .or(`title.ilike.%${searchTerm}%,content.ilike.%${searchTerm}%,title.ilike.%${wildcardQuery}%,content.ilike.%${wildcardQuery}%`)
                .limit(10);

            if (boardError) {
                console.error('Board posts search error:', boardError);
            }

            setResults({
                events: (eventsData || []).map(e => ({
                    id: e.id,
                    title: e.title,
                    description: e.description,
                    type: 'event' as const,
                    thumbnail: e.image_thumbnail,
                    date: e.start_date
                })),
                venues: (venuesData || []).map(p => ({
                    id: String(p.id),
                    title: p.name,
                    description: p.description,
                    type: 'practice_room' as const,
                    thumbnail: getOptimizedImageUrl(Array.isArray(p.images) ? p.images[0] : typeof p.images === 'string' ? JSON.parse(p.images)[0] : undefined, 100)
                })),
                shopping: (shopsData || []).map(s => ({
                    id: String(s.id),
                    title: s.name,
                    description: s.description,
                    type: 'shopping' as const,
                    thumbnail: s.logo_url
                })),
                board_posts: (boardData || []).map(bp => ({
                    id: String(bp.id),
                    title: bp.title,
                    description: bp.content,
                    type: 'board_post' as const,
                    thumbnail: undefined
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
                    // 이벤트 전체 데이터 가져오기
                    const { data, error } = await supabase
                        .from('events')
                        .select('*')
                        .eq('id', result.id)
                        .maybeSingle();

                    if (error) {
                        console.error('이벤트 조회 오류:', error);
                        return;
                    }

                    if (!data) {
                        return;
                    }

                    setSelectedEvent(data as Event);
                    setShowEventDetail(true);
                    break;
                }
                case 'practice_room': {
                    // VenueDetailModal로 상세 표시
                    setSelectedVenueId(result.id);
                    break;
                }
                case 'shopping': {
                    // 쇼핑 전체 데이터 가져오기
                    const { data, error } = await supabase
                        .from('shops')
                        .select('*')
                        .eq('id', result.id)
                        .maybeSingle();

                    if (error) {
                        console.error('쇼핑 조회 오류:', error);
                        return;
                    }

                    if (!data) {
                        return;
                    }

                    setSelectedShop(data as Shop);
                    setShowShopDetail(true);
                    break;
                }
                case 'social_place': {
                    // 소셜 장소는 아직 상세 모달이 없으므로 페이지 이동
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

    const getSectionTitle = (type: string) => {
        switch (type) {
            case 'events':
                return '행사';
            case 'practice_rooms':
                return '장소 안내';
            case 'shopping':
                return '쇼핑';
            case 'social_places':
                return '소셜 장소';
            case 'board_posts':
                return '자유게시판';
            default:
                return '';
        }
    };

    const totalResults = results.events.length + results.venues.length +
        results.shopping.length + results.board_posts.length;

    useModalHistory(isOpen, onClose);

    if (!isOpen) return null;

    return createPortal(
        <div className="search-modal-overlay" onClick={onClose}>
            <div className="search-modal-container" onClick={(e) => e.stopPropagation()}>
                <div className="search-modal-header">
                    <div className="search-modal-input-wrapper" style={{ flex: 1, marginRight: '12px', position: 'relative' }}>
                        <i className="ri-search-line" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }}></i>
                        <input
                            type="text"
                            value={localQuery}
                            onChange={(e) => setLocalQuery(e.target.value)}
                            placeholder="이벤트, 연습실, 소셜, 쇼핑 검색..."
                            style={{ width: '100%', padding: '10px 12px 10px 36px', borderRadius: '8px', border: '1px solid #e5e7eb', outline: 'none', boxSizing: 'border-box', fontSize: '1rem' }}
                            autoFocus
                        />
                    </div>
                    <button onClick={onClose} className="search-modal-close" style={{ flexShrink: 0 }}>
                        <i className="ri-close-line"></i>
                    </button>
                </div>

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
                            {results.events.length > 0 && (
                                <div className="search-section">
                                    <h3 className="search-section-title">{getSectionTitle('events')}</h3>
                                    <div className="search-results-grid">
                                        {results.events.map((result) => (
                                            <div
                                                key={result.id}
                                                className="search-result-item"
                                                onClick={() => handleResultClick(result)}
                                            >
                                                {result.thumbnail && (
                                                    <img src={result.thumbnail} alt={result.title} className="search-result-image" />
                                                )}
                                                <div className="search-result-info">
                                                    <h4 className="search-result-title">{result.title}</h4>
                                                    {result.description && (
                                                        <p className="search-result-description">{result.description}</p>
                                                    )}
                                                    {result.date && (
                                                        <p className="search-result-date">{new Date(result.date).toLocaleDateString('ko-KR')}</p>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {results.venues.length > 0 && (
                                <div className="search-section">
                                    <h3 className="search-section-title">장소 안내</h3>
                                    <div className="search-results-grid">
                                        {results.venues.map((result) => (
                                            <div
                                                key={result.id}
                                                className="search-result-item"
                                                onClick={() => handleResultClick(result)}
                                            >
                                                {result.thumbnail && (
                                                    <img src={result.thumbnail} alt={result.title} className="search-result-image" />
                                                )}
                                                <div className="search-result-info">
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

                            {results.shopping.length > 0 && (
                                <div className="search-section">
                                    <h3 className="search-section-title">{getSectionTitle('shopping')}</h3>
                                    <div className="search-results-grid">
                                        {results.shopping.map((result) => (
                                            <div
                                                key={result.id}
                                                className="search-result-item"
                                                onClick={() => handleResultClick(result)}
                                            >
                                                {result.thumbnail && (
                                                    <img src={result.thumbnail} alt={result.title} className="search-result-image" />
                                                )}
                                                <div className="search-result-info">
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


                            {results.board_posts.length > 0 && (
                                <div className="search-section">
                                    <h3 className="search-section-title">{getSectionTitle('board_posts')}</h3>
                                    <div className="search-results-grid">
                                        {results.board_posts.map((result) => (
                                            <div
                                                key={result.id}
                                                className="search-result-item"
                                                onClick={() => handleResultClick(result)}
                                            >
                                                {result.thumbnail && (
                                                    <img src={result.thumbnail} alt={result.title} className="search-result-image" />
                                                )}
                                                <div className="search-result-info">
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
                        </>
                    )}
                </div>
            </div>

            {/* 장소 상세 모달 */}
            {selectedVenueId && (
                <VenueDetailModal
                    venueId={selectedVenueId}
                    onClose={handleCloseDetailModals}
                />
            )}

            {/* 이벤트 상세 모달 */}
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



            {/* 쇼핑 상세 모달 */}
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


