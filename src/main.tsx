console.log('%c[Main] 🏁 JavaScript Bundle Execution Started', 'background: #4f46e5; color: white; font-weight: bold;');
(window as any).__APP_STARTED = true;

import { StrictMode, useEffect, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { authLogger } from './utils/authLogger';
import './i18n'
import './index.css'

authLogger.log('[Main] 🚀 App entry point reached');
import { isPWAMode } from './lib/pwaDetect'

// Mobile Drag & Drop Polyfill
import { polyfill } from 'mobile-drag-drop';
import { scrollBehaviourDragImageTranslateOverride } from "mobile-drag-drop/scroll-behaviour";

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

// 배포 후 구버전 청크 로드 실패 시 1회 재시도 후 리로드하는 래퍼
function lazyWithRetry(importFn: () => Promise<any>) {
  return lazy(async () => {
    try {
      return await importFn();
    } catch (error) {
      // 1회 재시도 (캐시 무효화를 위해 timestamp 쿼리 추가 시도)
      // Vite/Rollup 환경에서 import(url + query)는 브라우저 캐시를 무시하게 함
      console.warn('📦 Chunk load failed, retrying with cache-buster...', error);

      // 재시도 시 이미 실패한 모듈을 다시 불러오기 위해 약간의 지연 후 시도
      await new Promise(resolve => setTimeout(resolve, 500));
      return await importFn();
    }
  });
}

// Lazy Loaded Pages (with retry)
const SocialPage = lazyWithRetry(() => import('./pages/social/page'));
const PracticePage = lazyWithRetry(() => import('./pages/practice/page'));
const BoardPage = lazyWithRetry(() => import('./pages/board/page'));
const ShoppingPage = lazyWithRetry(() => import('./pages/shopping/page'));
const GuidePage = lazyWithRetry(() => import('./pages/guide/page'));
const PrivacyPage = lazyWithRetry(() => import('./pages/privacy/page'));
const BillboardPage = lazyWithRetry(() => import('./pages/billboard/page'));
const BillboardPreviewPage = lazyWithRetry(() => import('./pages/billboard/preview/page'));
const BillboardCatalogPage = lazyWithRetry(() => import('./pages/billboard/preview/CatalogPage'));
const CalendarPage = lazyWithRetry(() => import('./pages/calendar/page'));
const MyActivitiesPage = lazyWithRetry(() => import('./pages/user/MyActivitiesPage'));
const ArchiveLayout = lazyWithRetry(() => import('./layouts/ArchiveLayout'));
const LearningPage = lazyWithRetry(() => import('./pages/learning/Page'));
const LearningDetailPage = lazyWithRetry(() => import('./pages/learning/detail/Page'));
const HistoryTimelinePage = lazyWithRetry(() => import('./pages/history/HistoryTimelinePage'));
const KakaoCallbackPage = lazyWithRetry(() => import('./pages/auth/kakao-callback/page'));
const SiteMapPage = lazyWithRetry(() => import('./pages/sitemap/SiteMapPage'));
const MainV2TestPage = lazyWithRetry(() => import('./pages/test/MainV2TestPage'));
const SurveyTestPage = lazyWithRetry(() => import('./pages/test/SurveyTestPage'));
const AdminPushTestPage = lazyWithRetry(() => import('./components/admin/AdminPushTest').then(m => ({ default: m.AdminPushTest })));
const ForumPage = lazyWithRetry(() => import('./pages/forum/ForumPage'));
const BpmTapperPage = lazyWithRetry(() => import('./pages/bpm-tapper/BpmTapperPage'));
const MetronomePage = lazyWithRetry(() => import('./pages/metronome/MetronomePage'));
const EventIngestorPage = lazyWithRetry(() => import('./pages/admin/EventIngestor'));
const WebzineViewer = lazyWithRetry(() => import('./pages/webzine/WebzineViewer'));
const AdminWebzineList = lazyWithRetry(() => import('./pages/admin/webzine/AdminWebzineList'));
const WebzineEditor = lazyWithRetry(() => import('./pages/admin/webzine/WebzineEditor'));

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
      { path: "/metronome", element: <MetronomePage /> },
      { path: "/my-activities", element: <MyActivitiesPage /> },
      { path: "/auth/kakao-callback", element: <KakaoCallbackPage /> },
      { path: "/map", element: <SiteMapPage /> },
      { path: "/admin/push-test", element: <Suspense fallback={null}><AdminPushTestPage /></Suspense> },
      { path: "/admin/ingestor", element: <Suspense fallback={null}><EventIngestorPage /></Suspense> },

      // Webzine Routes
      { path: "/webzine/:id", element: <WebzineViewer /> },
      { path: "/admin/webzine", element: <AdminWebzineList /> },
      { path: "/admin/webzine/new", element: <WebzineEditor /> },
      { path: "/admin/webzine/edit/:id", element: <WebzineEditor /> },

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
    const lockMobileOrientation = async () => {
      const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

      if (isMobile && isPWAMode()) {
        document.body.classList.add('mobile-pwa');

        if ('orientation' in screen && 'lock' in screen.orientation) {
          try {
            await (screen.orientation as any).lock('portrait');
          } catch (e) {
            console.log('Rotation lock failed:', e);
          }
        }
      }
    };
    lockMobileOrientation();

    // 🚀 Global Error Handler (Previous: handleChunkError)
    // 모바일 디버깅을 위해 에러 필터링을 완화하고 화면에 직접 출력
    const handleGlobalError = (event: ErrorEvent | PromiseRejectionEvent) => {
      // 🛡️ Safety Net (spinner-off timeout)
      const urlParams = new URLSearchParams(window.location.search);
      const hash = window.location.hash;
      const hasAuthParams = urlParams.has('code') || urlParams.has('error') || hash.includes('access_token=') || hash.includes('refresh_token=');

      // [Optimization] 일반 진입 시 5초, 인증 콜백 시 12초로 단축하여 사용자 대기 시간 감소
      const safetyTimeoutMillis = hasAuthParams ? 12000 : 5000;

      const error = 'reason' in event ? event.reason : event.error;
      const message = error?.message || error?.toString?.() || 'Unknown Error';
      const stack = error?.stack || '';

      // 불필요한 노이즈 무시
      if (message.includes('ResizeObserver loop') || message.includes('Script error')) {
        return;
      }

      // 배포 후 구버전 청크 로드 실패 → 에러창 없이 조용히 새로고침
      const isChunkError =
        message.includes('Failed to fetch dynamically imported module') ||
        message.includes('Importing a module script failed') ||
        message.includes('Loading chunk') ||
        message.includes('dynamically imported module') ||
        message.includes('fetch dynamically imported');
      if (isChunkError) {
        console.warn('📦 Chunk load failed, reloading silently...');
        window.location.reload();
        return;
      }

      console.warn('⚠️ Global Error Caught:', { message, stack });

      // 이미 에러 화면이 떠있다면 중복 렌더링 방지
      if (document.getElementById('crash-fallback-overlay')) return;

      const overlay = document.createElement('div');
      overlay.id = 'crash-fallback-overlay';
      overlay.innerHTML = `
        <div class="crash-fallback-container" style="
          position: fixed; top: 0; left: 0; width: 100%; height: 100%;
          background: #000; z-index: 2147483647; padding: 20px;
          display: flex; flex-direction: column; justify-content: center; align-items: center;
          color: #fff; font-family: sans-serif; text-align: center;
          overflow-y: auto; box-sizing: border-box;
        ">
          <h2 class="crash-fallback-title" style="color: #ef4444; margin-bottom: 20px;">오류가 발생했습니다</h2>
          <p class="crash-fallback-desc" style="margin-bottom: 20px;">앱을 실행하는 도중 예기치 못한 문제가 발생했습니다.</p>
          
          <div class="crash-error-code" style="
            font-size: 11px; color: #a1a1aa; background: #18181b; 
            padding: 15px; border-radius: 8px; margin: 10px 0; width: 100%; 
            overflow-x: auto; white-space: pre-wrap; text-align: left;
            border: 1px solid #333; max-height: 300px;
          ">
            <strong>Error:</strong> ${message}<br/><br/>
            <strong>UA:</strong> ${navigator.userAgent}<br/><br/>
            <strong>Stack:</strong><br/>${stack}
          </div>

          <div style="display: flex; gap: 10px; margin-top: 20px;">
            <button onclick="sessionStorage.clear(); localStorage.clear(); if('serviceWorker' in navigator){navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()))}; window.location.reload();" 
              class="crash-fallback-btn" style="
              padding: 12px 24px; background: #2563eb; color: white; border: none; 
              border-radius: 8px; font-weight: bold; font-size: 14px;
            ">
              앱 초기화 및 재시작
            </button>
            <button onclick="document.getElementById('crash-fallback-overlay').remove();" 
              class="crash-fallback-btn" style="
              padding: 12px 24px; background: #3f3f46; color: white; border: none; 
              border-radius: 8px; font-weight: bold; font-size: 14px;
            ">
              닫기 (무시)
            </button>
          </div>
          
          <p class="crash-footer" style="margin-top: 30px; font-size: 12px; color: #52525b;">
            화면 캡처 후 관리자에게 문의해주시면 해결에 도움이 됩니다.
          </p>
        </div>
      `;
      document.body.appendChild(overlay);
    };

    window.addEventListener('error', handleGlobalError);
    window.addEventListener('unhandledrejection', handleGlobalError);

    return () => {
      window.removeEventListener('error', handleGlobalError);
      window.removeEventListener('unhandledrejection', handleGlobalError);
    };
  }, []);

  authLogger.log('[Main] 🏗️ Rendering RootApp...');

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

console.log('[Main] 🏁 Executing createRoot...');
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootApp />
  </StrictMode>
);
