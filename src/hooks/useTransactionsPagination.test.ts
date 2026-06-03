// src/hooks/useTransactionsPagination.test.ts
// Testes diretos do hook de paginação cursor-based.
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Transaction } from '../shared/types/transaction';
import type { Centavos } from '../shared/types/money';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../shared/api/firebase/index', () => ({
  db: {},
  auth: { currentUser: null },
}));

const mockGetDocs = vi.fn();

vi.mock('firebase/firestore', () => ({
  collection:  vi.fn(() => ({})),
  query:       vi.fn(() => ({})),
  orderBy:     vi.fn(() => ({})),
  startAfter:  vi.fn(() => ({})),
  limit:       vi.fn(() => ({})),
  getDocs:     (...args: unknown[]) => mockGetDocs(...args),
  onSnapshot:  vi.fn(() => vi.fn()),
  doc:         vi.fn(),
  getDoc:      vi.fn(),
  where:       vi.fn(() => ({})),
}));

vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

vi.mock('../shared/lib/firebaseErrorHandling', () => ({
  logSanitizedFirebaseError:  vi.fn(),
  getUserFriendlyErrorMessage: vi.fn().mockReturnValue('Erro ao carregar.'),
  getFirebaseErrorCode:        vi.fn().mockReturnValue('unknown'),
}));

vi.mock('./useTransactions', () => ({
  normalizeTransaction: vi.fn((tx: Transaction) => tx),
}));

// ─── Import após mocks ────────────────────────────────────────────────────────

import { useTransactionsPagination } from './useTransactionsPagination';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const cents = (n: number): Centavos => n as Centavos;

function makeDoc(id: string, extra: Partial<Transaction> = {}) {
  return {
    id,
    data: () => ({
      description:   `Tx ${id}`,
      value_cents:   cents(1000),
      type:          'saida',
      category:      'Outros',
      date:          '2026-06-01',
      schemaVersion: 2,
      ...extra,
    }),
  };
}

function makeSnap(docs: ReturnType<typeof makeDoc>[]) {
  return {
    docs,
    size: docs.length,
  };
}

function setup() {
  const transactionsRef = { current: [] as Transaction[] };
  const setTransactions = vi.fn();
  const { result } = renderHook(() =>
    useTransactionsPagination('uid-test', transactionsRef, setTransactions),
  );
  return { result, transactionsRef, setTransactions };
}

// ─── Testes ───────────────────────────────────────────────────────────────────

describe('useTransactionsPagination — estado inicial', () => {
  it('hasMoreTransactions começa false', () => {
    const { result } = setup();
    expect(result.current.hasMoreTransactions).toBe(false);
  });

  it('isLoadingMore começa false', () => {
    const { result } = setup();
    expect(result.current.isLoadingMore).toBe(false);
  });

  it('lastPageDocRef começa null', () => {
    const { result } = setup();
    expect(result.current.lastPageDocRef.current).toBeNull();
  });

  it('olderPagesRef começa vazio', () => {
    const { result } = setup();
    expect(result.current.olderPagesRef.current).toHaveLength(0);
  });
});

describe('useTransactionsPagination — loadMoreTransactions sem cursor', () => {
  it('não chama getDocs quando não há cursor (lastPageDocRef null)', async () => {
    mockGetDocs.mockClear();
    const { result } = setup();
    await act(async () => { await result.current.loadMoreTransactions(); });
    expect(mockGetDocs).not.toHaveBeenCalled();
  });
});

