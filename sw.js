// FitDesk Service Worker —— 缓存应用壳，支持离线打开；不拦截同步 API 与动态请求。
const CACHE = 'fitdesk-v29';
const SHELL = [
  './',
  'index.html',
  'styles.css?v=2026082603',
  'app.js?v=2026082603',
  'words1800.js?v=2026082603',
  'overtime.html',
  'reading.html',
  'overtime.js?v=2026082603',
  'reading.js?v=2026082603',
  'fitdesk-store.js',
  'manifest.json',
  'icons/icon-192.svg',
  'icons/icon-512.svg'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return; // POST（同步上传等）一律走网络，不缓存

  const url = new URL(req.url);
  // 同步接口（/push、/pull、/health）是动态数据，绝不缓存
  if (/\/(push|pull|health)(\?|$)/.test(url.pathname)) return;

  // 同域应用壳：缓存优先；跨域 CDN（如 chart.js）也缓存一份，离线时图表可用
  e.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          if (res && res.ok &&
              (url.origin === self.location.origin || url.hostname.includes('cdn.jsdelivr.net'))) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached || caches.match('./index.html'));
    })
  );
});
