const CACHE = 'avnex-phone-v2';
const SHELL = ['/', '/manifest.webmanifest', '/assets/icon-192.png', '/assets/icon-512.png', '/assets/avnex-splash.png'];
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('avnex-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', event => {
  const req = event.request; const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads/')) return;
  event.respondWith(caches.match(req).then(cached => cached || fetch(req).then(response => { if (response.ok) { const copy=response.clone(); caches.open(CACHE).then(cache=>cache.put(req,copy)); } return response; }).catch(() => caches.match('/'))));
});
