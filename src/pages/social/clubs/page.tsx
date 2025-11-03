import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import SocialSubMenu from '../components/SocialSubMenu';
import PlaceModal from '../components/PlaceModal';
import type { SocialPlace } from '../page';

export default function ClubsPage() {
  const { isAdmin } = useAuth();
  const [places, setPlaces] = useState<SocialPlace[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPlaceModal, setShowPlaceModal] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState<SocialPlace | null>(null);
  const [map, setMap] = useState<any>(null);

  useEffect(() => {
    loadPlaces();
    initMap();
  }, []);

  const loadPlaces = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('social_places')
        .select('*')
        .order('name');

      if (error) throw error;
      setPlaces(data || []);
    } catch (error) {
      console.error('장소 로딩 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  const initMap = () => {
    const container = document.getElementById('clubs-map');
    if (!container || !window.kakao || !window.kakao.maps) {
      console.error('카카오맵 SDK가 로드되지 않았습니다.');
      setLoading(false);
      return;
    }

    // SDK가 로드되었다면, load()를 사용하여 내부 클래스 등록을 보장
    window.kakao.maps.load(() => {
      try {
        const center = new window.kakao.maps.LatLng(37.5665, 126.978);
        const options = {
          center,
          level: 8,
        };

        const newMap = new window.kakao.maps.Map(container, options);
        setMap(newMap);
        setLoading(false);
      } catch (error) {
        console.error('카카오맵 초기화 실패:', error);
        setLoading(false);
      }
    });
  };

  useEffect(() => {
    if (!map || !window.kakao || places.length === 0) return;

    const kakao = window.kakao;
    const bounds = new kakao.maps.LatLngBounds();

    places.forEach((place) => {
      const position = new kakao.maps.LatLng(place.latitude, place.longitude);
      
      const marker = new kakao.maps.Marker({
        position,
        map,
      });

      bounds.extend(position);

      const labelDiv = document.createElement('div');
      labelDiv.style.cssText = `
        position: relative;
        bottom: 35px;
        background: rgba(34, 34, 34, 0.9);
        color: white;
        padding: 3px 8px;
        border-radius: 6px;
        font-size: 10px;
        font-weight: bold;
        white-space: nowrap;
        cursor: pointer;
      `;
      labelDiv.textContent = place.name;

      const customOverlay = new kakao.maps.CustomOverlay({
        position,
        content: labelDiv,
        yAnchor: 0,
      });
      customOverlay.setMap(map);

      const handleClick = () => {
        setSelectedPlace(place);
      };

      kakao.maps.event.addListener(marker, 'click', handleClick);
      labelDiv.onclick = handleClick;
    });

    if (places.length > 0) {
      map.setBounds(bounds);
    }
  }, [map, places]);

  const handleClosePlaceInfo = () => {
    setSelectedPlace(null);
  };

  const handleCopyAddress = () => {
    if (selectedPlace?.address) {
      navigator.clipboard.writeText(selectedPlace.address);
      alert('주소가 복사되었습니다');
    }
  };

  const handleOpenNaverMap = () => {
    if (selectedPlace) {
      const url = `https://map.naver.com/v5/search/${encodeURIComponent(selectedPlace.address)}`;
      window.open(url, '_blank');
    }
  };

  const handleShare = async () => {
    if (selectedPlace) {
      const shareData = {
        title: selectedPlace.name,
        text: `${selectedPlace.name}\n${selectedPlace.address}`,
      };
      
      if (navigator.share) {
        try {
          await navigator.share(shareData);
        } catch (err) {
          console.log('공유 취소');
        }
      } else {
        navigator.clipboard.writeText(`${selectedPlace.name}\n${selectedPlace.address}`);
        alert('정보가 복사되었습니다');
      }
    }
  };

  return (
    <div className="min-h-screen pb-20" style={{ backgroundColor: 'var(--page-bg-color)' }}>
      <div
        className="fixed top-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-3"
        style={{
          maxWidth: '650px',
          margin: '0 auto',
          backgroundColor: 'var(--header-bg-color)',
        }}
      >
        <h1 className="text-xl font-bold text-white">동호회 위치</h1>
      </div>

      <SocialSubMenu />

      <div className="pt-28">
        <div className="relative w-full" style={{ height: 'calc(100vh - 160px)' }}>
          <div id="clubs-map" className="w-full h-full" />
          
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
              <div className="text-gray-400">지도 로딩 중...</div>
            </div>
          )}

          {isAdmin && (
            <button
              onClick={() => setShowPlaceModal(true)}
              className="absolute top-4 right-4 z-10 bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg shadow-lg transition-colors"
            >
              <i className="ri-add-line mr-1"></i>
              장소 등록
            </button>
          )}

          {selectedPlace && (
            <div className="absolute bottom-4 left-4 right-4 z-10 bg-gray-900 rounded-lg p-4 shadow-lg">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className="text-white font-bold text-lg">{selectedPlace.name}</h3>
                  <p className="text-gray-400 text-sm mt-1">{selectedPlace.address}</p>
                </div>
                <button
                  onClick={handleClosePlaceInfo}
                  className="text-gray-400 hover:text-white"
                >
                  <i className="ri-close-line text-xl"></i>
                </button>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleCopyAddress}
                  className="flex-1 bg-gray-800 hover:bg-gray-700 text-white py-2 px-3 rounded text-sm transition-colors"
                >
                  <i className="ri-file-copy-line mr-1"></i>
                  주소복사
                </button>
                <button
                  onClick={handleOpenNaverMap}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 px-3 rounded text-sm transition-colors"
                >
                  <i className="ri-map-pin-line mr-1"></i>
                  지도보기
                </button>
                <button
                  onClick={handleShare}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 px-3 rounded text-sm transition-colors"
                >
                  <i className="ri-share-line mr-1"></i>
                  공유
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {showPlaceModal && (
        <PlaceModal
          category="clubs"
          onClose={() => setShowPlaceModal(false)}
          onSaved={loadPlaces}
        />
      )}
    </div>
  );
}
