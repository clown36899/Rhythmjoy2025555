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

    positionGroups.forEach((groupPlaces, posKey) => {
      const [lat, lng] = posKey.split(',').map(Number);
      const count = groupPlaces.length;
      
      groupPlaces.forEach((place, index) => {
        // 같은 위치에 여러 장소가 있으면 원형으로 배치
        let offsetLat = lat;
        let offsetLng = lng;
        
        if (count > 1) {
          const angle = (index / count) * 2 * Math.PI;
          const radius = 0.001; // 약 111m
          offsetLat = lat + (radius * Math.cos(angle));
          offsetLng = lng + (radius * Math.sin(angle));
        }
        
        const position = new kakao.maps.LatLng(offsetLat, offsetLng);
        
        const marker = new kakao.maps.Marker({
          position,
          map,
        });

        // 장소 이름 표시 (항상 보이는 오버레이)
        const overlayContent = `
          <div style="
            position: relative;
            bottom: 50px;
            background: rgba(34, 34, 34, 0.95);
            color: white;
            padding: 4px 10px;
            border-radius: 12px;
            font-size: 11px;
            font-weight: bold;
            white-space: nowrap;
            border: 1px solid rgba(255, 255, 255, 0.2);
            box-shadow: 0 2px 6px rgba(0,0,0,0.3);
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

        // 호버 시 상세 정보
        const infowindow = new kakao.maps.InfoWindow({
          content: `<div style="padding:10px;font-size:12px;width:150px;">
            <div style="font-weight:bold;margin-bottom:5px;">${place.name}</div>
            <div style="color:#666;font-size:11px;">${place.address}</div>
          </div>`,
        });

        kakao.maps.event.addListener(marker, 'click', () => {
          // 마커 클릭 시 해당 위치로 부드럽게 확대
          const currentLevel = map.getLevel();
          const targetLevel = 3;
          
          // 줌 레벨을 단계적으로 변경 (부드러운 효과)
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
          
          // 부드럽게 이동
          map.panTo(position);
        });

        kakao.maps.event.addListener(marker, 'mouseover', () => {
          infowindow.open(map, marker);
        });

        kakao.maps.event.addListener(marker, 'mouseout', () => {
          infowindow.close();
        });

        markersRef.current.push({ marker, overlay: customOverlay });
        bounds.extend(position);
      });
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
