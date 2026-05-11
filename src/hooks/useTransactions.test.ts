import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Centavos } from '../shared/types/money';

const {
  mockCallable,
  mockCollection,
  mockCreateManualTransactionWithHistory,
  mockDoc,
  mockHttpsCallable,
  mockLimit,
  mockLogAction,
  mockLogTransactionHistory,
  mockOnSnapshot,
  mockOrderBy,
  mockQuery,
  mockStartAfter,
} = vi.hoisted(() => {
  const callable = vi.fn().mockResolvedValue({ data: { id: 'tx-created-1' } });
  return {
    mockCallable:              callable,
    mockCollection:            vi.fn(() => ({ kind: 'collection' })),
    mockCreateManualTransactionWithHistory: vi.fn().mockResolvedValue('tx-created-1'),
    mockDoc:                   vi.fn(),
    mockHttpsCallable:         vi.fn(() => callable),
    mockLimit:                 vi.fn((count: number) => ({ kind: 'limit', count })),
    mockLogAction:             vi.fn(),
    mockLogTransactionHistory: vi.fn(),
    mockOnSnapshot:            vi.fn(),
    mockOrderBy:               vi.fn((field: string, direction: string) => ({ kind: 'orderBy', field, direction })),
    mockQuery:                 vi.fn(() => ({ kind: 'query' })),
    mockStartAfter:            vi.fn(),
  };
});

vi.mock('firebase/firestore', () => ({
  collection: mockCollection,
  doc:        mockDoc,
  getDocs:    vi.fn(),
  limit:      mockLimit,
  onSnapshot: mockOnSnapshot,
  orderBy:    mockOrderBy,
  query:      mockQuery,
  startAfter: mockStartAfter,
}));

vi.mock('firebase/functions', () => ({
  httpsCallable: mockHttpsCallable,
}));

vi.mock('../shared/api/firebase/index', () => ({
  db:        { _isMock: true },
  functions: { _isMock: true },
}));

