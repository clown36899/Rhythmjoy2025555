import { Outlet, useLocation } from "react-router-dom";

import { Suspense, useEffect } from "react";
import { logPageView } from "./lib/analytics";
import { useOnlinePresence } from "./hooks/useOnlinePresence";
import { useAuth } from "./contexts/AuthContext";
import { QueryClientProvider } from '@tanstack/react-query';
import { CustomDevtools } from './components/CustomDevtools';
import { queryClient } from './lib/queryClient';
import { useRealtimeSync } from './hooks/useRealtimeSync';
import { SiteAnalyticsProvider } from './components/SiteAnalyticsProvider';
import './styles/devtools.css';

function AppContent() {
  const location = useLocation();

  // Track online presence for all users
  useOnlinePresence();

  // Sync queries with Supabase Realtime
  useRealtimeSync();

  // 페이지 변경 시 자동으로 페이지뷰 추적
  useEffect(() => {
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
      <Outlet />
    </Suspense>
  );
}

function App() {
  const { isAdmin } = useAuth();

  return (
    <QueryClientProvider client={queryClient}>
      <SiteAnalyticsProvider>
        <AppContent />
      </SiteAnalyticsProvider>
      {/* DevTools는 관리자만 볼 수 있음 */}
      {isAdmin && <CustomDevtools />}
    </QueryClientProvider>
  );
}

export default App;
