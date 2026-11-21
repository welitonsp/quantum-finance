import {
  collection,
  addDoc,
  getDocs,
  orderBy,
  limit,
  query,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../api/firebase/index';
import { logSanitizedFirebaseError } from '../lib/firebaseErrorHandling';
import { DATA_BACKEND } from '../config/backend';
import { getDataProcessingLogSupabase, logDataProcessingEventSupabase } from './supabase/dataPrivacySupabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export type DataProcessingEventType =
  | 'consent_granted'
  | 'export_requested'
  | 'deletion_requested'
  | 'portability';

export interface DataProcessingLogEntry {
  id: string;
  eventType: DataProcessingEventType;
  details?: string;
  /** Firestore Timestamp ou equivalente do Supabase: só `toDate()` é usado. */
  createdAt: Pick<Timestamp, 'toDate'> | null;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Registra que o usuário consentiu/exerceu um direito LGPD.
 * Escreve em users/{uid}/dataProcessingLog/{id} com timestamp.
 * Sem dados sensíveis no log (sem uid em texto, sem valores financeiros).
 */
async function logDataProcessingEventFirebase(
  uid: string,
  eventType: DataProcessingEventType,
  details?: string,
): Promise<void> {
  try {
    await addDoc(collection(db, 'users', uid, 'dataProcessingLog'), {
      eventType,
      ...(details ? { details: details.slice(0, 200) } : {}),
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    logSanitizedFirebaseError('data_processing_log', err);
  }
}

/**
 * Lê os últimos eventos de processamento de dados do usuário.
 */
async function getDataProcessingLogFirebase(
  uid: string,
  maxEntries = 20,
): Promise<DataProcessingLogEntry[]> {
  try {
    const q = query(
      collection(db, 'users', uid, 'dataProcessingLog'),
      orderBy('createdAt', 'desc'),
      limit(maxEntries),
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => {
      const raw = d.data();
      const entry: DataProcessingLogEntry = {
        id: d.id,
        eventType: raw['eventType'] as DataProcessingEventType,
        createdAt: raw['createdAt'] as Timestamp | null,
      };
      if (typeof raw['details'] === 'string') entry.details = raw['details'];
      return entry;
    });
  } catch (err) {
    logSanitizedFirebaseError('data_processing_log_read', err);
    return [];
  }
}

/** Firebase ou Supabase, escolhido no build (VITE_AUTH_PROVIDER). */
export const logDataProcessingEvent: (uid: string, eventType: DataProcessingEventType, details?: string) => Promise<void> =
  DATA_BACKEND === 'supabase' ? logDataProcessingEventSupabase : logDataProcessingEventFirebase;

export const getDataProcessingLog: (uid: string, maxEntries?: number) => Promise<DataProcessingLogEntry[]> =
  DATA_BACKEND === 'supabase' ? getDataProcessingLogSupabase : getDataProcessingLogFirebase;