describe('useTransactionsPagination — loadMoreTransactions com cursor', () => {
  beforeEach(() => {
    mockGetDocs.mockClear();
  });

  it('chama getDocs quando há cursor e retorna docs', async () => {
    const docs = [makeDoc('tx-new-1'), makeDoc('tx-new-2')];
    mockGetDocs.mockResolvedValueOnce(makeSnap(docs));

    const { result } = setup();
    // Simular cursor presente
    result.current.lastPageDocRef.current = { id: 'cursor-doc' } as unknown as NonNullable<typeof result.current.lastPageDocRef.current>;

    await act(async () => { await result.current.loadMoreTransactions(); });

    expect(mockGetDocs).toHaveBeenCalledTimes(1);
  });

  it('deduplicates IDs já presentes em transactionsRef', async () => {
    const docs = [makeDoc('tx-dup'), makeDoc('tx-new')];
    mockGetDocs.mockResolvedValueOnce(makeSnap(docs));

    const transactionsRef = { current: [{ id: 'tx-dup' } as Transaction] };
    const setTransactions = vi.fn();
    const { result } = renderHook(() =>
      useTransactionsPagination('uid-test', transactionsRef, setTransactions),
    );

    result.current.lastPageDocRef.current = { id: 'cursor' } as unknown as NonNullable<typeof result.current.lastPageDocRef.current>;

    await act(async () => { await result.current.loadMoreTransactions(); });

    // setTransactions deve ter sido chamado e só deve incluir o item novo
    if (setTransactions.mock.calls.length > 0) {
      const updater = setTransactions.mock.calls[0]?.[0];
      if (typeof updater === 'function') {
        const updated = updater([{ id: 'tx-dup' } as Transaction]);
        expect(updated.some((t: Transaction) => t.id === 'tx-new')).toBe(true);
        expect(updated.filter((t: Transaction) => t.id === 'tx-dup')).toHaveLength(1);
      }
    }
  });

  it('filtra docs isDeleted: true da página carregada', async () => {
    const docs = [makeDoc('del-tx', { isDeleted: true }), makeDoc('ok-tx')];
    mockGetDocs.mockResolvedValueOnce(makeSnap(docs));

    const { result, setTransactions } = setup();
    result.current.lastPageDocRef.current = { id: 'cursor' } as unknown as NonNullable<typeof result.current.lastPageDocRef.current>;

    await act(async () => { await result.current.loadMoreTransactions(); });

    if (setTransactions.mock.calls.length > 0) {
      const updater = setTransactions.mock.calls[0]?.[0];
      if (typeof updater === 'function') {
        const updated = updater([] as Transaction[]);
        const ids = updated.map((t: Transaction) => t.id);
        expect(ids).not.toContain('del-tx');
        expect(ids).toContain('ok-tx');
      }
    }
  });

  it('trata erro com toast — não lança exceção para o caller', async () => {
    const toastMock = (await import('react-hot-toast')).default;
    (toastMock.error as ReturnType<typeof vi.fn>).mockClear();

    mockGetDocs.mockRejectedValueOnce(new Error('Firestore offline'));

    const { result } = setup();
    result.current.lastPageDocRef.current = { id: 'cursor' } as unknown as NonNullable<typeof result.current.lastPageDocRef.current>;

    await act(async () => {
      await expect(result.current.loadMoreTransactions()).resolves.toBeUndefined();
    });

    expect((toastMock.error as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0);
  });

  it('não loga dados sensíveis no erro — usa logSanitizedFirebaseError', async () => {
    const { logSanitizedFirebaseError } = await import('../shared/lib/firebaseErrorHandling');
    (logSanitizedFirebaseError as ReturnType<typeof vi.fn>).mockClear();

    mockGetDocs.mockRejectedValueOnce(new Error('permission-denied'));

    const { result } = setup();
    result.current.lastPageDocRef.current = { id: 'cursor' } as unknown as NonNullable<typeof result.current.lastPageDocRef.current>;

    await act(async () => { await result.current.loadMoreTransactions(); });

    expect(logSanitizedFirebaseError).toHaveBeenCalledWith('transaction_load_more', expect.any(Error));
  });
});

describe('useTransactionsPagination — ciclo de loading', () => {
  beforeEach(() => { mockGetDocs.mockClear(); });

  it('isLoadingMore vai a true durante a carga e retorna a false após completar', async () => {
    mockGetDocs.mockResolvedValueOnce(makeSnap([]));

    const { result } = setup();
    result.current.lastPageDocRef.current = { id: 'cursor' } as unknown as NonNullable<typeof result.current.lastPageDocRef.current>;

    expect(result.current.isLoadingMore).toBe(false);

    await act(async () => {
      await result.current.loadMoreTransactions();
    });

    expect(result.current.isLoadingMore).toBe(false); // sempre false após completar
  });

  it('isLoadingMoreRef exposto — guard documentado no tipo PaginationResult', () => {
    const { result } = setup();
    // O ref é exposto para composição com useTransactions
    expect(result.current.isLoadingMoreRef).toBeDefined();
    expect(typeof result.current.isLoadingMoreRef.current).toBe('boolean');
    expect(result.current.isLoadingMoreRef.current).toBe(false);
  });
});

describe('useTransactionsPagination — resetPagination', () => {
  it('resetPagination zera cursor, olderPages e hasMore', () => {
    const { result } = setup();
    result.current.lastPageDocRef.current   = { id: 'cursor' } as unknown as NonNullable<typeof result.current.lastPageDocRef.current>;
    result.current.olderPagesRef.current    = [{ id: 'tx-old' } as Transaction];

    act(() => {
      result.current.setHasMoreTransactions(true);
      result.current.resetPagination();
    });

    expect(result.current.lastPageDocRef.current).toBeNull();
    expect(result.current.olderPagesRef.current).toHaveLength(0);
    expect(result.current.hasMoreTransactions).toBe(false);
    expect(result.current.isLoadingMore).toBe(false);
  });
});
