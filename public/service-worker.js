// 빌보드 PWA 서비스 워커 (Version: 20260129-4 - V27/Native Badge & Fix)
const CACHE_NAME = 'rhythmjoy-cache-v27';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // 🔥 중요: event.waitUntil을 제거하여 캐시 삭제가 완료될 때까지 기다리지 않음
  caches.keys().then(keys => Promise.all(keys.map(key => caches.delete(key))))
    .catch(err => console.warn('[SW] Cache clear failed (non-fatal):', err));

  event.waitUntil(self.clients.claim());
});

// Fetch 이벤트 핸들러 - Supabase API는 항상 네트워크 우선
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.hostname.includes('supabase.co')) {
    return;
  }
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

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
        badge: data.badge || notificationData.badge,
        tag: data.tag || notificationData.tag,
        data: data.data || notificationData.data
      };
    } catch (e) {
      console.log('[SW] Push data parsing failed, using defaults');
    }
  }

  // [Feature] 앱 아이콘 배지 설정 (Native Badging API)
  if (navigator.setAppBadge) {
    // 숫자를 1로 설정 (단순 알림 'ON' 의미)
    navigator.setAppBadge(1).catch(e => console.error('[SW] Badge Error:', e));
  }

  // [Debug] 창에 메시지 보내기 (Admin 테스트용)
  self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
    clients.forEach(client => {
      client.postMessage({ type: 'PUSH_DEBUG', payload: notificationData });
    });
  });

  event.waitUntil(
    self.registration.showNotification(notificationData.title, {
      body: notificationData.body,
      icon: notificationData.icon,
      badge: notificationData.badge,
      tag: notificationData.tag,
      data: notificationData.data,
      vibrate: [200, 100, 200],
      requireInteraction: true, // [Critical] 데스크탑에서 배너 유지
      silent: false, // [Critical] 소리/진동 켜기
      renotify: true // [Critical] 같은 태그여도 다시 알림
    }).catch(err => {
      console.error('[SW] Notification Error:', err);
      // 에러 전파
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
        clients.forEach(client => {
          client.postMessage({ type: 'PUSH_ERROR', error: err.toString() });
        });
      });
    })
  );
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

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url === new URL(urlToOpen, self.location.origin).href && 'focus' in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
  );
});
