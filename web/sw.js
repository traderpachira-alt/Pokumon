// Uygulama kabuğunu önbelleğe alır; veriyi önce ağdan ister, ağ yoksa son kaydedilen veriyi gösterir.
// Kabuk dosyaları (HTML/JS/CSS) sunucuda değişmişse açık sayfalara "güncelleme var" mesajı gönderir.
const VERSION = 'tahta-v2';
const SHELL = ['./', 'index.html', 'style.css', 'app.js', 'ind.js', 'manifest.webmanifest',
  'vendor/lightweight-charts.standalone.production.js', 'icons/icon-192.png'];
const SHELL_TYPES = /text\/html|javascript|text\/css/;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const notify = () => self.clients.matchAll({ type: 'window' })
  .then(cs => cs.forEach(c => c.postMessage({ type: 'update' })));

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.includes('/data/')) {
    // Veri: önce ağ, olmazsa önbellek
    e.respondWith(fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true })));
    return;
  }
  // Kabuk: önbellekten hızlı aç, arkada güncelle; içerik değiştiyse sayfaya haber ver
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => {
    const net = fetch(req).then(async res => {
      if (res.ok) {
        if (hit && SHELL_TYPES.test(res.headers.get('content-type') || '')) {
          const [a, b] = await Promise.all([hit.clone().text(), res.clone().text()]);
          if (a !== b) notify();
        }
        const cache = await caches.open(VERSION);
        await cache.put(req, res.clone());
      }
      return res;
    }).catch(() => hit);
    if (hit) { e.waitUntil(net); return hit; }
    return net;
  }));
});
