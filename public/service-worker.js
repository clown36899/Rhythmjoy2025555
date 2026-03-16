// PWA 서비스 워커 (vite-plugin-pwa injectManifest 방식)
// 매 빌드마다 self.__WB_MANIFEST가 Workbox에 의해 자동 주입됨 → SW 내용이 바뀌어 자동 업데이트 감지 가능
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';

// [Optimization] Workbox의 시끄러운 개발 로그(프리캐싱 경고 등)를 비활성화합니다.
// 알림 작동 확인을 위한 커스텀 로깅([Push], [SW])만 남기기 위함입니다.
self.__WB_DISABLE_DEV_LOGS = true;

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST || []);

const CACHE_NAME = 'rhythmjoy-cache-v1.0.5';
// Last updated: 2026-03-16 (v51)
self.addEventListener('install', (event) => {
  // PWA 설치 요건: 루트(/)와 필수 에셋이 캐시되어야 오프라인 신뢰성을 인정받음
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll([
        '/',
        '/index.html',
        '/manifest.json',
        '/icon-192.png',
      ]))
      .then(() => {
        console.log('[SW] Essential assets pre-cached (V50)');
        // skipWaiting()을 여기서 호출하지 않음
        // 클라이언트가 SKIP_WAITING 메시지를 보낼 때까지 waiting 상태 유지
        // → 클라이언트가 적절한 시점(페이지 로드, 포커스 복귀 등)에 자동으로 업데이트 적용
      })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      // 현재 캐시만 유지, 이전 버전 캐시만 삭제
      .then(keys => Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      ))
      .then(() => console.log('[SW] Old caches cleared'))
      .then(() => self.clients.claim())
      .then(() => {
        // 업데이트 완료 후 모든 클라이언트에 리로드 신호 전송
        return self.clients.matchAll({ type: 'window' }).then(clients => {
          clients.forEach(client => {
            client.postMessage({ type: 'SW_UPDATED' });
          });
        });
      })
  );
});

// Fetch 이벤트 핸들러 - 네트워크 우선
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // [Fix] 외부 요청(Supabase API, 에지 함수, 외부 리소스)은 SW 간섭 없이 즉시 네트워크로 연결
  // Workbox가 이 요청들을 가로채서 "No route found" 경고를 내지 않도록 최상단에서 처리합니다.
  const isSupabaseRequest = url.port === '54321' || url.pathname.includes('/functions/v1/');
  const isExternalRequest = url.hostname !== self.location.hostname;
  
  // 인증 관련 및 외부/Supabase 요청 바이패스
  const isBypassRequest = isSupabaseRequest || isExternalRequest ||
    url.search.includes('code=') ||
    url.search.includes('error=') ||
    url.hash.includes('access_token=') ||
    url.hash.includes('refresh_token=');

  if (isBypassRequest) {
    if (isSupabaseRequest || isExternalRequest) {
      // 불필요한 로그 노이즈 방지 (인증 관련한 것만 남김)
      event.respondWith(fetch(event.request));
    } else {
      console.log('[SW] 🛡️ Bypass request detected (Auth). Forcing network direct.', url.href);
      event.respondWith(fetch(event.request));
    }
    
    // 이 핸들러가 응답을 맡았으므로 다른 (Workbox) 핸들러로 전파 중단
    if (event.stopImmediatePropagation) {
      event.stopImmediatePropagation();
    }
    return;
  }

  // navigate 요청 → 네트워크 우선, 실패 시 캐시된 index.html
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // 성공 시 index.html 캐시 갱신
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put('/index.html', clone));
          }
          return response;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // [PWA Reliable] 그 외 모든 동일 출처 요청에 대해 respondWith 보장
  // 크롬의 PWA 설치 기준(WebAPK)은 fetch 핸들러가 존재하고 유효한 응답을 내놓는지를 체크합니다.
  event.respondWith(fetch(event.request));
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  // [Feature] 클라이언트(앱)가 켜졌을 때 알림창/배지 모두 제거
  if (event.data && event.data.type === 'CLEAR_NOTIFICATIONS') {
    self.registration.getNotifications().then(notifications => {
      notifications.forEach(notification => notification.close());
    });
    // 배지 API도 명시적으로 클리어
    if (navigator.clearAppBadge) {
      navigator.clearAppBadge().catch(console.error);
    } else if (navigator.setAppBadge) {
      navigator.setAppBadge(0).catch(console.error);
    }
  }

  // [Feature] 알림 읽음 처리 (모달에서 클릭 시)
  if (event.data && event.data.type === 'MARK_NOTIFICATION_READ') {
    const id = event.data.id;
    markAsReadInDB(id);
  }
});

