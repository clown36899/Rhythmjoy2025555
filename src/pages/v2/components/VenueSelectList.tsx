import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import LocalLoading from '../../../components/LocalLoading';
import type { ImageObject } from '../../../utils/getEventThumbnail';
import './VenueSelectList.css';

interface Venue {
    id: string | number; // ID 타입을 유연하게 처리 (DB 스키마에 따라 number일 수도 있음)
    name: string;
    address: string;
    phone?: string;
    description: string;
    images: (string | ImageObject)[];
    category: string;
}

interface VenueSelectListProps {
    activeCategory: string;
    onVenueClick: (venue: Venue) => void;
}

export default function VenueSelectList({ activeCategory, onVenueClick }: VenueSelectListProps) {
    const [venues, setVenues] = useState<Venue[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchKeyword, setSearchKeyword] = useState('');

    useEffect(() => {
        // Debounce fetch when search changes
        const timer = setTimeout(() => {
            fetchVenues();
        }, 300);
        return () => clearTimeout(timer);
    }, [activeCategory, searchKeyword]);

    const fetchVenues = async () => {
        setLoading(true);
        try {
            // 원본(PracticeRoomList)과 동일하게 display_order로 정렬
            let query = supabase
                .from('venues')
                .select('*')
                .eq('is_active', true)
                .order('display_order', { ascending: true });

            // 검색어가 있을 때는 연습실, 스윙바 모두 검색
            if (searchKeyword.trim()) {
                query = query.in('category', ['연습실', '스윙바']);
            } else {
                query = query.eq('category', activeCategory);
            }

            const { data, error } = await query;

            if (error) throw error;

            if (data && data.length > 0) {
                // 데이터 중복 제거 (이름 기준)
                // ID가 달라도 이름이 같으면 중복으로 간주하고 하나만 표시
                // display_order 순서(우선순위)를 보존하기 위해 filter 사용
                const uniqueVenues = data.filter((venue, index, self) =>
                    index === self.findIndex((t) => t.name === venue.name)
                );

                // Parse images if needed
                const parsedVenues = uniqueVenues.map(venue => ({
                    ...venue,
                    images: typeof venue.images === 'string' ? JSON.parse(venue.images) : (venue.images || [])
                }));

                // 검색어가 있을 때는 프론트엔드에서 필터링 적용
                if (searchKeyword.trim()) {
                    const lowerKeyword = searchKeyword.toLowerCase();
                    const filtered = parsedVenues.filter(venue =>
                        venue.name.toLowerCase().includes(lowerKeyword) ||
                        venue.address.toLowerCase().includes(lowerKeyword)
                    );
                    setVenues(filtered);
                } else {
                    setVenues(parsedVenues);
                }
            } else {
                setVenues([]);
            }
        } catch (error) {
            console.error('Failed to fetch venues:', error);
            setVenues([]);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="venue-select-list-container">
            <div className="venue-select-search-bar">
                <i className="ri-search-line"></i>
                <input
                    type="text"
                    placeholder="장소 이름 또는 주소 검색"
                    value={searchKeyword}
                    onChange={(e) => setSearchKeyword(e.target.value)}
                />
                {loading && (
                    <i className="ri-loader-4-line spin" style={{ color: 'var(--color-blue-500)' }}></i>
                )}
            </div>

            {/* Initial loading state before any venues are loaded */
                loading && venues.length === 0 ? (
                    <div className="venue-select-loading">
                        <LocalLoading message="장소 목록을 불러오는 중..." size="md" />
                    </div>
                ) : venues.length === 0 && !searchKeyword.trim() ? (
                    <div className="venue-select-empty">
                        <i className="ri-map-pin-line"></i>
                        <p>등록된 장소가 없습니다</p>
                    </div>
                ) : venues.length === 0 && searchKeyword.trim() ? (
                    <div className="venue-select-empty">
                        <i className="ri-search-eye-line"></i>
                        <p>검색 결과가 없습니다</p>
                    </div>
                ) : (
                    <div className="venue-select-list">
                        {venues.map((venue) => {
                            // 이미지 URL 처리
                            let imageUrl = null;
                            if (venue.images && venue.images.length > 0) {
                                const img = venue.images[0];
                                imageUrl = typeof img === 'string' ? img : (img.url || img.micro || img.thumbnail || img.medium || img.full);
                            }

                            return (
                                <div
                                    key={venue.id}
                                    className="venue-select-card"
                                    onClick={() => onVenueClick(venue)}
                                >
                                    <div className="venue-select-card-image">
                                        {imageUrl ? (
                                            <img
                                                src={imageUrl}
                                                alt={venue.name}
                                                onError={(e) => {
                                                    console.error('Image load failed:', imageUrl);
                                                    e.currentTarget.style.display = 'none';
                                                    e.currentTarget.parentElement!.innerHTML = `
                                                    <div class="venue-select-card-placeholder">
                                                        <i class="ri-building-line"></i>
                                                    </div>
                                                `;
                                                }}
                                            />
                                        ) : (
                                            <div className="venue-select-card-placeholder">
                                                <i className="ri-building-line"></i>
                                            </div>
                                        )}
                                    </div>
                                    <div className="venue-select-card-content">
                                        <h3 className="venue-select-card-name">
                                            {venue.name}
                                            {/* Display category label when searching to distinguish them */}
                                            {searchKeyword.trim() && (
                                                <span style={{
                                                    fontSize: '0.75rem',
                                                    marginLeft: '0.5rem',
                                                    padding: '0.1rem 0.4rem',
                                                    backgroundColor: 'var(--bg-surface-3)',
                                                    borderRadius: '1rem',
                                                    color: 'var(--text-tertiary)'
                                                }}>{venue.category}</span>
                                            )}
                                        </h3>
                                        <p className="venue-select-card-address">
                                            <i className="ri-map-pin-line"></i>
                                            {venue.address}
                                        </p>
                                        {venue.phone && (
                                            <p className="venue-select-card-phone">
                                                <i className="ri-phone-line"></i>
                                                {venue.phone}
                                            </p>
                                        )}
                                    </div>
                                    <div className="venue-select-card-arrow">
                                        <i className="ri-arrow-right-s-line"></i>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
        </div>
    );
}
