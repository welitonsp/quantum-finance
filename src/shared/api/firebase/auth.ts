import { getAuth, signInAnonymously, onAuthStateChanged, type Auth, type User } from 'firebase/auth';
import { app, FIREBASE_ENABLED } from './index';
import { logSanitizedFirebaseError } from '../../lib/firebaseErrorHandling';

export const auth: Auth = FIREBASE_ENABLED ? getAuth(app) : (undefined as unknown as Auth);

export function initAuth(onUserChange: (user: User) => void) {
  return onAuthStateChanged(auth, async (user) => {
    if (user) {
      onUserChange(user);
    } else {
      try {
        await signInAnonymously(auth);
      } catch (error) {
        logSanitizedFirebaseError('auth_anonymous_login', error);
      }
    }
  });
}
