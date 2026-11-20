import { useEffect, useState } from 'react';
import type { Transaction } from '../shared/types/transaction';
import {
  fetchEarliestTransactionYear,
  fetchTransactionsInDateRange,
  yearRange,
} from '../shared/services/transactionPeriodRepo';
import { logSanitizedFirebaseError } from '../shared/lib/firebaseErrorHandling';

export interface TransactionsByYearState {
  transactions: Transaction[];
  /** Anos com dados possíveis (da transação mais antiga até o ano atual). */
  years: number[];
  loading: boolean;
  error: boolean;
  /** Resultado bateu no teto de segurança de leitura e pode estar incompleto. */
  truncated: boolean;
}

/**
 * Carrega TODAS as transações de um ano-calendário (P-01). Leitura sob demanda
 * (getDocs paginado), não realtime: o informe de IR é um relatório, não um feed.
 */
export function useTransactionsByYear(uid: string | null | undefined, year: number): TransactionsByYearState {
  const currentYear = new Date().getFullYear();
  const [years, setYears] = useState<number[]>([currentYear]);
  const [state, setState] = useState<Omit<TransactionsByYearState, 'years'>>({
    transactions: [], loading: true, error: false, truncated: false,
  });

  useEffect(() => {
    if (!uid) return undefined;
    let cancelled = false;
    fetchEarliestTransactionYear(uid)
      .then((earliest) => { if (!cancelled) setYears(yearRange(earliest, currentYear)); })
      .catch((error: unknown) => logSanitizedFirebaseError('transaction_load_more', error));
    return () => { cancelled = true; };
  }, [uid, currentYear]);

  useEffect(() => {
    if (!uid) {
      setState({ transactions: [], loading: false, error: false, truncated: false });
      return undefined;
    }
    let cancelled = false;
    setState(prev => ({ ...prev, loading: true, error: false }));
    fetchTransactionsInDateRange(uid, `${year}-01-01`, `${year}-12-31`)
      .then(({ transactions, truncated }) => {
        if (!cancelled) setState({ transactions, loading: false, error: false, truncated });
      })
      .catch((error: unknown) => {
        logSanitizedFirebaseError('transaction_load_more', error);
        if (!cancelled) setState({ transactions: [], loading: false, error: true, truncated: false });
      });
    return () => { cancelled = true; };
  }, [uid, year]);

  return { ...state, years };
}
