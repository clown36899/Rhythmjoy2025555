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

  // [Feature] 알림 배지 및 센터 청소 통합 함수
  const clearNotifications = async () => {
    // 1. 서비스 워커에게 '알림센터 비우기' 명령 전송
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.ready;
      if (registration && registration.active) {
        registration.active.postMessage({ type: 'CLEAR_NOTIFICATIONS' });
      }
    }

    // 2. 앱 배지(숫자) 비우기 API 호출
    const nav = navigator as any;
    if (nav.clearAppBadge) {
      nav.clearAppBadge().catch((err: any) => console.error('[Badge] Clear failed:', err));
    } else if (nav.setAppBadge) {
      nav.setAppBadge(0).catch((err: any) => console.error('[Badge] Set(0) failed:', err));
    }
  };

  // 1. 앱 실행 시 & 포커스 & 상호작용 시 청소
  useEffect(() => {
    // A. 초기 실행 (약간의 지연 후 시도)
    setTimeout(() => clearNotifications(), 500);

    // B. 포커스/가시성 변경 감지
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        clearNotifications();
      }
    };

    // C. 유저 상호작용(터치/클릭) 시 즉시 청소 (제스처 요구사항 대응 & 확실한 트리거)
    const handleInteraction = () => {
      clearNotifications();
      // 한 번 청소하면 리스너 제거 (불필요한 호출 방지) 
      // 다만, 사용자가 알림을 늦게 받을 수도 있으므로 완전 제거보다는 
      // 잦은 호출 방지용 디바운스가 낫지만, 여기선 "앱 진입 후 첫 동작"에 집중.
      // 하지만 앱 사용 중에도 알림이 올 수 있으므로 제거하지 않는 게 나을 수도?
      // -> 아니오, 앱 사용중엔 포그라운드 알림이 오지 않거나 무시됨. 
      // 배지 클리어는 "확인했다"는 의미이므로 계속 유지해도 무방함.
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleVisibilityChange); // 데스크탑 포커스 대응
    window.addEventListener('click', handleInteraction);      // 클릭 대응
    window.addEventListener('touchstart', handleInteraction); // 모바일 터치 대응

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleVisibilityChange);
      window.removeEventListener('click', handleInteraction);
      window.removeEventListener('touchstart', handleInteraction);
    };
  }, []);

  // [PWA Auto-Subscribe] 앱 최초 실행 시(PWA 모드) 알림 권한 자동 요청
  useEffect(() => {
    const initPwaPush = async () => {
      // PWA 모드(standalone)인지 확인
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone;

      if (isStandalone) {
        // 이미 구독되어 있는지 확인
        const existingSub = await getPushSubscription();
        if (!existingSub) {
          // 구독이 없으면 자동으로 권한 요청 및 구독 시도
          console.log('[App] PWA detected. Attempting auto-subscribe...');
          const sub = await subscribeToPush();
          if (sub) {
            // 기본 설정(전체 수신)으로 저장
            await saveSubscriptionToSupabase(sub, {
              pref_events: true,
              pref_lessons: true,
              pref_filter_tags: null
            });
            // 안내 메시지 (Toast 대신 간단한 alert 혹은 조용한 처리)
            // alert('알림이 활성화되었습니다. 설정 메뉴에서 변경 가능합니다.'); 
            console.log('[App] PWA Auto-subscribed successfully.');
          }
        }
      }
    };

    initPwaPush();
  }, []);

  // 2. 페이지 이동 시에도 청소 (location)
  useEffect(() => {
    clearNotifications();

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
