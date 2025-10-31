import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { SocialPlace } from '../page';

// Leaflet 기본 아이콘 수정 (빌드 시 경로 문제 해결)
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface SeoulMapProps {
  places: SocialPlace[];
  onPlaceSelect: (place: SocialPlace) => void;
}

// 지도 중심 자동 조정 컴포넌트
function MapBounds({ places }: { places: SocialPlace[] }) {
  const map = useMap();

  useEffect(() => {
    if (places.length > 0) {
      const bounds = L.latLngBounds(
        places.map(p => [p.latitude, p.longitude] as [number, number])
      );
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [places, map]);

  return null;
}

export default function SeoulMap({ places, onPlaceSelect }: SeoulMapProps) {
  // 서울 중심 좌표
  const seoulCenter: [number, number] = [37.5665, 126.9780];

  return (
    <div className="w-full h-64 relative">
      <MapContainer
        center={seoulCenter}
        zoom={11}
        style={{ height: '100%', width: '100%' }}
        className="z-0"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        {places.map((place) => (
          <Marker
            key={place.id}
            position={[place.latitude, place.longitude]}
            eventHandlers={{
              click: () => onPlaceSelect(place),
            }}
          >
            <Popup>
              <div className="text-sm">
                <div className="font-bold mb-1">{place.name}</div>
                <div className="text-gray-600 text-xs">{place.address}</div>
              </div>
            </Popup>
          </Marker>
        ))}

        {places.length > 0 && <MapBounds places={places} />}
      </MapContainer>
    </div>
  );
}
