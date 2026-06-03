// src/hooks/transactionNormalizer.ts
// Funções puras de normalização e serialização de transações,
// extraídas de useTransactions.ts para isolamento e testabilidade.
import type { Transaction } from '../shared/types/transaction';
import { fromCentavos, type Centavos } from '../shared/types/money';
import type { Timestamp } from 'firebase/firestore';

// ─── Normalização de leitura ──────────────────────────────────────────────────

export function normalizeTransaction(tx: Transaction): Transaction {
  // O cliente não reconstrói value_cents a partir de value legado — Admin Repair.
  const rawCents = tx.value_cents;
  const value_cents = (typeof rawCents === 'number' && Number.isSafeInteger(rawCents) && rawCents >= 0)
    ? (rawCents as Centavos)
    : (0 as Centavos); // Fallback só para exibição UI; schemaVersion preservado

  return {
    ...tx,
    value_cents,
    value: fromCentavos(value_cents),
    schemaVersion: tx.schemaVersion ?? 1,
  };
}

// ─── Normalização de escrita ──────────────────────────────────────────────────

export function normalizeWriteData(data: Partial<Transaction>): Partial<Transaction> {
  const {
    id: _id,
    uid: _uid,
    value: _legacyValue,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    deletedAt: _deletedAt,
    importHash: _importHash,
    isDeleted: _isDeleted,
    value_cents: rawCents,
    ...rest
  } = data;
  void _id; void _uid; void _legacyValue; void _createdAt;
  void _updatedAt; void _deletedAt; void _importHash; void _isDeleted;

  const result: Partial<Transaction> = { schemaVersion: 2 };

  // Filtra undefined para garantir payload Firestore sem campos vazios
  Object.entries(rest).forEach(([key, val]) => {
    if (val !== undefined) {
      (result as Record<string, unknown>)[key] = val;
    }
  });

  if (typeof rawCents === 'number' && Number.isSafeInteger(rawCents) && rawCents >= 0) {
    result.value_cents = rawCents as Centavos;
  }

  return result;
}

export function buildUpdateWriteData(
  current: Transaction | undefined,
  data:    Partial<Transaction>,
): Partial<Transaction> {
  const base: Partial<Transaction> = {};

  if (current) {
    const currentCents = current.value_cents;
    if (current.schemaVersion === 2 && typeof currentCents === 'number' && Number.isSafeInteger(currentCents) && currentCents >= 0) {
      base.value_cents = currentCents as Centavos;
    }
    base.schemaVersion = 2;

    if (current.type) {
      const rawType = String(current.type).toLowerCase();
      if (rawType === 'entrada' || rawType === 'receita') base.type = 'entrada';
      else if (rawType === 'saida' || rawType === 'despesa') base.type = 'saida';
    }

    if (current.source) {
      const rawSource = String(current.source).toLowerCase();
      if      (rawSource === 'csv')    base.source = 'csv';
      else if (rawSource === 'ofx')    base.source = 'ofx';
      else if (rawSource === 'pdf')    base.source = 'pdf';
      else                             base.source = 'manual';
    }
  }

  const incomingCents = data.value_cents;
  let finalCents: Centavos | undefined = base.value_cents;
  if (typeof incomingCents === 'number' && Number.isSafeInteger(incomingCents) && incomingCents >= 0) {
    finalCents = incomingCents as Centavos;
  }

  const merged: Partial<Transaction> = { ...base, ...data };

  if (finalCents !== undefined) merged.value_cents = finalCents;
  else delete merged.value_cents;

  // Normalização final do source no payload de escrita
  if (merged.source) {
    const s = String(merged.source).toLowerCase();
    if      (s === 'csv')  merged.source = 'csv';
    else if (s === 'ofx')  merged.source = 'ofx';
    else if (s === 'pdf')  merged.source = 'pdf';
    else                   merged.source = 'manual';
  }

  return normalizeWriteData(merged);
}

// ─── Histórico ────────────────────────────────────────────────────────────────

/**
 * Serializa transação para payload de histórico.
 * Exclui id, uid, value legado e importHash (proibidos ou redundantes com o path).
 */
export function sanitizeForHistory(tx: Partial<Transaction>): Record<string, unknown> {
  const excluded = new Set<string>(['id', 'uid', 'value', 'importHash', '_lastOpId', 'correlationId']);
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(tx)) {
    if (!excluded.has(k) && v !== undefined) result[k] = v;
  }
  return result;
}

/**
 * Retorna os campos que diferem entre before e after.
 */
export function computeChangedFields(
  before: Record<string, unknown>,
  after:  Record<string, unknown>,
): string[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys].filter(k => {
    try {
      return JSON.stringify(before[k]) !== JSON.stringify(after[k]);
    } catch {
      return before[k] !== after[k];
    }
  });
}

// ─── Timestamp ────────────────────────────────────────────────────────────────

/**
 * Normaliza qualquer forma de timestamp (Firestore Timestamp, number ms, string ISO)
 * para milissegundos. Retorna 0 se não reconhecido.
 */
export function toMillis(ts: Transaction['updatedAt'] | Transaction['createdAt']): number {
  if (ts === null || ts === undefined) return 0;
  if (typeof ts === 'object' && 'toMillis' in ts) return (ts as Timestamp).toMillis();
  if (typeof ts === 'number') return ts;
  if (typeof ts === 'string') { const p = Date.parse(ts); return isNaN(p) ? 0 : p; }
  return 0;
}
