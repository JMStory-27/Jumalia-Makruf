self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(clients.claim()));
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SHOW_NOTIFICATION') {
    const { title, body, tag } = e.data;
    self.registration.showNotification(title, {
      body,
      icon: '/game/duo-bucin-icon.png',
      badge: '/game/duo-bucin-icon.png',
      vibrate: [200, 100, 200],
      tag: tag || ('duo-bucin-' + Date.now()),
      requireInteraction: false
    });
  }
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window' }).then(list => {
    for (const c of list) if (c.url && 'focus' in c) return c.focus();
    if (clients.openWindow) return clients.openWindow('/');
  }));
});
