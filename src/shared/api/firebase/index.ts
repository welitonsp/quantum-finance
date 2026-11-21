import { initializeApp, type FirebaseApp }                    from 'firebase/app';
import { initializeAppCheck, ReCaptchaV3Provider }            from 'firebase/app-check';
import { getAuth, connectAuthEmulator, type Auth }             from 'firebase/auth';
import {
  getFirestore, initializeFirestore, connectFirestoreEmulator,
  persistentLocalCache, persistentMultipleTabManager, type Firestore,
}                                                              from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator, type Functions } from 'firebase/functions';

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY as string,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID as string,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID as string,
};

// Build Supabase (VITE_AUTH_PROVIDER=supabase): o Firebase NÃO é inicializado.
// Todos os caminhos Firebase ficam desligados no nível do módulo nesse build, então
// estes exports nunca são usados; se algum resto de código Firebase rodar, falha
// alto em vez de falar com o projeto Firebase desativado. Sem variáveis VITE_FIREBASE_*.
export const FIREBASE_ENABLED = import.meta.env.VITE_AUTH_PROVIDER !== 'supabase';

export const app: FirebaseApp = FIREBASE_ENABLED ? initializeApp(firebaseConfig) : (undefined as unknown as FirebaseApp);
export const auth: Auth       = FIREBASE_ENABLED ? getAuth(app) : (undefined as unknown as Auth);

// F-11 — cache PERSISTENTE (IndexedDB): leituras funcionam offline (dashboard/lista
// sobrevivem a reload sem rede) e escritas DIRETAS ao Firestore ficam numa fila durável
// que replica ao reconectar. Sob emulador/test ou sem IndexedDB, usa o padrão (memória)
// para determinismo. (A criação canônica via callable é tratada por outbox à parte.)
const _useEmulatorDb = import.meta.env.DEV && import.meta.env.VITE_USE_EMULATOR === 'true';
const _isTestEnv     = import.meta.env.MODE === 'test' || import.meta.env.VITEST === 'true';
export const db: Firestore = !FIREBASE_ENABLED
  ? (undefined as unknown as Firestore)
  : (_useEmulatorDb || _isTestEnv || typeof indexedDB === 'undefined')
    ? getFirestore(app)
    : initializeFirestore(app, {
        localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
      });

export const functions: Functions = FIREBASE_ENABLED
  ? getFunctions(app, 'southamerica-east1')
  : (undefined as unknown as Functions);

if (FIREBASE_ENABLED && import.meta.env.DEV && import.meta.env.VITE_USE_EMULATOR === 'true') {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
}

// Sem Firebase (build Supabase) não há App Check: a site key é ignorada.
const _siteKey    = FIREBASE_ENABLED ? (import.meta.env.VITE_RECAPTCHA_SITE_KEY as string | undefined) : undefined;
const _isEmulator = import.meta.env.VITE_USE_EMULATOR === 'true';
const _isTest     = import.meta.env.MODE === 'test' || import.meta.env.VITEST === 'true';
const _mode       = import.meta.env.MODE;
const _isLocalMode = _mode === 'development' || _mode === 'local';
const _isProtectedBuild = import.meta.env.PROD || _mode === 'production' || _mode === 'staging';
const _allowAppCheckDebugToken = import.meta.env.DEV && _isLocalMode && !_isProtectedBuild;

if (_siteKey && !_isEmulator && !_isTest) {
  const _env = import.meta.env as Record<string, string | boolean | undefined>;
  const _dbgToken = _allowAppCheckDebugToken
    ? _env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN
    : undefined;

  // App Check debug tokens are local-only; production and staging builds ignore them.
  if (typeof _dbgToken === 'string' && _dbgToken.trim()) {
    (globalThis as Record<string, unknown>).FIREBASE_APPCHECK_DEBUG_TOKEN = _dbgToken;
  } else if (import.meta.env.DEV && _env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN && _isProtectedBuild) {
    console.warn('[Quantum] Firebase App Check debug token ignored outside local development.');
  }

  if (!import.meta.hot?.data?.appCheckInitialized) {
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(_siteKey),
      isTokenAutoRefreshEnabled: true,
    });
    if (import.meta.hot?.data) import.meta.hot.data.appCheckInitialized = true;
  }
}
