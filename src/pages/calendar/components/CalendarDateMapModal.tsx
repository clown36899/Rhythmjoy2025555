import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { Event as AppEvent } from '../../../lib/supabase';
import '../styles/CalendarDateMapModal.css';

declare global {
    interface Window {
        kakao: any;
    }
}

interface CalendarDateMapModalProps {
    isOpen: boolean;
    onClose: () => void;
    date: Date | null;
    events: AppEvent[];
    onEventClick: (event: AppEvent) => void;
}

const weekDayNames = ['일', '월', '화', '수', '목', '금', '토'];

export default function CalendarDateMapModal({
    isOpen,
    onClose,
    date,
    events,
    onEventClick,
}: CalendarDateMapModalProps) {
    const [map, setMap] = useState<any>(null);
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const markersRef = useRef<any[]>([]);
    const overlaysRef = useRef<any[]>([]);
    const [selectedRegion, setSelectedRegion] = useState<string>('서울');
    const [geocodedData, setGeocodedData] = useState<{ lat: number, lng: number, event: AppEvent }[]>([]);
    const [isGeocoding, setIsGeocoding] = useState(false);
    const [localEvents, setLocalEvents] = useState<AppEvent[]>(events);

    // events prop 변경 시 동기화
    useEffect(() => {
        setLocalEvents(events);
    }, [events]);

    // eventUpdated 커스텀 이벤트 수신하여 로컬 데이터 즉시 갱신
    useEffect(() => {
        const handleEventUpdated = (e: CustomEvent) => {
            const { id, event: updatedEvent } = e.detail;
            if (!id || !updatedEvent) return;
            setLocalEvents(prev => prev.map(ev => {
                const evId = String(ev.id);
                const updatedId = String(id);
                if (evId === updatedId || evId === `social-${updatedId}` || evId.replace('social-', '') === updatedId) {
                    return { ...ev, ...updatedEvent };
                }
                return ev;
            }));
        };
        window.addEventListener('eventUpdated', handleEventUpdated as EventListener);
        return () => window.removeEventListener('eventUpdated', handleEventUpdated as EventListener);
    }, []);

    // 주소에서 지역명 추출 (도우미 함수)
    const getRegionFromAddress = (addr: string): string => {
        if (!addr) return '';
        const trimmed = addr.trim();

        // 1. 서울 통합 체크 (자치구 및 주요 키워드)
        const seoulDistricts = ['강남구', '강동구', '강북구', '강서구', '관악구', '광진구', '구로구', '금천구', '노원구', '도봉구', '동대문구', '동작구', '마포구', '서대문구', '서초구', '성동구', '성북구', '송파구', '양천구', '영등포구', '용산구', '은평구', '종로구', '중구', '중랑구'];
        const seoulKeywords = ['서울', '신림', '건대', '홍대', '강남', '신촌', '이태원', '성수', '잠실', '압구정', '마얀'];

        if (seoulDistricts.some(d => trimmed.includes(d)) || seoulKeywords.some(k => trimmed.includes(k))) {
            return '서울';
        }

        const parts = trimmed.split(/\s+/);
        if (parts.length === 0) return '';
        const first = parts[0];

        // 2. 광역시/특별자치시
        if (first.includes('부산')) return '부산';
        if (first.includes('대구')) return '대구';
        if (first.includes('인천')) return '인천';
        if (first.includes('광주')) return '광주';
        if (first.includes('대전')) return '대전';
        if (first.includes('울산')) return '울산';
        if (first.includes('세종')) return '세종';

        // 3. 도(Province) 단위 -> 시/군(City/County) 단위로 세분화 (예: 경기도 청주시 -> 청주)
        const provincePattern = /^(경기|강원|충북|충남|전북|전남|경북|경남|제주|전라|경상|충청)/;
        if (provincePattern.test(first)) {
            if (parts.length > 1) {
                return parts[1].replace(/[시군]$/, '');
            }
            return first;
        }

        // 4. 그 외 첫 번째 단어 처리
        if (first.length >= 2) return first.replace(/[시군]$/, '');

        return '기타';
    };

    // 주소에서 지역(시/도 단위 대분류) 추출 로직
    const regions = useMemo(() => {
        const set = new Set<string>(['전체']);
        localEvents.forEach(e => {
            const addr = (Array.isArray(e.venues) ? e.venues[0]?.address : e.venues?.address) || e.address || e.location || e.venue_name || '';
            const reg = getRegionFromAddress(addr);
            if (reg) set.add(reg);
        });

        // 정렬: 전체 -> 서울 -> 경기 -> 가나다순
        const sorted = Array.from(set).sort((a, b) => {
            if (a === '전체') return -1;
            if (b === '전체') return 1;
            if (a === '서울') return -1;
            if (b === '서울') return 1;
            if (a === '경기') return -1;
            if (b === '경기') return 1;
            return a.localeCompare(b);
        });

        return sorted;
    }, [localEvents]);

    // 초기 지역 설정 (서울이 있으면 서울, 없으면 첫 번째 지역)
    useEffect(() => {
        if (isOpen && regions.length > 1) {
            // localEvents가 있고 regions가 추출되었을 때 '서울'이 있으면 서울 우선, 없으면 첫 번째 실제 지역 선택
            if (regions.includes('서울')) {
                setSelectedRegion('서울');
            } else if (regions.length > 1) {
                // '전체'가 항상 0번째이므로 1번째가 실제 첫 지역
                setSelectedRegion(regions[1]);
            }
        }
    }, [isOpen, regions]);

    // 필터링된 이벤트
    const filteredEvents = useMemo(() => {
        console.log('🔍 [CDMM] Filtering localEvents for region:', selectedRegion, 'Total localEvents:', localEvents.length);
        if (selectedRegion === '전체') return localEvents;
        const result = localEvents.filter(e => {
            const addr = (Array.isArray(e.venues) ? e.venues[0]?.address : e.venues?.address) || e.address || e.location || e.venue_name || '';
            const reg = getRegionFromAddress(addr);
            if (selectedRegion === '기타') {
                return reg === '기타' || reg === '';
            }
            return reg === selectedRegion;
        });
        console.log('✅ [CDMM] Filtered result count:', result.length);
        return result;
    }, [localEvents, selectedRegion]);

    // 1. 주소 검색(Geocoding) 먼저 수행
    useEffect(() => {
        if (!isOpen || !window.kakao) return;

        const performGeocoding = () => {
            if (!window.kakao.maps || !window.kakao.maps.services) {
                console.warn('⚠️ [CDMM] Kakao maps services not yet available');
                return;
            }

            const eventsWithLoc = filteredEvents.filter(e => (Array.isArray(e.venues) ? e.venues[0]?.address : e.venues?.address) || e.address || e.location || e.location_link || e.venue_name);

            if (eventsWithLoc.length === 0) {
                setGeocodedData([]);
                setIsGeocoding(false);
                return;
            }

            setIsGeocoding(true);
            const geocoder = new window.kakao.maps.services.Geocoder();
            const geocodePromises = eventsWithLoc.map(event => {
                const address = (Array.isArray(event.venues) ? event.venues[0]?.address : event.venues?.address) || event.address || event.location || event.venue_name || '';
                return new Promise<{ lat: number, lng: number, event: AppEvent } | null>((resolve) => {
                    if (!address) { resolve(null); return; }
                    geocoder.addressSearch(address, (result: any, status: any) => {
                        if (status === window.kakao.maps.services.Status.OK) {
                            resolve({ lat: parseFloat(result[0].y), lng: parseFloat(result[0].x), event });
                        } else {
                            resolve(null);
                        }
                    });
                });
            });

            Promise.all(geocodePromises).then(results => {
                const valid = results.filter(r => r !== null) as { lat: number, lng: number, event: AppEvent }[];
                setGeocodedData(valid);
                setIsGeocoding(false);
                console.log('✅ [CDMM] Geocoding completed. Valid count:', valid.length);
            });
        };

        // 서비스 라이브러리는 core 로딩 후에 사용 가능하므로 load 콜백 권장
        if (window.kakao.maps && window.kakao.maps.load) {
            window.kakao.maps.load(performGeocoding);
        } else {
            // 혹시라도 load가 없는 경우를 대비한 fallback
            const timer = setTimeout(performGeocoding, 100);
            return () => clearTimeout(timer);
        }
    }, [isOpen, filteredEvents]);

    // 2. 주소 검색 완료 후 맵 초기화
    useEffect(() => {
        if (!isOpen || !mapContainerRef.current || map || isGeocoding) return;

        const initMap = () => {
            if (!window.kakao || !window.kakao.maps) return;

            window.kakao.maps.load(() => {
                const container = mapContainerRef.current;
                if (!container) return;

                // 초기 중심점은 기본값(서울)으로 설정하고, 직후에 setBounds로 실제 위치에 맞춤
                const options = {
                    center: new window.kakao.maps.LatLng(37.5665, 126.9780),
                    level: 5,
                };

                const newMap = new window.kakao.maps.Map(container, options);

                // 검색된 데이터가 있으면 즉시 바운드 설정
                if (geocodedData.length > 0) {
                    const bounds = new window.kakao.maps.LatLngBounds();
                    geocodedData.forEach(v => bounds.extend(new window.kakao.maps.LatLng(v.lat, v.lng)));
                    newMap.setBounds(bounds, 60, 30, 10, 30);
                }

                // 모달 애니메이션(0.3s) 후 레이아웃 갱신
                setTimeout(() => {
                    newMap.relayout();
                    if (geocodedData.length > 0) {
                        const bounds = new window.kakao.maps.LatLngBounds();
                        geocodedData.forEach(v => bounds.extend(new window.kakao.maps.LatLng(v.lat, v.lng)));
                        newMap.setBounds(bounds, 60, 30, 10, 30);
                    }
                }, 400);

                setMap(newMap);
            });
        };

        const timer = setTimeout(initMap, 100);
        return () => clearTimeout(timer);
    }, [isOpen, map, isGeocoding, geocodedData]);

    // 맵 가시성 확보 및 바운드 재조정 (지역 필터링 시)
    useEffect(() => {
        if (isOpen && map && geocodedData.length > 0) {
            const bounds = new window.kakao.maps.LatLngBounds();
            geocodedData.forEach(v => bounds.extend(new window.kakao.maps.LatLng(v.lat, v.lng)));
            map.setBounds(bounds, 60, 30, 10, 30);

            setTimeout(() => {
                map.relayout();
            }, 500);
        }
    }, [isOpen, map, geocodedData]);

    // 2. 단일 개별 렌더링 (클러스터링 없이 오버랩 허용)
    useEffect(() => {
        if (!map || !window.kakao || !window.kakao.maps || geocodedData.length === 0) return;

        // 기존 마커 등 정리
        overlaysRef.current.forEach(o => o.setMap(null));
        overlaysRef.current = [];

        geocodedData.forEach((item, idx) => {
            const { lat, lng, event } = item;
            const position = new window.kakao.maps.LatLng(lat, lng);
            const defaultZIndex = 100 + idx;

            const markerContainer = document.createElement('div');
            markerContainer.className = 'CDMM-marker-container';
            markerContainer.style.zIndex = defaultZIndex.toString();

            markerContainer.onclick = (e) => {
                e.stopPropagation();
                onEventClick(event);
            };

            markerContainer.onmouseenter = () => { markerContainer.style.zIndex = '9999'; };
            markerContainer.onmouseleave = () => { markerContainer.style.zIndex = defaultZIndex.toString(); };

            const imageUrl = event.image_thumbnail || event.image_micro || '';
            const locationText = event.venue_name || event.location || '장소 정보 없음';

            markerContainer.innerHTML = `
                <div class="CDMM-marker-wrapper">
                    <div class="CDMM-marker-icon">
                        <div class="CDMM-marker">
                            ${imageUrl ? `<img src="${imageUrl}" alt="Event" />` : `<i class="ri-map-pin-2-fill" style="color: #4f46e5; font-size: 20px;"></i>`}
                        </div>
                        <div class="CDMM-marker-tail"></div>
                    </div>
                    <div class="CDMM-marker-label">
                        <span><i class="ri-map-pin-line"></i> ${locationText}</span>
                    </div>
                </div>
            `;

            const customOverlay = new window.kakao.maps.CustomOverlay({
                position,
                content: markerContainer,
                yAnchor: 1,
                zIndex: defaultZIndex
            });

            customOverlay.setMap(map);
            overlaysRef.current.push(customOverlay);
        });
    }, [geocodedData, map, onEventClick]);

    if (!isOpen || !date) return null;

    const resetMapBounds = () => {
        if (!map || geocodedData.length === 0) return;
        const bounds = new window.kakao.maps.LatLngBounds();
        geocodedData.forEach(v => bounds.extend(new window.kakao.maps.LatLng(v.lat, v.lng)));
        map.setBounds(bounds, 60, 30, 10, 30);
    };

    const getCategoryColor = (category?: string) => {
        const cat = category?.toLowerCase();
        if (cat === 'social' || cat === 'party') return '#ef4444';
        if (cat === 'regular' || cat === 'club') return '#3b82f6';
        if (cat === 'class') return '#10b981';
        return '#6b7280';
    };

    return createPortal(
        <div className="CalendarDateMapModal-overlay" onClick={onClose}>
            <div className="CDMM-container" onClick={e => e.stopPropagation()}>
                <div className="CDMM-header">
                    <div className="CDMM-dateInfo">
                        <span className="CDMM-weekday">
                            {date.getFullYear()}/{String(date.getMonth() + 1).padStart(2, '0')}/{String(date.getDate()).padStart(2, '0')} ({weekDayNames[date.getDay()]})
                        </span>
                        <span className="CDMM-subtitle">장소별 이벤트 맵</span>
                    </div>
                    <button className="CDMM-closeBtn" onClick={onClose}>
                        <i className="ri-close-line"></i>
                    </button>
                </div>

                <div className="CDMM-body">
                    <div className="CDMM-mapArea">
                        <div ref={mapContainerRef} className="CDMM-map"></div>
                        {map && geocodedData.length > 0 && (
                            <button className="CDMM-resetBtn" onClick={resetMapBounds} title="초기 위치로 이동">
                                <i className="ri-focus-3-line"></i>
                            </button>
                        )}
                        {(isGeocoding || !map) && (
                            <div className="CDMM-mapLoading">
                                <div className="CDMM-spinner"></div>
                                <span>장소 위치를 찾는 중...</span>
                            </div>
                        )}
                    </div>

                    <div className="CDMM-filterArea">
                        {regions.map(region => (
                            <button
                                key={region}
                                className={`CDMM-filterChip ${selectedRegion === region ? 'active' : ''}`}
                                onClick={() => setSelectedRegion(region)}
                            >
                                {region}
                            </button>
                        ))}
                    </div>

                    <div className="CDMM-eventListArea">
                        <h4 className="CDMM-eventListTitle">
                            {selectedRegion} 이벤트 ({filteredEvents.length})
                        </h4>
                        <div className="CDMM-eventList">
                            {filteredEvents.length > 0 ? (
                                filteredEvents.map((event) => (
                                    <div
                                        key={event.id}
                                        className="CDMM-eventItem"
                                        onClick={() => onEventClick(event)}
                                    >
                                        <div className="CDMM-eventImage">
                                            {(event.image_thumbnail || event.image_micro) ? (
                                                <img src={event.image_thumbnail || event.image_micro} alt={event.title} />
                                            ) : (
                                                <div className="CDMM-fallbackImage">
                                                    <i className="ri-calendar-event-line"></i>
                                                </div>
                                            )}
                                        </div>
                                        <div className="CDMM-eventInfo">
                                            <span
                                                className="CDMM-eventCategory"
                                                style={{ backgroundColor: `${getCategoryColor(event.category)}20`, color: getCategoryColor(event.category) }}
                                            >
                                                {event.category === 'social' ? '소셜' : event.category === 'class' || event.category === 'regular' ? '강습' : event.category === 'club' ? '동호회' : '이벤트'}
                                            </span>
                                            <div className="CDMM-eventTitle">{event.title}</div>
                                            <div className="CDMM-eventMeta">
                                                <i className="ri-map-pin-line"></i>
                                                <span>{event.venue_name || event.location || '장소 정보 없음'}</span>
                                            </div>
                                        </div>
                                        <i className="ri-arrow-right-s-line" style={{ alignSelf: 'center', color: '#ccc' }}></i>
                                    </div>
                                ))
                            ) : (
                                <div className="CDMM-emptyState">
                                    <p>해당 지역에 등록된 이벤트가 없습니다.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="CDMM-footer">
                    이벤트를 클릭하면 상세 정보를 확인할 수 있습니다.
                </div>
            </div>
        </div>,
        document.body
    );
}
