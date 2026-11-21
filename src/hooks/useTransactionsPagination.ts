import { useState, useCallback, useRef } from 'react';
import { transactionGateway } from './transactionGateway';
import type { Transaction } from '../shared/types/transaction';
import { PAGE_SIZE, hasMorePages } from '../utils/transactionPagination';
import {
  getUserFriendlyErrorMessage,
  logSanitizedFirebaseError,
} from '../shared/lib/firebaseErrorHandling';
import { normalizeTransaction } from './useTransactions';
import toast from 'react-hot-toast';

export type PaginationResult = {
  hasMoreTransactions:    boolean;
  isLoadingMore:          boolean;
  loadMoreTransactions:   () => Promise<void>;
  /** Cursor ref — shared with the onSnapshot effect in useTransactions. */
  /** Cursor opaco do backend (documento no Firebase, created_at no Supabase). */
  lastPageDocRef:         React.MutableRefObject<unknown>;
  /** Accumulated older-page docs — shared with the onSnapshot merge logic. */
  olderPagesRef:          React.MutableRefObject<Transaction[]>;
  /** Guard ref against concurrent loadMore calls. */
  isLoadingMoreRef:       React.MutableRefObject<boolean>;
  setHasMoreTransactions: React.Dispatch<React.SetStateAction<boolean>>;
  setIsLoadingMore:       React.Dispatch<React.SetStateAction<boolean>>;
  resetPagination:        () => void;
};

/**
 * Encapsulates cursor-based pagination for transactions (via transactionGateway).
 * Owns page refs and loadMore logic; composes into useTransactions.
 */
export function useTransactionsPagination(
  uid: string,
  transactionsRef: React.MutableRefObject<Transaction[]>,
  setTransactions: React.Dispatch<React.SetStateAction<Transaction[]>>,
): PaginationResult {
  const lastPageDocRef   = useRef<unknown>(null);
  const olderPagesRef    = useRef<Transaction[]>([]);
  const isLoadingMoreRef = useRef(false);

  const [hasMoreTransactions, setHasMoreTransactions] = useState(false);
  const [isLoadingMore,       setIsLoadingMore]        = useState(false);

  const resetPagination = useCallback((): void => {
    olderPagesRef.current    = [];
    lastPageDocRef.current   = null;
    isLoadingMoreRef.current = false;
    setHasMoreTransactions(false);
    setIsLoadingMore(false);
  }, []);

  const loadMoreTransactions = useCallback(async (): Promise<void> => {
    if (!uid || isLoadingMoreRef.current || !lastPageDocRef.current) return;

    isLoadingMoreRef.current = true;
    setIsLoadingMore(true);

    try {
      const page = await transactionGateway.loadOlder(uid, lastPageDocRef.current);

      const newDocs = page.docs
        .map(tx => normalizeTransaction(tx))
        .filter(tx => tx.isDeleted !== true && !tx.deletedAt);

      if (page.rawCount > 0) {
        lastPageDocRef.current = page.cursor;
      }

      const existingIds = new Set(transactionsRef.current.map(tx => tx.id));
      const uniqueNew   = newDocs.filter(tx => !existingIds.has(tx.id));
      olderPagesRef.current = [...olderPagesRef.current, ...uniqueNew];

      setHasMoreTransactions(hasMorePages(PAGE_SIZE, page.rawCount));

      if (uniqueNew.length > 0) {
        setTransactions(prev => {
          const prevIds = new Set(prev.map(tx => tx.id));
          const deduped = uniqueNew.filter(tx => !prevIds.has(tx.id));
          return [...prev, ...deduped];
        });
      }
    } catch (err) {
      logSanitizedFirebaseError('transaction_load_more', err);
      toast.error(getUserFriendlyErrorMessage(err, 'transaction_load_more'));
    } finally {
      isLoadingMoreRef.current = false;
      setIsLoadingMore(false);
    }
  }, [uid, transactionsRef, setTransactions]);

  return {
    hasMoreTransactions,
    isLoadingMore,
    loadMoreTransactions,
    lastPageDocRef,
    olderPagesRef,
    isLoadingMoreRef,
    setHasMoreTransactions,
    setIsLoadingMore,
    resetPagination,
  };
}
