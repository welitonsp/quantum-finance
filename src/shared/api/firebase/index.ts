import { initializeApp }                           from 'firebase/app';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import { getAuth }                                  from 'firebase/auth';
import { getFirestore }                             from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator }   from 'firebase/functions';

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY as string,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID as string,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID as string,
};

export const app       = initializeApp(firebaseConfig);
export const auth      = getAuth(app);
export const db        = getFirestore(app);
export const functions = getFunctions(app, 'southamerica-east1');

if (import.meta.env.DEV && import.meta.env.VITE_USE_EMULATOR === 'true') {
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  console.info('[Quantum] 🔧 Firebase Functions Emulator activo em localhost:5001');
}

const _siteKey    = import.meta.env.VITE_RECAPTCHA_SITE_KEY as string | undefined;
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
