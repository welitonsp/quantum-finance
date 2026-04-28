// src/hooks/useAccounts.ts
// Hook de contas — write em centavos (schemaVersion: 2),
// read tolerante a documentos legados (sem schemaVersion).
import { useState, useEffect, useCallback } from 'react';
import {
  collection, query, onSnapshot, addDoc, deleteDoc, doc, updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../shared/api/firebase/index';
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
        console.error('❌ Erro ao ler contas:', err);
        setLoadingAccounts(false);
      }
    );

    return () => unsubscribe();
  }, [uid]);

  // ── WRITE: SEMPRE schemaVersion: 2 + balance em centavos ───────────────────
  const addAccount = useCallback(async (data: AddAccountInput): Promise<string> => {
    if (!uid) throw new Error('Utilizador não autenticado.');
    const accountsRef = collection(db, 'users', uid, 'accounts');
    const docRef = await addDoc(accountsRef, {
      name:          data.name,
      type:          data.type,
      balance:       toCentavos(data.balance),
      schemaVersion: 2,
      createdAt:     serverTimestamp(),
      updatedAt:     serverTimestamp(),
    });
    return docRef.id;
  }, [uid]);

  const updateAccount = useCallback(async (id: string, data: UpdateAccountInput): Promise<void> => {
    if (!uid || !id) return;
    const docRef = doc(db, 'users', uid, 'accounts', id);
    const payload: Record<string, unknown> = {
      updatedAt: serverTimestamp(),
    };
    if (typeof data.name === 'string')   payload['name'] = data.name;
    if (typeof data.type === 'string')   payload['type'] = data.type;
    if (typeof data.balance === 'number') {
      payload['balance']       = toCentavos(data.balance);
      payload['schemaVersion'] = 2;   // upgrade silencioso ao escrever
    }
    await updateDoc(docRef, payload);
  }, [uid]);

  const removeAccount = useCallback(async (id: string): Promise<void> => {
    if (!uid || !id) return;
    await deleteDoc(doc(db, 'users', uid, 'accounts', id));
  }, [uid]);

  return { accounts, loadingAccounts, addAccount, updateAccount, removeAccount };
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

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
  const n = Number(rawBalance);
  if (!Number.isFinite(n)) return 0 as Centavos;

  // Schema v2: já é centavos inteiros
  if (schemaVersion === 2) return Math.round(n) as Centavos;

  // Legacy: era reais float → converte
  return toCentavos(n) as Centavos;
}
