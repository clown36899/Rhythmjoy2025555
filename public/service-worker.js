// 빌보드 PWA 서비스 워커
const CACHE_NAME = 'billboard-cache-v1';
const urlsToCache = [
  '/',
  '/icon-192.png',
  '/icon-512.png'
];

// 설치 이벤트
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('캐시 열림');
        return cache.addAll(urlsToCache);
      })
  );
  self.skipWaiting();
});

// 활성화 이벤트
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('오래된 캐시 삭제:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch 이벤트
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // [근본 해결] 인증 및 주요 API 요청은 서비스 워커가 아예 개입하지 않음
  // 1. 도메인 기반 제외: Supabase, Kakao (API 도메인 전체)
  // 2. 경로 기반 제외: /auth/ 경로는 무조건 제외 (세션 갱신 등)
  // 3. 헤더 기반 제외: apikey, Authorization 헤더가 있으면 API 요청임
  const isSupabase = url.hostname.includes('supabase.co');
  const isKakao = url.hostname.includes('kakao.com') || url.hostname.includes('kakaocdn.net');
  const isNetlifyFunc = url.pathname.includes('/.netlify/functions/');
  const isAuthPath = url.pathname.includes('/auth/');

  // API 요청 여부 확인
  const isApiRequest = isSupabase || isKakao || isNetlifyFunc || isAuthPath ||
    event.request.headers.has('apikey') ||
    event.request.headers.has('Authorization');

  // Supabase Storage 이미지 요청이면 캐싱 로직으로 보냄
  const isStorageImage = url.pathname.includes('/storage/v1/object/public/images/');

  // 인증 요청은 무조건 바이패스
  if (isApiRequest && !isStorageImage) {
    return;
  }

  // 1. Supabase Storage 이미지: Cache First (캐시 우선, 없으면 네트워크)
  // 패턴: */storage/v1/object/public/images/*
  // models 폴더 제외 (AI 모델은 용량이 크므로 캐싱하지 않음 via SW, 브라우저 캐만 사용)
  if (url.pathname.includes('/models/')) {
    return;
  }

  if (url.pathname.includes('/storage/v1/object/public/images/')) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(event.request).then((response) => {
          if (!response || response.status !== 200 || response.type !== 'basic' && response.type !== 'cors') {
            return response;
          }
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
          return response;
        });
      })
    );
    return;
  }

  // 2. 그 외 요청: Network First (네트워크 우선, 실패 시 캐시)
  // HTML, API 등 최신 데이터가 중요한 경우
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // GET 요청이면서 http/https 프로토콜인 경우만 캐시
        if (event.request.method === 'GET' &&
          (event.request.url.startsWith('http://') || event.request.url.startsWith('https://'))) {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => {
        // 네트워크 실패 시 캐시에서 제공
        return caches.match(event.request);
      })
  );
});
