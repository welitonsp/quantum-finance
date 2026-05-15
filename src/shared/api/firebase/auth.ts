import { getAuth, signInAnonymously, onAuthStateChanged, type User } from 'firebase/auth';
import { app } from './index';
import { logSanitizedFirebaseError } from '../../lib/firebaseErrorHandling';

export const auth = getAuth(app);

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
