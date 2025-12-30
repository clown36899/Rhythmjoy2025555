// 빌보드 PWA 서비스 워커 (Version: 20251230-1743)
const CACHE_NAME = 'rhythmjoy-cache-v13';

self.addEventListener('install', (event) => {
  console.log('[SW] v13 - New content detected! 🦄');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[SW] v13 - Unicorn Magic Active! 🦄');
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(key => caches.delete(key))))
  );
  self.clients.claim();
});

// Fetch 이벤트 핸들러를 완전히 제거하여 브라우저의 기본 네트워크 동작을 방해하지 않게 합니다.
// PWA 기능(이미지 캐싱)은 나중에 안정화된 후 다시 추가할 예정입니다.

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});
