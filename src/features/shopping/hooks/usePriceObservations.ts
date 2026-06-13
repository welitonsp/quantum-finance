import { useState, useEffect, useCallback } from 'react';
import {
  collection, query, orderBy, onSnapshot,
  addDoc, serverTimestamp, limit,
} from 'firebase/firestore';
import { db } from '../../../shared/api/firebase/index';
import { logSanitizedFirebaseError } from '../../../shared/lib/firebaseErrorHandling';
import type { PriceObservation } from '../../../shared/types/shopping';
import { priceObservationCreateSchema, type PriceObservationCreateInput } from '../../../shared/schemas/shoppingSchemas';

interface UsePriceObservationsReturn {
  observations: PriceObservation[];
  loading: boolean;
  addObservation: (payload: PriceObservationCreateInput) => Promise<string>;
  forProduct: (productName: string) => PriceObservation[];
}

function normalizeProductName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function usePriceObservations(uid: string): UsePriceObservationsReturn {
  const [observations, setObservations] = useState<PriceObservation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) return;
    const ref = collection(db, 'users', uid, 'priceObservations');
    const q = query(ref, orderBy('observedAt', 'desc'), limit(500));
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
    const ref = collection(db, 'users', uid, 'priceObservations');
    const docRef = await addDoc(ref, {
      ...parsed,
      uid,
      createdAt: serverTimestamp(),
      schemaVersion: 1,
    });
    return docRef.id;
  }, [uid]);

  const forProduct = useCallback(
    (productName: string): PriceObservation[] => {
      const normalized = normalizeProductName(productName);
      return observations
        .filter((o) => normalizeProductName(o.productName) === normalized)
        .slice(0, 20);
    },
    [observations],
  );

  return { observations, loading, addObservation, forProduct };
}
