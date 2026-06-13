// ═══════════════════════════════════════════════════════════════
//  notifications.js  —  MediClock
//  Maneja: permisos, token FCM, guardado en Firestore,
//          notificaciones en primer plano (app abierta)
//
//  ⚠️  IMPORTANTE: Este archivo NO se importa con <script src="">
//  Su código va PEGADO dentro del <script type="module"> de index.html
//  justo después de donde defines app, auth y db.
//  Ver instrucciones al final del archivo.
// ═══════════════════════════════════════════════════════════════

// ── 1. AGREGA ESTE IMPORT junto a los otros imports de Firebase ──
// (pégalo en la línea de imports de tu index.html)
//
// import { getMessaging, getToken, onMessage }
//   from "https://www.gstatic.com/firebasejs/11.0.0/firebase-messaging.js";
// import { doc, setDoc } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
// (setDoc ya lo tienes importado, no lo dupliques)


// ── 2. PEGA ESTA FUNCIÓN después de:  const db = getFirestore(app); ──────

async function iniciarNotificaciones(app, db, userId) {
  try {
    // ── Paso 1: verificar soporte del navegador ──────────────────
    if (!('Notification' in window)) {
      console.warn('Este navegador no soporta notificaciones.');
      return null;
    }
    if (!('serviceWorker' in navigator)) {
      console.warn('Este navegador no soporta Service Workers.');
      return null;
    }

    // ── Paso 2: pedir permiso al usuario ────────────────────────
    const permiso = await Notification.requestPermission();
    if (permiso !== 'granted') {
      console.warn('Permiso de notificaciones denegado por el usuario.');
      mostrarBannerPermisoDenegado();
      return null;
    }

    // ── Paso 3: registrar el Service Worker ─────────────────────
    const swRegistration = await navigator.serviceWorker.register(
      '/firebase-messaging-sw.js',
      { scope: '/' }
    );
    console.log('[FCM] Service Worker registrado:', swRegistration);

    // ── Paso 4: iniciar Firebase Messaging ──────────────────────
    const messaging = getMessaging(app);

    // 🔴 REEMPLAZA con tu VAPID Key
    // (Firebase Console → Configuración → Cloud Messaging → Web Push certificates → Generate key pair)
    const VAPID_KEY = 'TU_VAPID_KEY_AQUI';

    // ── Paso 5: obtener token FCM del dispositivo ────────────────
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: swRegistration
    });

    if (!token) {
      console.warn('[FCM] No se pudo obtener el token. ¿Está habilitado en Firebase Console?');
      return null;
    }

    console.log('[FCM] Token obtenido:', token);

    // ── Paso 6: guardar token en Firestore ──────────────────────
    // Así puedes enviarte notificaciones desde la nube después
    await setDoc(
      doc(db, 'usuarios', userId),
      {
        fcmToken:         token,
        tokenDispositivo: navigator.userAgent,
        tokenActualizado: new Date().toISOString()
      },
      { merge: true }   // no sobreescribe otros campos del usuario
    );

    console.log('[FCM] Token guardado en Firestore ✅');

    // ── Paso 7: escuchar mensajes con app en PRIMER PLANO ───────
    // Cuando la app está abierta, FCM no muestra notificación del sistema
    // automáticamente — hay que mostrarla manualmente con un toast
    onMessage(messaging, (payload) => {
      console.log('[FCM] Mensaje en primer plano:', payload);

      const titulo = payload.notification?.title || '⏰ MediClock';
      const cuerpo = payload.notification?.body  || 'Es hora de tomar tu medicamento';
      const medId  = payload.data?.medId || '';

      mostrarToastNotificacion(titulo, cuerpo, medId);
    });

    return token;

  } catch (error) {
    console.error('[FCM] Error al iniciar notificaciones:', error);
    return null;
  }
}


