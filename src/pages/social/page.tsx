import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import SeoulMap from './components/SeoulMap';
import PlaceList from './components/PlaceList';
import PlaceCalendar from './components/PlaceCalendar';

export interface SocialPlace {
  id: number;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  contact?: string;
  description?: string;
  created_at?: string;
}

export default function SocialPage() {
  const { placeId } = useParams();
  const navigate = useNavigate();
  const [places, setPlaces] = useState<SocialPlace[]>([]);
  const [selectedPlace, setSelectedPlace] = useState<SocialPlace | null>(null);
  const [loading, setLoading] = useState(true);

  // 장소 목록 불러오기
  useEffect(() => {
    loadPlaces();
  }, []);

  // URL 파라미터로 장소 선택
  useEffect(() => {
    if (placeId && places.length > 0) {
      const place = places.find(p => p.id === parseInt(placeId));
      setSelectedPlace(place || null);
    } else {
      setSelectedPlace(null);
    }
  }, [placeId, places]);

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

  const handlePlaceSelect = (place: SocialPlace) => {
    navigate(`/social/${place.id}`);
  };

  const handleBack = () => {
    navigate('/social');
  };

  // 장소별 달력 보기
  if (selectedPlace) {
    return (
      <PlaceCalendar
        place={selectedPlace}
        onBack={handleBack}
        onPlaceUpdate={loadPlaces}
      />
    );
  }

  // 메인 화면: 지도 + 장소 리스트
  return (
    <div className="min-h-screen pb-20" style={{ backgroundColor: 'var(--page-bg-color)' }}>
      {/* 헤더 */}
      <div
        className="fixed top-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-3"
        style={{
          maxWidth: '650px',
          margin: '0 auto',
          backgroundColor: 'var(--header-bg-color)',
        }}
      >
        <h1 className="text-xl font-bold text-white">소셜 장소</h1>
      </div>

      {/* 메인 콘텐츠 */}
      <div className="pt-14">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-gray-400">로딩 중...</div>
          </div>
        ) : (
          <>
            {/* 서울 지도 */}
            <div className="mb-4">
              <SeoulMap
                places={places}
                onPlaceSelect={handlePlaceSelect}
              />
            </div>

            {/* 장소 리스트 */}
            <PlaceList
              places={places}
              onPlaceSelect={handlePlaceSelect}
              onPlaceUpdate={loadPlaces}
            />
          </>
        )}
      </div>
    </div>
  );
}
