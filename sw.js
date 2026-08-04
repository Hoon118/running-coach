// 런코치 서비스 워커 - 오프라인 캐시 (앱 셸)
const CACHE = 'runcoach-v25';
const ASSETS = [
  './',
  './index.html',
  './app.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim()).then(() =>
      self.clients.matchAll({ type:'window', includeUncontrolled:true }).then((clients) => {
        clients.forEach((c) => c.postMessage({ type:'SW_UPDATED', cache: CACHE }));
      })
    )
  );
});

self.addEventListener('message', (e) => {
  if(e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  // 외부(CDN 등) 요청은 절대 가로채지 않음 → OCR 엔진(tesseract.js) 정상 로드 보장
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // sw.js 자체는 항상 네트워크 (캐시 우회)
  if (url.pathname.endsWith('/sw.js')) {
    e.respondWith(fetch(req, { cache: 'no-store' }).catch(() => caches.match(req)));
    return;
  }

  // 동일 출처: 네트워크 우선, 실패 시 캐시 (내비게이션만 index.html로 폴백)
  e.respondWith(
    fetch(req, { cache: 'no-cache' })
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() =>
        caches.match(req).then((r) => r || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error()))
      )
  );
});
