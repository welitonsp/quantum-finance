// src/hooks/useAccounts.ts
// Hook de contas — write em centavos (schemaVersion: 2),
// read tolerante a documentos legados (sem schemaVersion).
import { useState, useEffect, useCallback } from 'react';
import {
  collection, query, onSnapshot, doc, getDoc, writeBatch, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../shared/api/firebase/index';
import { logSanitizedFirebaseError } from '../shared/lib/firebaseErrorHandling';
import { generateSafeOperationId } from '../shared/lib/operationTrace';
import { toCentavos } from '../shared/schemas/financialSchemas';
import type { Account } from '../shared/types/transaction';
import type { Centavos } from '../shared/types/money';

// ─── Public API ───────────────────────────────────────────────────────────────

interface UseAccountsReturn {
  accounts:        Account[];
  loadingAccounts: boolean;
  /** balance VEM em REAIS (float). Hook converte para centavos antes do write. */
  addAccount:      (data: AddAccountInput) => Promise<string>;
  /** balance opcional em REAIS. Outros campos passam direto. */
  updateAccount:   (id: string, data: UpdateAccountInput) => Promise<void>;
  removeAccount:   (id: string) => Promise<void>;
}

interface AddAccountInput {
  name:    string;
  type:    Account['type'];
  /** Em REAIS (float). Será convertido para centavos no write. */
  balance: number;
}

interface UpdateAccountInput {
  name?:    string;
  type?:    Account['type'];
  /** Em REAIS (float). Será convertido para centavos se presente. */
  balance?: number;
}

type AccountHistoryAction = 'CREATE' | 'UPDATE' | 'DELETE';

const ACCOUNT_HISTORY_FIELDS = [
  'name',
  'type',
  'balance',
  'schemaVersion',
  'createdAt',
  'updatedAt',
] as const;

type AccountHistoryField = typeof ACCOUNT_HISTORY_FIELDS[number];

const ACCOUNT_HISTORY_CHANGED_FIELDS: AccountHistoryField[] = [
  'name',
  'type',
  'balance',
  'schemaVersion',
];

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAccounts(uid: string): UseAccountsReturn {
  const [accounts, setAccounts]               = useState<Account[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);

  useEffect(() => {
    if (!uid) { setAccounts([]); setLoadingAccounts(false); return; }

    setLoadingAccounts(true);
    const accountsRef = collection(db, 'users', uid, 'accounts');
    const q = query(accountsRef);

    const unsubscribe = onSnapshot(q,
      (snapshot) => {
        const data: Account[] = snapshot.docs.map(d => {
          const raw = d.data();
          const account: Account = {
            id:            d.id,
            name:          (raw['name'] as string) ?? '',
            type:          (raw['type'] as Account['type']) ?? 'corrente',
            balance:       normalizeBalance(raw['balance'], raw['schemaVersion']),
            createdAt:     raw['createdAt'] ?? null,
            updatedAt:     raw['updatedAt'] ?? null,
          };
          if (raw['schemaVersion'] === 2) account.schemaVersion = 2;
          return account;
        });
        data.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        setAccounts(data);
        setLoadingAccounts(false);
      },
      (err) => {
        logSanitizedFirebaseError('accounts_load', err);
        setLoadingAccounts(false);
      }
    );

    return () => unsubscribe();
  }, [uid]);

  // ── WRITE: SEMPRE schemaVersion: 2 + balance em centavos ───────────────────
  const addAccount = useCallback(async (data: AddAccountInput): Promise<string> => {
    if (!uid) throw new Error('Utilizador não autenticado.');
    const accountsRef = collection(db, 'users', uid, 'accounts');
    const accountRef = doc(accountsRef);
    const batch = writeBatch(db);
    const timestamp = serverTimestamp();
    const correlationId = generateSafeOperationId('op');
    const accountPayload = {
      name:          data.name,
      type:          data.type,
      balance:       toCentavos(data.balance),
      schemaVersion: 2,
      createdAt:     timestamp,
      updatedAt:     timestamp,
    };
    const after = sanitizeAccountForHistory(accountPayload);

    batch.set(accountRef, accountPayload);
    batch.set(doc(db, 'users', uid, 'accounts', accountRef.id, 'history', 'create'), {
      ...buildAccountHistory('CREATE', accountRef.id, correlationId),
      after,
      changedFields: computeAccountChangedFields({}, after),
    });
    await batch.commit();
    return accountRef.id;
  }, [uid]);

  const updateAccount = useCallback(async (id: string, data: UpdateAccountInput): Promise<void> => {
    if (!uid || !id) return;
    const accountRef = doc(db, 'users', uid, 'accounts', id);
    const snap = await getDoc(accountRef);
    if (!snap.exists()) return;

    const timestamp = serverTimestamp();
    const correlationId = generateSafeOperationId('op');
    const payload: Record<string, unknown> = {
      updatedAt: timestamp,
      _lastOpId: correlationId,
    };
    if (typeof data.name === 'string')   payload['name'] = data.name;
    if (typeof data.type === 'string')   payload['type'] = data.type;
    if (typeof data.balance === 'number') {
      payload['balance']       = toCentavos(data.balance);
      payload['schemaVersion'] = 2;   // upgrade silencioso ao escrever
    }

    const before = sanitizeAccountForHistory(snap.data());
    const after = sanitizeAccountForHistory({ ...snap.data(), ...payload });
    const batch = writeBatch(db);

    batch.update(accountRef, payload);
    batch.set(doc(db, 'users', uid, 'accounts', id, 'history', correlationId), {
      ...buildAccountHistory('UPDATE', id, correlationId),
      before,
      after,
      changedFields: computeAccountChangedFields(before, after),
    });
    await batch.commit();
  }, [uid]);

  const removeAccount = useCallback(async (id: string): Promise<void> => {
    if (!uid || !id) return;
    const accountRef = doc(db, 'users', uid, 'accounts', id);
    const snap = await getDoc(accountRef);
    if (!snap.exists()) return;

    const correlationId = generateSafeOperationId('op');
    const before = sanitizeAccountForHistory(snap.data());
    const batch = writeBatch(db);

    batch.set(doc(db, 'users', uid, 'accounts', id, 'history', 'delete'), {
      ...buildAccountHistory('DELETE', id, correlationId),
      before,
      changedFields: ACCOUNT_HISTORY_CHANGED_FIELDS.filter(field => field in before),
    });
    batch.delete(accountRef);
    await batch.commit();
  }, [uid]);

  return { accounts, loadingAccounts, addAccount, updateAccount, removeAccount };
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function buildAccountHistory(
  action: AccountHistoryAction,
  accountId: string,
  correlationId: string,
): Record<string, unknown> {
  return {
    action,
    accountId,
    origin:        'manual',
    correlationId,
    createdAt:     serverTimestamp(),
    schemaVersion: 1,
  };
}

export function sanitizeAccountForHistory(account: Record<string, unknown>): Record<string, unknown> {
  return ACCOUNT_HISTORY_FIELDS.reduce<Record<string, unknown>>((snapshot, field) => {
    if (account[field] !== undefined) snapshot[field] = account[field];
    return snapshot;
  }, {});
}

export function computeAccountChangedFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): AccountHistoryField[] {
  return ACCOUNT_HISTORY_CHANGED_FIELDS.filter(field => {
    const beforeValue = before[field];
    const afterValue = after[field];
    return JSON.stringify(beforeValue) !== JSON.stringify(afterValue);
  });
}

/**
 * Normaliza balance em CENTAVOS, tolerando dois formatos no Firestore:
 *
 * - schemaVersion === 2: balance JÁ é centavos inteiros → arredonda defensivo
 * - schemaVersion ausente: legado em REAIS (float) → converte com toCentavos
 *
 * Esta função é o ÚNICO ponto que conhece o formato legado. O resto do app
 * trabalha exclusivamente em centavos.
 */
export function normalizeBalance(
  rawBalance: unknown,
  schemaVersion: unknown,
): Centavos {
  if (typeof rawBalance !== 'number' || !Number.isFinite(rawBalance)) return 0 as Centavos;

  // Schema v2: já é centavos inteiros
  if (schemaVersion === 2) return Math.floor(rawBalance + 0.5) as Centavos;

  // Legacy: era reais float → converte
  return toCentavos(rawBalance) as Centavos;
}
