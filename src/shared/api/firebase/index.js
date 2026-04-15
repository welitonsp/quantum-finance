import { initializeApp }                        from 'firebase/app';
import { getAuth }                               from 'firebase/auth';
import { getFirestore }                          from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
};

export const app       = initializeApp(firebaseConfig);
export const auth      = getAuth(app);
export const db        = getFirestore(app);

// Functions com região BR (southamerica-east1 = São Paulo)
export const functions = getFunctions(app, 'southamerica-east1');

// Em desenvolvimento local: conectar ao Firebase Emulator (opcional)
// Para activar: adicionar VITE_USE_EMULATOR=true no .env.local
// e correr: firebase emulators:start --only functions
if (import.meta.env.DEV && import.meta.env.VITE_USE_EMULATOR === 'true') {
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  console.info('[Quantum] 🔧 Firebase Functions Emulator activo em localhost:5001');
}
