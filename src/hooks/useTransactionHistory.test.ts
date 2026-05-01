import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockCollection,
  mockLimit,
  mockOnSnapshot,
  mockOrderBy,
  mockQuery,
} = vi.hoisted(() => ({
  mockCollection: vi.fn(() => ({ kind: 'collection' })),
  mockLimit:      vi.fn((count: number) => ({ kind: 'limit', count })),
  mockOnSnapshot: vi.fn(),
  mockOrderBy:    vi.fn((field: string, direction: string) => ({ kind: 'orderBy', field, direction })),
  mockQuery:      vi.fn(() => ({ kind: 'query' })),
}));

vi.mock('firebase/firestore', () => ({
  collection: mockCollection,
  limit:      mockLimit,
  onSnapshot: mockOnSnapshot,
  orderBy:    mockOrderBy,
  query:      mockQuery,
}));

vi.mock('../shared/api/firebase/index', () => ({
  db: { _isMock: true },
}));

import { useTransactionHistory } from './useTransactionHistory';

describe('useTransactionHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOnSnapshot.mockReturnValue(vi.fn());
  });

  it('nao consulta Firestore sem uid ou transactionId', async () => {
    const { result } = renderHook(() => useTransactionHistory('', 'tx-1'));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.events).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(mockCollection).not.toHaveBeenCalled();
    expect(mockOnSnapshot).not.toHaveBeenCalled();
  });

  it('ouve a subcolecao history e mapeia eventos ordenados por timestamp desc', async () => {
    const unsubscribe = vi.fn();
    mockOnSnapshot.mockImplementation((_queryArg, onNext) => {
      onNext({
        docs: [
          {
            id:   'old-event',
            data: () => ({
              action:        'UPDATE',
              txId:          'tx-1',
              origin:        'manual',
              changedFields: ['category'],
              createdAt:     { toMillis: () => 1000 },
              schemaVersion: 1,
            }),
          },
          {
            id:   'new-event',
            data: () => ({
              action:        'BULK_UPDATE',
              txId:          'tx-1',
              category:      'Saude',
              amount_cents:  1234,
              createdAt:     { toMillis: () => 2000 },
              schemaVersion: 1,
            }),
          },
        ],
      });
      return unsubscribe;
    });

    const { result, unmount } = renderHook(() => useTransactionHistory('uid-1', 'tx-1'));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockCollection).toHaveBeenCalledWith(
      expect.anything(),
      'users',
      'uid-1',
      'transactions',
      'tx-1',
      'history',
    );
    expect(mockOrderBy).toHaveBeenCalledWith('createdAt', 'desc');
    expect(mockLimit).toHaveBeenCalledWith(50);
    expect(result.current.events.map(event => event.id)).toEqual(['new-event', 'old-event']);
    expect(result.current.events[0]).toEqual(expect.objectContaining({
      action:       'BULK_UPDATE',
      txId:         'tx-1',
      category:     'Saude',
      amount_cents: 1234,
      timestamp:    2000,
    }));

    unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
