/* Lock AI — Service Worker
   Cache shell for offline + PWA install */
const CACHE = 'lock-ai-v5';
const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './img/icon-192.png',
  './img/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // Network-first for Gemini API calls, cache-first for shell
  const url = new URL(e.request.url);
  if (url.hostname.includes('googleapis.com') || url.hostname.includes('generativelanguage')) {
    return; // bypass cache, go to network
  }
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(resp => {
      // Stash successful same-origin GETs
      if (e.request.method === 'GET' && resp.ok && url.origin === self.location.origin){
        const clone = resp.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone)).catch(()=>{});
      }
      return resp;
    }).catch(() => caches.match('./index.html')))
  );
});
