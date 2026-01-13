import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import './i18n'
import './index.css'

// Mobile Drag & Drop Polyfill
import { polyfill } from 'mobile-drag-drop';
import { scrollBehaviourDragImageTranslateOverride } from 'mobile-drag-drop/scroll-behaviour';
import 'mobile-drag-drop/default.css';

import { PageActionProvider } from './contexts/PageActionContext';
import { AuthProvider } from './contexts/AuthContext';
import { BoardDataProvider } from './contexts/BoardDataContext';
import { ModalProvider } from './contexts/ModalContext';
import { InstallPromptProvider } from './contexts/InstallPromptContext';

import App from './App.tsx'
import GlobalErrorBoundary from './components/GlobalErrorBoundary';
import { ModalRegistry } from './components/ModalRegistry';
import { initGAWithEngagement } from './lib/analytics';

// Pages
import HomePageV2 from './pages/v2/Page';
import SocialPage from './pages/social/page';
import PracticePage from './pages/practice/page';
import BoardPage from './pages/board/page';
import ShoppingPage from './pages/shopping/page';
import GuidePage from './pages/guide/page';
import PrivacyPage from './pages/privacy/page';
// import EventDetailPage from './pages/v2/EventDetailPage'; // File not found
import CalendarPage from './pages/calendar/page';
import MyActivitiesPage from './pages/user/MyActivitiesPage';

/* Admin Pages - Temporarily disabled due to missing files
import AdminPage from './pages/admin/Page';
import AdminDashboard from './pages/admin/dashboard/Dashboard';
import AdminBanners from './pages/admin/banners/Banners';
import AdminUsers from './pages/admin/users/Users';
import AdminEvents from './pages/admin/events/Events';
import AdminCommunity from './pages/admin/community/Community';
*/
// import KakaoCallback from './components/auth/KakaoCallback';

// Archive Pages
import ArchiveLayout from './layouts/ArchiveLayout';
import LearningPage from './pages/learning/Page';
import LearningDetailPage from './pages/learning/detail/Page';
// import HistoryPage from './pages/history/Page';
import HistoryTimelinePage from './pages/history/HistoryTimelinePage';
import KakaoCallbackPage from './pages/auth/kakao-callback/page';
import SiteMapPage from './pages/sitemap/SiteMapPage';

const router = createBrowserRouter([
  {
    path: "/",
    element: (
      <AuthProvider>
        <PageActionProvider>
          <BoardDataProvider>
            <ModalProvider>
              <GlobalErrorBoundary>
                <App />
                <ModalRegistry />
              </GlobalErrorBoundary>
            </ModalProvider>
          </BoardDataProvider>
        </PageActionProvider>
      </AuthProvider>
    ),
    children: [
      { path: "/", element: <HomePageV2 /> },
      { path: "/v2", element: <HomePageV2 /> },
      // { path: "/v2/events/:id", element: <EventDetailPage /> }, // Disabled
      { path: "/calendar", element: <CalendarPage /> },
      { path: "/social", element: <SocialPage /> },
      { path: "/practice", element: <PracticePage /> },
      { path: "/shopping", element: <ShoppingPage /> },
      { path: "/guide", element: <GuidePage /> },
      { path: "/privacy", element: <PrivacyPage /> },
      { path: "/board/*", element: <BoardPage /> },
      { path: "/my-activities", element: <MyActivitiesPage /> },
      { path: "/auth/kakao-callback", element: <KakaoCallbackPage /> },
      { path: "/map", element: <SiteMapPage /> },

      // 댄스 라이브러리 (Archive) Routes - MobileShell 내부에 중첩
      {
        element: <ArchiveLayout />,
        children: [
          { path: "/learning", element: <LearningPage /> },
          { path: "/learning/:id", element: <LearningDetailPage /> },
          { path: "/history", element: <HistoryTimelinePage /> },
        ]
      }
    ]
  }
], {
  future: {
    v7_startTransition: true,
    v7_relativeSplatPath: true,
    v7_fetcherPersist: true,
    v7_normalizeFormMethod: true,
    v7_partialHydration: true,
    v7_skipActionErrorRevalidation: true,
  }
});

function RootApp() {
  useEffect(() => {
    // React 렌더링 완료 후 body 표시
    document.body.classList.add('loaded');

    // Google Analytics 초기화 (사용자 참여 기반)
    initGAWithEngagement();

    // 📱 Mobile PWA Orientation Lock
    // 데스크탑은 회전/리사이즈 자유, 모바일 PWA만 세로 모드 고정
    const lockMobileOrientation = async () => {
      const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      const isPWA = window.matchMedia('(display-mode: standalone)').matches;

      if (isMobile && isPWA) {
        // iOS 등 JS Lock 미지원 기기를 위한 CSS 타겟팅 클래스 추가
        document.body.classList.add('mobile-pwa');

        if ('orientation' in screen && 'lock' in screen.orientation) {
          try {
            await (screen.orientation as any).lock('portrait');
            console.log('🔒 Screen locked to portrait');
          } catch (e) {
            console.log('Rotation lock not supported or failed:', e);
          }
        }
      }
    };
    lockMobileOrientation();

    // 🚀 Version Mismatch Auto-Reload Logic
    // 배포 후 구버전 사용자가 청크 로드 실패 시 자동 새로고침
    const handleChunkError = (event: ErrorEvent | PromiseRejectionEvent) => {
      const error = 'reason' in event ? event.reason : event.error;
      const message = error?.message || '';

      if (
        message.includes('Failed to fetch dynamically imported module') ||
        message.includes('Importing a module script failed')
      ) {
        console.warn('⚠️ New version detected (Chunk load failed). Reloading...');
        // Prevent infinite reload loop if the error persists
        const lastReload = sessionStorage.getItem('chunk_reload');
        if (lastReload && Date.now() - parseInt(lastReload) < 10000) {
          console.error('Reload loop detected, stopping auto-reload.');



          // Loop detected: Show fallback UI instead of white screen
          document.body.innerHTML = `
            <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;text-align:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
              <h2 style="margin-bottom:10px;font-size:18px;font-weight:600;">업데이트 문제 발생</h2>
              <p style="margin-bottom:20px;color:#666;font-size:14px;">최신 버전을 로딩하는 중 문제가 발생했습니다.</p>
              <button onclick="sessionStorage.clear(); localStorage.clear(); window.location.reload();" 
                style="padding:10px 20px;background:#2563EB;color:white;border:none;border-radius:6px;font-weight:500;cursor:pointer;">
                앱 초기화 및 다시 불러오기
              </button>
            </div>
          `;
          return;
        }

        sessionStorage.setItem('chunk_reload', Date.now().toString());
        window.location.reload();
      }
    };

    window.addEventListener('error', handleChunkError);
    window.addEventListener('unhandledrejection', handleChunkError);

    return () => {
      window.removeEventListener('error', handleChunkError);
      window.removeEventListener('unhandledrejection', handleChunkError);
    };
  }, []);

  return (
    <InstallPromptProvider>
      <RouterProvider router={router} />
    </InstallPromptProvider>
  );
}

// Polyfill 초기화 (아이폰 등 모바일에서 드래그 동작 지원)
polyfill({
  dragImageCenterOnTouch: true,
  // 탭해서 스크롤시 드래그로 오인되지 않게 하는 옵션
  iterationInterval: 50,
  // 드래그 중 스크롤 처리
  dragImageTranslateOverride: scrollBehaviourDragImageTranslateOverride
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootApp />
  </StrictMode>,
)
