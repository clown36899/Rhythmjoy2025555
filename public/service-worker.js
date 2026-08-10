// PWA 서비스 워커 (vite-plugin-pwa injectManifest 방식)
// 매 빌드마다 self.__WB_MANIFEST가 Workbox에 의해 자동 주입됨 → SW 내용이 바뀌어 자동 업데이트 감지 가능
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';

// [Optimization] Workbox의 시끄러운 개발 로그(프리캐싱 경고 등)를 비활성화합니다.
// 알림 작동 확인을 위한 커스텀 로깅([Push], [SW])만 남기기 위함입니다.
self.__WB_DISABLE_DEV_LOGS = true;

const PRECACHE_MANIFEST = self.__WB_MANIFEST || [];
const indexPrecacheEntry = PRECACHE_MANIFEST.find((entry) => entry.url === 'index.html');
const runtimeRevision = indexPrecacheEntry?.revision || 'dev';

const RUNTIME_CACHE_PREFIX = 'rhythmjoy-runtime-';
const LEGACY_CACHE_PREFIX = 'rhythmjoy-cache-';
const CACHE_NAME = `${RUNTIME_CACHE_PREFIX}${runtimeRevision}`;
const SHARE_TARGET_CACHE = 'rhythmjoy-share-targets-v1';
const SHARE_TARGET_PATH = '/__pwa-share-target/';
const SHARE_TARGET_MAX_AGE_MS = 10 * 60 * 1000;
// Last updated: 2026-06-11 (v56)
self.addEventListener('install', (event) => {
  // Cache only the shell essentials. Build-specific cache names prevent stale Cafe24 HTML.
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll([
        new Request('/index.html', { cache: 'reload' }),
        new Request('/manifest.json', { cache: 'reload' }),
        new Request('/icon-192.png', { cache: 'reload' }),
      ]))
      .then(() => {
        // 기존 탭을 즉시 선점하지 않는다. 앱의 단일 갱신 코디네이터가 입력·모달
        // 상태를 확인한 뒤 SKIP_WAITING을 보낼 때만 새 버전을 활성화한다.
        console.log('[SW] Essential assets pre-cached; waiting for safe activation');
      })
  );
});

function compactShareValue(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function hasIncomingShareParams(url) {
  return ['title', 'text', 'url', 'add', 'link'].some((key) => url.searchParams.has(key));
}

function hasUsefulSharePayload(payload) {
  return Boolean(payload?.title || payload?.text || payload?.url);
}

async function readShareTargetPayload(request, url) {
  const payload = {
    title: compactShareValue(url.searchParams.get('title')),
    text: compactShareValue(url.searchParams.get('text')),
    url: compactShareValue(url.searchParams.get('url') || url.searchParams.get('add') || url.searchParams.get('link')),
    savedAt: Date.now()
  };

  if (request.method === 'POST') {
    try {
      const formData = await request.formData();
      payload.title = compactShareValue(formData.get('title')) || payload.title;
      payload.text = compactShareValue(formData.get('text')) || payload.text;
      payload.url = compactShareValue(formData.get('url') || formData.get('add') || formData.get('link')) || payload.url;
    } catch (error) {
      console.warn('[SW] Share target form parsing failed:', error);
    }
  }

  return payload;
}

async function cleanupStoredShareTargets(cache) {
  const requests = await cache.keys();
  await Promise.all(requests.map(async (request) => {
    try {
      const response = await cache.match(request);
      const payload = await response?.clone().json();
      if (!payload?.savedAt || Date.now() - Number(payload.savedAt) > SHARE_TARGET_MAX_AGE_MS) {
        await cache.delete(request);
      }
    } catch {
      await cache.delete(request);
    }
  }));
}

async function handleShareTargetRequest(request, url) {
  const payload = await readShareTargetPayload(request, url);
  if (!hasUsefulSharePayload(payload)) {
    return Response.redirect(new URL('/forum/media', self.location.origin).href, 303);
  }

  const shareId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const cache = await caches.open(SHARE_TARGET_CACHE);
  await cleanupStoredShareTargets(cache);
  await cache.put(
    new Request(`${self.location.origin}${SHARE_TARGET_PATH}${shareId}`),
    new Response(JSON.stringify(payload), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store'
      }
    })
  );

  return Response.redirect(new URL(`/forum/media/share?share_id=${encodeURIComponent(shareId)}`, self.location.origin).href, 303);
}

