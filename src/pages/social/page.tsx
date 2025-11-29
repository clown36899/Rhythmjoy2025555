import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import {
  SeoulMap,
  PlaceList,
  PlaceCalendar,
  SocialCalendar,
  SocialEventModal,
} from './components';
import type { SocialPlace } from './types';

export default function SocialPage() {
  const { placeId } = useParams();
  const navigate = useNavigate();
  const [places, setPlaces] = useState<SocialPlace[]>([]);
  const [loading, setLoading] = useState(true);
  const [focusedPlace, setFocusedPlace] = useState<SocialPlace | null>(null);
  const [view, setView] = useState<'places' | 'calendar'>('calendar'); // 서브메뉴 상태
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [showEventModal, setShowEventModal] = useState(false);

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
    <div className="min-h-screen pb-32" style={{ backgroundColor: 'var(--page-bg-color)' }}>
      {/* 상단 고정 헤더 */}
      <div
        className="fixed top-0 left-0 right-0 z-10 border-b border-[#22262a]"
        style={{
          maxWidth: '650px',
          margin: '0 auto',
          backgroundColor: 'var(--header-bg-color)',
        }}
      >
        {/* 서브 메뉴 */}
        <div className="flex items-center">
          <button
            onClick={() => setView('calendar')}
            className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${
              view === 'calendar'
                ? 'text-green-400 border-b-2 border-green-400'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            소셜 일정표
          </button>
          <button
            onClick={() => setView('places')}
            className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${
              view === 'places'
                ? 'text-green-400 border-b-2 border-green-400'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            소셜 장소
          </button>
        </div>
        {/* 달력 보기일 때만 월 이동 + 요일 헤더 표시 */}
        {view === 'calendar' && (
          <>
            {/* 월 이동 + 등록 버튼 */}
            <div className="flex items-center justify-between p-1 border-t border-[rgb(20,20,20)]">
              <div className="flex items-center gap-4">
                <button onClick={() => changeMonth(-1)} className="p-2 hover:bg-gray-700 rounded-full"><i className="ri-arrow-left-s-line text-white"></i></button>
                <h3 className="text-lg font-bold text-white w-28 text-center p-[0.2rem]">
                  {currentMonth.getFullYear()}년 {currentMonth.getMonth() + 1}월
                </h3>
                <button onClick={() => changeMonth(1)} className="p-2 hover:bg-gray-700 rounded-full"><i className="ri-arrow-right-s-line text-white"></i></button>
              </div>
              <button onClick={() => setShowEventModal(true)} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                <i className="ri-add-line mr-1"></i>일정 등록
              </button>
            </div>
            {/* 요일 헤더 */}
            <div className="grid grid-cols-7 text-center text-xs shadow-[0_4px_6px_-1px_rgba(0,0,0,0.4)]" style={{ backgroundColor: 'var(--header-bg-color)'}}>
              {['일', '월', '화', '수', '목', '금', '토'].map((day, i) => (
                <div key={day} className={`relative py-1.5 ${i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-gray-400'}`}>
                  {day}
                  {i < 6 && (
                    <div className="absolute top-0 right-0 h-full w-px bg-gradient-to-t from-[rgb(20,20,20)] via-[rgba(20,20,20,0.5)] to-transparent"></div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* 메인 콘텐츠 */}
      {/* 헤더 높이만큼 패딩 조정. 달력 뷰일 때 요일 헤더 높이만큼 추가 패딩 */}
      <div style={{ paddingTop: view === 'calendar' ? '7.5rem' : '3.5rem' }}>
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-gray-400">로딩 중...</div>
          </div>
        ) : (
          <div className={view === 'places' ? 'px-4' : ''}>
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
      {showEventModal && <SocialEventModal onClose={() => setShowEventModal(false)} onEventCreated={() => { setShowEventModal(false); /* TODO: fetchUnifiedEvents(); */ }} />}
    </div>
  );
}
