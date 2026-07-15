// src/hooks/useAiConsent.ts
// Espelho realtime do consentimento de IA em users/{uid}/consents/current.
// O gate real é server-trusted (assertAiConsent, fail-closed); este hook só
// permite refletir o estado na UI sem esperar o erro da callable.
import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../shared/api/firebase/index';
import { logSanitizedFirebaseError } from '../shared/lib/firebaseErrorHandling';

interface UseAiConsentReturn {
  /** true somente quando o documento existe e `ai === true`. Fail-closed em qualquer outro caso. */
  aiGranted: boolean;
  loading:   boolean;
}

export function useAiConsent(uid: string): UseAiConsentReturn {
  const [aiGranted, setAiGranted] = useState(false);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    if (!uid) { setAiGranted(false); setLoading(false); return; }
    setLoading(true);

    const ref = doc(db, 'users', uid, 'consents', 'current');

    const unsub = onSnapshot(
      ref,
      snap => {
        setAiGranted(snap.exists() && snap.data()?.['ai'] === true);
        setLoading(false);
      },
      err => {
        // Espelha o fail-closed do servidor: qualquer erro de leitura → sem consentimento.
        logSanitizedFirebaseError('ai_consent_read', err);
        setAiGranted(false);
        setLoading(false);
      },
    );
    return () => unsub();
  }, [uid]);

  return { aiGranted, loading };
}
