import { useState, useEffect, useCallback } from 'react';
import {
  collection, query, orderBy, onSnapshot, limit,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../../shared/api/firebase/index';
import { logSanitizedFirebaseError } from '../../../shared/lib/firebaseErrorHandling';
import type { PriceObservation } from '../../../shared/types/shopping';
import { priceObservationCreateSchema, type PriceObservationCreateInput } from '../../../shared/schemas/shoppingSchemas';
import { DATA_BACKEND } from '../../../shared/config/backend';
import {
  normalizeProductName, observationsForProduct, PRICE_OBSERVATIONS_LIMIT,
  type UsePriceObservationsReturn,
} from './priceObservationRules';
import { usePriceObservationsSupabase } from './usePriceObservationsSupabase';

export type { UsePriceObservationsReturn } from './priceObservationRules';

function usePriceObservationsFirebase(uid: string): UsePriceObservationsReturn {
  const [observations, setObservations] = useState<PriceObservation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) return;
    const ref = collection(db, 'users', uid, 'priceObservations');
    const q = query(ref, orderBy('observedAt', 'desc'), limit(PRICE_OBSERVATIONS_LIMIT));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setObservations(snap.docs.map((d) => ({ id: d.id, ...d.data() } as PriceObservation)));
        setLoading(false);
      },
      (err) => {
        logSanitizedFirebaseError('price_observations_load', err);
        setLoading(false);
      },
    );
    return unsub;
  }, [uid]);

  const addObservation = useCallback(async (payload: PriceObservationCreateInput): Promise<string> => {
    const parsed = priceObservationCreateSchema.parse({
      ...payload,
      productName: normalizeProductName(payload.productName),
      store: payload.store.trim(),
    });
    const call = httpsCallable<PriceObservationCreateInput, { id: string }>(
      functions, 'recordPriceObservation'
    );
    const result = await call(parsed);
    return result.data.id;
  }, [uid]);

  const forProduct = useCallback(
    (productName: string) => observationsForProduct(observations, productName),
    [observations],
  );

  return { observations, loading, addObservation, forProduct };
}

/** Firebase ou Supabase, escolhido no build (VITE_AUTH_PROVIDER). */
export const usePriceObservations: (uid: string) => UsePriceObservationsReturn =
  DATA_BACKEND === 'supabase' ? usePriceObservationsSupabase : usePriceObservationsFirebase;
