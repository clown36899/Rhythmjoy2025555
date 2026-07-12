import { useLocation } from "react-router-dom";
import { MobileShell } from "./layouts/MobileShell";
import { Suspense, useEffect, useCallback, useState, useRef } from "react";
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
import { saveSubscriptionToDataStore, subscribeToPush } from './lib/pushNotifications';
import { PwaNotificationModal } from './components/PwaNotificationModal';
import DeploymentAutoRefresh from './components/DeploymentAutoRefresh';
import { AppNoticeToast } from './components/common/AppNoticeToast';
import KioskModeController from './components/KioskModeController';

import { notificationStore } from './lib/notificationStore';
import {
  getSiteNotifications,
  markSiteNotificationsRead,
  SITE_NOTIFICATION_INBOX_EVENT,
} from './lib/siteNotificationInbox';
import { useModalActions, useModalState } from './contexts/ModalContext';
import { CALENDAR_EVENTS_QUERY_VERSION, getCalendarRange, fetchCalendarEvents } from './hooks/queries/useCalendarEventsQuery';
import LocalLoading from './components/LocalLoading';
import './styles/devtools.css';

let calendarPrefetchStarted = false;
const PWA_DEBUG = import.meta.env.VITE_PWA_DEBUG === 'true';
const pwaDebug = (...args: unknown[]) => {
  if (PWA_DEBUG) console.debug(...args);
};

const shouldPrefetchCalendarForPath = (pathname: string) => (
  pathname === '/' ||
  pathname === '/main-v2-test'
);

