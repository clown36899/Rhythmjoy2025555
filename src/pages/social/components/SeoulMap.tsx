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
  const markersRef = useRef<any[]>([]);

  useEffect(() => {
    if (!mapRef.current || !window.kakao) return;

    const kakao = window.kakao;
    kakao.maps.load(() => {
      const center = new kakao.maps.LatLng(37.5665, 126.9780);
      const options = {
        center,
        level: 8,
      };

      const newMap = new kakao.maps.Map(mapRef.current, options);
      setMap(newMap);
    });
  }, []);

  useEffect(() => {
    if (!map || !window.kakao) return;

    markersRef.current.forEach(marker => marker.setMap(null));
    markersRef.current = [];

    const kakao = window.kakao;
    const bounds = new kakao.maps.LatLngBounds();

    places.forEach((place) => {
      const position = new kakao.maps.LatLng(place.latitude, place.longitude);
      
      const marker = new kakao.maps.Marker({
        position,
        map,
      });

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

      markersRef.current.push(marker);
      bounds.extend(position);
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
    <div className="w-full h-64 relative">
      <div ref={mapRef} className="w-full h-full" />
      
      <button
        onClick={toggleMapType}
        className="absolute top-2 right-2 z-10 bg-white hover:bg-gray-100 text-gray-700 px-3 py-2 rounded-lg text-sm font-medium shadow-md border border-gray-200 transition-colors"
      >
        <i className={`ri-${mapType === 'ROADMAP' ? 'earth' : 'map-2'}-line mr-1`}></i>
        {mapType === 'ROADMAP' ? '스카이뷰' : '지도'}
      </button>
    </div>
  );
}
