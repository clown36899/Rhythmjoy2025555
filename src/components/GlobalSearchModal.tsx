import { useState, useEffect, memo, useRef } from 'react';
import { supabase } from '../lib/supabase';
import EventDetailModal from '../pages/v2/components/EventDetailModal';
import PracticeRoomDetail from '../pages/practice/components/PracticeRoomDetail';
import ShopDetailModal from '../pages/shopping/components/ShopDetailModal';
import type { Event } from '../lib/supabase';
import type { Shop } from '../pages/shopping/page';
import { useModalHistory } from '../hooks/useModalHistory';
import './GlobalSearchModal.css';

interface SearchResult {
    id: string;
    title: string;
    description?: string;
    type: 'event' | 'practice_room' | 'shopping' | 'social_place';
    thumbnail?: string;
    date?: string;
}

interface GlobalSearchModalProps {
    isOpen: boolean;
    onClose: () => void;
    searchQuery: string;
}

export default memo(function GlobalSearchModal({ isOpen, onClose, searchQuery }: GlobalSearchModalProps) {
    const [results, setResults] = useState<{
        events: SearchResult[];
        practice_rooms: SearchResult[];
        shopping: SearchResult[];
        social_places: SearchResult[];
    }>({
        events: [],
        practice_rooms: [],
        shopping: [],
        social_places: []
    });
    const [loading, setLoading] = useState(false);
    const lastSearchQuery = useRef('');

    // 상세 모달 상태 관리
    const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
    const [selectedPracticeRoomId, setSelectedPracticeRoomId] = useState<string | null>(null);
    const [selectedShop, setSelectedShop] = useState<Shop | null>(null);
    const [showEventDetail, setShowEventDetail] = useState(false);
    const [showPracticeDetail, setShowPracticeDetail] = useState(false);
    const [showShopDetail, setShowShopDetail] = useState(false);

    useEffect(() => {
        if (isOpen && searchQuery.trim() && searchQuery !== lastSearchQuery.current) {
            lastSearchQuery.current = searchQuery;
            performSearch(searchQuery);
        }
    }, [isOpen, searchQuery]);

    // Enable mobile back gesture to close modal
    useModalHistory(isOpen, onClose);

    const performSearch = async (query: string) => {
        setLoading(true);
        const searchTerm = query.toLowerCase();

        try {
            // Search events
            const { data: eventsData, error: eventsError } = await supabase
                .from('events')
                .select('id, title, description, image_thumbnail, start_date')
                .or(`title.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%`)
                .limit(10);

            if (eventsError) {
                console.error('Events search error:', eventsError);
            }

            // Search practice rooms
            const { data: practiceData, error: practiceError } = await supabase
                .from('practice_rooms')
                .select('id, name, description, images, address')
                .or(`name.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%,address.ilike.%${searchTerm}%`)
                .limit(10);

            if (practiceError) {
                console.error('Practice rooms search error:', practiceError);
            }

            // Search social places
            const { data: socialData, error: socialError } = await supabase
                .from('social_places')
                .select('place_id, name, description, address')
                .or(`name.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%,address.ilike.%${searchTerm}%`)
                .limit(10);

            if (socialError) {
                console.error('Social places search error:', socialError);
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
                practice_rooms: (practiceData || []).map(p => ({
                    id: String(p.id),
                    title: p.name,
                    description: p.description,
                    type: 'practice_room' as const,
                    thumbnail: Array.isArray(p.images) ? p.images[0] : typeof p.images === 'string' ? JSON.parse(p.images)[0] : undefined
                })),
                shopping: [], // Shopping table doesn't exist
                social_places: (socialData || []).map(sp => ({
                    id: String(sp.place_id),
                    title: sp.name,
                    description: sp.description,
                    type: 'social_place' as const,
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
                        .single();

                    if (error) {
                        console.error('이벤트 조회 오류:', error);
                        return;
                    }

                    setSelectedEvent(data as Event);
                    setShowEventDetail(true);
                    break;
                }
                case 'practice_room': {
                    // 연습실 페이지로 라우팅
                    window.location.href = `/practice?id=${result.id}`;
                    break;
                }
                case 'shopping': {
                    // 쇼핑 전체 데이터 가져오기
                    const { data, error } = await supabase
                        .from('shops')
                        .select('*')
                        .eq('id', result.id)
                        .single();

                    if (error) {
                        console.error('쇼핑 조회 오류:', error);
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
            }
        } catch (error) {
            console.error('상세 정보 조회 오류:', error);
        }
    };

    const handleCloseDetailModals = () => {
        setShowEventDetail(false);
        setShowPracticeDetail(false);
        setShowShopDetail(false);
        setSelectedEvent(null);
        setSelectedPracticeRoomId(null);
        setSelectedShop(null);
    };

    const getSectionTitle = (type: string) => {
        switch (type) {
            case 'events':
                return '행사';
            case 'practice_rooms':
                return '연습실';
            case 'shopping':
                return '쇼핑';
            case 'social_places':
                return '소셜 장소';
            default:
                return '';
        }
    };

    const totalResults = results.events.length + results.practice_rooms.length +
        results.shopping.length + results.social_places.length;

    if (!isOpen) return null;

    return (
        <div className="search-modal-overlay" onClick={onClose}>
            <div className="search-modal-container" onClick={(e) => e.stopPropagation()}>
                <div className="search-modal-header">
                    <h2 className="search-modal-title">검색 결과</h2>
                    <button onClick={onClose} className="search-modal-close">
                        <i className="ri-close-line"></i>
                    </button>
                </div>

                <div className="search-modal-content">
                    {loading ? (
                        <div className="search-loading">
                            <i className="ri-loader-4-line animate-spin"></i>
                            <p>검색 중...</p>
                        </div>
                    ) : totalResults === 0 ? (
                        <div className="search-empty">
                            <i className="ri-search-line"></i>
                            <p>"{searchQuery}"에 대한 검색 결과가 없습니다.</p>
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

                            {results.practice_rooms.length > 0 && (
                                <div className="search-section">
                                    <h3 className="search-section-title">{getSectionTitle('practice_rooms')}</h3>
                                    <div className="search-results-grid">
                                        {results.practice_rooms.map((result) => (
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

                            {results.social_places.length > 0 && (
                                <div className="search-section">
                                    <h3 className="search-section-title">{getSectionTitle('social_places')}</h3>
                                    <div className="search-results-grid">
                                        {results.social_places.map((result) => (
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

            {/* 연습실 상세 모달 */}
            {showPracticeDetail && selectedPracticeRoomId && (
                <PracticeRoomDetail
                    roomId={selectedPracticeRoomId}
                    onClose={handleCloseDetailModals}
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
        </div>
    );
});
