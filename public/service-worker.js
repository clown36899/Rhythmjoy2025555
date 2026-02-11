// 빌보드 PWA 서비스 워커 (Version: 20260212 - V41/Badge Lifecycle Fix)
const CACHE_NAME = 'rhythmjoy-cache-v41';

self.addEventListener('install', (event) => {
  // index.html을 반드시 캐시한 후 skipWaiting (navigate fallback 보장)
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.add('/index.html'))
      .then(() => {
        console.log('[SW] index.html pre-cached');
        return self.skipWaiting();
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

  // 외부 요청 무시 (Supabase, chrome-extension, 다른 도메인)
  if (!url.protocol.startsWith('http') || url.hostname !== self.location.hostname) {
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

  // hashed assets (/assets/*) → 네트워크 전용, 실패 시 브라우저 기본 처리
  // main.tsx의 handleChunkError가 404를 감지하여 리로드 처리
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

  // [Feature] 클릭 시 DB에서도 읽음 처리
  if (dbId) {
    markAsReadInDB(dbId);
  }

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
