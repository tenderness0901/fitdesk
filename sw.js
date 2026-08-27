// FitDesk Service Worker —— 纯透传（不缓存任何响应），永远从网络取最新文件。
// 站点页面会在加载时自行 unregister 本 SW，因此本文件仅作兜底，不会再造成旧缓存死循环。
const CACHE = 'fitdesk-v41';

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    // 清空所有历史缓存，避免旧页面被缓存卡死
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return; // POST（同步上传等）一律走网络，不缓存
  const url = new URL(e.request.url);
  // 同步接口（/push、/pull、/health）是动态数据，绝不缓存
  if (/\/(push|pull|health)(\?|$)/.test(url.pathname)) return;
  // 一律走网络，不缓存；离线时若恰好有缓存则兜底，否则交回网络错误
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request).then((c) => c || caches.match('./index.html')))
  );
});
