/**
 * transactionGateway.ts — acesso de leitura/criação usado pelo useTransactions,
 * com uma implementação por backend (escolhida no build por VITE_AUTH_PROVIDER).
 *
 * - subscribeWindow: janela em tempo real (busca, categoria, intervalo de datas
 *   ou mais recentes), limitada a PAGE_SIZE.
 * - loadOlder: página seguinte, a partir do cursor da página anterior.
 * - fetchOne: estado atual de uma transação (base do histórico de edição).
 * - create: criação server-trusted (callable no Firebase; insert com RLS e
 *   idempotência no Supabase).
 */
import {
  collection, query, orderBy, onSnapshot, limit, where, doc, getDoc, getDocs, startAfter,
  type QueryDocumentSnapshot, type DocumentData,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../shared/api/firebase/index';
import type { Transaction } from '../shared/types/transaction';
import { PAGE_SIZE } from '../utils/transactionPagination';
import { DATA_BACKEND } from '../shared/config/backend';
import { transactionGatewaySupabase } from '../shared/services/supabase/transactionRepoSupabase';

export interface WindowQuery {
  /** Busca por descrição (mín. 2 caracteres, já em minúsculas). */
  term?: string;
  /** Categoria exata (usada quando não há termo). */
  category?: string;
  /** Intervalo de datas YYYY-MM-DD inclusivo (usado sem termo/categoria). */
  dateFrom?: string;
  dateTo?: string;
}

export interface WindowPage {
  /** Transações da página (ainda não normalizadas; podem incluir excluídas). */
  docs: Transaction[];
  /** Quantas linhas a consulta devolveu (decide se há mais páginas). */
  rawCount: number;
  /** Cursor para loadOlder; null quando a página veio vazia. */
  cursor: unknown;
}

export interface TransactionGateway {
  subscribeWindow: (
    uid: string,
    q: WindowQuery,
    onNext: (page: WindowPage) => void,
    onError: (err: unknown) => void,
  ) => () => void;
  loadOlder: (uid: string, cursor: unknown) => Promise<WindowPage>;
  fetchOne: (uid: string, id: string) => Promise<Transaction | null>;
  create: (uid: string, data: Partial<Transaction>, idempotencyKey: string) => Promise<string>;
  /** Novo id gerado no cliente (fila offline / criação idempotente). */
  newId: (uid: string) => string;
}

function txFromDoc(d: QueryDocumentSnapshot<DocumentData>): Transaction {
  return { id: d.id, ...(d.data() as Omit<Transaction, 'id'>) };
}

function pageFromDocs(docs: QueryDocumentSnapshot<DocumentData>[]): WindowPage {
  return {
    docs: docs.map(txFromDoc),
    rawCount: docs.length,
    cursor: docs.length > 0 ? (docs[docs.length - 1] ?? null) : null,
  };
}

export const transactionGatewayFirebase: TransactionGateway = {
  subscribeWindow(uid, q, onNext, onError) {
    const col = collection(db, 'users', uid, 'transactions');
    const term = q.term ?? '';
    const fq = term.length >= 2
      ? query(col, where('descriptionLower', '>=', term), where('descriptionLower', '<=', term + ''),
          orderBy('descriptionLower', 'asc'), limit(PAGE_SIZE))
      : q.category
        ? query(col, where('category', '==', q.category), orderBy('date', 'desc'), limit(PAGE_SIZE))
        : q.dateFrom && q.dateTo
          ? query(col, where('date', '>=', q.dateFrom), where('date', '<=', q.dateTo),
              orderBy('date', 'desc'), limit(PAGE_SIZE))
          : query(col, orderBy('createdAt', 'desc'), limit(PAGE_SIZE));
    return onSnapshot(fq, snap => onNext(pageFromDocs(snap.docs)), onError);
  },

  async loadOlder(uid, cursor) {
    const snap = await getDocs(query(
      collection(db, 'users', uid, 'transactions'),
      orderBy('createdAt', 'desc'),
      startAfter(cursor as QueryDocumentSnapshot<DocumentData>),
      limit(PAGE_SIZE),
    ));
    return pageFromDocs(snap.docs);
  },

  async fetchOne(uid, id) {
    const snap = await getDoc(doc(db, 'users', uid, 'transactions', id));
    return snap.exists() ? { id, ...(snap.data() as Omit<Transaction, 'id'>) } : null;
  },

  // Modo Blaze: callable server-trusted com App Check + audit atômico via Admin SDK.
  async create(_uid, data, idempotencyKey) {
    const callCreateTransaction = httpsCallable<Record<string, unknown>, { id: string }>(
      functions, 'createTransaction',
    );
    const callPayload: Record<string, unknown> = {
      description:     data.description ?? '',
      value_cents:     data.value_cents,
      type:            data.type ?? 'saida',
      category:        data.category ?? 'Outros',
      date:            data.date ?? new Date().toISOString().slice(0, 10),
      source:          'manual',
      isRecurring:     data.isRecurring ?? false,
      idempotencyKey,
    };
    if (data.account   !== undefined) callPayload['account']   = data.account;
    if (data.accountId !== undefined) callPayload['accountId'] = data.accountId;
    if (data.cardId    !== undefined) callPayload['cardId']    = data.cardId;
    if (data.fitId     !== undefined) callPayload['fitId']     = data.fitId;
    if (Array.isArray(data.tags) && data.tags.length > 0) callPayload['tags'] = data.tags;
    const result = await callCreateTransaction(callPayload);
    return result.data.id;
  },

  newId(uid) {
    return doc(collection(db, 'users', uid, 'transactions')).id;
  },
};

export const transactionGateway: TransactionGateway =
  DATA_BACKEND === 'supabase' ? transactionGatewaySupabase : transactionGatewayFirebase;
