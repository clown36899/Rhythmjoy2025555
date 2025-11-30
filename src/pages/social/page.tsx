import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import {
  SeoulMap,
  PlaceList,
  PlaceCalendar,
  SocialCalendar
} from './components';
import type { SocialPlace } from './types';
import './social.css';

export default function SocialPage() {
  const { placeId } = useParams();
  const navigate = useNavigate();
  const [places, setPlaces] = useState<SocialPlace[]>([]);
  const [loading, setLoading] = useState(true);
  const [focusedPlace, setFocusedPlace] = useState<SocialPlace | null>(null);
  const [view, setView] = useState<'places' | 'calendar'>('calendar'); // 서브메뉴 상태
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
    // 리스트에서 장소 클릭 시 지도 뷰로 전환
    if (view !== 'places') {
      setView('places');
    }
  };

  const handleViewCalendar = (place: SocialPlace) => {
    navigate(`/social/${place.id}`);
  };

  const changeMonth = (offset: number) => {
    setCurrentMonth(prev => {
      const newDate = new Date(prev);
      newDate.setMonth(newDate.getMonth() + offset);
      return newDate;
    });
  };

  const handleBackFromCalendar = () => {
    navigate('/social');
  };

  // 장소별 달력 보기
  if (placeForCalendar) {
    return (
      <PlaceCalendar
        place={placeForCalendar}
        onBack={handleBackFromCalendar}
        onPlaceUpdate={loadPlaces}
      />
    );
  }

  // 메인 화면: 지도 + 장소 리스트
  return (
    <div className="social-page-container" style={{ backgroundColor: 'var(--page-bg-color)' }}>
      {/* 상단 고정 헤더 */}
      <div
        ref={headerRef}
        className="fixed top-0 left-0 right-0 z-10 border-b border-[#22262a]"
        style={{
          maxWidth: '650px',
          margin: '0 auto',
          backgroundColor: 'var(--header-bg-color)',
        }}
      >
        {/* 서브 메뉴 */}
        <div className="social-sub-menu">
          <button
            onClick={() => setView('calendar')}
            className={`sub-menu-button ${view === 'calendar' ? 'active' : ''}`}
          >
            소셜 일정표
          </button>
          <button
            onClick={() => setView('places')}
            className={`sub-menu-button ${view === 'places' ? 'active' : ''}`}
          >
            소셜 장소
          </button>
        </div>
        {/* 달력 보기일 때만 월 이동 + 요일 헤더 표시 */}
        {view === 'calendar' && (
          <>
            {/* 월 이동 + 등록 버튼 */}
            <div className="calendar-controls">
              <div className="month-nav-container">
                <button onClick={() => changeMonth(-1)} className="month-nav-button"><i className="ri-arrow-left-s-line"></i></button>
                <h3 className="month-display">
                  {currentMonth.getFullYear()}년 {currentMonth.getMonth() + 1}월
                </h3>
                <button onClick={() => changeMonth(1)} className="month-nav-button"><i className="ri-arrow-right-s-line"></i></button>
              </div>
              <button onClick={() => setShowEventModal(true)} className="calendar-register-button">
                <i className="ri-add-line mr-1"></i>일정 등록
              </button>
            </div>
            {/* 요일 헤더 */}
            <div className="day-header-grid" style={{ backgroundColor: 'var(--header-bg-color)'}}>
              {['일', '월', '화', '수', '목', '금', '토'].map((day, i) => (
                <div key={day} className={`day-header-cell ${i === 0 ? 'sunday' : i === 6 ? 'saturday' : 'weekday'}`}>
                  {day}
                  {i < 6 && (
                    <div className="day-header-divider"></div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* 메인 콘텐츠 */}
      {/* 헤더 높이만큼 패딩 조정. 달력 뷰일 때 요일 헤더 높이만큼 추가 패딩 */}
      <div style={{ paddingTop: `${headerHeight}px` }}>
        {loading ? (
          <div className="social-loader">
            <div className="loader-text">로딩 중...</div>
          </div>
        ) : (
          <div className={view === 'places' ? 'places-view' : 'calendar-view'}>
            {view === 'places' ? (
              <>
                <div className="mb-4">
                  <SeoulMap
                    places={places}
                    selectedPlace={focusedPlace}
                    onMarkerClick={handleFocusPlace}
                  />
                </div>
                <PlaceList
                  places={places}
                  onPlaceSelect={handleFocusPlace}
                  onViewCalendar={handleViewCalendar}
                  onPlaceUpdate={loadPlaces}
                />
              </>
            ) : (
              <SocialCalendar
                currentMonth={currentMonth}
                showModal={showEventModal}
                setShowModal={setShowEventModal}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
