const V = 'ljk-v2';
const SHELL = ['./', './index.html', './app.js', './manifest.json', './icon.svg'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  // API Apps Script: jangan disentuh service worker (selalu langsung ke jaringan)
  if (u.hostname === 'script.google.com' || u.hostname.endsWith('googleusercontent.com')) return;
  const own = u.origin === self.location.origin;
  const save = res => { if (res && (res.ok || res.type === 'opaque')) { const cp = res.clone(); caches.open(V).then(c => c.put(r, cp)) } return res };
  if (own) { // file aplikasi: network-first agar update selalu terbaru, fallback ke cache saat offline
    e.respondWith(fetch(r).then(save).catch(() => caches.match(r).then(h => h || caches.match('./index.html'))));
  } else {   // CDN (OpenCV, Tailwind, font): cache-first + revalidate
    e.respondWith(caches.match(r).then(hit => hit || fetch(r).then(save)));
  }
});
