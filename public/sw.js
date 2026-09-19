// Keeps Hearth Studio working offline once it has been opened. Pages load fresh when the
// network is available; built files (which have unique names) are served from the cache.
const CACHE = 'hearth-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  const fresh = fetch(req).then((res) => {
    if (res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy));
    }
    return res;
  });
  if (req.mode === 'navigate')
    event.respondWith(fresh.catch(() => caches.match(req).then((r) => r || caches.match('./'))));
  else event.respondWith(caches.match(req).then((hit) => hit || fresh));
});
