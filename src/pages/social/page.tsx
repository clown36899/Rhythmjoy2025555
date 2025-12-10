import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import {
  SeoulMap,
  PlaceList,
  PlaceCalendar,
  SocialCalendar
} from './components';
import SimpleHeader from '../../components/SimpleHeader';
import type { SocialPlace } from './types';
import './social.css';

export default function SocialPage() {
  const { placeId } = useParams();
  const navigate = useNavigate();
  const [places, setPlaces] = useState<SocialPlace[]>([]);
  const [loading, setLoading] = useState(true);
  const [focusedPlace, setFocusedPlace] = useState<SocialPlace | null>(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [showEventModal, setShowEventModal] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(0);
  const headerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const headerElement = headerRef.current;
    if (!headerElement) return;

    const observer = new ResizeObserver(() => {
      setHeaderHeight(headerElement.offsetHeight);
    });
    observer.observe(headerElement);
    return () => observer.disconnect();
  }, []);

  // Listeners from MobileShell
  useEffect(() => {
    const handleOpenRegistration = () => setShowEventModal(true);
    window.addEventListener('openSocialRegistration', handleOpenRegistration);
    return () => window.removeEventListener('openSocialRegistration', handleOpenRegistration);
  }, []);

  // 장소 목록 불러오기
  useEffect(() => {
    loadPlaces();
  }, []);

  // URL 파라미터로 달력에 표시할 장소 선택
  const placeForCalendar = placeId && places.length > 0
    ? places.find(p => p.id === parseInt(placeId))
    : null;

  const loadPlaces = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('social_places')
        .select('id:place_id, name, address, latitude, longitude, created_at')
        .order('name');

      if (error) throw error;
      setPlaces(data || []);
    } catch (error) {
      console.error('장소 로딩 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFocusPlace = (place: SocialPlace) => {
    setFocusedPlace(place);
    // 리스트에서 장소 클릭 시 별도 뷰 전환 없이 지도 포커스만 이동
  };

  const handleViewCalendar = (place: SocialPlace) => {
    navigate(`/social/${place.id}`);
  };

  // 장소별 달력 보기 (상세 페이지 개념)
  if (placeForCalendar) {
    return (
      <PlaceCalendar
        place={placeForCalendar}
        onBack={() => navigate('/social')}
        onPlaceUpdate={loadPlaces}
      />
    );
  }

  // 메인 화면: 주간 스케줄표 (상단) + 지도/장소 리스트 (하단)
  return (
    <div className="social-page-container" style={{ backgroundColor: 'var(--page-bg-color)' }}>
      {/* 상단 고정 헤더 - SimpleHeader 사용으로 통일성 확보 */}
      <div
        ref={headerRef}
        className="social-header global-header"
      >
        <SimpleHeader title="Social Schedule" />
      </div>

      {/* 메인 콘텐츠 */}
      <div style={{ paddingTop: `${headerHeight}px`, paddingBottom: '80px' }}>
        {loading ? (
          <div className="social-loader">
            <div className="loader-text">로딩 중...</div>
          </div>
        ) : (
          <div className="social-merged-view">
            {/* 1. 주간 스케줄표 */}
            <section className="social-section-schedule">
              <SocialCalendar
                currentMonth={currentMonth}
                showModal={showEventModal}
                setShowModal={setShowEventModal}
              />
            </section>

            {/* 2. 장소 지도 및 리스트 */}
            <section className="social-section-places" style={{ padding: '0 1rem' }}>

              <PlaceList
                places={places}
                onPlaceSelect={handleFocusPlace}
                onViewCalendar={handleViewCalendar}
                onPlaceUpdate={loadPlaces}
              />
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
