import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../api/firebase/index';
import { logSanitizedFirebaseError } from '../lib/firebaseErrorHandling';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UserConsents {
  analytics: boolean; // Consentimento para uso em melhorias do produto
  ai:        boolean; // Consentimento para processamento por IA
  updatedAt: Timestamp | null;
}

const DEFAULT_CONSENTS: Omit<UserConsents, 'updatedAt'> = {
  analytics: false,
  ai:        false,
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Lê os consentimentos atuais do usuário de users/{uid}/consents/current.
 * Retorna defaults (false, false) se o documento não existir.
 */
export async function getUserConsents(uid: string): Promise<UserConsents> {
  try {
    const ref  = doc(db, 'users', uid, 'consents', 'current');
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      return { ...DEFAULT_CONSENTS, updatedAt: null };
    }
    const data = snap.data();
    return {
      analytics: Boolean(data['analytics']),
      ai:        Boolean(data['ai']),
      updatedAt: (data['updatedAt'] as Timestamp | null) ?? null,
    };
  } catch (err) {
    logSanitizedFirebaseError('user_consents_read', err);
    return { ...DEFAULT_CONSENTS, updatedAt: null };
  }
}

/**
 * Salva os consentimentos do usuário em users/{uid}/consents/current.
 */
export async function saveUserConsents(
  uid: string,
  consents: Omit<UserConsents, 'updatedAt'>,
): Promise<void> {
  try {
    const ref = doc(db, 'users', uid, 'consents', 'current');
    await setDoc(ref, {
      analytics: consents.analytics,
      ai:        consents.ai,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    logSanitizedFirebaseError('user_consents_save', err);
    throw err;
  }
}
