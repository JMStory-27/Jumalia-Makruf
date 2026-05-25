const CACHE = 'lawnime-v3';
const CORE = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];

// ── Install ───────────────────────────────────────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c =>
      Promise.allSettled(CORE.map(u => c.add(u).catch(() => {})))
    )
  );
  self.skipWaiting();
});

// ── Activate ──────────────────────────────────────────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Fetch (cache-first for assets) ───────────────────────────────────────────
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res && res.status === 200 && res.type === 'basic') {
          caches.open(CACHE).then(c => c.put(e.request, res.clone()));
        }
        return res;
      }).catch(() => cached);
    })
  );
});

// ── Push ──────────────────────────────────────────────────────────────────────
self.addEventListener('push', e => {
  let data = { title: 'Lawnime', body: 'Ada update baru!' };
  try { data = e.data ? e.data.json() : data; } catch {}

  const { title, body, icon, image, url, tag } = data;

  const options = {
    body: body || '',
    icon: icon || '/anisub/icon-192.png',
    badge: '/anisub/icon-192.png',
    image: image || undefined,
    tag: tag || 'lawnime-notif',
    renotify: true,
    requireInteraction: false,
    data: { url: url || '/anisub/' },
    vibrate: [200, 100, 200],
    actions: [
      { action: 'open', title: '🎬 Buka Lawnime' },
      { action: 'dismiss', title: 'Tutup' }
    ]
  };

  // Broadcast ke semua tab/halaman yang terbuka agar langsung refresh bell
  const broadcast = self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    .then(clients => clients.forEach(c => c.postMessage({ type: 'PUSH_RECEIVED', data })));

  e.waitUntil(Promise.all([
    self.registration.showNotification(title, options),
    broadcast,
  ]));
});

// ── Notification Click ────────────────────────────────────────────────────────
self.addEventListener('notificationclick', e => {
  e.notification.close();

  if (e.action === 'dismiss') return;

  const targetUrl = e.notification.data?.url || '/anisub/';

  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      for (const client of windowClients) {
        if (client.url.includes('/anisub') && 'focus' in client) {
          client.focus();
          return;
        }
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});

// ── Push Subscription Change ──────────────────────────────────────────────────
self.addEventListener('pushsubscriptionchange', e => {
  e.waitUntil(
    self.registration.pushManager.subscribe(e.oldSubscription.options)
      .then(sub => fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub.toJSON())
      }))
  );
});
