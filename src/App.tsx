import { useLocation } from "react-router-dom";
import { MobileShell } from "./layouts/MobileShell";
import { Suspense, useEffect } from "react";
import { logPageView } from "./lib/analytics";
import { useOnlinePresence } from "./hooks/useOnlinePresence";
import { PageActionProvider } from './contexts/PageActionContext';
import { useAuth } from './contexts/AuthContext';
import { QueryClientProvider } from '@tanstack/react-query';
import { CustomDevtools } from './components/CustomDevtools';
import { queryClient } from './lib/queryClient';
import { useRealtimeSync } from './hooks/useRealtimeSync';
import { SiteAnalyticsProvider } from './components/SiteAnalyticsProvider';
import { InAppBrowserGuard } from './components/InAppBrowserGuard';
import { GlobalPlayerProvider } from './contexts/GlobalPlayerContext';
import './styles/devtools.css';

function AppContent() {
  const location = useLocation();

  // Track online presence for all users
  useOnlinePresence();

  // Sync queries with Supabase Realtime
  useRealtimeSync();

  // 페이지 변경 시 자동으로 페이지뷰 추적 및 배지 초기화
  useEffect(() => {
    // [Feature] 앱이 활성화되면(사용자가 앱을 켜거나 포커스하면) 배지와 알림센터 모두 제거
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_NOTIFICATIONS' });
    }

    // Fallback: 배지 API 직접 호출
    const nav = navigator as any;
    if (nav.clearAppBadge) {
      nav.clearAppBadge().catch((err: any) => console.error('[Badge] Clear failed:', err));
    } else if (nav.setAppBadge) {
      nav.setAppBadge(0).catch((err: any) => console.error('[Badge] Set(0) failed:', err));
    }

    // "/" 경로는 "/v2"로 즉시 리다이렉트되므로 페이지뷰 기록 안함
    if (location.pathname === '/') {
      return;
    }
    logPageView(location.pathname + location.search);
  }, [location]);

  return (
    <Suspense fallback={
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', backgroundColor: '#000000', color: 'white' }}>
        {/* Spinner removed for login optimization */}
      </div>
    }>
      <MobileShell />
    </Suspense>
  );
}

function App() {
  const { isAdmin } = useAuth();

  return (
    <PageActionProvider>
      <QueryClientProvider client={queryClient}>
        <SiteAnalyticsProvider>
          {/* Add GlobalPlayerProvider */}
          <GlobalPlayerProvider>
            <InAppBrowserGuard />
            <AppContent />
          </GlobalPlayerProvider>
        </SiteAnalyticsProvider>
        {/* DevTools는 관리자만 볼 수 있음 */}
        {isAdmin && <CustomDevtools />}
      </QueryClientProvider>
    </PageActionProvider>

  );
}

export default App;
