// 빌보드 PWA 서비스 워커 (Version: 20260205 - V36/SideDrawer & USS Darkmode Improvements)
const CACHE_NAME = 'rhythmjoy-cache-v36';

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

  // [Feature] DB에 알림 저장
  event.waitUntil((async () => {
    const dbId = await saveToDB(notificationData);

    // 알림 표시 (표시 시점에 DB ID를 데이터에 포함)
    await self.registration.showNotification(notificationData.title, {
      body: notificationData.body,
      icon: notificationData.icon,
      image: notificationData.image, // [NEW] 큰 이미지 표시
      badge: notificationData.badge,
      tag: notificationData.tag,
      data: { ...notificationData.data, dbId: dbId }, // DB ID 추가
      vibrate: [200, 100, 200],
      requireInteraction: true,
      silent: false,
      renotify: true
    });
  })());

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
