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

export default function SeoulMap({ places }: SeoulMapProps) {
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

    // 모든 장소에 대해 마커와 데이터 준비
    const allMarkerData = places.map((place) => {
      const position = new kakao.maps.LatLng(place.latitude, place.longitude);
      
      const marker = new kakao.maps.Marker({
        position,
        map,
      });

      bounds.extend(position);

      return {
        place,
        position,
        marker,
        bottomOffset: 35, // 기본 오프셋
      };
    });

    // 화면 픽셀 좌표로 변환하여 겹침 감지
    const projection = map.getProjection();
    const screenPositions = allMarkerData.map((data) => {
      const point = projection.pointFromCoords(data.position);
      return {
        data,
        x: point.x,
        y: point.y,
        labelWidth: data.place.name.length * 6 + 12, // 대략적인 라벨 너비
        labelHeight: 15, // 라벨 높이
      };
    });

    // 화면 좌표 기준으로 겹침 감지 및 오프셋 조정
    for (let i = 0; i < screenPositions.length; i++) {
      let overlaps = 0;
      for (let j = 0; j < screenPositions.length; j++) {
        if (i === j) continue;
        
        const xDiff = Math.abs(screenPositions[i].x - screenPositions[j].x);
        const yDiff = Math.abs(screenPositions[i].y - screenPositions[j].y);
        
        // 화면상에서 라벨이 겹치는지 확인 (x축 60px, y축 20px 이내)
        if (xDiff < 60 && yDiff < 20) {
          if (j < i) {
            overlaps++;
          }
        }
      }
      // 겹치는 개수만큼 위로 올림 (15px씩)
      screenPositions[i].data.bottomOffset += (overlaps * 15);
    }

    // 각 마커에 오버레이와 이벤트 추가
    allMarkerData.forEach(({ place, position, marker, bottomOffset }) => {
      // DOM 요소 직접 생성
      const labelDiv = document.createElement('div');
      labelDiv.style.cssText = `
        position: relative;
        bottom: ${bottomOffset}px;
        background: rgba(34, 34, 34, 0.9);
        color: white;
        padding: 2px 6px;
        border-radius: 6px;
        font-size: 9px;
        font-weight: bold;
        white-space: nowrap;
        border: 1px solid rgba(255, 255, 255, 0.15);
        box-shadow: 0 1px 3px rgba(0,0,0,0.3);
        cursor: pointer;
        pointer-events: auto;
      `;
      labelDiv.textContent = place.name;

      const customOverlay = new kakao.maps.CustomOverlay({
        position,
        content: labelDiv,
        yAnchor: 0,
      });
      customOverlay.setMap(map);

      // 확대 함수
      const handleZoom = () => {
        map.setLevel(3);
        map.setCenter(position);
      };

      // 마커 클릭 이벤트
      kakao.maps.event.addListener(marker, 'click', handleZoom);

      // 라벨 클릭 이벤트 (DOM 요소에 직접 할당)
      labelDiv.onclick = (e) => {
        e.stopPropagation();
        handleZoom();
      };

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
      initialBoundsRef.current = bounds;
    }
  }, [map, places]);

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
