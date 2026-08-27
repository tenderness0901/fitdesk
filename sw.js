// FitDesk Service Worker —— 缓存应用壳，支持离线打开；不拦截同步 API 与动态请求。
const CACHE = 'fitdesk-v39';
const SHELL = [
  './',
  'index.html',
  'styles.css?v=2026082709',
  'app.js?v=2026082709',
  'words1800.js?v=2026082709',
  'overtime.html',
  'reading.html',
  'overtime.js?v=2026082709',
  'reading.js?v=2026082709',
  'reading-ex.html?v=2026082709',
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
  e.waitUntil((async () => {
    // 清空所有旧版本缓存，避免旧页面被缓存卡死
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    // 立即接管所有已打开的标签页
    await self.clients.claim();
    // 强制刷新所有打开的窗口，确保立即加载最新页面（根治旧 SW 死循环）
    const cls = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    cls.forEach((c) => { if (c.url) { try { c.navigate(c.url); } catch (_) {} } });
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return; // POST（同步上传等）一律走网络，不缓存

  const url = new URL(req.url);
  // 同步接口（/push、/pull、/health）是动态数据，绝不缓存
  if (/\/(push|pull|health)(\?|$)/.test(url.pathname)) return;

  // 网络优先：保证强刷/重新部署后一定拿到最新文件，不被旧缓存卡住；
  // 仅当网络失败（离线）时才回退到缓存，兼顾离线可用。
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok &&
            (url.origin === self.location.origin || url.hostname.includes('cdn.jsdelivr.net'))) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((c) => c || caches.match('./index.html')))
  );
});
