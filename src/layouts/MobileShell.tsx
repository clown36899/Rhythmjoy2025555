import { Outlet, useLocation, useNavigate, useSearchParams } from "react-router-dom";

export function MobileShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // 현재 페이지와 카테고리 파악
  const isEventsPage = location.pathname === '/';
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
      <div className="fixed bottom-0 left-0 right-0 border-t border-[#22262a] z-20" style={{ maxWidth: '650px', margin: '0 auto', backgroundColor: "var(--header-bg-color)" }}>
        <div className="flex items-center justify-around px-2 py-2">
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
      </div>
    </div>
  );
}
