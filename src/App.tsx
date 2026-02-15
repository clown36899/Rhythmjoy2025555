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
import { isPWAMode } from './lib/pwaDetect';
import { PwaNotificationModal } from './components/PwaNotificationModal';
import { useState } from 'react';
import { notificationStore } from './lib/notificationStore';
import { useModalActions } from './contexts/ModalContext';
import { getCalendarRange, fetchCalendarEvents } from './hooks/queries/useCalendarEventsQuery';
import LocalLoading from './components/LocalLoading';
import './styles/devtools.css';

function AppContent() {
  const location = useLocation();

  // Track online presence for all users
  useOnlinePresence();

  // Sync queries with Supabase Realtime
  useRealtimeSync();

  // [Cache] 달력 데이터 사전 페칭 (Prefetching)
  useEffect(() => {
    const prefetchCalendar = async () => {
      // 현재 날짜 기준 3개월치(이전, 현재, 다음) 미리 가져오기
      const now = new Date();
      const { startDateStr, endDateStr } = getCalendarRange(now);

      try {
        await queryClient.prefetchQuery({
          queryKey: ['calendar-events', startDateStr, endDateStr],
          queryFn: () => fetchCalendarEvents(startDateStr, endDateStr),
          staleTime: 1000 * 60 * 5, // 5분
        });
        // console.log('[App] Calendar data prefetched successfully');
      } catch (err) {
        console.warn('[App] Calendar prefetch failed:', err);
      }
    };

    prefetchCalendar();
  }, []);

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
      const isStandalone = isPWAMode();

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
            // [Bugfix] 구독이 없더라도, 기기 권한이 이미 'granted'라면 조용히 재구독 (Silent Resubscribe)
            if (Notification.permission === 'granted') {
              console.log('[App] Permission granted but no subscription. Silent resubscribing...');
              const newSub = await subscribeToPush();
              if (newSub) {
                // DB에 저장 (기본 설정으로)
                // 만약 이전 설정을 복구하고 싶다면 user_push_subscriptions 테이블에서 user_id로 조회해서 가져와야 하나,
                // endpoint가 달라졌을 수 있으므로 여기서는 기본값(모두 true)으로 새로 등록함.
                await saveSubscriptionToSupabase(newSub).catch(err => console.error('[App] Silent resubscribe failed to save DB:', err));
                console.log('[App] Silent resubscribe completed via Notification.permission=granted');
                return;
              }
            }

            // 구독이 없고 권한도 없으면 안내 모달 띄우기
            console.log('[App] PWA detected & No Subscription & Permission not granted. Showing Modal...');
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

  const handlePwaConfirm = async (prefs: { pref_events: boolean, pref_class: boolean, pref_clubs: boolean, pref_filter_tags: string[] | null, pref_filter_class_genres: string[] | null }, dontShowAgain: boolean) => {
    setShowPwaModal(false);

    if (dontShowAgain) {
      localStorage.setItem('pwa_prompt_dismissed', 'true');
      console.log('[App] User configured PWA notifications and opted out of future prompts.');
    }

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
          <LocalLoading />
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
