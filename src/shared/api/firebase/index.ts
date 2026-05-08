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

if (_siteKey && !_isEmulator) {
  if (import.meta.env.DEV) {
    const _dbgToken = import.meta.env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN as string | undefined;
    if (_dbgToken) {
      (globalThis as Record<string, unknown>).FIREBASE_APPCHECK_DEBUG_TOKEN = _dbgToken;
    }
  }
  if (!import.meta.hot?.data?.appCheckInitialized) {
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(_siteKey),
      isTokenAutoRefreshEnabled: true,
    });
    if (import.meta.hot?.data) import.meta.hot.data.appCheckInitialized = true;
  }
}
