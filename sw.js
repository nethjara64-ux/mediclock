// MediClock Service Worker v1.0
const CACHE = 'mediclock-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json'
];

// ── INSTALACIÓN: guarda los archivos en caché ──────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// ── ACTIVACIÓN: limpia cachés viejos ──────────────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── FETCH: sirve desde caché, si falla usa red ────────────────────────────
self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});

// ── NOTIFICACIONES PUSH ───────────────────────────────────────────────────
self.addEventListener('push', e => {
  const data = e.data ? e.data.json() : {};
  e.waitUntil(
    self.registration.showNotification(data.title || '⏰ MediClock', {
      body: data.body || 'Es hora de tomar tu medicamento',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      vibrate: [200, 100, 200],
      tag: 'mediclock-reminder',
      actions: [
        { action: 'taken', title: '✓ Ya tomé' },
        { action: 'snooze', title: '⏰ Recordar en 5 min' }
      ]
    })
  );
});

// ── CLICK EN NOTIFICACIÓN ─────────────────────────────────────────────────
self.addEventListener('notificationclick', e => {
  e.notification.close();
  if (e.action === 'snooze') {
    // Vuelve a notificar en 5 minutos
    setTimeout(() => {
      self.registration.showNotification('⏰ Recordatorio (snooze)', {
        body: e.notification.body,
        icon: '/icons/icon-192.png'
      });
    }, 5 * 60 * 1000);
  } else {
    e.waitUntil(
      clients.openWindow('/')
    );
  }
});
