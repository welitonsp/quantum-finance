import {
  collection,
  doc,
  getDocs,
  getDoc,
  writeBatch,
} from 'firebase/firestore';
import { deleteUser } from 'firebase/auth';
import { db, auth } from '../api/firebase/index';
import { logSanitizedFirebaseError } from '../lib/firebaseErrorHandling';

// ─── Constants ────────────────────────────────────────────────────────────────

const EXPORTABLE_SUBCOLLECTIONS = [
  'transactions',
  'accounts',
  'audit_logs',
  'system_logs',
  'budgets',
  'categoryRules',
  'categories',
  'creditCards',
  'recurringTasks',
  'simulations',
] as const;

/** Only subcollections whose Rules allow plain `delete: if isOwner()`. */
const DELETABLE_SUBCOLLECTIONS = [
  'budgets',
  'categoryRules',
  'creditCards',
  'simulations',
] as const;

const BATCH_CHUNK_SIZE = 400;

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function shortUidHash(uid: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(uid);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 8);
}

function omitImportHash(data: Record<string, unknown>): Record<string, unknown> {
  const { importHash: _omitted, ...rest } = data;
  void _omitted;
  return rest;
}

async function readSubcollection(
  uid: string,
  name: string,
): Promise<Array<{ id: string } & Record<string, unknown>>> {
  const snap = await getDocs(collection(db, 'users', uid, name));
  return snap.docs.map(d => ({ id: d.id, ...omitImportHash(d.data() as Record<string, unknown>) }));
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Reads all user subcollections, assembles an anonymised JSON export, and
 * triggers a browser download. The uid is never written in plain text — only
 * the first 8 hex chars of its SHA-256 hash are included for reference.
 */
export async function exportAllUserData(uid: string): Promise<void> {
  const collections: Record<string, unknown[]> = {};

  for (const name of EXPORTABLE_SUBCOLLECTIONS) {
    try {
      collections[name] = await readSubcollection(uid, name);
    } catch (err) {
      logSanitizedFirebaseError('data_export', err);
      collections[name] = [];
    }
  }

  // usage/ai_calls is a single document, not a subcollection
  try {
    const usageDoc = await getDoc(doc(db, 'users', uid, 'usage', 'ai_calls'));
    collections['usage_ai_calls'] = usageDoc.exists()
      ? [omitImportHash(usageDoc.data() as Record<string, unknown>)]
      : [];
  } catch (err) {
    logSanitizedFirebaseError('data_export', err);
    collections['usage_ai_calls'] = [];
  }

  const uidHash = await shortUidHash(uid);
  const today = new Date().toISOString().slice(0, 10);

  const payload = {
    exportedAt: new Date().toISOString(),
    uid_hash: uidHash,
    collections,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `quantum-finance-dados-${today}.json`;
  anchor.click();

  // Revoke after a short delay to allow the browser to pick up the download
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Full account deletion flow:
 *   1. Export all data so the user keeps a copy.
 *   2. Delete Firestore documents in safe subcollections (batch-safe only).
 *   3. Delete the Firebase Auth user.
 *
 * Throws `'REQUIRES_RECENT_LOGIN'` when Firebase Auth rejects the deletion
 * because the session is too old — the caller must prompt a re-login.
 */
export async function deleteUserAccount(uid: string): Promise<void> {
  // Step 1 — Export so the user has their data before anything is removed.
  await exportAllUserData(uid);

  // Step 2 — Delete docs from subcollections that allow plain batch delete.
  try {
    for (const name of DELETABLE_SUBCOLLECTIONS) {
      const snap = await getDocs(collection(db, 'users', uid, name));
      const refs = snap.docs.map(d => d.ref);

      for (let i = 0; i < refs.length; i += BATCH_CHUNK_SIZE) {
        const chunk = refs.slice(i, i + BATCH_CHUNK_SIZE);
        const batch = writeBatch(db);
        chunk.forEach(ref => batch.delete(ref));
        await batch.commit();
      }
    }
  } catch (err) {
    logSanitizedFirebaseError('data_delete_subcollections', err);
    // Non-fatal: proceed to Auth deletion regardless; Firestore data without
    // a valid auth token is inaccessible per Rules.
  }

  // Step 3 — Delete the Firebase Auth user.
  try {
    await deleteUser(auth.currentUser!);
  } catch (err) {
    const code = (err as { code?: string }).code ?? '';
    if (code === 'auth/requires-recent-login') {
      throw new Error('REQUIRES_RECENT_LOGIN');
    }
    logSanitizedFirebaseError('data_delete_auth_user', err);
    throw err;
  }
}
