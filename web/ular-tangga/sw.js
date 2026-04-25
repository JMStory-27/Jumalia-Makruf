/* Ular Tangga PWA — minimal service worker.
   Strategy:
   - HTML (navigation): network-first, fall back to cache (so users always get latest game logic when online).
   - Static assets (icons, manifest): cache-first.
   - Firebase / WebRTC traffic: passthrough (never cache realtime data).
*/
const VERSION = 'v4-2026-04-25';
const STATIC_CACHE = `ut-static-${VERSION}`;
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-192.png',
  './icon-maskable-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(STATIC_CACHE).then(c => c.addAll(STATIC_ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== STATIC_CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Never cache realtime / cross-origin signaling traffic
  if (url.origin !== location.origin) return;
  if (/firebaseio|googleapis|gstatic/.test(url.hostname)) return;

  // Navigation: network-first
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    e.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(STATIC_CACHE);
        cache.put('./index.html', fresh.clone());
        return fresh;
      } catch {
        const cache = await caches.open(STATIC_CACHE);
        return (await cache.match('./index.html')) || (await cache.match('./')) || Response.error();
      }
    })());
    return;
  }

  // Static asset: cache-first
  e.respondWith((async () => {
    const cache = await caches.open(STATIC_CACHE);
    const hit = await cache.match(req);
    if (hit) return hit;
    try {
      const fresh = await fetch(req);
      if (fresh && fresh.status === 200) cache.put(req, fresh.clone());
      return fresh;
    } catch {
      return hit || Response.error();
    }
  })());
});
