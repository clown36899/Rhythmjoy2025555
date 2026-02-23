import React, { useEffect, useRef } from 'react';
import './EventKakaoMap.css';

declare global {
    interface Window {
        kakao: any;
    }
}

interface EventKakaoMapProps {
    address: string;
    imageUrl?: string | null;
    placeName?: string | null;
    onMarkerClick?: () => void;
    className?: string;
}

export default function EventKakaoMap({ address, imageUrl, placeName, onMarkerClick, className = '' }: EventKakaoMapProps) {
    const mapContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!address || typeof window.kakao === 'undefined' || !mapContainerRef.current) return;

        // 기존 맵 초기화 (DOM 꼬임 방지)
        mapContainerRef.current.innerHTML = '';

        let isMounted = true;

        window.kakao.maps.load(() => {
            if (!isMounted) return;

            const ps = new window.kakao.maps.services.Places();

            const initMap = (lat: number, lng: number) => {
                if (!mapContainerRef.current || !isMounted) return;

                // 다시 한 번 비워주기
                mapContainerRef.current.innerHTML = '';
                const options = {
                    // 마커가 높이(약 120px)를 차지하므로, 시각적으로 중앙에 오도록 
                    // 지도 중심을 실제 좌표보다 살짝 북쪽(화면상 위쪽)으로 올립니다.
                    center: new window.kakao.maps.LatLng(lat + 0.001, lng),
                    level: 4,
                    scrollwheel: false,
                    draggable: false, // 스크롤 도중 지도가 움직이지 않도록 모달 내에서는 고정
                    disableDoubleClickZoom: true,
                };

                const map = new window.kakao.maps.Map(mapContainerRef.current, options);

                // 동그란 마커 렌더링 (이벤트 부착을 위해 DOM 객체 생성)
                const markerContainer = document.createElement('div');
                markerContainer.className = 'EKM-marker-container';
                if (onMarkerClick) {
                    markerContainer.style.cursor = 'pointer';
                    // 클릭 이벤트 추가
                    // 카카오 맵 내부 이벤트 방해를 최소화하기 위해 기본 캡처 처리
                    markerContainer.onclick = (e) => {
                        e.stopPropagation();
                        onMarkerClick();
                    };
                }

                markerContainer.innerHTML = `
                  <div class="EKM-marker-wrapper">
                    <div class="EKM-marker-icon">
                      <div class="EKM-marker">
                        ${imageUrl ? `<img src="${imageUrl}" alt="Marker" />` : `<i class="ri-map-pin-fill" style="font-size: 24px; color: #fff;"></i>`}
                      </div>
                      <div class="EKM-marker-tail"></div>
                    </div>
                    ${placeName ? `<div class="EKM-marker-label"><span>${placeName}</span><i class="ri-arrow-right-s-line"></i></div>` : ''}
                  </div>
                `;

                const customOverlay = new window.kakao.maps.CustomOverlay({
                    position: new window.kakao.maps.LatLng(lat, lng),
                    content: markerContainer,
                    yAnchor: 1, // 마커의 꼬리가 해당 좌표를 정확히 가리키도록 맨 아래로 앵커 설정
                    clickable: true // 오버레이 클릭 가능하도록 설정
                });

                customOverlay.setMap(map);
            };

            // 1. 키워드로 먼저 장소 검색 시도 (장소명이 섞여 있을 수 있음)
            ps.keywordSearch(address, (data: any, status: any) => {
                if (!isMounted) return;
                if (status === window.kakao.maps.services.Status.OK && data.length > 0) {
                    initMap(parseFloat(data[0].y), parseFloat(data[0].x));
                } else {
                    // 2. 키워드로 안되면 Geocoder를 통해 정확한 주소 검색
                    const geocoder = new window.kakao.maps.services.Geocoder();
                    geocoder.addressSearch(address, (geoData: any, geoStatus: any) => {
                        if (!isMounted) return;
                        if (geoStatus === window.kakao.maps.services.Status.OK && geoData.length > 0) {
                            initMap(parseFloat(geoData[0].y), parseFloat(geoData[0].x));
                        } else {
                            // 검색 실패 시 기본 위치 (시청)
                            initMap(37.566826, 126.9786567);
                        }
                    });
                }
            });
        });

        return () => {
            isMounted = false;
            if (mapContainerRef.current) {
                mapContainerRef.current.innerHTML = '';
            }
        };
    }, [address, imageUrl]);

    return (
        <div className={`EKM-container ${className}`}>
            <div ref={mapContainerRef} className="EKM-map"></div>
            <div className="EKM-overlay"></div>
        </div>
    );
}