// ── TOAST: notificación visual cuando la app está abierta ─────
function mostrarToastNotificacion(titulo, cuerpo, medId = '') {
  // Elimina toast anterior si existe
  const anterior = document.getElementById('fcm-toast');
  if (anterior) anterior.remove();

  const toast = document.createElement('div');
  toast.id = 'fcm-toast';
  toast.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 9999;
    background: #1D9E75;
    color: #fff;
    padding: 14px 18px;
    border-radius: 14px;
    max-width: 320px;
    box-shadow: 0 6px 24px rgba(0,0,0,0.18);
    font-size: 14px;
    font-family: inherit;
    animation: fcmSlideIn 0.3s ease;
    cursor: pointer;
  `;

  toast.innerHTML = `
    <div style="font-weight:600;margin-bottom:4px">💊 ${titulo}</div>
    <div style="opacity:0.92;font-size:13px">${cuerpo}</div>
    <div style="display:flex;gap:8px;margin-top:10px">
      <button id="fcm-btn-tomar" style="
        background:#fff;color:#1D9E75;border:none;
        padding:6px 14px;border-radius:8px;
        font-size:12px;font-weight:600;cursor:pointer">
        ✅ Tomar ahora
      </button>
      <button id="fcm-btn-cerrar" style="
        background:rgba(255,255,255,0.25);color:#fff;border:none;
        padding:6px 12px;border-radius:8px;
        font-size:12px;cursor:pointer">
        ✕
      </button>
    </div>
  `;

  // Animación CSS
  const style = document.createElement('style');
  style.textContent = `
    @keyframes fcmSlideIn {
      from { transform: translateX(120%); opacity: 0; }
      to   { transform: translateX(0);    opacity: 1; }
    }
  `;
  document.head.appendChild(style);
  document.body.appendChild(toast);

  // Botón "Tomar ahora" — marca la dosis en Firestore
  document.getElementById('fcm-btn-tomar').addEventListener('click', () => {
    toast.remove();
    if (medId) marcarDosisDesdeNotificacion(medId);
  });

  // Botón cerrar
  document.getElementById('fcm-btn-cerrar').addEventListener('click', () => {
    toast.remove();
  });

  // Auto-cierre en 8 segundos
  setTimeout(() => { if (toast.parentNode) toast.remove(); }, 8000);
}


// ── MARCAR DOSIS desde notificación en primer plano ───────────
async function marcarDosisDesdeNotificacion(medId) {
  try {
    const userId = auth.currentUser?.uid;
    if (!userId || !medId) return;

    await setDoc(
      doc(db, 'usuarios', userId, 'medicamentos', medId),
      {
        ultimaToma:  new Date().toISOString(),
        estadoHoy:   'tomado'
      },
      { merge: true }
    );
    console.log('[FCM] Dosis marcada desde notificación:', medId);

    // Recarga la vista principal si existe la función
    if (typeof cargarMedicamentosHoy === 'function') {
      cargarMedicamentosHoy();
    }
  } catch (err) {
    console.error('[FCM] Error al marcar dosis:', err);
  }
}


// ── BANNER si el usuario denegó permisos ──────────────────────
function mostrarBannerPermisoDenegado() {
  const banner = document.createElement('div');
  banner.style.cssText = `
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 9998;
    background: #1a1a1a;
    color: #fff;
    padding: 12px 20px;
    border-radius: 12px;
    font-size: 13px;
    max-width: 340px;
    text-align: center;
    box-shadow: 0 4px 16px rgba(0,0,0,0.3);
  `;
  banner.innerHTML = `
    🔕 Notificaciones bloqueadas.<br>
    <small>Actívalas en Configuración del navegador para recibir recordatorios.</small>
  `;
  document.body.appendChild(banner);
  setTimeout(() => banner.remove(), 6000);
}


// ══════════════════════════════════════════════════════════════
//  INSTRUCCIONES DE INTEGRACIÓN EN index.html
// ══════════════════════════════════════════════════════════════
//
//  PASO 1 — Agrega este import junto a los demás (línea ~2 del script):
//
//    import { getMessaging, getToken, onMessage }
//      from "https://www.gstatic.com/firebasejs/11.0.0/firebase-messaging.js";
//
//
//  PASO 2 — Llama a iniciarNotificaciones() después del login de Google.
//  Busca tu onAuthStateChanged (o el bloque donde manejas el login) y agrega:
//
//    onAuthStateChanged(auth, async (user) => {
//      if (user) {
//        await iniciarNotificaciones(app, db, user.uid);
//        // ... resto de tu código de login
//      }
//    });
//
//
//  PASO 3 — Obtén la VAPID Key:
//    Firebase Console → tu proyecto → ⚙️ Configuración
//    → Cloud Messaging → Web Push certificates → Generate key pair
//    → Copia la clave y pégala donde dice TU_VAPID_KEY_AQUI
//
//
//  PASO 4 — Manejo del parámetro ?accion=tomar en la URL
//  (cuando el usuario toca "Tomar ahora" en la notificación del sistema)
//  Agrega esto al inicio de tu script, después de const db = getFirestore(app):
//
//    const params = new URLSearchParams(window.location.search);
//    if (params.get('accion') === 'tomar' && params.get('med')) {
//      marcarDosisDesdeNotificacion(params.get('med'));
//    }
//
// ══════════════════════════════════════════════════════════════
