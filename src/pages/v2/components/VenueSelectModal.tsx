import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import VenueSelectList from './VenueSelectList';
import './VenueSelectModal.css';

declare global {
    interface Window {
        daum: any;
        kakao: any;
    }
}

interface Venue {
    id: string | number;
    name: string;
    address: string;
    phone?: string;
    description: string;
    images: string[];
    website_url?: string;
    map_url?: string;
    category: string;
}

interface VenueSelectModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (venue: Venue) => void;
    onManualInput?: (venueName: string, venueLink: string, venueAddress?: string) => void;
}

export default function VenueSelectModal({ isOpen, onClose, onSelect, onManualInput }: VenueSelectModalProps) {
    const navigate = useNavigate();
    const [activeCategory, setActiveCategory] = useState<string>("연습실");

    // Form States
    const [venueName, setVenueName] = useState('');
    const [venueAddress, setVenueAddress] = useState('');
    const [venueLink, setVenueLink] = useState('');

    // Unified Search State
    const [searchKeyword, setSearchKeyword] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [isSdkLoaded, setIsSdkLoaded] = useState(false);

    // Ensure Kakao SDK is loaded (for autoload=false)
    useEffect(() => {
        if (isOpen && window.kakao && window.kakao.maps) {
            window.kakao.maps.load(() => {
                setIsSdkLoaded(true);
                console.log('✅ [VenueSelectModal] Kakao Maps SDK Loaded');
            });
        }
    }, [isOpen]);

    const handleVenueClick = (venue: Venue) => {
        onSelect(venue);
        onClose();
    };

    const performSearch = async (keyword: string) => {
        if (!keyword.trim()) {
            setSearchResults([]);
            return;
        }
        if (!isSdkLoaded) {
            alert('지도 서비스를 준비 중입니다. 잠시만 기다려주세요.');
            return;
        }

        setIsSearching(true);
        const ps = new window.kakao.maps.services.Places();

        // 원본 키워드 및 자주 쓰이는 접미사 추가 쿼리들
        const searchQueries = [
            keyword,
            `${keyword} 연습실`,
            `${keyword} 스튜디오`,
            `${keyword} 바`,
            `${keyword.replace(/\s+/g, '')}연습실` // 공백 제거 버전
        ];

        const searchPromises = searchQueries.map(q => {
            return new Promise<any[]>((resolve) => {
                ps.keywordSearch(q, (data: any, status: any) => {
                    if (status === window.kakao.maps.services.Status.OK) {
                        resolve(data);
                    } else {
                        resolve([]); // 실패하거나 결과가 없으면 빈 배열
                    }
                });
            });
        });

        try {
            const resultsArrays = await Promise.all(searchPromises);

            // 모든 결과 합치기
            let mergedResults: any[] = [];
            resultsArrays.forEach(arr => {
                mergedResults = [...mergedResults, ...arr];
            });

            // ID 기준으로 중복 제거
            const uniqueResults = Array.from(
                new Map(mergedResults.map(item => [item.id, item])).values()
            );

            setSearchResults(uniqueResults);
        } catch (error) {
            console.error('Search failed', error);
            setSearchResults([]);
        } finally {
            setIsSearching(false);
        }
    };

    const handleSearchSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        performSearch(searchKeyword);
    };

    // 실시간 검색 (Debounce 적용)
    useEffect(() => {
        const timeoutId = setTimeout(() => {
            if (activeCategory === '직접입력') {
                performSearch(searchKeyword);
            }
        }, 400); // 400ms 지연 후 검색 실행

        return () => clearTimeout(timeoutId);
    }, [searchKeyword, activeCategory, isSdkLoaded]);

    const handleResultSelect = (place: any) => {
        setVenueName(place.place_name);
        setVenueAddress(place.road_address_name || place.address_name);
        setVenueLink(place.place_url);
        setSearchResults([]); // Hide list after selection
        // Optional: Keep the search keyword or clear it
    };

    const handleManualSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        e.stopPropagation();

        if (!venueName.trim()) {
            alert('장소 이름을 입력해주세요.');
            return;
        }
        if (!venueAddress.trim()) {
            alert('주소를 입력 또는 검색해주세요.');
            return;
        }
        if (!venueLink.trim()) {
            alert('장소 링크(지도 URL)를 입력해주세요.');
            return;
        }

        if (onManualInput) {
            onManualInput(venueName.trim(), venueLink.trim(), venueAddress.trim());
            setVenueName('');
            setVenueAddress('');
            setVenueLink('');
            setSearchKeyword('');
            onClose();
        }
    };

    if (!isOpen) return null;

    const categories = ['연습실', '스윙바', '직접입력'];

    return createPortal(
        <div className="venue-select-overlay" onClick={onClose}>
            <div className="venue-select-container" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="venue-select-header">
                    <h2 className="venue-select-title">장소 선택</h2>
                    <div className="venue-select-header-actions">
                        <button
                            onClick={() => {
                                onClose();
                                navigate('/practice?action=register');
                            }}
                            className="venue-register-btn"
                        >
                            <i className="ri-add-line"></i> 장소 등록
                        </button>
                        <button onClick={onClose} className="venue-select-close-btn">
                            <i className="ri-close-line"></i>
                        </button>
                    </div>
                </div>

                {/* Tab Bar */}
                <div className="venue-select-tab-wrapper">
                    <div className="venue-tab-bar-inline">
                        <div className="venue-tab-scroller-inline">
                            {categories.map((cat) => (
                                <button
                                    key={cat}
                                    className={`venue-tab-item-inline ${activeCategory === cat ? 'active' : ''}`}
                                    onClick={() => setActiveCategory(cat)}
                                >
                                    <i className={`${cat === '연습실' ? 'ri-music-2-line' :
                                        cat === '스윙바' ? 'ri-goblet-line' :
                                            'ri-edit-line'
                                        } venue-tab-icon`}></i>
                                    <span className="venue-tab-label">{cat}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Content Area */}
                <div className="venue-select-body">
                    {activeCategory === '직접입력' ? (
                        <div className="venue-unified-search-wrapper">
                            {/* Unified Search Bar */}
                            <div className="venue-search-control">
                                <label className="venue-manual-label">장소/주소 검색</label>
                                <form onSubmit={handleSearchSubmit} className="venue-search-form">
                                    <div className="venue-search-input-group">
                                        <input
                                            type="text"
                                            value={searchKeyword}
                                            onChange={(e) => setSearchKeyword(e.target.value)}
                                            placeholder="장소명(해피홀) 또는 주소를 입력하세요"
                                            className="venue-manual-input"
                                            autoFocus
                                        />
                                        <button type="submit" className="venue-search-submit-btn" disabled={isSearching}>
                                            {isSearching ? <i className="ri-loader-4-line spin"></i> : <i className="ri-search-line"></i>}
                                        </button>
                                    </div>
                                </form>

                                {/* Inline Search Results */}
                                {searchResults.length > 0 && (
                                    <div className="venue-search-dropdown">
                                        <div className="dropdown-header">검색 결과 ({searchResults.length})</div>
                                        <ul className="venue-search-results-list">
                                            {searchResults.map((place, idx) => (
                                                <li key={idx} className="venue-search-item">
                                                    <div className="venue-item-info">
                                                        <span className="venue-item-name">{place.place_name}</span>
                                                        <span className="venue-item-addr">{place.road_address_name || place.address_name}</span>
                                                    </div>
                                                    <div className="venue-item-actions">
                                                        <button
                                                            type="button"
                                                            className="venue-item-map-btn"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                window.open(place.place_url, '_blank');
                                                            }}
                                                        >
                                                            <i className="ri-map-2-line"></i>
                                                            <span>지도</span>
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="venue-item-select-btn"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleResultSelect(place);
                                                            }}
                                                        >
                                                            선택
                                                        </button>
                                                    </div>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>

                            {/* Manual Entry Fields (Auto-filled by search) */}
                            <form onSubmit={handleManualSubmit} className="venue-manual-entry-form">
                                <div className="venue-fields-grid">
                                    <div className="venue-manual-field">
                                        <label className="venue-manual-label">장소 이름 <span className="venue-manual-required">*</span></label>
                                        <input
                                            type="text"
                                            value={venueName}
                                            onChange={(e) => setVenueName(e.target.value)}
                                            placeholder="검색하거나 직접 입력하세요"
                                            className="venue-manual-input"
                                        />
                                    </div>
                                    <div className="venue-manual-field">
                                        <label className="venue-manual-label">주소 <span className="venue-manual-required">*</span></label>
                                        <input
                                            type="text"
                                            value={venueAddress}
                                            onChange={(e) => setVenueAddress(e.target.value)}
                                            placeholder="상세 주소"
                                            className="venue-manual-input"
                                        />
                                    </div>
                                    <div className="venue-manual-field">
                                        <label className="venue-manual-label">장소 링크 <span className="venue-manual-required">*</span></label>
                                        <input
                                            type="text"
                                            value={venueLink}
                                            onChange={(e) => setVenueLink(e.target.value)}
                                            placeholder="지도의 상세 페이지 URL"
                                            className="venue-manual-input"
                                        />
                                    </div>
                                </div>

                                <div className="venue-manual-footer-btns">
                                    <button type="button" onClick={onClose} className="venue-btn-cancel">취소</button>
                                    <button type="submit" className="venue-btn-confirm">장소 적용하기</button>
                                </div>
                            </form>
                        </div>
                    ) : (
                        <>
                            <div className="venue-select-description">
                                <p>
                                    <i className="ri-information-line"></i>
                                    이미 등록된 장소 중에서 선택하세요
                                </p>
                            </div>
                            <VenueSelectList
                                activeCategory={activeCategory}
                                onVenueClick={handleVenueClick}
                            />
                        </>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
}
