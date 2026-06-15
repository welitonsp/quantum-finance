// Firebase Messaging Service Worker — background push handler
//
// NOTA DE INTEGRAÇÃO: Este SW lida com notificações em background (app fechado/em segundo plano).
// Com VitePWA em modo `generateSW`, o SW de caching é gerado automaticamente em /sw.js.
// Para background push funcionar, o token FCM deve ser obtido passando
// `serviceWorkerRegistration` (via navigator.serviceWorker.ready) ao getToken().
// Notificações em foreground funcionam via onMessage() no hook usePushNotifications.
//
// CONFIGURAÇÃO: Preencher firebaseConfig com os valores do projeto Firebase.
// Os valores não podem ser injetados via import.meta.env pois este arquivo
// é servido estaticamente e não passa pelo pipeline Vite.

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

const firebaseConfig = {
  apiKey:            '',
  authDomain:        '',
  projectId:         '',
  storageBucket:     '',
  messagingSenderId: '',
  appId:             '',
};

if (firebaseConfig.projectId) {
  firebase.initializeApp(firebaseConfig);
  const messaging = firebase.messaging();

  messaging.onBackgroundMessage(payload => {
    const title = payload.notification?.title ?? 'Quantum Finance';
    const body  = payload.notification?.body  ?? '';
    self.registration.showNotification(title, {
      body,
      icon:  '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      tag:   'quantum-push',
      data:  payload.data ?? {},
    });
  });
}

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if ('focus' in c) return c.focus();
      }
      return clients.openWindow?.('/');
    }),
  );
});
