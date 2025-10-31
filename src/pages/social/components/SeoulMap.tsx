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
  const [mapType, setMapType] = useState<'ROADMAP' | 'SKYVIEW'>('ROADMAP');
  const [loading, setLoading] = useState(true);
  const markersRef = useRef<any[]>([]);

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
      
      groupPlaces.forEach((place, index) => {
        // 같은 위치에 여러 장소가 있으면 약간씩 offset
        const offsetLat = lat + (index * 0.0003);
        const offsetLng = lng + (index * 0.0003);
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
          onPlaceSelect(place);
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
    }
  }, [map, places, onPlaceSelect]);

  const toggleMapType = () => {
    if (!map || !window.kakao) return;

    const kakao = window.kakao;
    const newType = mapType === 'ROADMAP' ? 'SKYVIEW' : 'ROADMAP';
    
    map.setMapTypeId(kakao.maps.MapTypeId[newType]);
    setMapType(newType);
  };

  return (
    <div className="w-full h-64 relative bg-gray-800 rounded-lg overflow-hidden">
      <div ref={mapRef} className="w-full h-full" />
      
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
          <div className="text-gray-400">지도 로딩 중...</div>
        </div>
      )}
      
      {map && (
        <button
          onClick={toggleMapType}
          className="absolute top-2 right-2 z-10 bg-white hover:bg-gray-100 text-gray-700 px-3 py-2 rounded-lg text-sm font-medium shadow-md border border-gray-200 transition-colors"
        >
          <i className={`ri-${mapType === 'ROADMAP' ? 'earth' : 'map-2'}-line mr-1`}></i>
          {mapType === 'ROADMAP' ? '스카이뷰' : '지도'}
        </button>
      )}
    </div>
  );
}
