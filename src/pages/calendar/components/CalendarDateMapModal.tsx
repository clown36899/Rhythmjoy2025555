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
        events.forEach(e => {
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
    }, [events]);

    // 초기 지역 설정 (서울이 있으면 서울, 없으면 첫 번째 지역)
    useEffect(() => {
        if (isOpen && regions.length > 1) {
            // events가 있고 regions가 추출되었을 때 '서울'이 있으면 서울 우선, 없으면 첫 번째 실제 지역 선택
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
        console.log('🔍 [CDMM] Filtering events for region:', selectedRegion, 'Total events:', events.length);
        if (selectedRegion === '전체') return events;
        const result = events.filter(e => {
            const addr = (Array.isArray(e.venues) ? e.venues[0]?.address : e.venues?.address) || e.address || e.location || e.venue_name || '';
            const reg = getRegionFromAddress(addr);
            if (selectedRegion === '기타') {
                return reg === '기타' || reg === '';
            }
            return reg === selectedRegion;
        });
        console.log('✅ [CDMM] Filtered result count:', result.length);
        return result;
    }, [events, selectedRegion]);

    // 맵 초기화
    useEffect(() => {
        console.log('🗺️ [CDMM] Modal Open state:', isOpen, 'Map container exists:', !!mapContainerRef.current);
        if (!isOpen || !mapContainerRef.current || map) return;

        const initMap = () => {
            if (!window.kakao || !window.kakao.maps) {
                console.error('Kakao maps not loaded');
                return;
            }

            window.kakao.maps.load(() => {
                const container = mapContainerRef.current;
                if (!container) return;

                const options = {
                    center: new window.kakao.maps.LatLng(37.5665, 126.9780), // 서울 중심 기본값
                    level: 5,
                };

                const newMap = new window.kakao.maps.Map(container, options);

                // 모달 애니메이션(0.3s) 후 레이아웃 갱신
                setTimeout(() => {
                    newMap.relayout();
                    console.log('🔄 [CDMM] Map relayout called after animation');
                }, 400);

                setMap(newMap);
            });
        };

        const timer = setTimeout(initMap, 100);
        return () => clearTimeout(timer);
    }, [isOpen, map]);

    // 맵 가시성 확보 (모달이 열릴 때마다 relayout)
    useEffect(() => {
        if (isOpen && map) {
            setTimeout(() => {
                map.relayout();
            }, 500);
        }
    }, [isOpen, map]);

    // 마커 표시 및 바운드 설정
    useEffect(() => {
        if (!map || !window.kakao || !window.kakao.maps) return;

        // 기존 마커 및 오버레이 제거
        overlaysRef.current.forEach(o => o.setMap(null));
        overlaysRef.current = [];

        if (filteredEvents.length === 0) {
            map.setCenter(new window.kakao.maps.LatLng(37.5665, 126.9780));
            return;
        }

        const geocoder = new window.kakao.maps.services.Geocoder();
        const bounds = new window.kakao.maps.LatLngBounds();

        const eventsWithLoc = filteredEvents.filter(e => (Array.isArray(e.venues) ? e.venues[0]?.address : e.venues?.address) || e.address || e.location || e.location_link || e.venue_name);

        if (eventsWithLoc.length === 0) {
            map.setCenter(new window.kakao.maps.LatLng(37.5665, 126.9780));
            return;
        }

        const geocodePromises = eventsWithLoc.map(event => {
            const address = (Array.isArray(event.venues) ? event.venues[0]?.address : event.venues?.address) || event.address || event.location || event.venue_name || '';
            console.log(`📍 [CDMM] Geocoding request for: "${event.title}"`);
            return new Promise<{ lat: number, lng: number, event: AppEvent } | null>((resolve) => {
                if (!address) {
                    resolve(null);
                    return;
                }
                geocoder.addressSearch(address, (result: any, status: any) => {
                    if (status === window.kakao.maps.services.Status.OK) {
                        resolve({ lat: parseFloat(result[0].y), lng: parseFloat(result[0].x), event });
                    } else {
                        console.error(`❌ [CDMM] Geocode FAILED (Status: ${status}) for: "${address}"`);
                        resolve(null);
                    }
                });
            });
        });

        Promise.all(geocodePromises).then(results => {
            if (!map || overlaysRef.current === undefined) return;

            const validResults = results.filter(r => r !== null) as { lat: number, lng: number, event: AppEvent }[];
            if (validResults.length === 0) return;

            const grouped: Record<string, { lat: number, lng: number, events: AppEvent[] }> = {};
            validResults.forEach(r => {
                // 주소 텍스트 누락 등 변수를 차단하기 위해 오직 '카카오 좌표 변환 결과값(소수점 4자리)'을 기준으로 강제 병합합니다.
                const key = `coord_${r.lat.toFixed(4)},${r.lng.toFixed(4)}`;

                if (!grouped[key]) {
                    // 그룹 대표 좌표는 첫 번째 이벤트의 좌표 사용
                    grouped[key] = { lat: r.lat, lng: r.lng, events: [] };
                }
                grouped[key].events.push(r.event);
            });

            Object.values(grouped).forEach(group => {
                const { lat, lng, events } = group;
                const position = new window.kakao.maps.LatLng(lat, lng);
                const defaultZIndex = 100 + events.length;

                const markerContainer = document.createElement('div');
                markerContainer.className = 'CDMM-marker-container';
                markerContainer.style.zIndex = defaultZIndex.toString();

                // 마우스 호버 시 최상단으로 올리기 위함
                markerContainer.onmouseenter = () => { markerContainer.style.zIndex = '9999'; };
                markerContainer.onmouseleave = () => { markerContainer.style.zIndex = defaultZIndex.toString(); };

                const firstEvent = events[0];
                const imageUrl = firstEvent.image_thumbnail || firstEvent.image_micro || '';

                const wrapper = document.createElement('div');
                wrapper.className = 'CDMM-marker-wrapper';

                const badgeHtml = events.length > 1 ? `<div class="CDMM-marker-badge">${events.length}</div>` : '';

                const iconDiv = document.createElement('div');
                iconDiv.className = 'CDMM-marker-icon';
                iconDiv.innerHTML = `
                    <div class="CDMM-marker">
                        ${imageUrl ? `<img src="${imageUrl}" alt="Event" />` : `<i class="ri-map-pin-2-fill" style="color: #4f46e5; font-size: 20px;"></i>`}
                    </div>
                    ${badgeHtml}
                    <div class="CDMM-marker-tail"></div>
                `;

                const labelDiv = document.createElement('div');
                labelDiv.className = 'CDMM-marker-label CDMM-marker-label-multi';

                events.forEach((ev, idx) => {
                    const itemDiv = document.createElement('div');
                    itemDiv.className = 'CDMM-group-item';
                    itemDiv.onclick = (e) => {
                        e.stopPropagation();
                        onEventClick(ev);
                    };

                    const locationText = ev.venue_name || ev.location || '장소 정보 없음';
                    itemDiv.innerHTML = `
                        <div class="CDMM-marker-label-text">
                            <span class="CDMM-marker-title">${ev.title}</span>
                            <span class="CDMM-marker-location"><i class="ri-map-pin-line"></i> ${locationText}</span>
                        </div>
                        <i class="ri-arrow-right-s-line CDMM-arrow"></i>
                    `;
                    labelDiv.appendChild(itemDiv);

                    if (idx < events.length - 1) {
                        const dividerDiv = document.createElement('div');
                        dividerDiv.className = 'CDMM-group-divider';
                        labelDiv.appendChild(dividerDiv);
                    }
                });

                wrapper.appendChild(iconDiv);
                wrapper.appendChild(labelDiv);
                markerContainer.appendChild(wrapper);

                const customOverlay = new window.kakao.maps.CustomOverlay({
                    position,
                    content: markerContainer,
                    yAnchor: 1,
                    zIndex: 100 + events.length
                });

                customOverlay.setMap(map);
                overlaysRef.current.push(customOverlay);
                bounds.extend(position);
            });

            if (overlaysRef.current.length > 0) {
                map.setBounds(bounds);
                setTimeout(() => {
                    if (map.getLevel() < 3) map.setLevel(3);
                    else map.setLevel(map.getLevel() + 1);
                }, 100);
            }
        });
    }, [filteredEvents, map, onEventClick]);

    if (!isOpen || !date) return null;

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
                                                {event.category === 'social' ? '소셜' : event.category === 'class' ? '강습' : '이벤트'}
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
