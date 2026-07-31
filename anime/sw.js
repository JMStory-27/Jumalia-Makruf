'use strict';

// ── Cache names ───────────────────────────────────────────────────────────────
const VERSION   = 'lawnime-v7';
const STATIC    = `${VERSION}-static`;
const API_CACHE = `${VERSION}-api`;
// Image & episode cache sengaja TIDAK pakai versi —
// biar persist antar SW update, ga perlu download ulang ribuan poster.
const IMAGES          = 'lawnime-images';
const PRIORITY_IMAGES = 'lawnime-priority-images'; // poster yang user sudah klik — TIDAK pernah di-trim
const EPISODE         = 'lawnime-episode';
// Cache-cache ini tidak boleh dihapus saat activate (persistent)
const PERSISTENT_CACHES = [IMAGES, PRIORITY_IMAGES, EPISODE];

const OFFLINE_URL = './offline.html';
const CORE = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png', OFFLINE_URL];

const API_PATTERNS = [
  /\/otakudesu\/home/,
  /\/otakudesu\/ongoing/,
  /\/otakudesu\/complete/,
  /\/otakudesu\/schedule/,
  /\/otakudesu\/genres/,
  /\/otakudesu\/anime\//,
];

const IMAGE_PATTERNS = [
  /otakudesu\.cloud/,
  /cdn\.otakudesu/,
  /img\d?\.otakudesu/,
  /s4\.anilist\.co/,
  /media\.kitsu\.io/,
  /cdn\.myanimelist/,
  /anilist\.co\/img/,
  /image\.tmdb\.org/,
  /i0\.wp\.com/,      // Photon proxy
  /wsrv\.nl/,
  /i\.imgur\.com/,
  /\/api\/poster\/p\?url=/,  // Server-side poster proxy (disk-cached)
];

const API_TTL_MS = 5 * 60 * 1000;
// 3000 slot — cukup untuk 1800+ anime (poster + banner + karakter) tanpa evict
const IMAGE_MAX  = 3000;

// ── Install ───────────────────────────────────────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(STATIC).then(c =>
      Promise.allSettled(CORE.map(u => c.add(u).catch(() => {})))
    )
  );
  self.skipWaiting();
});

// ── Activate ──────────────────────────────────────────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => !k.startsWith(VERSION) && !PERSISTENT_CACHES.includes(k))
          .map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function isImage(req) {
  return IMAGE_PATTERNS.some(p => p.test(req.url)) ||
    /\.(jpg|jpeg|png|webp|gif|avif|svg)(\?|$)/i.test(req.url);
}
function isApiCacheable(req) {
  return API_PATTERNS.some(p => p.test(req.url));
}
function isEpisodeApi(req) {
  return /\/otakudesu\/episode\//.test(req.url) || /\/otakudesu\/server\//.test(req.url);
}
function isStaticAsset(req) {
  return /\.(js|css|woff2?|ttf|otf|ico)(\?|$)/i.test(req.url);
}

async function trimImageCache() {
  const cache = await caches.open(IMAGES);
  const keys  = await cache.keys();
  if (keys.length > IMAGE_MAX) {
    await Promise.all(keys.slice(0, keys.length - IMAGE_MAX).map(k => cache.delete(k)));
  }
}

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const req = e.request;
  const url = req.url;

  // JS/CSS bundles — cache-first (Vite adds hash to filenames, safe forever)
  if (isStaticAsset(req) && !url.includes('/api/')) {
    e.respondWith(
      caches.open(STATIC).then(async c => {
        const hit = await c.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) c.put(req, res.clone());
        return res;
      })
    );
    return;
  }

  // Images — cek priority bucket dulu (tidak pernah expired), lalu regular cache
  if (isImage(req)) {
    e.respondWith((async () => {
      // 1. Priority cache (poster yang sudah pernah diklik user) — serve instan
      const priCache = await caches.open(PRIORITY_IMAGES);
      const priHit = await priCache.match(req);
      if (priHit) {
        // Revalidate di background supaya tetap fresh
        fetch(req, { mode: 'cors' }).then(res => { if (res.ok) priCache.put(req, res.clone()); }).catch(() => {});
        return priHit;
      }
      // 2. Regular image cache (stale-while-revalidate)
      const imgCache = await caches.open(IMAGES);
      const cached = await imgCache.match(req);
      const fetchPromise = fetch(req, { mode: 'cors' }).then(res => {
        if (res.ok) { imgCache.put(req, res.clone()); trimImageCache(); }
        return res;
      }).catch(() => cached);
      return cached || fetchPromise;
    })());
    return;
  }

  // Episode & server API — cache-first + silent background revalidate
  if (isEpisodeApi(req)) {
    e.respondWith(
      caches.open(EPISODE).then(async c => {
        const cached = await c.match(req);
        if (cached) {
          fetch(req).then(res => { if (res.ok) c.put(req, res.clone()); }).catch(() => {});
          return cached;
        }
        const res = await fetch(req);
        if (res.ok) c.put(req, res.clone());
        return res;
      })
    );
    return;
  }

  // General API (home, list, schedule) — network-first, cache as TTL fallback
  if (isApiCacheable(req)) {
    e.respondWith(
      caches.open(API_CACHE).then(async c => {
        try {
          const res = await fetch(req);
          if (res.ok) {
            const headers = new Headers(res.headers);
            headers.append('sw-cached-at', Date.now().toString());
            const body = await res.clone().arrayBuffer();
            c.put(req, new Response(body, { status: res.status, headers }));
          }
          return res;
        } catch {
          const cached = await c.match(req);
          if (!cached) throw new Error('Offline and no cache');
          return cached;
        }
      })
    );
    return;
  }

  // HTML / navigasi — network-first (index.html tidak pernah basi di cache SW),
  // tapi kalau BENAR-BENAR offline dan network gagal total, tampilkan offline.html
  // alih-alih error browser polos. Begitu online lagi, network-first otomatis balik normal.
  if (req.mode === 'navigate' || req.headers.get('accept')?.includes('text/html')) {
    e.respondWith(
      fetch(req).catch(async () => {
        const cache = await caches.open(STATIC);
        const offline = await cache.match(OFFLINE_URL);
        return offline || new Response('Offline', { status: 503, statusText: 'Offline' });
      })
    );
    return;
  }
});

