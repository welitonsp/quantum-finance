import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Centavos } from '../shared/types/money';

const {
  mockAddTransaction,
  mockCollection,
  mockLimit,
  mockLogAction,
  mockLogTransactionHistory,
  mockOnSnapshot,
  mockOrderBy,
  mockQuery,
  mockStartAfter,
} = vi.hoisted(() => ({
  mockAddTransaction:        vi.fn(),
  mockCollection:            vi.fn(() => ({ kind: 'collection' })),
  mockLimit:                 vi.fn((count: number) => ({ kind: 'limit', count })),
  mockLogAction:             vi.fn(),
  mockLogTransactionHistory: vi.fn(),
  mockOnSnapshot:            vi.fn(),
  mockOrderBy:               vi.fn((field: string, direction: string) => ({ kind: 'orderBy', field, direction })),
  mockQuery:                 vi.fn(() => ({ kind: 'query' })),
  mockStartAfter:            vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  collection: mockCollection,
  getDocs:    vi.fn(),
  limit:      mockLimit,
  onSnapshot: mockOnSnapshot,
  orderBy:    mockOrderBy,
  query:      mockQuery,
  startAfter: mockStartAfter,
}));

vi.mock('../shared/api/firebase/index', () => ({
  db: { _isMock: true },
}));

vi.mock('../shared/services/FirestoreService', () => ({
  FirestoreService: {
    addTransaction:          mockAddTransaction,
    updateTransaction:       vi.fn(),
    deleteTransaction:       vi.fn(),
    deleteBatchTransactions: vi.fn(),
    batchUpdateTransactions: vi.fn(),
  },
}));

vi.mock('../shared/services/AuditService', () => ({
  AuditService: {
    logAction:             mockLogAction,
    logTransactionHistory: mockLogTransactionHistory,
  },
}));

vi.mock('../utils/aiCategorize', () => ({
  categorizeTransaction: vi.fn(() => undefined),
}));

vi.mock('../services/AICategorizationService', () => ({
  categorizeWithAI: vi.fn(),
}));

vi.mock('react-hot-toast', () => ({
  default: {
    error: vi.fn(),
  },
}));

import { useTransactions } from './useTransactions';

describe('useTransactions - auditoria da criação manual', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAddTransaction.mockResolvedValue('tx-created-1');
    mockLogAction.mockResolvedValue(undefined);
    mockLogTransactionHistory.mockResolvedValue(undefined);
    mockOnSnapshot.mockImplementation((_queryArg, onNext) => {
      onNext({ docs: [] });
      return vi.fn();
    });
  });

  it('registra history CREATE com origin manual após criação bem-sucedida', async () => {
    const { result, unmount } = renderHook(() => useTransactions('uid-1'));

    let createdId = '';
    await act(async () => {
      createdId = await result.current.add({
        id:          'client-side-id',
        uid:         'client-uid',
        description: 'Café manual',
        value:       12.34,
        value_cents: 1234 as Centavos,
        type:        'saida',
        category:    'Alimentação',
        date:        '2026-05-05',
        source:      'manual',
        importHash:  'forbidden-import-hash',
        isRecurring: false,
      });
    });

    expect(createdId).toBe('tx-created-1');
    expect(mockAddTransaction).toHaveBeenCalledWith('uid-1', expect.objectContaining({
      description: 'Café manual',
      value_cents: 1234,
      type:        'saida',
      category:    'Alimentação',
      date:        '2026-05-05',
      source:      'manual',
      schemaVersion: 2,
    }));

    await waitFor(() => expect(mockLogTransactionHistory).toHaveBeenCalledTimes(1));

    const [uid, txId, event] = mockLogTransactionHistory.mock.calls[0] as [
      string,
      string,
      {
        action: string;
        txId: string;
        origin: string;
        after: Record<string, unknown>;
        changedFields: string[];
        amount_cents: number;
        category: string;
      },
    ];

    expect(uid).toBe('uid-1');
    expect(txId).toBe('tx-created-1');
    expect(event).toMatchObject({
      action:       'CREATE',
      txId:         'tx-created-1',
      origin:       'manual',
      amount_cents: 1234,
      category:     'Alimentação',
    });
    expect(event).not.toHaveProperty('before');
    expect(event.after).toEqual(expect.objectContaining({
      description:   'Café manual',
      value_cents:   1234,
      type:          'saida',
      category:      'Alimentação',
      date:          '2026-05-05',
      source:        'manual',
      isRecurring:   false,
      schemaVersion: 2,
    }));
    expect(event.changedFields).toEqual(expect.arrayContaining([
      'category',
      'description',
      'date',
      'type',
      'source',
      'value_cents',
      'isRecurring',
    ]));
    expect(event.changedFields).not.toEqual(expect.arrayContaining(['id', 'uid', 'importHash', 'value']));
    expect(event.after).not.toHaveProperty('id');
    expect(event.after).not.toHaveProperty('uid');
    expect(event.after).not.toHaveProperty('importHash');
    expect(event.after).not.toHaveProperty('value');

    unmount();
  });
});