function AppContent() {
  const location = useLocation();

  // Track online presence for all users
  useOnlinePresence();

  // Sync queries with the realtime bridge
  useRealtimeSync();

  // [Cache] 달력 데이터 사전 페칭 (Prefetching)
  useEffect(() => {
    if (!shouldPrefetchCalendarForPath(location.pathname)) return;
    if (calendarPrefetchStarted) return;

    const prefetchCalendar = async () => {
      if (calendarPrefetchStarted) return;
      calendarPrefetchStarted = true;

      // 현재 날짜 기준 3개월치(이전, 현재, 다음) 미리 가져오기
      const now = new Date();
      const { startDateStr, endDateStr } = getCalendarRange(now);

      try {
        await queryClient.prefetchQuery({
          queryKey: ['calendar-events', CALENDAR_EVENTS_QUERY_VERSION, 'swing', startDateStr, endDateStr],
          queryFn: () => fetchCalendarEvents(startDateStr, endDateStr, 'swing'),
          staleTime: 1000 * 30,
        });
        // console.log('[App] Calendar data prefetched successfully');
      } catch (err) {
        console.warn('[App] Calendar prefetch failed:', err);
      }
    };

    const delayMs = 1800;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let idleId: number | null = null;

    timeoutId = setTimeout(() => {
      if ('requestIdleCallback' in window) {
        idleId = window.requestIdleCallback(() => {
          prefetchCalendar();
        }, { timeout: 4000 });
      } else {
        prefetchCalendar();
      }
    }, delayMs);

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (idleId !== null && 'cancelIdleCallback' in window) {
        window.cancelIdleCallback(idleId);
      }
    };
  }, [location.pathname]);

  const [showPwaModal, setShowPwaModal] = useState(false);
  const [pwaModalInitialPrefs, setPwaModalInitialPrefs] = useState<{
    pref_events: boolean; pref_class: boolean; pref_clubs: boolean;
    pref_filter_tags: string[] | null; pref_filter_class_genres: string[] | null;
  } | null>(null);
  const { openModal, updateModalProps } = useModalActions();
  const { modalStack } = useModalState();
  const modalStackRef = useRef<string[]>([]);

  // modalStack 상태가 변할 때마다 Ref 최신화 (리스너/콜백용)
  useEffect(() => {
    modalStackRef.current = modalStack;
  }, [modalStack]);


  // [History] 읽지 않은 알림 로드 및 자동 알림 제어 로직 (정석 Fix)
  // 단순 포커스 이벤트로 인한 무한 루프를 방지하기 위해 신규 알림이 발생했거나 강제 오픈 시에만 실행
  const lastUnreadCountRef = useRef<number>(0);
  const isRefreshingRef = useRef<boolean>(false);

  const loadUnreadNotifications = useCallback(async (forceOpen = false) => {
    // 1. 이미 처리 중이면 중복 실행 방지 (동시성 가드)
    if (isRefreshingRef.current) return;
    isRefreshingRef.current = true;

    try {
      const unread = await notificationStore.getUnread();
      const currentCount = unread.length;

      // 2. [Proper Fix] 상태 업데이트를 로직 초기에 수행
      // 모달 오픈이나 다른 비동기 작업 중 발생하는 재진입(focus 등) 시
      // 이미 업데이트된 Count를 참조하게 하여 무한 루프를 원천 차단함
      lastUnreadCountRef.current = currentCount;

      // 3. 사용자를 방해하지 않도록 자동 오픈은 하지 않고, 강제 진입/이미 열린 상태만 처리
      const currentStack = modalStackRef.current;
      // 모달이 이미 열려있으면 알림을 읽어도 목록 갱신 (읽은 항목 즉시 제거)
      const isModalAlreadyOpen = currentStack.includes('notificationHistory');

      if (forceOpen || isModalAlreadyOpen) {
        if (currentCount > 0 || forceOpen || isModalAlreadyOpen) {
          const notifProps = {
            notifications: unread,
            siteNotifications: getSiteNotifications(),
            onRefresh: () => loadUnreadNotifications(false),
            onOpenNotificationSettings: () => openModal('notificationSettings'),
          };
          if (forceOpen) {
            await notificationStore.markAllAsRead();
            markSiteNotificationsRead();
            window.dispatchEvent(new CustomEvent(SITE_NOTIFICATION_INBOX_EVENT));
          }
          // [Bug Fix] notificationHistory 위에 다른 모달(eventDetail 등)이 올라와 있을 때
          // openModal을 호출하면 notificationHistory가 스택 최상위로 이동해 eventDetail을 가림.
          // 이 경우 props만 업데이트하고 스택 순서는 유지 (백그라운드 갱신).
          const isHistoryOnTop = currentStack[currentStack.length - 1] === 'notificationHistory';
          if (isModalAlreadyOpen && !isHistoryOnTop) {
            updateModalProps('notificationHistory', notifProps);
          } else {
            openModal('notificationHistory', notifProps);
          }
        }
      }
    } catch (err) {
      console.warn('[App] Failed to load unread notifications:', err);
    } finally {
      // 처리가 완전히 끝난 후 배포 잠금 해제
      isRefreshingRef.current = false;
    }
  }, [openModal, updateModalProps]);

  // PWA 알림 권한은 앱 부팅/로그인 중 자동으로 띄우지 않고, 사용자가 알림 설정을 열 때만 처리한다.
  // [Admin Test] 관리자용 테스트 트리거
  useEffect(() => {
    (window as any).adminTestPwaModal = () => {
      pwaDebug('[Admin] Forcing PWA Modal...');
      setPwaModalInitialPrefs(null);
      setShowPwaModal(true);
    };
  }, []);

  const handlePwaConfirm = async (prefs: { pref_events: boolean, pref_class: boolean, pref_clubs: boolean, pref_filter_tags: string[] | null, pref_filter_class_genres: string[] | null }, dontShowAgain: boolean) => {
    setShowPwaModal(false);
    setPwaModalInitialPrefs(null);

    if (dontShowAgain) {
      localStorage.setItem('pwa_prompt_dismissed', 'true');
      pwaDebug('[App] User configured PWA notifications and opted out of future prompts.');
    }

    pwaDebug('[App] User configured PWA notifications:', prefs);
    const sub = await subscribeToPush();
    if (sub) {
      await saveSubscriptionToDataStore(sub, prefs); // 사용자가 선택한 설정 적용 (그대로 전달)
      pwaDebug('[App] PWA Auto-subscribed successfully with custom prefs.');
      window.dispatchEvent(new CustomEvent('pushStatusChanged', { detail: { enabled: true } }));
    }
  };

  const handlePwaCancel = (dontShowAgain: boolean) => {
    setShowPwaModal(false);
    setPwaModalInitialPrefs(null);
    if (dontShowAgain) {
      localStorage.setItem('pwa_prompt_dismissed', 'true');
      pwaDebug('[App] User dismissed PWA prompt (Dont show again).');
    } else {
      pwaDebug('[App] User canceled PWA prompt (Show again next time).');
    }
  };

  // [Feature] 알림 배지 및 센터 청소 통합 함수
  const lastNotificationClearRef = useRef(0);

  const clearNotifications = async (force = false) => {
    const now = Date.now();
    if (!force && now - lastNotificationClearRef.current < 3000) return;
    lastNotificationClearRef.current = now;

    // 1. 서비스 워커에게 '알림센터 비우기' 명령 전송
    const serviceWorker = navigator.serviceWorker;
    if (serviceWorker?.ready) {
      try {
        const registration = await serviceWorker.ready;
        if (registration?.active) {
          registration.active.postMessage({ type: 'CLEAR_NOTIFICATIONS' });
        }
      } catch (err) {
        console.warn('[Notification] Service worker cleanup skipped:', err);
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
    setTimeout(() => clearNotifications(true), 500);

    // B. 포커스/가시성 변경 감지
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        clearNotifications(true);
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
    window.addEventListener('touchstart', handleInteraction, { passive: true }); // 모바일 터치 대응

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
    clearNotifications(true);

    // [Feature] 알림 클릭 진입 감지 (open_notifications 파라미터)
    const params = new URLSearchParams(location.search);
    if (params.get('open_notifications') === 'true') {
      loadUnreadNotifications(true); // 강제 오픈

      // URL에서 파라미터 제거 (뒤로가기 시 중복 방지)
      const newParams = new URLSearchParams(location.search);
      newParams.delete('open_notifications');
      const newSearch = newParams.toString();
      const newUrl = location.pathname + (newSearch ? `?${newSearch}` : '') + location.hash;
      window.history.replaceState({}, '', newUrl);
    }

    logPageView(location.pathname + location.search);
  }, [location, loadUnreadNotifications]);

  return (
    <>
      <KioskModeController />
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
        initialPrefs={pwaModalInitialPrefs}
      />
      <DeploymentAutoRefresh hasOpenModal={modalStack.length > 0 || showPwaModal} />
      <AppNoticeToast />
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
