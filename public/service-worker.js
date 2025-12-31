// 빌보드 PWA 서비스 워커 (Version: 20251231-1423 - Supabase API Network-First)
const CACHE_NAME = 'rhythmjoy-cache-v15';

self.addEventListener('install', (event) => {
  console.log('[SW] v15 - New content with Supabase Network-First! 🌐');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[SW] v15 - Activated with Supabase Network-First! 🌐');
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(key => caches.delete(key))))
  );
  self.clients.claim();
});

// Fetch 이벤트 핸들러 - Supabase API는 항상 네트워크 우선
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Supabase API 요청은 항상 네트워크 우선 (캐시 사용 안 함)
  // 이를 통해 로그아웃 후에도 캐시된 인증 정보가 사용되지 않음
  if (url.hostname.includes('supabase.co')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // 나머지 요청은 기본 동작 (브라우저가 처리)
  // 이 핸들러는 Chrome이 PWA로 인식하기 위한 최소 요구사항
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// 푸시 알림 수신 이벤트
self.addEventListener('push', (event) => {
  console.log('[SW] Push notification received:', event);

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

  // 푸시 데이터가 있으면 파싱
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

  event.waitUntil(
    self.registration.showNotification(notificationData.title, {
      body: notificationData.body,
      icon: notificationData.icon,
      badge: notificationData.badge,
      tag: notificationData.tag,
      data: notificationData.data,
      vibrate: [200, 100, 200],
      requireInteraction: false
    })
  );
});

// 알림 클릭 이벤트
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event.notification.tag);

  event.notification.close();

  const urlToOpen = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // 이미 열린 창이 있으면 포커스
        for (const client of clientList) {
          if (client.url === new URL(urlToOpen, self.location.origin).href && 'focus' in client) {
            return client.focus();
          }
        }
        // 없으면 새 창 열기
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
  );
});
