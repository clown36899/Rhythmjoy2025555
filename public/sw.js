// Service Worker - PWA 캐싱 및 오프라인 지원
const CACHE_NAME = 'billboard-v1';

self.addEventListener('install', (event) => {
  console.log('Service Worker 설치됨');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('Service Worker 활성화됨');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Supabase Realtime WebSocket 요청은 캐시하지 않음
  if (event.request.url.includes('supabase.co') || 
      event.request.url.includes('realtime')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
