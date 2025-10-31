import { Outlet, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";

export function MobileShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [viewMode, setViewMode] = useState<"month" | "year">("month");
  const { isAdmin } = useAuth();
  const [showAdminPanel, setShowAdminPanel] = useState(false);

  // 테마 색상 로드 (모든 페이지 공통)
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

        // CSS 변수 업데이트
        document.documentElement.style.setProperty("--bg-color", data.background_color);
        document.documentElement.style.setProperty("--header-bg-color", data.header_bg_color || "#1f2937");
        document.documentElement.style.setProperty("--calendar-bg-color", data.calendar_bg_color);
        document.documentElement.style.setProperty("--event-list-bg-color", data.event_list_bg_color);
        document.documentElement.style.setProperty("--event-list-outer-bg-color", data.event_list_outer_bg_color);
        document.documentElement.style.setProperty("--page-bg-color", data.page_bg_color || "#111827");
      } catch (err) {
        // 기본 색상 사용
      }
    };

    loadThemeColors();
  }, []);

  // HomePage에서 전달되는 현재 월 정보 수신
  useEffect(() => {
    const handleMonthChange = (event: CustomEvent) => {
      if (event.detail && event.detail.month) {
        setCurrentMonth(new Date(event.detail.month));
      }
    };

    window.addEventListener('monthChanged', handleMonthChange as EventListener);
    
    return () => {
      window.removeEventListener('monthChanged', handleMonthChange as EventListener);
    };
  }, []);

  // HomePage에서 전달되는 viewMode 정보 수신
  useEffect(() => {
    const handleViewModeChange = (event: CustomEvent) => {
      if (event.detail && event.detail.viewMode) {
        setViewMode(event.detail.viewMode);
      }
    };

    window.addEventListener('viewModeChanged', handleViewModeChange as EventListener);
    
    return () => {
      window.removeEventListener('viewModeChanged', handleViewModeChange as EventListener);
    };
  }, []);

  // 현재 페이지와 카테고리 파악
  const isEventsPage = location.pathname === '/';
  const isSocialPage = location.pathname.startsWith('/social');
  const isPracticePage = location.pathname === '/practice';
  const isGuidePage = location.pathname === '/guide';
  const category = searchParams.get('category') || 'all';

  // 카테고리 변경 (이벤트 페이지 전용)
  const handleCategoryChange = (newCategory: string) => {
    if (newCategory === 'all') {
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
        {/* Month/Year Indicator - 홈 페이지에서만 표시 */}
        {isEventsPage && (
          <div 
            className="border-t border-[#22262a] flex items-center justify-between px-3"
            style={{ 
              backgroundColor: "var(--header-bg-color)",
              height: '20px'
            }}
          >
            <span className="text-gray-400 font-medium" style={{ fontSize: '12px', lineHeight: '1.2' }}>
              {viewMode === "year" ? (
                <>
                  {currentMonth.getFullYear()}년{' '}
                  {category === 'all' ? '전체' : category === 'class' ? '강습' : '행사'}
                </>
              ) : (
                <>
                  {currentMonth.getFullYear()}년 {currentMonth.getMonth() + 1}월{' '}
                  {category === 'all' ? '전체' : category === 'class' ? '강습' : '행사'}
                </>
              )}
            </span>
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
        )}
        
        {/* 관리자 상태 표시 - 모든 페이지 공통 */}
        {!isEventsPage && (
          <div 
            className="border-t border-[#22262a] flex items-center justify-between px-3"
            style={{ 
              backgroundColor: "var(--header-bg-color)",
              height: '20px'
            }}
          >
            <span className="text-gray-400 font-medium" style={{ fontSize: '12px', lineHeight: '1.2' }}>
              {isSocialPage && '소셜 장소'}
              {isPracticePage && '연습실'}
              {isGuidePage && '안내'}
            </span>
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
        )}
        
        <div className="flex items-center justify-around px-2 py-2 border-t border-[#22262a]" style={{ backgroundColor: "var(--header-bg-color)" }}>
          {/* 전체 버튼 */}
          <button
            onClick={() => handleCategoryChange('all')}
            className={`flex flex-col items-center justify-center px-3 py-1 rounded-lg transition-colors flex-1 ${
              isEventsPage && category === 'all'
                ? "text-blue-500"
                : "text-gray-300 hover:text-white"
            }`}
          >
            <i className="ri-file-list-3-line text-xl mb-0.5"></i>
            <span className="text-xs">전체</span>
          </button>

          {/* 강습 버튼 */}
          <button
            onClick={() => handleCategoryChange('class')}
            className={`flex flex-col items-center justify-center px-3 py-1 rounded-lg transition-colors flex-1 ${
              isEventsPage && category === 'class'
                ? "text-purple-500"
                : "text-gray-300 hover:text-white"
            }`}
          >
            <i className="ri-book-open-line text-xl mb-0.5"></i>
            <span className="text-xs">강습</span>
          </button>

          {/* 행사 버튼 */}
          <button
            onClick={() => handleCategoryChange('event')}
            className={`flex flex-col items-center justify-center px-3 py-1 rounded-lg transition-colors flex-1 ${
              isEventsPage && category === 'event'
                ? "text-blue-500"
                : "text-gray-300 hover:text-white"
            }`}
          >
            <i className="ri-calendar-event-line text-xl mb-0.5"></i>
            <span className="text-xs">행사</span>
          </button>

          {/* 소셜 버튼 */}
          <button
            onClick={() => navigate('/social')}
            className={`flex flex-col items-center justify-center px-3 py-1 rounded-lg transition-colors flex-1 ${
              isSocialPage
                ? "text-green-500"
                : "text-gray-300 hover:text-white"
            }`}
          >
            <i className="ri-map-pin-line text-xl mb-0.5"></i>
            <span className="text-xs">소셜</span>
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
                navigate('/');
                window.dispatchEvent(new CustomEvent('openBillboardSettings'));
                setShowAdminPanel(false);
              }}
              className="w-full text-left text-white hover:bg-gray-700 px-3 py-2 rounded text-xs flex items-center gap-2"
            >
              <i className="ri-image-2-line"></i>
              광고판 설정
            </button>
            <button
              onClick={() => {
                navigate('/');
                window.dispatchEvent(new CustomEvent('openBillboardUserManagement'));
                setShowAdminPanel(false);
              }}
              className="w-full text-left text-white hover:bg-gray-700 px-3 py-2 rounded text-xs flex items-center gap-2"
            >
              <i className="ri-user-settings-line"></i>
              빌보드 사용자 관리
            </button>
            <button
              onClick={() => {
                navigate('/');
                window.dispatchEvent(new CustomEvent('openDefaultThumbnailSettings'));
                setShowAdminPanel(false);
              }}
              className="w-full text-left text-white hover:bg-gray-700 px-3 py-2 rounded text-xs flex items-center gap-2"
            >
              <i className="ri-image-line"></i>
              기본 썸네일 설정
            </button>
            <button
              onClick={() => {
                navigate('/');
                window.dispatchEvent(new CustomEvent('openColorSettings'));
                setShowAdminPanel(false);
              }}
              className="w-full text-left text-white hover:bg-gray-700 px-3 py-2 rounded text-xs flex items-center gap-2"
            >
              <i className="ri-palette-line"></i>
              색상 설정
            </button>
            <button
              onClick={() => {
                navigate('/');
                window.dispatchEvent(new CustomEvent('openSettings'));
                setShowAdminPanel(false);
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
