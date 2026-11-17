const V = 'ljk-v1';
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
  if (u.hostname === 'script.google.com' || u.hostname.endsWith('googleusercontent.com')) return; // API Apps Script: selalu langsung ke jaringan
  e.respondWith(caches.match(r).then(hit => {
    const net = fetch(r).then(res => {
      if (res && (res.ok || res.type === 'opaque')) { const cp = res.clone(); caches.open(V).then(c => c.put(r, cp)) }
      return res;
    }).catch(() => hit || (r.mode === 'navigate' ? caches.match('./index.html') : undefined));
    return hit || net; // stale-while-revalidate
  }));
});
