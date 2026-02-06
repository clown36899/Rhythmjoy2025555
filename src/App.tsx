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
import { getPushSubscription, saveSubscriptionToSupabase, subscribeToPush, getPushPreferences } from './lib/pushNotifications';
import { PwaNotificationModal } from './components/PwaNotificationModal';
import { useState } from 'react';
import { notificationStore } from './lib/notificationStore';
import { useModalActions } from './contexts/ModalContext';
import './styles/devtools.css';

function AppContent() {
  const location = useLocation();

  // Track online presence for all users
  useOnlinePresence();

  // Sync queries with Supabase Realtime
  useRealtimeSync();

  const { user, isAdmin } = useAuth();
  const [showPwaModal, setShowPwaModal] = useState(false);
  const { openModal } = useModalActions();


  // [History] 읽지 않은 알림 로드
  const loadUnreadNotifications = async () => {
    try {
      const unread = await notificationStore.getUnread();
      if (unread.length > 0) {
        openModal('notificationHistory', {
          notifications: unread,
          onRefresh: loadUnreadNotifications
        });
      }
    } catch (err) {
      console.warn('[App] Failed to load unread notifications:', err);
    }
  };

  // [PWA Auto-Subscribe] 로그인 후 & 앱 최초 실행 시(PWA) 알림 권한 처리
  useEffect(() => {
    const initPwaPush = async () => {
      if (!user) return;

      // [Update] PWA 알림 구독은 모든 유저에게 제공
      // const isAdmin = user.user_metadata?.is_admin === true || user.app_metadata?.is_admin === true;
      // if (!isAdmin) {
      //   return;
      // }

      // 이미 '안 보기'를 선택했는지 확인
      const isDismissed = localStorage.getItem('pwa_prompt_dismissed') === 'true';
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone;

      console.log('[App] PWA Check:', { isAdmin, isDismissed, isStandalone });

      if (isDismissed) return;

      if (isStandalone) {
        try {
          const existingSub = await getPushSubscription();
          console.log('[App] Existing Sub:', existingSub);

          if (existingSub) {
            // [Check DB] 브라우저엔 있어도 DB에 없으면(삭제됨) 모달 띄워야 함
            const dbPrefs = await getPushPreferences();

            if (dbPrefs) {
              // [Silent Sync] 이미 구독 중이고 DB에도 데이터가 있음 -> 최신 상태로 갱신
              console.log('[App] Existing subscription matches DB. Syncing...');
              await saveSubscriptionToSupabase(existingSub, {
                pref_events: dbPrefs.pref_events,
                pref_class: dbPrefs.pref_class,
                pref_clubs: dbPrefs.pref_clubs,
                pref_filter_tags: dbPrefs.pref_filter_tags,
                pref_filter_class_genres: dbPrefs.pref_filter_class_genres
              }).catch(err => console.warn('[App] Silent sync failed:', err));
            } else {
              // [Zombie Sub] 브라우저엔 있는데 DB엔 없음 -> 모달 띄워서 재등록 유도
              console.log('[App] Zombie subscription detected (Browser=Yes, DB=No). Showing Modal...');
              setShowPwaModal(true);
            }
          } else {
            // 구독이 없으면 안내 모달 띄우기
            console.log('[App] PWA detected & No Subscription. Showing Modal...');
            setShowPwaModal(true);
          }
        } catch (err: any) {
          console.error('[App] PWA Init Error:', err);
        }
      }
    };

    initPwaPush();
  }, [user]);

  // [Admin Test] 관리자용 테스트 트리거
  useEffect(() => {
    (window as any).adminTestPwaModal = () => {
      console.log('[Admin] Forcing PWA Modal...');
      setShowPwaModal(true);
    };
  }, []);

  const handlePwaConfirm = async (prefs: { pref_events: boolean, pref_class: boolean, pref_clubs: boolean, pref_filter_tags: string[] | null, pref_filter_class_genres: string[] | null }) => {
    setShowPwaModal(false);
    console.log('[App] User configured PWA notifications:', prefs);
    const sub = await subscribeToPush();
    if (sub) {
      await saveSubscriptionToSupabase(sub, prefs); // 사용자가 선택한 설정 적용 (그대로 전달)
      console.log('[App] PWA Auto-subscribed successfully with custom prefs.');
    }
  };

  const handlePwaCancel = (dontShowAgain: boolean) => {
    setShowPwaModal(false);
    if (dontShowAgain) {
      localStorage.setItem('pwa_prompt_dismissed', 'true');
      console.log('[App] User dismissed PWA prompt (Dont show again).');
    } else {
      console.log('[App] User canceled PWA prompt (Show again next time).');
    }
  };

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
        loadUnreadNotifications();
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

    // D. 초기 로드 시 알림 확인 및 정리
    loadUnreadNotifications();
    notificationStore.deleteOld(); // 1주일 지난 알림 자동 삭제

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleVisibilityChange);
      window.removeEventListener('click', handleInteraction);
      window.removeEventListener('touchstart', handleInteraction);
    };
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
    <>
      <Suspense fallback={
        <div className="full-screen-fallback">
          {/* Spinner removed for login optimization */}
        </div>
      }>
        <MobileShell />
      </Suspense>
      <PwaNotificationModal
        isOpen={showPwaModal}
        onConfirm={handlePwaConfirm}
        onCancel={handlePwaCancel}
      />
    </>
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
