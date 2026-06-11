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
  createdAt: Timestamp | null;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Registra que o usuário consentiu/exerceu um direito LGPD.
 * Escreve em users/{uid}/dataProcessingLog/{id} com timestamp.
 * Sem dados sensíveis no log (sem uid em texto, sem valores financeiros).
 */
export async function logDataProcessingEvent(
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
export async function getDataProcessingLog(
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
