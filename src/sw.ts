/// <reference lib="webworker" />
// Service Worker customizado (VitePWA `injectManifest`) — substitui o SW
// gerado (`generateSW`) para viabilizar FCM background push no MESMO SW de
// caching (o token FCM já era obtido contra este registration via
// navigator.serviceWorker.ready em usePushNotifications).
//
// Replica fielmente o comportamento do generateSW anterior:
// - precache do app shell (skipWaiting + clientsClaim = registerType autoUpdate);
// - navigateFallback /offline.html com allowlist /^(?!\/__).*/;
// - runtime caching CacheFirst para Google Fonts (mesmos nomes/expirações).
//
// E adiciona o que o generateSW não permitia:
// - onBackgroundMessage do Firebase Messaging (config injetada no build via
//   import.meta.env — nunca hardcoded; o stub morto public/firebase-messaging-sw.js
//   foi removido);
// - notificationclick focando a janela existente ou abrindo o app.

declare let self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Parameters<typeof precacheAndRoute>[0];
};

import { clientsClaim, type WorkboxPlugin } from 'workbox-core';
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { initializeApp } from 'firebase/app';
import { getMessaging, onBackgroundMessage } from 'firebase/messaging/sw';

// ── App shell / caching (paridade com o generateSW anterior) ─────────────────

void self.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

registerRoute(
  new NavigationRoute(createHandlerBoundToURL('offline.html'), {
    allowlist: [/^(?!\/__).*/],
  }),
);

// Cast: os tipos do workbox declaram callbacks opcionais sem `| undefined`,
// incompatível com exactOptionalPropertyTypes — limitação conhecida upstream.
const expiration = (opts: ConstructorParameters<typeof ExpirationPlugin>[0]): WorkboxPlugin =>
  new ExpirationPlugin(opts) as unknown as WorkboxPlugin;

registerRoute(
  /^https:\/\/fonts\.googleapis\.com\/.*/i,
  new CacheFirst({
    cacheName: 'google-fonts-cache',
    plugins: [expiration({ maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 })],
  }),
);

registerRoute(
  /^https:\/\/fonts\.gstatic\.com\/.*/i,
  new CacheFirst({
    cacheName: 'google-fonts-static',
    plugins: [expiration({ maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 })],
  }),
);

// ── FCM background push ──────────────────────────────────────────────────────

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string,
};

// Sob emulador/CI a config é fake — messaging não inicializa (mesmo guard do
// stub antigo), e o SW segue funcionando só como cache.
if (firebaseConfig.projectId && firebaseConfig.projectId !== 'fake-project'
  && firebaseConfig.projectId !== 'demo-quantum-finance') {
  try {
    const messaging = getMessaging(initializeApp(firebaseConfig));
    onBackgroundMessage(messaging, (payload) => {
      const title = payload.notification?.title ?? 'Quantum Finance';
      const body = payload.notification?.body ?? '';
      void self.registration.showNotification(title, {
        body,
        icon: '/pwa-192x192.png',
        badge: '/pwa-192x192.png',
        tag: 'quantum-push',
        data: payload.data ?? {},
      });
    });
  } catch {
    // Messaging indisponível (navegador sem suporte) — SW continua como cache.
  }
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) return client.focus();
      }
      return self.clients.openWindow('/');
    }),
  );
});