async function appShellFallback(response) {
  if (response?.ok) return response;
  const cached = await caches.match('/index.html');
  if (cached) return cached;
  return response;
}

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => (
            key !== CACHE_NAME &&
            (key.startsWith(RUNTIME_CACHE_PREFIX) || key.startsWith(LEGACY_CACHE_PREFIX))
          ))
          .map(key => caches.delete(key))
      ))
      .then(() => console.log('[SW] Old runtime caches cleared'))
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
  const isSameOrigin = url.origin === self.location.origin;
  const isShareTargetRoute = isSameOrigin && url.pathname === '/forum/media/share';

  if (
    isShareTargetRoute &&
    (
      event.request.method === 'POST' ||
      (event.request.method === 'GET' && hasIncomingShareParams(url) && !url.searchParams.has('share_id'))
    )
  ) {
    event.respondWith(handleShareTargetRequest(event.request, url));
    if (event.stopImmediatePropagation) {
      event.stopImmediatePropagation();
    }
    return;
  }

  const isApiRequest =
    url.pathname.startsWith('/api/') ||
    url.pathname === '/version.json' ||
    url.pathname === '/service-worker.js';
  const isAuthApiRequest =
    url.pathname === '/api/kakao-login' ||
    url.pathname === '/auth/kakao-callback';
  const isExternalRequest = url.hostname !== self.location.hostname;
  
  // 인증 관련 API 및 외부 요청 바이패스
  const isBypassRequest = event.request.method !== 'GET' ||
    isApiRequest ||
    isAuthApiRequest ||
    isExternalRequest ||
    url.search.includes('code=') ||
    url.search.includes('error=') ||
    url.hash.includes('access_token=') ||
    url.hash.includes('refresh_token=');

  if (isBypassRequest) {
    if (isExternalRequest || isApiRequest || event.request.method !== 'GET') {
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
    const freshNavigationRequest = new Request(event.request, { cache: 'no-store' });

    event.respondWith(
      fetch(freshNavigationRequest)
        .then(response => {
          const contentType = response.headers.get('Content-Type') || '';
          // 성공 시 index.html 캐시 갱신
          if (response.ok && contentType.includes('text/html')) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put('/index.html', clone));
          }
          return appShellFallback(response);
        })
        .catch(() => caches.match('/index.html'))
    );
    if (event.stopImmediatePropagation) {
      event.stopImmediatePropagation();
    }
    return;
  }
});

cleanupOutdatedCaches();
precacheAndRoute(PRECACHE_MANIFEST);

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  // 사용자가 명시적으로 전체 읽음을 실행했을 때만 운영체제 알림과 배지를 정리한다.
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

});

// 푸시 알림 수신 이벤트
self.addEventListener('push', (event) => {
  let notificationData = {
    title: '댄스빌보드',
    body: '새로운 알림이 도착했습니다!',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: 'default',
    image: null,
    renotify: false,
    items: [],
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
        renotify: data.renotify === true,
        items: data.items || data.data?.items || [],
        data: {
          ...(data.data || notificationData.data),
          image: data.image || data.data?.image || null,
          items: data.items || data.data?.items || []
        }
      };
    } catch (e) {
      console.log('[SW] Push data parsing failed, using defaults');
    }
  }

  // 운영 알림함의 원본은 서버 user_notifications이다.
  // 서비스워커는 IndexedDB를 소유하지 않고 운영체제 알림 표시만 담당한다.
  event.waitUntil((async () => {
    try {
      await self.registration.showNotification(notificationData.title, {
        body: notificationData.body,
        icon: notificationData.icon,
        image: notificationData.image,
        badge: notificationData.badge,
        tag: notificationData.tag,
        data: { ...notificationData.data },
        vibrate: [200, 100, 200],
        requireInteraction: true,
        silent: false,
        renotify: notificationData.renotify === true
      });

      // 1. 앱 배지 설정
      if (navigator.setAppBadge) {
        await navigator.setAppBadge(1);
      }

      // 2. 알림 수신 시 새 SW 버전 백그라운드 체크
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
  const notificationData = event.notification.data || {};
  const sourceKind = notificationData.queueId
    ? 'new_event'
    : notificationData.commentId
      ? 'board_comment'
      : notificationData.kind === 'daily_schedule_morning' && notificationData.date
        ? 'daily_schedule'
        : null;
  const sourceId = notificationData.queueId || notificationData.commentId || (
    notificationData.kind === 'daily_schedule_morning' ? notificationData.date : null
  );

  // 클릭한 한 건만 사용자별 서버 읽음 상태와 동기화할 수 있도록 식별자를 전달한다.
  const url = new URL(urlToOpen, self.location.origin);
  url.searchParams.set('open_notifications', 'true');
  if (sourceKind && sourceId) {
    url.searchParams.set('notification_kind', sourceKind);
    url.searchParams.set('notification_source_id', sourceId);
  }
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
