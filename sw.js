/* 周行事例批注台 · Service Worker：离线缓存，安装后可在无网络时使用 */
const CACHE = 'wsd-v12';
const ASSETS = [
  './index.html',
  './css/style.css',
  './js/util/dateutil.js',
  './js/util/aliases.js',
  './js/core/rowparser.js',
  './js/core/parser.js',
  './js/core/stats.js',
  './js/core/store.js',
  './js/core/filereader.js',
  './js/ui/toast.js',
  './js/ui/eventform.js',
  './js/ui/daypanel.js',
  './js/ui/calendar.js',
  './js/ui/importmodal.js',
  './js/ui/statspanel.js',
  './js/app.js',
  './vendor/xlsx.full.min.js',
  './vendor/papaparse.min.js',
  './vendor/mammoth.browser.min.js',
  './vendor/echarts.min.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    // 页面：网络优先，失败回退缓存，保证始终能打开最新版
    e.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put('./index.html', copy));
        return res;
      }).catch(() => caches.match('./index.html'))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(hit => {
      if (hit) return hit;
      return fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
        return res;
      });
    })
  );
});
