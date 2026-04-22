import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import VenueRegistrationModal from '../practice/components/VenueRegistrationModal';
import VenueDetailModal from '../practice/components/VenueDetailModal';
import VenueMapView from '../practice/components/VenueMapView';
import { useSetPageAction } from '../../contexts/PageActionContext';
import './places.css';

export interface Venue {
    id: string;
    category: string;
    name: string;
    address: string;
    phone: string;
    description: string;
    website_url: string;
    map_url: string;
    images?: any; // JSON or string
    user_id: string;
    created_at: string;
}

export default function PlacesPage() {
    const { user, isAdmin } = useAuth();
    const [places, setPlaces] = useState<Venue[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editTargetId, setEditTargetId] = useState<string | null>(null);
    const [filterCategory, setFilterCategory] = useState<string>('스윙바');
    const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<'list' | 'map'>('map');
    const [regionFilter, setRegionFilter] = useState<'all' | 'seoul' | 'other'>('seoul');

    const fetchPlaces = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('venues')
                .select('*')
                .order('name', { ascending: true });

            if (error) throw error;
            setPlaces(data || []);
        } catch (error) {
            console.error('Error fetching places:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPlaces();

        // 화이트 테마 클래스 추가
        document.body.classList.add('places-white-theme');
        return () => {
            document.body.classList.remove('places-white-theme');
        };
    }, []);

    // 동적으로 존재하는 카테고리 추출 ('연습실', '스윙바' 등)
    const allCategories = Array.from(new Set(places.map(place => place.category))).filter(Boolean).sort();

    useSetPageAction(React.useMemo(() => ({
        icon: 'ri-add-line',
        label: '장소 추가',
        requireAuth: true,
        onClick: () => {
            setEditTargetId(null);
            setIsModalOpen(true);
        }
    }), []));

    // 필터링된 배열 계산
    const categoryFiltered = filterCategory === '전체'
        ? places
        : places.filter(place => place.category === filterCategory);

    const SEOUL_KEYWORDS = ['서울', '서울시', '종로구', '중구', '용산구', '성동구', '광진구', '동대문구', '중랑구', '성북구', '강북구', '도봉구', '노원구', '은평구', '서대문구', '마포구', '양천구', '강서구', '구로구', '금천구', '영등포구', '동작구', '관악구', '서초구', '강남구', '송파구', '강동구'];
    const isSeoul = (addr: string | undefined) => !!addr && SEOUL_KEYWORDS.some(k => addr.startsWith(k));

    const filteredPlaces = categoryFiltered.filter(place => {
        if (regionFilter === 'seoul') return isSeoul(place.address);
        if (regionFilter === 'other') return place.address && !isSeoul(place.address);
        return true;
    });

    const getThumbnail = (place: Venue): string => {
        if (!place.images) return '';
        try {
            const parsed = typeof place.images === 'string' ? JSON.parse(place.images) : place.images;
            if (Array.isArray(parsed) && parsed.length > 0) {
                // If the first image has isThumbnail: true, use its url
                if (parsed[0].isThumbnail && parsed[0].url) {
                    return parsed[0].url;
                }
                // Fallback to the first image if it's an object with url or just a string
                const firstImg = parsed[0];
                return firstImg.url || (typeof firstImg === 'string' ? firstImg : '');
            }
        } catch (e) {
            // ignore
        }
        return '';
    };

    return (
        <div className="places-page-glass-container">
            <header className="places-hero-header">
                <div className="places-hero-content">
                    <p className="subtitle-glass">더 즐거운 댄스 라이프를 만들어 줄 연습실과 모임 장소들</p>
                </div>
            </header>

            <div className="places-glass-filter-wrapper">
                <div className="places-category-filter">
                    <button
                        className={`glass-pill-places ${filterCategory === '전체' ? 'active' : ''}`}
                        onClick={() => setFilterCategory('전체')}
                    >
                        <span className="category-text">전체</span>
                        <span className="category-count">{places.length}</span>
                    </button>
                    {allCategories.map(cat => {
                        const count = places.filter(p => p.category === cat).length;
                        return (
                            <button
                                key={cat}
                                className={`glass-pill-places ${filterCategory === cat ? 'active' : ''}`}
                                onClick={() => setFilterCategory(cat)}
                            >
                                <span className="category-text">{cat}</span>
                                <span className="category-count">{count}</span>
                            </button>
                        );
                    })}
                </div>

                {/* 뷰 모드 + 지역 필터 */}
                <div className="places-view-controls">
                    <div className="places-view-toggle">
                        <button
                            className={`places-view-btn${viewMode === 'list' ? ' active' : ''}`}
                            onClick={() => setViewMode('list')}
                        >
                            <i className="ri-list-check"></i> 리스트
                        </button>
                        <button
                            className={`places-view-btn${viewMode === 'map' ? ' active' : ''}`}
                            onClick={() => setViewMode('map')}
                        >
                            <i className="ri-map-2-line"></i> 지도
                        </button>
                    </div>
                    <div className="places-region-filter">
                        {(['all', 'seoul', 'other'] as const).map(r => (
                            <button
                                key={r}
                                className={`places-region-btn${regionFilter === r ? ' active' : ''}`}
                                onClick={() => setRegionFilter(r)}
                            >
                                {r === 'all' ? '전체' : r === 'seoul' ? '서울' : '다른 지역'}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* 지도 뷰 */}
            {viewMode === 'map' && !loading && (
                <VenueMapView
                    venues={filteredPlaces}
                    onVenueClick={(id) => setSelectedVenueId(id)}
                />
            )}

            {loading ? (
                <div className="places-glass-loading">
                    <div className="spinner-glow-places"></div>
                    <p>장소 정보를 불러오는 중입니다...</p>
                </div>
            ) : filteredPlaces.length === 0 ? (
                <div className="places-glass-empty">
                    <div className="empty-icon-glow"><i className="ri-map-pin-line"></i></div>
                    <h3>등록된 장소가 없습니다</h3>
                    <p>당신이 아는 좋은 장소를 처음으로 등록해보세요!</p>
                </div>
            ) : (
                <div className="places-glass-grid">
                    {filteredPlaces.map((place) => {
                        const thumb = getThumbnail(place);
                        let parsedMapUrls = { kakao: '', naver: '', google: '' };
                        if (place.map_url) {
                            if (place.map_url.startsWith('{')) {
                                try { parsedMapUrls = JSON.parse(place.map_url); } catch(e){}
                            } else if (place.map_url.includes('naver')) {
                                parsedMapUrls.naver = place.map_url;
                            } else {
                                parsedMapUrls.kakao = place.map_url;
                            }
                        }

                        return (
                            <div key={place.id} className="glass-card-places"
                                onClick={() => setSelectedVenueId(place.id)}>
                                
                                <div className="place-card-body">
                                    <div className="place-neon-icon">
                                        {thumb ? (
                                            <img src={thumb} alt={place.name} draggable={false} />
                                        ) : (
                                            <div className="icon-placeholder">
                                                <i className="ri-map-pin-user-fill"></i>
                                            </div>
                                        )}
                                    </div>
                                    <div className="place-content">
                                        <div className="place-meta">
                                            <span className="glass-tag-places">{place.category}</span>
                                            {place.address && (
                                                <span className="place-address" title={place.address}>
                                                    <i className="ri-map-pin-line" style={{ marginRight: '4px' }}></i>
                                                    {place.address.split(' ').slice(0, 2).join(' ')}
                                                </span>
                                            )}
                                        </div>
                                        <h3 className="place-title" title={place.name}>{place.name}</h3>
                                        
                                        <div className="place-map-links" style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
                                            {parsedMapUrls.kakao && (
                                                <button onClick={(e) => { e.stopPropagation(); window.open(parsedMapUrls.kakao, '_blank'); }} className="glass-action-btn" style={{ padding: '6px 10px' }}>
                                                    <i className="ri-road-map-line" style={{ color: '#FEE500' }}></i> 카카오
                                                </button>
                                            )}
                                            {parsedMapUrls.naver && (
                                                <button onClick={(e) => { e.stopPropagation(); window.open(parsedMapUrls.naver, '_blank'); }} className="glass-action-btn" style={{ padding: '6px 10px' }}>
                                                    <i className="ri-map-pin-2-fill" style={{ color: '#03C75A' }}></i> 네이버
                                                </button>
                                            )}
                                            {parsedMapUrls.google && (
                                                <button onClick={(e) => { e.stopPropagation(); window.open(parsedMapUrls.google, '_blank'); }} className="glass-action-btn" style={{ padding: '6px 10px' }}>
                                                    <i className="ri-google-fill" style={{ color: '#4285F4' }}></i> 구글
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    {place.website_url && (
                                        <div className="place-hover-arrow">
                                            <i className="ri-arrow-right-up-line"></i>
                                        </div>
                                    )}
                                </div>

                                {(isAdmin || (user && user.id === place.user_id)) && (
                                    <div className="place-glass-actions" onClick={e => e.stopPropagation()}>
                                        <button onClick={() => { setEditTargetId(place.id); setIsModalOpen(true); }} className="glass-action-btn edit">
                                            <i className="ri-pencil-line"></i> 관리
                                        </button>
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            )}

            {/* 장소 상세 모달 */}
            {selectedVenueId && (
                <VenueDetailModal
                    venueId={selectedVenueId}
                    onClose={() => setSelectedVenueId(null)}
                    onEdit={() => {
                        setEditTargetId(selectedVenueId);
                        setSelectedVenueId(null);
                        setIsModalOpen(true);
                    }}
                />
            )}

            {/* 기존 카카오 방식의 장소 등록/수정 모달 활용 */}
            {isModalOpen && (
                <VenueRegistrationModal
                    isOpen={isModalOpen}
                    onClose={() => { setIsModalOpen(false); setEditTargetId(null); }}
                    onVenueCreated={fetchPlaces}
                    onVenueDeleted={fetchPlaces}
                    editVenueId={editTargetId}
                />
            )}
        </div>
    );
}