// ── Messages dari app ─────────────────────────────────────────────────────────
self.addEventListener('message', async e => {
  if (!e.data) return;

  // Prefetch episode berikutnya + gambar-gambarnya
  if (e.data.type === 'PREFETCH_EPISODE') {
    const { episodeId, apiBase = 'https://wg-anime-api-v2.onrender.com', posterUrls = [] } = e.data;
    if (!episodeId) return;

    const epCache  = await caches.open(EPISODE);
    const imgCache = await caches.open(IMAGES);
    const epUrl    = `${apiBase}/otakudesu/episode/${episodeId}`;

    try {
      const already = await epCache.match(epUrl);
      if (!already) {
        const res = await fetch(epUrl, { headers: { Accept: 'application/json' } });
        if (res.ok) epCache.put(epUrl, res);
      }
    } catch {}

    for (const url of posterUrls.slice(0, 5)) {
      try {
        const already = await imgCache.match(url);
        if (already) continue;
        const res = await fetch(url, { mode: 'cors' });
        if (res.ok) imgCache.put(url, res);
      } catch {}
    }
    trimImageCache();
  }

  // Batch-cache gambar poster (dari halaman home/list)
  if (e.data.type === 'CACHE_IMAGES') {
    const { urls = [] } = e.data;
    const imgCache = await caches.open(IMAGES);
    for (const url of urls.slice(0, 30)) {
      try {
        const already = await imgCache.match(url);
        if (already) continue;
        const res = await fetch(url, { mode: 'cors' });
        if (res.ok) imgCache.put(url, res);
      } catch {}
    }
    trimImageCache();
  }

  // Cache gambar poster ke priority bucket (dipanggil saat user klik anime)
  // Priority bucket TIDAK pernah di-trim — poster yang pernah dibuka user selamanya ada
  if (e.data.type === 'PRIORITY_CACHE_IMAGE') {
    const { urls = [] } = e.data;
    const priCache = await caches.open(PRIORITY_IMAGES);
    for (const url of urls.slice(0, 10)) {
      try {
        const already = await priCache.match(url);
        if (already) continue;
        const res = await fetch(url, { mode: 'cors' });
        if (res.ok) priCache.put(url, res);
      } catch {}
    }
    return;
  }

  if (e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// ── Push ──────────────────────────────────────────────────────────────────────
self.addEventListener('push', e => {
  let data = { title: 'Lawnime', body: 'Ada update baru!' };
  try { data = e.data ? e.data.json() : data; } catch {}

  const { title, body, icon, image, url, tag } = data;
  const options = {
    body: body || '',
    icon: icon || 'icon-192.png',
    badge: 'icon-192.png',
    image: image || undefined,
    tag: tag || 'lawnime-notif',
    renotify: true,
    requireInteraction: false,
    data: { url: url || '/' },
    vibrate: [200, 100, 200],
    actions: [
      { action: 'open',    title: '🎬 Buka Lawnime' },
      { action: 'dismiss', title: 'Tutup' },
    ],
  };

  const broadcast = self.clients
    .matchAll({ type: 'window', includeUncontrolled: true })
    .then(clients => clients.forEach(c => c.postMessage({ type: 'PUSH_RECEIVED', data })));

  e.waitUntil(Promise.all([self.registration.showNotification(title, options), broadcast]));
});

// ── Notification Click ────────────────────────────────────────────────────────
self.addEventListener('notificationclick', e => {
  e.notification.close();
  if (e.action === 'dismiss') return;
  const targetUrl = e.notification.data?.url || '/';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(ws => {
      for (const w of ws) {
        if (w.url.includes(self.registration.scope) && 'focus' in w) { w.focus(); return; }
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});

self.addEventListener('pushsubscriptionchange', e => {
  e.waitUntil(
    self.registration.pushManager
      .subscribe(e.oldSubscription.options)
      .then(sub => fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
      }))
  );
});