// IndexedDB Helper for SW
const DB_NAME = 'notification-history';
const STORE_NAME = 'notifications';
const DB_VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveToDB(notification) {
  try {
    const db = await openDB();
    const id = Date.now() + Math.random().toString(36).substr(2, 9);

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      const record = {
        ...notification,
        url: notification.data?.url || notification.url, // URL 평탄화
        id: id,
        received_at: new Date().toISOString(),
        is_read: false
      };

      const request = store.add(record);

      tx.oncomplete = () => resolve(id);
      tx.onerror = () => reject(tx.error);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error('[SW] DB Save Error:', err);
    return null;
  }
}

async function markAsReadInDB(id) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const getRequest = store.get(id);

      getRequest.onsuccess = () => {
        const data = getRequest.result;
        if (data) {
          data.is_read = true;
          const putRequest = store.put(data);
          putRequest.onsuccess = () => resolve();
          putRequest.onerror = () => reject(putRequest.error);
        } else {
          resolve();
        }
      };
      getRequest.onerror = () => reject(getRequest.error);
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.error('[SW] DB Update Error:', err);
  }
}

// 푸시 알림 수신 이벤트
self.addEventListener('push', (event) => {
  let notificationData = {
    title: '댄스빌보드',
    body: '새로운 알림이 도착했습니다!',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: 'default',
    data: {
      url: '/'
    }
  };

  if (event.data) {
    try {
      const data = event.data.json();
      notificationData = {
        title: data.title || notificationData.title,
        body: data.body || notificationData.body,
        icon: data.icon || notificationData.icon,
        image: data.image || null, // [NEW] 큰 이미지 필드 추가
        badge: data.badge || notificationData.badge,
        tag: data.tag || notificationData.tag,
        data: data.data || notificationData.data
      };
    } catch (e) {
      console.log('[SW] Push data parsing failed, using defaults');
    }
  }

  // [Feature] DB 저장 및 알림/배지 표시 통합 제어
  event.waitUntil((async () => {
    try {
      const dbId = await saveToDB(notificationData);

      // 1. 알림 표시 (DB ID 포함)
      await self.registration.showNotification(notificationData.title, {
        body: notificationData.body,
        icon: notificationData.icon,
        image: notificationData.image,
        badge: notificationData.badge,
        tag: notificationData.tag,
        data: { ...notificationData.data, dbId: dbId },
        vibrate: [200, 100, 200],
        requireInteraction: true,
        silent: false,
        renotify: true
      });

      // 2. 앱 배지 설정
      if (navigator.setAppBadge) {
        await navigator.setAppBadge(1);
      }

      // 3. [Update] 알림 수신 시 새 SW 버전 백그라운드 체크
      // 사용자가 알림을 탭해서 앱을 열 때쯤엔 새 버전이 준비 완료되어 자동 적용됨
      self.registration.update().catch(() => { });
    } catch (err) {
      console.error('[SW] Push processing failed:', err);
    }
  })());

  // [Debug] 창에 메시지 보내기 (Admin 테스트용)
  self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
    clients.forEach(client => {
      client.postMessage({ type: 'PUSH_DEBUG', payload: notificationData });
    });
  });
});

// 알림 클릭 이벤트
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  // [Feature] 배지 초기화 (알림 확인했으므로 제거)
  if (navigator.clearAppBadge) {
    navigator.clearAppBadge().catch(e => console.error('[SW] Clear Badge Error:', e));
  } else if (navigator.setAppBadge) {
    navigator.setAppBadge(0).catch(e => console.error('[SW] Clear Badge Error:', e));
  }

  const urlToOpen = event.notification.data?.url || '/';
  const dbId = event.notification.data?.dbId;
  // [Update] 알림 클릭 시 읽음 처리는 앱(클라이언트)이 맡음
  // SW에서 즉시 처리해버리면 앱 진입 시 '읽지 않은 알림' 목록이 비어있게 되기 때문
  /* 
  if (dbId) {
    markAsReadInDB(dbId);
  }
  */

  // [Update] 앱이 알림을 통해 진입했음을 알 수 있도록 파라미터 추가
  const url = new URL(urlToOpen, self.location.origin);
  url.searchParams.set('open_notifications', 'true');
  const finalUrl = url.href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // 이미 같은 URL이 열려있다면 해당 창 포커스
        for (const client of clientList) {
          if (client.url === finalUrl && 'focus' in client) {
            return client.focus();
          }
        }
        // 없으면 새 창
        if (clients.openWindow) {
          return clients.openWindow(finalUrl);
        }
      })
  );
});
