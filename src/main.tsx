import { StrictMode, useEffect, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import './i18n'
import './index.css'

// Mobile Drag & Drop Polyfill
import { polyfill } from 'mobile-drag-drop';
import { scrollBehaviourDragImageTranslateOverride } from 'mobile-drag-drop/scroll-behaviour';

// [Critical Fix] Mobile Safari (iOS) Compatibility
if (typeof window !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent) && typeof (window as any).TouchEvent === 'undefined') {
  try {
    (window as any).TouchEvent = class TouchEvent { };
  } catch (e) {
    console.warn('[Shim] Failed to shim TouchEvent:', e);
  }
}
import 'mobile-drag-drop/default.css';

import { PageActionProvider } from './contexts/PageActionContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { AuthProvider } from './contexts/AuthContext';
import { BoardDataProvider } from './contexts/BoardDataContext';
import { ModalProvider } from './contexts/ModalContext';
import { LoadingProvider } from './contexts/LoadingContext';
import { InstallPromptProvider } from './contexts/InstallPromptContext';
import { GlobalPlayerProvider } from './contexts/GlobalPlayerContext';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';

import App from './App.tsx'
import GlobalErrorBoundary from './components/GlobalErrorBoundary';
import { ModalRegistry } from './components/ModalRegistry';
import { initGAWithEngagement } from './lib/analytics';
import LocalLoading from './components/LocalLoading';

// Pages - HomePage stays static for instant first paint
import HomePageV2 from './pages/v2/Page';

// Lazy Loaded Pages
const SocialPage = lazy(() => import('./pages/social/page'));
const PracticePage = lazy(() => import('./pages/practice/page'));
const BoardPage = lazy(() => import('./pages/board/page'));
const ShoppingPage = lazy(() => import('./pages/shopping/page'));
const GuidePage = lazy(() => import('./pages/guide/page'));
const PrivacyPage = lazy(() => import('./pages/privacy/page'));
const BillboardPage = lazy(() => import('./pages/billboard/page'));
const BillboardPreviewPage = lazy(() => import('./pages/billboard/preview/page'));
const BillboardCatalogPage = lazy(() => import('./pages/billboard/preview/CatalogPage'));
const CalendarPage = lazy(() => import('./pages/calendar/page'));
const MyActivitiesPage = lazy(() => import('./pages/user/MyActivitiesPage'));
const ArchiveLayout = lazy(() => import('./layouts/ArchiveLayout'));
const LearningPage = lazy(() => import('./pages/learning/Page'));
const LearningDetailPage = lazy(() => import('./pages/learning/detail/Page'));
const HistoryTimelinePage = lazy(() => import('./pages/history/HistoryTimelinePage'));
const KakaoCallbackPage = lazy(() => import('./pages/auth/kakao-callback/page'));
const SiteMapPage = lazy(() => import('./pages/sitemap/SiteMapPage'));
const MainV2TestPage = lazy(() => import('./pages/test/MainV2TestPage'));
const SurveyTestPage = lazy(() => import('./pages/test/SurveyTestPage'));
const AdminPushTestPage = lazy(() => import('./components/admin/AdminPushTest').then(m => ({ default: m.AdminPushTest })));
const ForumPage = lazy(() => import('./pages/forum/ForumPage'));
const BpmTapperPage = lazy(() => import('./pages/bpm-tapper/BpmTapperPage'));

const BillboardFallback = () => (
  <div className="full-screen-fallback">
    <LocalLoading message="로딩 중..." />
  </div>
);

const router = createBrowserRouter([
  {
    path: "/billboard/:userId",
    element: (
      <Suspense fallback={<BillboardFallback />}>
        <ThemeProvider>
          <QueryClientProvider client={queryClient}>
            <BillboardPage />
          </QueryClientProvider>
        </ThemeProvider>
      </Suspense>
    ),
  },
  {
    path: "/billboard/:userId/preview",
    element: (
      <Suspense fallback={<BillboardFallback />}>
        <ThemeProvider>
          <AuthProvider>
            <PageActionProvider>
              <QueryClientProvider client={queryClient}>
                <BoardDataProvider>
                  <ModalProvider>
                    <GlobalPlayerProvider>
                      <BillboardPreviewPage />
                    </GlobalPlayerProvider>
                  </ModalProvider>
                </BoardDataProvider>
              </QueryClientProvider>
            </PageActionProvider>
          </AuthProvider>
        </ThemeProvider>
      </Suspense>
    ),
  },
  {
    path: "/billboard/:userId/preview/catalog",
    element: (
      <Suspense fallback={<BillboardFallback />}>
        <ThemeProvider>
          <AuthProvider>
            <PageActionProvider>
              <QueryClientProvider client={queryClient}>
                <BoardDataProvider>
                  <ModalProvider>
                    <GlobalPlayerProvider>
                      <BillboardCatalogPage />
                    </GlobalPlayerProvider>
                  </ModalProvider>
                </BoardDataProvider>
              </QueryClientProvider>
            </PageActionProvider>
          </AuthProvider>
        </ThemeProvider>
      </Suspense>
    ),
  },
  {
    path: "/",
    element: (
      <ThemeProvider>
        <AuthProvider>
          <PageActionProvider>
            <BoardDataProvider>
              <ModalProvider>
                <LoadingProvider>
                  <GlobalErrorBoundary>
                    <App />
                    <ModalRegistry />
                  </GlobalErrorBoundary>
                </LoadingProvider>
              </ModalProvider>
            </BoardDataProvider>
          </PageActionProvider>
        </AuthProvider>
      </ThemeProvider>
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
      { path: "/forum", element: <ForumPage /> },
      { path: "/bpm-tapper", element: <BpmTapperPage /> },
      { path: "/my-activities", element: <MyActivitiesPage /> },
      { path: "/auth/kakao-callback", element: <KakaoCallbackPage /> },
      { path: "/map", element: <SiteMapPage /> },
      { path: "/admin/push-test", element: <Suspense fallback={null}><AdminPushTestPage /></Suspense> },

      // 댄스 라이브러리 (Archive) Routes - MobileShell 내부에 중첩
      {
        path: "test/main-v2",
        element: <MainV2TestPage />,
      },
      {
        path: "main-v2-test",
        element: <MainV2TestPage />,
      },
      {
        path: "test/survey",
        element: <SurveyTestPage />,
      },
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
            <div class="crash-fallback-container">
              <h2 class="crash-fallback-title">업데이트 문제 발생</h2>
              <p class="crash-fallback-desc">최신 버전을 로딩하는 중 문제가 발생했습니다.</p>
              <button onclick="sessionStorage.clear(); localStorage.clear(); window.location.reload();" 
                class="crash-fallback-btn">
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
// [Definitive Fix] Only activate if the device actually supports Touch events natively.
// This prevents the polyfill from intercepting mouse clicks on Mac Chrome/Safari.
if (typeof window !== 'undefined' && 'ontouchstart' in window && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
  try {
    polyfill({
      dragImageCenterOnTouch: true,
      iterationInterval: 16,
      dragImageTranslateOverride: scrollBehaviourDragImageTranslateOverride
    });
  } catch (error) {
    console.warn('[mobile-drag-drop] Polyfill initialization failed:', error);
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootApp />
  </StrictMode>,
)
