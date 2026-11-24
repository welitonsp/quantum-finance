/// <reference lib="webworker" />
// Service Worker customizado (VitePWA `injectManifest`) — substitui o SW
// gerado (`generateSW`) para viabilizar FCM background push no MESMO SW de
// caching (o token FCM já era obtido contra este registration via
// navigator.serviceWorker.ready em usePushNotifications).
//
// Replica fielmente o comportamento do generateSW anterior:
// - precache do app shell (skipWaiting + clientsClaim = registerType autoUpdate);
// - navegação: rede primeiro; /offline.html só quando a rede falha
//   (allowlist /^(?!\/__).*/). Antes o offline.html respondia a TODA navegação
//   fora do precache — ex.: a volta do login Google em /?code=... — e o app
//   mostrava "Sem conexão" mesmo online;
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
  matchPrecache,
  precacheAndRoute,
} from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkOnly } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { initializeApp } from 'firebase/app';
import { getMessaging, onBackgroundMessage } from 'firebase/messaging/sw';

// ── App shell / caching (paridade com o generateSW anterior) ─────────────────

void self.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// Navegação fora do precache (ex.: /?code=... na volta do OAuth): busca na
// rede; só sem rede mostra o offline.html.
const navigationNetwork = new NetworkOnly();
registerRoute(
  new NavigationRoute(
    async (options) => {
      try {
        return await navigationNetwork.handle(options);
      } catch {
        return (await matchPrecache('offline.html')) ?? Response.error();
      }
    },
    { allowlist: [/^(?!\/__).*/] },
  ),
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
// Build Supabase: sem Firebase (o push via FCM fica desligado).
if (import.meta.env.VITE_AUTH_PROVIDER !== 'supabase'
  && firebaseConfig.projectId && firebaseConfig.projectId !== 'fake-project'
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
