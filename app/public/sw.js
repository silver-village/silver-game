/* Works offline. The page itself is fetched fresh when online, so updates arrive on the next open. */
const CACHE = 'silver-__BUILD__';
const ranks = Array.from({ length: 14 }, (_, r) => `art/c${r}.jpg`);
const PRECACHE = ['./', 'style.css', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'art/back.jpg', 'art/bg.jpg', 'art/amulet.jpg', ...ranks, /* filled in by the build */ __ASSETS__];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      /* other apps share this github.io address, so only this game's old caches may go */
      .then(keys => Promise.all(keys.filter(k => k.startsWith('silver-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const fresh = request.mode === 'navigate' || request.url.endsWith('style.css');
  if (fresh) {
    event.respondWith(
      fetch(request)
        .then(res => {
          const copy = res.clone();
          void caches.open(CACHE).then(c => c.put(request, copy));
          return res;
        })
        .catch(() => caches.match(request).then(hit => hit ?? caches.match('./'))),
    );
    return;
  }
  event.respondWith(
    caches.match(request).then(hit => hit ?? fetch(request).then(res => {
      if (res.ok || res.type === 'opaque') {
        const copy = res.clone();
        void caches.open(CACHE).then(c => c.put(request, copy));
      }
      return res;
    })),
  );
});
