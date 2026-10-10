// 離線快取：有網路時抓最新版並更新快取，沒網路時用快取
// 改了檔案清單時，把版本號 +1
const CACHE = 'tetris-v3';
const FILES = [
  './',
  './index.html',
  './style.css',
  './js/core.js',
  './js/game.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  // no-cache：每次都向伺服器確認是否有新版（避開瀏覽器自己的 HTTP 快取）
  event.respondWith(
    fetch(req.url, { cache: 'no-cache' })
      .then((res) => {
        // Safari 不接受 service worker 回傳轉址過的頁面，複製成一般回應
        if (res.redirected) {
          res = new Response(res.body, { status: res.status, statusText: res.statusText, headers: res.headers });
        }
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('./index.html')))
  );
});
