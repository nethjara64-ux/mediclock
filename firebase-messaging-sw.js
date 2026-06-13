// ═══════════════════════════════════════════════════════════════
//  firebase-messaging-sw.js  —  MediClock
//  Service Worker ÚNICO: caché offline + FCM + notificaciones push
//  ⚠️  Debe estar en la RAÍZ del proyecto (mismo nivel que index.html)
// ═══════════════════════════════════════════════════════════════

// ── FIREBASE (compat — obligatorio en Service Workers) ────────
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');



// 🔴 REEMPLAZA con tu configuración real de Firebase
firebase.initializeApp({
  apiKey:            "TU_API_KEY",
  authDomain:        "TU_PROJECT.firebaseapp.com",
  projectId:         "TU_PROJECT_ID",
  storageBucket:     "TU_PROJECT.appspot.com",
  messagingSenderId: "TU_SENDER_ID",
  appId:             "TU_APP_ID"
});

const messaging = firebase.messaging();

// ── CACHÉ OFFLINE ─────────────────────────────────────────────
const CACHE = 'mediclock-v2';
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

// Instalación: guarda archivos en caché
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Activación: limpia cachés viejos
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: sirve desde caché, si falla usa red
self.addEventListener('fetch', e => {
  // Navegación: intenta red primero, cae a index.html si no hay internet
  if (e.request.mode === 'navigate' || e.request.destination === 'document') {
    e.respondWith(
      fetch(e.request)
        .then(res => res)
        .catch(() => caches.match('/index.html'))
    );
    return;
  }
  // Otros recursos: caché primero, luego red
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});

// ── NOTIFICACIONES FCM — APP EN SEGUNDO PLANO O CERRADA ───────
// Firebase llama a esto cuando llega un mensaje con app cerrada
messaging.onBackgroundMessage(payload => {
  console.log('[SW] Mensaje FCM en background:', payload);

  const titulo = payload.notification?.title || '⏰ MediClock';
  const cuerpo = payload.notification?.body  || 'Es hora de tomar tu medicamento';
  const medId  = payload.data?.medId || '';

  self.registration.showNotification(titulo, {
    body:    cuerpo,
    icon:    '/icons/icon-192.png',
    badge:   '/icons/icon-192.png',
    vibrate: [200, 100, 200],
    tag:     'mediclock-reminder',
    data:    { medId },           // pasa el ID del medicamento al click
    actions: [
      { action: 'taken',  title: '✅ Ya tomé'           },
      { action: 'snooze', title: '⏰ Recordar en 5 min' }
    ]
  });
});

// ── NOTIFICACIONES PUSH DIRECTAS (sin FCM) ────────────────────
// Se usa cuando el backend envía push manual (Web Push Protocol)
self.addEventListener('push', e => {
  // Si ya lo maneja FCM arriba, este bloque no interfiere
  if (!e.data) return;

  let data = {};
  try { data = e.data.json(); } catch { data = { title: e.data.text() }; }

  const titulo = data.title || '⏰ MediClock';
  const cuerpo = data.body  || 'Es hora de tomar tu medicamento';

  e.waitUntil(
    self.registration.showNotification(titulo, {
      body:    cuerpo,
      icon:    '/icons/icon-192.png',
      badge:   '/icons/icon-192.png',
      vibrate: [200, 100, 200],
      tag:     'mediclock-reminder',
      data:    data,
      actions: [
        { action: 'taken',  title: '✅ Ya tomé'           },
        { action: 'snooze', title: '⏰ Recordar en 5 min' }
      ]
    })
  );
});

// ── CLICK EN NOTIFICACIÓN ─────────────────────────────────────
self.addEventListener('notificationclick', e => {
  e.notification.close();

  if (e.action === 'taken') {
    // Abre la app y pasa el ID del medicamento para marcarlo
    const medId = e.notification.data?.medId || '';
    e.waitUntil(
      clients.openWindow('/?accion=tomar&med=' + medId)
    );

  } else if (e.action === 'snooze') {
    // Snooze: vuelve a notificar en 5 minutos
    const body = e.notification.body;
    const medId = e.notification.data?.medId || '';

    e.waitUntil(
      new Promise(resolve => {
        setTimeout(() => {
          self.registration.showNotification('⏰ Recordatorio (snooze)', {
            body,
            icon:    '/icons/icon-192.png',
            badge:   '/icons/icon-192.png',
            vibrate: [200, 100, 200],
            tag:     'mediclock-snooze',
            data:    { medId },
            actions: [
              { action: 'taken',  title: '✅ Ya tomé'           },
              { action: 'snooze', title: '⏰ Recordar en 5 min' }
            ]
          });
          resolve();
        }, 5 * 60 * 1000); // 5 minutos
      })
    );

  } else {
    // Toque general: abre la app
    e.waitUntil(clients.openWindow('/'));
  }
});