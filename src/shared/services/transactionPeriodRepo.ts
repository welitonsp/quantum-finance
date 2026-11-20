/**
 * transactionPeriodRepo.ts — leitura de transações por período, sem o teto de
 * 500 do listener realtime (P-01, Fase 1).
 *
 * O listener de useTransactions carrega no máximo PAGE_SIZE (500) documentos
 * mais recentes. Telas que precisam de um período inteiro com transações
 * individuais (ex.: informe de IR, que apura ganho de capital por ativo) leem
 * aqui, paginando até cobrir o intervalo.
 */
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  where,
  type Query,
  type QueryDocumentSnapshot,
  type QuerySnapshot,
} from 'firebase/firestore';
import { db } from '../api/firebase/index';
import type { Transaction } from '../types/transaction';

export const PERIOD_PAGE_SIZE = 500;
/** Teto de segurança contra varredura sem fim (custo): 40 páginas = 20.000 docs/período. */
export const PERIOD_MAX_PAGES = 40;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface PeriodFetchResult {
  transactions: Transaction[];
  /** true se o teto PERIOD_MAX_PAGES foi atingido (resultado pode estar incompleto). */
  truncated: boolean;
}

function isActive(tx: Transaction): boolean {
  return tx.isDeleted !== true && !tx.deletedAt;
}

/** Todas as transações ativas com `date` entre `from` e `to` (inclusive, YYYY-MM-DD). */
export async function fetchTransactionsInDateRange(
  uid: string,
  from: string,
  to: string,
): Promise<PeriodFetchResult> {
  if (!uid) throw new Error('UID obrigatório.');
  if (!DATE_RE.test(from) || !DATE_RE.test(to) || from > to) {
    throw new Error('Período inválido.');
  }

  const col = collection(db, 'users', uid, 'transactions');
  const transactions: Transaction[] = [];
  let cursor: QueryDocumentSnapshot | null = null;

  for (let page = 0; page < PERIOD_MAX_PAGES; page += 1) {
    const q: Query = cursor
      ? query(col, where('date', '>=', from), where('date', '<=', to), orderBy('date', 'asc'), startAfter(cursor), limit(PERIOD_PAGE_SIZE))
      : query(col, where('date', '>=', from), where('date', '<=', to), orderBy('date', 'asc'), limit(PERIOD_PAGE_SIZE));
    const snap: QuerySnapshot = await getDocs(q);
    for (const d of snap.docs) {
      const tx = { id: d.id, ...d.data() } as Transaction;
      if (isActive(tx)) transactions.push(tx);
    }
    if (snap.docs.length < PERIOD_PAGE_SIZE) return { transactions, truncated: false };
    cursor = snap.docs[snap.docs.length - 1] ?? null;
  }
  return { transactions, truncated: true };
}

/** Ano da transação mais antiga (por `date`), ou null se não houver nenhuma. */
export async function fetchEarliestTransactionYear(uid: string): Promise<number | null> {
  if (!uid) throw new Error('UID obrigatório.');
  const snap = await getDocs(query(
    collection(db, 'users', uid, 'transactions'),
    orderBy('date', 'asc'),
    limit(1),
  ));
  const date = snap.docs[0]?.data()?.['date'];
  if (typeof date !== 'string' || !DATE_RE.test(date)) return null;
  const year = Number.parseInt(date.slice(0, 4), 10);
  return Number.isInteger(year) ? year : null;
}

/** Anos de `earliest` até `current`, do mais recente para o mais antigo. */
export function yearRange(earliest: number | null, current: number): number[] {
  if (earliest === null || earliest > current) return [current];
  const years: number[] = [];
  for (let y = current; y >= earliest; y -= 1) years.push(y);
  return years;
}
