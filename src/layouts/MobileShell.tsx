import { Outlet, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";

export function MobileShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isAdmin } = useAuth();
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [eventCounts, setEventCounts] = useState({ class: 0, event: 0 });
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [calendarView, setCalendarView] = useState<{ year: number; month: number; viewMode: 'month' | 'year' }>({
    year: new Date().getFullYear(),
    month: new Date().getMonth(),
    viewMode: 'month'
  });

  // 달력 월/뷰모드 변경 감지
  useEffect(() => {
    const handleCalendarMonthChanged = (e: CustomEvent) => {
      setCalendarView(e.detail);
    };

    window.addEventListener('calendarMonthChanged', handleCalendarMonthChanged as EventListener);
    
    return () => {
      window.removeEventListener('calendarMonthChanged', handleCalendarMonthChanged as EventListener);
    };
  }, []);

  // selectedDate 변경 감지
  useEffect(() => {
    const handleSelectedDateChanged = (e: CustomEvent) => {
      setSelectedDate(e.detail);
    };

    window.addEventListener('selectedDateChanged', handleSelectedDateChanged as EventListener);
    
    return () => {
      window.removeEventListener('selectedDateChanged', handleSelectedDateChanged as EventListener);
    };
  }, []);

  // 이벤트 개수 로드 (현재 달력 월/년 기준)
  useEffect(() => {
    const loadEventCounts = async () => {
      try {
        const { data: events } = await supabase
          .from('events')
          .select('category, date, start_date, end_date');
        
        if (events) {
          // 현재 달력에 표시된 월/년에 해당하는 이벤트만 필터링
          const filteredEvents = events.filter(event => {
            const eventDate = new Date(event.start_date || event.date);
            const eventYear = eventDate.getFullYear();
            const eventMonth = eventDate.getMonth();
            
            if (calendarView.viewMode === 'year') {
              // 년 단위 표시: 해당 년도의 모든 이벤트
              return eventYear === calendarView.year;
            } else {
              // 월 단위 표시: 해당 월의 이벤트만
              return eventYear === calendarView.year && eventMonth === calendarView.month;
            }
          });
          
          const classCount = filteredEvents.filter(e => e.category === 'class').length;
          const eventCount = filteredEvents.filter(e => e.category === 'event').length;
          setEventCounts({ class: classCount, event: eventCount });
        }
      } catch (error) {
        console.error('이벤트 개수 로드 실패:', error);
      }
    };

    if (location.pathname === '/') {
      loadEventCounts();
      
      // 이벤트 변경 시 개수 업데이트
      const handleEventChange = () => {
        loadEventCounts();
      };
      
      window.addEventListener('eventCreated', handleEventChange);
      window.addEventListener('eventUpdated', handleEventChange);
      window.addEventListener('eventDeleted', handleEventChange);
      
      return () => {
        window.removeEventListener('eventCreated', handleEventChange);
        window.removeEventListener('eventUpdated', handleEventChange);
        window.removeEventListener('eventDeleted', handleEventChange);
      };
    }
  }, [location.pathname, calendarView]);

  // 테마 색상 로드 (DB 최우선, index.css는 폴백)
  useEffect(() => {
    const loadThemeColors = async () => {
      try {
        const { data, error } = await supabase
          .from("theme_settings")
          .select("*")
          .eq("id", 1)
          .single();

        if (error || !data) {
          return;
        }

        // CSS 변수 업데이트 (DB 색상으로 덮어씀)
        document.documentElement.style.setProperty("--bg-color", data.background_color);
        document.documentElement.style.setProperty("--header-bg-color", data.header_bg_color || "#1f2937");
        document.documentElement.style.setProperty("--calendar-bg-color", data.calendar_bg_color);
        document.documentElement.style.setProperty("--event-list-bg-color", data.event_list_bg_color);
        document.documentElement.style.setProperty("--event-list-outer-bg-color", data.event_list_outer_bg_color);
        document.documentElement.style.setProperty("--page-bg-color", data.page_bg_color || "#111827");
      } catch (err) {
        // 기본 색상 사용 (index.css)
      }
    };

    loadThemeColors();
  }, []);


  // 현재 페이지와 카테고리 파악
  const isEventsPage = location.pathname === '/';
  const isSocialPage = location.pathname.startsWith('/social');
  const isPracticePage = location.pathname === '/practice';
  const isGuidePage = location.pathname === '/guide';
  const category = searchParams.get('category') || 'all';

  // 카테고리 변경 (이벤트 페이지 전용)
  const handleCategoryChange = (newCategory: string) => {
    // 전체 버튼 클릭 시 날짜 선택 해제
    if (newCategory === 'all') {
      window.dispatchEvent(new CustomEvent('clearSelectedDate'));
      navigate('/');
    } else {
      navigate(`/?category=${newCategory}`);
    }
  };

  return (
    <div className="min-h-screen bg-[#1f1f1f]">
      {/* Main Content */}
      <Outlet context={{ category }} />

      {/* Bottom Navigation - 모든 페이지 공통 */}
      <div className="fixed bottom-0 left-0 right-0 z-20" style={{ maxWidth: '650px', margin: '0 auto' }}>
        {/* Category Filter Badges - 홈 페이지에서만 표시 */}
        {isEventsPage && (
          <div 
            className="border-t border-[#22262a] flex items-center justify-between px-3 py-1.5 no-select gap-2"
            style={{ 
              backgroundColor: "var(--header-bg-color)",
              minHeight: '32px'
            }}
          >
            <div className="flex items-center gap-2 flex-1 justify-center">
              {/* 행사 버튼 (앞으로 이동) */}
              <button
                onClick={() => {
                  // 독립 토글: 행사 켜기/끄기
                  if (category === 'all') {
                    handleCategoryChange('class'); // 둘 다 켜짐 → 강습만
                  } else if (category === 'event') {
                    handleCategoryChange('none'); // 행사만 → 둘 다 끔
                  } else if (category === 'class') {
                    handleCategoryChange('all'); // 강습만 → 둘 다 켬
                  } else {
                    handleCategoryChange('event'); // 둘 다 꺼짐 → 행사만
                  }
                }}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border transition-colors ${
                  category === 'event' || category === 'all'
                    ? 'bg-blue-500/20 border-blue-500 text-blue-300'
                    : 'bg-gray-700/30 border-gray-600 text-gray-400'
                }`}
              >
                <span>행사 {eventCounts.event}</span>
                <i className={`${category === 'event' || category === 'all' ? 'ri-check-line' : 'ri-close-line'} text-sm`}></i>
              </button>
              
              {/* 오늘 버튼 - 현재 월이 아닐 때만 표시 */}
              {!(calendarView.year === new Date().getFullYear() && calendarView.month === new Date().getMonth()) && (
                <button
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent('resetToToday'));
                  }}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border transition-colors bg-green-500/20 border-green-500 text-green-300 hover:bg-green-500/30"
                >
                  <span>오늘</span>
                  <i className="ri-calendar-check-line text-sm"></i>
                </button>
              )}
              
              {/* 강습 버튼 */}
              <button
                onClick={() => {
                  // 독립 토글: 강습 켜기/끄기
                  if (category === 'all') {
                    handleCategoryChange('event'); // 둘 다 켜짐 → 행사만
                  } else if (category === 'class') {
                    handleCategoryChange('none'); // 강습만 → 둘 다 끔
                  } else if (category === 'event') {
                    handleCategoryChange('all'); // 행사만 → 둘 다 켬
                  } else {
                    handleCategoryChange('class'); // 둘 다 꺼짐 → 강습만
                  }
                }}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border transition-colors ${
                  category === 'class' || category === 'all'
                    ? 'bg-purple-500/20 border-purple-500 text-purple-300'
                    : 'bg-gray-700/30 border-gray-600 text-gray-400'
                }`}
              >
                <span>강습 {eventCounts.class}</span>
                <i className={`${category === 'class' || category === 'all' ? 'ri-check-line' : 'ri-close-line'} text-sm`}></i>
              </button>

              {/* 등록 버튼 - 날짜 선택 시에만 표시 */}
              {selectedDate && (
                <button
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent('createEventForDate'));
                  }}
                  className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium border transition-all bg-blue-600 border-blue-500 text-white hover:bg-blue-700 ml-auto"
                >
                  <i className="ri-add-line text-sm"></i>
                  <span>등록</span>
                </button>
              )}
            </div>
            
            {isAdmin && (
              <button
                onClick={() => setShowAdminPanel(!showAdminPanel)}
                className="text-red-400 hover:text-red-300 transition-colors ml-auto"
                style={{ fontSize: '12px', lineHeight: '1.2' }}
              >
                <i className={`${showAdminPanel ? 'ri-close-line' : 'ri-admin-line'} text-sm`}></i>
              </button>
            )}
          </div>
        )}
        
        {/* 관리자 상태 표시 - 모든 페이지 공통 */}
        {!isEventsPage && (
          <div 
            className="border-t border-[#22262a] flex items-center justify-between px-3 no-select"
            style={{ 
              backgroundColor: "var(--header-bg-color)",
              height: '20px'
            }}
          >
            <span className="text-gray-400 font-medium no-select" style={{ fontSize: '12px', lineHeight: '1.2' }}>
              {isSocialPage && '소셜 장소'}
              {isPracticePage && '연습실'}
              {isGuidePage && '안내'}
            </span>
            <div className="flex items-center gap-2">
              {isPracticePage && (
                <button
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent('practiceRoomRegister'));
                  }}
                  className="text-blue-400 hover:text-blue-300 transition-colors"
                  style={{ fontSize: '12px', lineHeight: '1.2' }}
                >
                  <i className="ri-add-line text-sm mr-0.5"></i>
                  <span>등록</span>
                </button>
              )}
              {isAdmin && (
                <button
                  onClick={() => setShowAdminPanel(!showAdminPanel)}
                  className="text-red-400 hover:text-red-300 transition-colors"
                  style={{ fontSize: '12px', lineHeight: '1.2' }}
                >
                  <i className={`${showAdminPanel ? 'ri-close-line' : 'ri-admin-line'} text-sm`}></i>
                </button>
              )}
            </div>
          </div>
        )}
        
        <div className="flex items-center justify-around px-2 py-2 border-t border-[#22262a] no-select" style={{ backgroundColor: "var(--header-bg-color)" }}>
          {/* 이벤트 달력 버튼 */}
          <button
            onClick={(e) => {
              if (isEventsPage) {
                // 버튼 눌림 효과
                const btn = e.currentTarget;
                btn.style.transform = 'scale(0.95)';
                btn.style.opacity = '0.7';
                
                // 로딩 오버레이 표시
                const overlay = document.createElement('div');
                overlay.style.cssText = `
                  position: fixed;
                  top: 0;
                  left: 0;
                  right: 0;
                  bottom: 0;
                  background: rgba(0, 0, 0, 0.8);
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  z-index: 9999;
                  max-width: 650px;
                  margin: 0 auto;
                `;
                overlay.innerHTML = `
                  <div style="text-align: center;">
                    <i class="ri-loader-4-line" style="font-size: 48px; color: #3b82f6; animation: spin 1s linear infinite;"></i>
                    <div style="color: white; margin-top: 16px; font-size: 14px;">새로고침 중...</div>
                  </div>
                `;
                document.body.appendChild(overlay);
                
                // 약간의 딜레이 후 새로고침
                setTimeout(() => {
                  window.location.reload();
                }, 150);
              } else {
                // 다른 페이지면 이동
                navigate('/');
              }
            }}
            className={`flex flex-col items-center justify-center px-3 py-1 rounded-lg transition-all active:scale-95 flex-1 ${
              isEventsPage
                ? "text-blue-500"
                : "text-gray-300 hover:text-white"
            }`}
          >
            <i className="ri-calendar-line text-xl mb-0.5"></i>
            <span className="text-xs">이벤트 달력</span>
          </button>

          {/* 소셜 버튼 */}
          <button
            onClick={() => navigate('/social')}
            className={`flex flex-col items-center justify-center px-3 py-1 rounded-lg transition-colors flex-1 relative ${
              isSocialPage
                ? "text-green-500"
                : "text-gray-300 hover:text-white"
            }`}
          >
            <i className="ri-map-pin-line text-xl mb-0.5"></i>
            <span className="text-xs">소셜</span>
            <span className="absolute top-0 right-1 text-[9px] text-orange-400 font-semibold no-select">
              공사중
            </span>
          </button>

          {/* 연습실 버튼 */}
          <button
            onClick={() => navigate('/practice')}
            className={`flex flex-col items-center justify-center px-3 py-1 rounded-lg transition-colors flex-1 ${
              isPracticePage
                ? "text-blue-500"
                : "text-gray-300 hover:text-white"
            }`}
          >
            <i className="ri-music-2-line text-xl mb-0.5"></i>
            <span className="text-xs">연습실</span>
          </button>

          {/* 안내 버튼 */}
          <button
            onClick={() => navigate('/guide')}
            className={`flex flex-col items-center justify-center px-3 py-1 rounded-lg transition-colors flex-1 ${
              isGuidePage
                ? "text-blue-500"
                : "text-gray-300 hover:text-white"
            }`}
          >
            <i className="ri-information-line text-xl mb-0.5"></i>
            <span className="text-xs">안내</span>
          </button>
        </div>
        
        {/* 관리자 패널 - 빠른 접근 */}
        {isAdmin && showAdminPanel && (
          <div 
            className="border-t border-[#22262a] bg-gray-800 p-3 space-y-2"
            style={{ maxHeight: '200px', overflowY: 'auto' }}
          >
            <div className="text-xs text-gray-400 font-bold mb-2">관리자 패널</div>
            <button
              onClick={() => {
                setShowAdminPanel(false);
                navigate('/');
                setTimeout(() => {
                  window.dispatchEvent(new CustomEvent('openBillboardSettings'));
                }, 100);
              }}
              className="w-full text-left text-white hover:bg-gray-700 px-3 py-2 rounded text-xs flex items-center gap-2"
            >
              <i className="ri-image-2-line"></i>
              광고판 설정
            </button>
            <button
              onClick={() => {
                setShowAdminPanel(false);
                navigate('/');
                setTimeout(() => {
                  window.dispatchEvent(new CustomEvent('openBillboardUserManagement'));
                }, 100);
              }}
              className="w-full text-left text-white hover:bg-gray-700 px-3 py-2 rounded text-xs flex items-center gap-2"
            >
              <i className="ri-user-settings-line"></i>
              빌보드 사용자 관리
            </button>
            <button
              onClick={() => {
                setShowAdminPanel(false);
                navigate('/');
                setTimeout(() => {
                  window.dispatchEvent(new CustomEvent('openDefaultThumbnailSettings'));
                }, 100);
              }}
              className="w-full text-left text-white hover:bg-gray-700 px-3 py-2 rounded text-xs flex items-center gap-2"
            >
              <i className="ri-image-line"></i>
              기본 썸네일 설정
            </button>
            <button
              onClick={() => {
                setShowAdminPanel(false);
                navigate('/');
                setTimeout(() => {
                  window.dispatchEvent(new CustomEvent('openColorSettings'));
                }, 100);
              }}
              className="w-full text-left text-white hover:bg-gray-700 px-3 py-2 rounded text-xs flex items-center gap-2"
            >
              <i className="ri-palette-line"></i>
              색상 설정
            </button>
            <button
              onClick={() => {
                setShowAdminPanel(false);
                navigate('/');
                setTimeout(() => {
                  window.dispatchEvent(new CustomEvent('openSettings'));
                }, 100);
              }}
              className="w-full text-left text-white hover:bg-gray-700 px-3 py-2 rounded text-xs flex items-center gap-2"
            >
              <i className="ri-settings-3-line"></i>
              전체 설정
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