vi.mock('../shared/services/FirestoreService', () => ({
  FirestoreService: {
    createManualTransactionWithHistory: mockCreateManualTransactionWithHistory,
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
  default: { error: vi.fn() },
}));

import { sanitizeForHistory, useTransactions } from './useTransactions';

describe('useTransactions - criação manual Spark via batch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    let generatedTxId = 0;
    mockDoc.mockImplementation((_parent: unknown, explicitId?: string) => ({
      kind: 'doc',
      id: explicitId ?? `tx-reserved-${++generatedTxId}`,
    }));
    mockCallable.mockResolvedValue({ data: { id: 'tx-created-1' } });
    mockCreateManualTransactionWithHistory.mockImplementation(
      async (_uid: string, _data: Record<string, unknown>, txId?: string) => txId ?? 'tx-created-1',
    );
    mockLogAction.mockResolvedValue(undefined);
    mockLogTransactionHistory.mockResolvedValue(undefined);
    mockOnSnapshot.mockImplementation((_queryArg: unknown, onNext: (snap: { docs: never[] }) => void) => {
      onNext({ docs: [] });
      return vi.fn();
    });
  });

  it('chama FirestoreService.createManualTransactionWithHistory e não chama callable', async () => {
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

    expect(createdId).toBe('tx-reserved-1');

    expect(mockCreateManualTransactionWithHistory).toHaveBeenCalledWith(
      'uid-1',
      expect.objectContaining({
        description: 'Café manual',
        value_cents: 1234,
        type:        'saida',
        category:    'Alimentação',
        date:        '2026-05-05',
        source:      'manual',
      }),
      'tx-reserved-1',
    );
    expect(mockHttpsCallable).not.toHaveBeenCalled();
    expect(mockCallable).not.toHaveBeenCalled();

    const [, payload] = mockCreateManualTransactionWithHistory.mock.calls[0] as [string, Record<string, unknown>, string];
    expect(payload).not.toHaveProperty('id');
    expect(payload).not.toHaveProperty('uid');
    expect(payload).not.toHaveProperty('importHash');
    expect(payload).not.toHaveProperty('value');

    unmount();
  });

  it('reutiliza o mesmo txId reservado quando a mesma operação manual é reprocessada', async () => {
    const transientError = Object.assign(new Error('network timeout'), {
      code: 'unavailable',
    });
    mockCreateManualTransactionWithHistory.mockRejectedValueOnce(transientError);
    const { result, unmount } = renderHook(() => useTransactions('uid-1'));

    let addPromise!: Promise<string>;
    await act(async () => {
      addPromise = result.current.add({
        description: 'Café manual',
        value_cents: 1234 as Centavos,
        type:        'saida',
        category:    'Alimentação',
        date:        '2026-05-05',
        source:      'manual',
      });
      await Promise.resolve();
    });

    await waitFor(() => expect(mockCreateManualTransactionWithHistory).toHaveBeenCalledTimes(1));
    const firstTxId = mockCreateManualTransactionWithHistory.mock.calls[0]?.[2];
    expect(firstTxId).toBe('tx-reserved-1');

    await act(async () => {
      window.dispatchEvent(new Event('online'));
      await Promise.resolve();
    });

    await expect(addPromise).resolves.toBe('tx-reserved-1');
    await waitFor(() => expect(mockCreateManualTransactionWithHistory).toHaveBeenCalledTimes(2));
    expect(mockCreateManualTransactionWithHistory.mock.calls[1]?.[2]).toBe(firstTxId);
    expect(mockDoc).toHaveBeenCalledTimes(1);
    expect(mockHttpsCallable).not.toHaveBeenCalled();
    expect(mockCallable).not.toHaveBeenCalled();

    unmount();
  });

  it('não chama logTransactionHistory para CREATE — o batch escreve history junto', async () => {
    const { result, unmount } = renderHook(() => useTransactions('uid-1'));

    await act(async () => {
      await result.current.add({
        description: 'Almoço',
        value_cents: 3500 as Centavos,
        type:        'saida',
        category:    'Alimentação',
        date:        '2026-05-05',
        source:      'manual',
      });
    });

    // Nenhum log de CREATE separado — o helper escreve transaction + history no mesmo batch.
    const createCalls = mockLogTransactionHistory.mock.calls.filter(
      (c) => (c[2] as { action: string }).action === 'CREATE',
    );
    expect(createCalls).toHaveLength(0);

    unmount();
  });

  it('remove o item otimista quando a criação manual falha', async () => {
    const permissionError = Object.assign(new Error('permission denied'), {
      code: 'permission-denied',
    });
    mockCreateManualTransactionWithHistory.mockRejectedValueOnce(permissionError);
    const { result, unmount } = renderHook(() => useTransactions('uid-1'));

    await act(async () => {
      await expect(result.current.add({
        description: 'Café manual',
        value_cents: 1234 as Centavos,
        type:        'saida',
        category:    'Alimentação',
        date:        '2026-05-05',
        source:      'manual',
      })).rejects.toThrow('A movimentação foi recusada pelas regras do Firebase');
    });

    await waitFor(() => expect(result.current.transactions).toHaveLength(0));
    expect(mockCreateManualTransactionWithHistory).toHaveBeenCalledTimes(1);

    unmount();
  });

  it('remove importHash apenas do payload sanitizado para history', () => {
    const importHash = 'a'.repeat(64);
    const sanitized = sanitizeForHistory({
      id:            'tx-imported-1',
      uid:           'uid-1',
      value:         123.45,
      importHash,
      description:   'Compra importada',
      value_cents:   12345 as Centavos,
      schemaVersion: 2,
      type:          'saida',
      category:      'Alimentação',
      date:          '2026-05-05',
      source:        'csv',
      fitId:         'fit-123',
      tags:          ['cartao'],
    });

    expect(sanitized).not.toHaveProperty('id');
    expect(sanitized).not.toHaveProperty('uid');
    expect(sanitized).not.toHaveProperty('value');
    expect(sanitized).not.toHaveProperty('importHash');
    expect(sanitized).toEqual(expect.objectContaining({
      description:   'Compra importada',
      value_cents:   12345,
      schemaVersion: 2,
      type:          'saida',
      category:      'Alimentação',
      date:          '2026-05-05',
      source:        'csv',
      fitId:         'fit-123',
      tags:          ['cartao'],
    }));
  });

  it('registra UPDATE + origin=ai quando IA categoriza transação sem categoria', async () => {
    const { categorizeWithAI } = await import('../services/AICategorizationService');
    vi.mocked(categorizeWithAI).mockResolvedValue('Transporte');

    const { result, unmount } = renderHook(() => useTransactions('uid-1'));

    await act(async () => {
      await result.current.add({
        description: 'Uber corrida',
        value_cents: 2500 as Centavos,
        type:        'saida',
        date:        '2026-05-05',
        source:      'manual',
        // sem category — dispara AI fallback
      });
    });

    await waitFor(() =>
      expect(mockLogTransactionHistory).toHaveBeenCalledWith(
        'uid-1',
        'tx-reserved-1',
        expect.objectContaining({
          action:        'UPDATE',
          origin:        'ai',
          before:        { category: 'Outros' },
          after:         { category: 'Transporte' },
          changedFields: ['category'],
        }),
      ),
    );

    unmount();
  });
});
