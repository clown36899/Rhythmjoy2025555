import { useEffect, useRef, useState } from 'react';
import type { SocialPlace } from '../page';

declare global {
  interface Window {
    kakao: any;
  }
}

interface SeoulMapProps {
  places: SocialPlace[];
  onPlaceSelect: (place: SocialPlace) => void;
}

export default function SeoulMap({ places, onPlaceSelect }: SeoulMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const markersRef = useRef<any[]>([]);
  const initialBoundsRef = useRef<any>(null);

  useEffect(() => {
    if (!mapRef.current) return;

    let attempts = 0;
    const maxAttempts = 20;

    const initMap = () => {
      if (!window.kakao || !window.kakao.maps) {
        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(initMap, 200);
        } else {
          console.error('카카오맵 SDK가 로드되지 않았습니다.');
          setLoading(false);
        }
        return;
      }

      const kakao = window.kakao;
      try {
        const center = new kakao.maps.LatLng(37.5665, 126.9780);
        const options = {
          center,
          level: 8,
        };

        const newMap = new kakao.maps.Map(mapRef.current, options);
        setMap(newMap);
        setLoading(false);
        console.log('카카오맵 초기화 성공');
      } catch (error) {
        console.error('카카오맵 초기화 실패:', error);
        setLoading(false);
      }
    };

    initMap();
  }, []);

  useEffect(() => {
    if (!map || !window.kakao) return;

    markersRef.current.forEach(item => {
      if (item.marker) item.marker.setMap(null);
      if (item.overlay) item.overlay.setMap(null);
    });
    markersRef.current = [];

    const kakao = window.kakao;
    const bounds = new kakao.maps.LatLngBounds();

    // 같은 위치 장소 그룹화 (겹침 방지)
    const positionGroups = new Map<string, SocialPlace[]>();
    places.forEach((place) => {
      const key = `${place.latitude},${place.longitude}`;
      if (!positionGroups.has(key)) {
        positionGroups.set(key, []);
      }
      positionGroups.get(key)!.push(place);
    });

    // 모든 장소에 대해 마커와 오버레이 생성 (겹침 처리 전)
    const overlayData: Array<{
      place: SocialPlace;
      position: any;
      marker: any;
      bottomOffset: number;
    }> = [];

    places.forEach((place) => {
      const position = new kakao.maps.LatLng(place.latitude, place.longitude);
      
      const marker = new kakao.maps.Marker({
        position,
        map,
      });

      overlayData.push({
        place,
        position,
        marker,
        bottomOffset: 35, // 기본 오프셋
      });

      bounds.extend(position);
    });

    // 겹침 감지 및 오프셋 조정
    for (let i = 0; i < overlayData.length; i++) {
      for (let j = i + 1; j < overlayData.length; j++) {
        const pos1 = overlayData[i].position;
        const pos2 = overlayData[j].position;
        
        // 지도상 거리 계산 (매우 가까운지 확인)
        const latDiff = Math.abs(pos1.getLat() - pos2.getLat());
        const lngDiff = Math.abs(pos1.getLng() - pos2.getLng());
        
        // 0.002도 이내면 겹침으로 간주 (약 200m)
        if (latDiff < 0.002 && lngDiff < 0.002) {
          // j번째 오버레이를 위로 올림
          overlayData[j].bottomOffset += 20;
        }
      }
    }

    // 오버레이 생성
    overlayData.forEach(({ place, position, marker, bottomOffset }) => {
      const overlayContent = `
        <div style="
          position: relative;
          bottom: ${bottomOffset}px;
          background: rgba(34, 34, 34, 0.95);
          color: white;
          padding: 2px 6px;
          border-radius: 8px;
          font-size: 9px;
          font-weight: bold;
          white-space: nowrap;
          border: 1px solid rgba(255, 255, 255, 0.2);
          box-shadow: 0 2px 4px rgba(0,0,0,0.3);
          cursor: pointer;
        ">
          ${place.name}
        </div>
      `;

      const customOverlay = new kakao.maps.CustomOverlay({
        position,
        content: overlayContent,
        yAnchor: 0,
      });
      customOverlay.setMap(map);

      // 확대 함수
      const zoomToPosition = () => {
        const currentLevel = map.getLevel();
        const targetLevel = 3;
        
        if (currentLevel > targetLevel) {
          let step = 0;
          const steps = currentLevel - targetLevel;
          const interval = setInterval(() => {
            if (step >= steps) {
              clearInterval(interval);
              return;
            }
            map.setLevel(currentLevel - step - 1);
            step++;
          }, 100);
        }
        map.panTo(position);
      };

      // 마커 클릭
      kakao.maps.event.addListener(marker, 'click', zoomToPosition);

      // 오버레이(이름) 클릭
      setTimeout(() => {
        const overlayElement = customOverlay.getContent();
        if (overlayElement && overlayElement.addEventListener) {
          overlayElement.addEventListener('click', zoomToPosition);
        }
      }, 100);

      // 호버 시 상세 정보
      const infowindow = new kakao.maps.InfoWindow({
        content: `<div style="padding:8px;font-size:11px;width:140px;">
          <div style="font-weight:bold;margin-bottom:4px;">${place.name}</div>
          <div style="color:#666;font-size:10px;">${place.address}</div>
        </div>`,
      });

      kakao.maps.event.addListener(marker, 'mouseover', () => {
        infowindow.open(map, marker);
      });

      kakao.maps.event.addListener(marker, 'mouseout', () => {
        infowindow.close();
      });

      markersRef.current.push({ marker, overlay: customOverlay });
    });

    if (places.length > 0) {
      map.setBounds(bounds);
      // 초기 bounds 저장 (원상태 복원용)
      initialBoundsRef.current = bounds;
    }
  }, [map, places, onPlaceSelect]);

  const resetMapView = () => {
    if (!map || !initialBoundsRef.current) return;
    
    // 부드럽게 원상태로 복원
    map.setBounds(initialBoundsRef.current);
  };

  return (
    <div className="w-full h-64 relative bg-gray-800 rounded-lg overflow-hidden">
      <div ref={mapRef} className="w-full h-full" />
      
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
          <div className="text-gray-400">지도 로딩 중...</div>
        </div>
      )}
      
      {map && initialBoundsRef.current && (
        <button
          onClick={resetMapView}
          className="absolute bottom-2 left-2 z-10 bg-white hover:bg-gray-100 text-gray-700 p-2.5 rounded-lg shadow-md border border-gray-200 transition-colors"
          title="전체 보기"
        >
          <i className="ri-fullscreen-line text-lg"></i>
        </button>
      )}
    </div>
  );
}
