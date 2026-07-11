import {
  collection,
  doc,
  getDocs,
  getDoc,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, auth, functions } from '../api/firebase/index';
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

  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Full account deletion flow (Blaze — hard delete via Admin SDK):
 *   1. Export all data so the user keeps a copy.
 *   2. Call `deleteUserData` Cloud Function → recursiveDelete(users/{uid}) + auth.deleteUser(uid).
 *
 * Throws `'REQUIRES_RECENT_LOGIN'` when Firebase Auth rejects the deletion
 * because the session is too old — the caller must prompt a re-login.
 */
export async function deleteUserAccount(uid: string): Promise<void> {
  void uid; // uid verified server-side via request.auth.uid

  // Step 1 — Export so the user has their data before anything is removed.
  await exportAllUserData(auth.currentUser?.uid ?? uid);

  // Step 2 — Hard delete via server-trusted callable (Admin SDK recursiveDelete).
  try {
    const callDelete = httpsCallable<Record<string, never>, { deleted: boolean }>(
      functions, 'deleteUserData'
    );
    await callDelete({});
  } catch (err) {
    const code = (err as { code?: string }).code ?? '';
    // functions/failed-precondition = step-up exigido pelo servidor (F-06).
    if (
      code === 'functions/unauthenticated' ||
      code === 'auth/requires-recent-login' ||
      code === 'functions/failed-precondition'
    ) {
      throw new Error('REQUIRES_RECENT_LOGIN');
    }
    logSanitizedFirebaseError('data_delete_account', err);
    throw err;
  }
}
