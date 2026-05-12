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
  mockDeleteTransaction,
  mockLogAction,
  mockLogTransactionHistory,
  mockOnSnapshot,
  mockOrderBy,
  mockQuery,
  mockSoftDeleteTransactionWithHistory,
  mockStartAfter,
  mockUpdateTransaction,
  mockUpdateTransactionWithHistory,
} = vi.hoisted(() => {
  const callable = vi.fn().mockResolvedValue({ data: { id: 'tx-created-1' } });
  return {
    mockCallable:              callable,
    mockCollection:            vi.fn(() => ({ kind: 'collection' })),
    mockCreateManualTransactionWithHistory: vi.fn().mockResolvedValue('tx-created-1'),
    mockDeleteTransaction:       vi.fn().mockResolvedValue(undefined),
    mockDoc:                   vi.fn(),
    mockHttpsCallable:         vi.fn(() => callable),
    mockLimit:                 vi.fn((count: number) => ({ kind: 'limit', count })),
    mockLogAction:             vi.fn(),
    mockLogTransactionHistory: vi.fn(),
    mockOnSnapshot:            vi.fn(),
    mockOrderBy:               vi.fn((field: string, direction: string) => ({ kind: 'orderBy', field, direction })),
    mockQuery:                 vi.fn(() => ({ kind: 'query' })),
    mockSoftDeleteTransactionWithHistory: vi.fn().mockResolvedValue(undefined),
    mockStartAfter:            vi.fn(),
    mockUpdateTransaction:     vi.fn().mockResolvedValue(undefined),
    mockUpdateTransactionWithHistory: vi.fn().mockResolvedValue(undefined),
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
    updateTransaction:       mockUpdateTransaction,
    updateTransactionWithHistory: mockUpdateTransactionWithHistory,
    softDeleteTransactionWithHistory: mockSoftDeleteTransactionWithHistory,
    deleteTransaction:       mockDeleteTransaction,
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

describe('useTransactions - atualização manual com batch + history', () => {
  const transactionDoc = {
    id: 'tx-1',
    data: () => ({
      id:          'tx-1',
      uid:         'uid-1',
      value:       10,
      importHash:  'x'.repeat(64),
      description: 'Compra original',
      value_cents: 1000,
      type:        'saida',
      category:    'Outros',
      date:        '2026-05-01',
      source:      'manual',
      schemaVersion: 2,
      createdAt:   1000,
      updatedAt:   1000,
    }),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockLogTransactionHistory.mockResolvedValue(undefined);
    mockUpdateTransaction.mockResolvedValue(undefined);
    mockUpdateTransactionWithHistory.mockResolvedValue(undefined);
    mockOnSnapshot.mockImplementation((_queryArg: unknown, onNext: (snap: { docs: unknown[] }) => void) => {
      onNext({ docs: [transactionDoc] });
      return vi.fn();
    });
  });

  it('chama updateTransactionWithHistory quando previous existe e não chama logTransactionHistory', async () => {
    const { result, unmount } = renderHook(() => useTransactions('uid-1'));
    await waitFor(() => expect(result.current.transactions).toHaveLength(1));

    await act(async () => {
      await result.current.update('tx-1', {
        description: 'Compra alterada',
        category: 'Alimentação',
      });
    });

    await waitFor(() => expect(mockUpdateTransactionWithHistory).toHaveBeenCalledWith(
      'uid-1',
      'tx-1',
      expect.objectContaining({
        description: 'Compra alterada',
        category: 'Alimentação',
      }),
      expect.objectContaining({
        before: expect.objectContaining({ description: 'Compra original', category: 'Outros' }),
        after: expect.objectContaining({ description: 'Compra alterada', category: 'Alimentação' }),
        changedFields: expect.arrayContaining(['description', 'category']),
        amount_cents: 1000,
        category: 'Alimentação',
      }),
    ));

    const [, , , historyEvent] = mockUpdateTransactionWithHistory.mock.calls[0] as [
      string,
      string,
      Record<string, unknown>,
      { before: Record<string, unknown>; after: Record<string, unknown> },
    ];
    for (const forbidden of ['id', 'uid', 'value', 'importHash']) {
      expect(historyEvent.before).not.toHaveProperty(forbidden);
      expect(historyEvent.after).not.toHaveProperty(forbidden);
    }
    expect(mockLogTransactionHistory).not.toHaveBeenCalled();
    expect(mockUpdateTransaction).not.toHaveBeenCalled();

    unmount();
  });

  it('mantém fallback para updateTransaction quando previous não existe', async () => {
    const { result, unmount } = renderHook(() => useTransactions('uid-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.update('tx-unknown', { description: 'Fallback' });
    });

    expect(mockUpdateTransaction).toHaveBeenCalledWith('uid-1', 'tx-unknown', expect.anything());
    expect(mockUpdateTransactionWithHistory).not.toHaveBeenCalled();
    expect(mockLogTransactionHistory).not.toHaveBeenCalled();

    unmount();
  });

  it('restaura o estado otimista quando updateTransactionWithHistory falha', async () => {
    const permissionError = Object.assign(new Error('permission denied'), {
      code: 'permission-denied',
    });
    mockUpdateTransactionWithHistory.mockRejectedValueOnce(permissionError);

    const { result, unmount } = renderHook(() => useTransactions('uid-1'));
    await waitFor(() => expect(result.current.transactions[0]?.description).toBe('Compra original'));

    await act(async () => {
      await result.current.update('tx-1', {
        description: 'Compra alterada',
        category:    'Alimentação',
      });
    });

    await waitFor(() => expect(mockUpdateTransactionWithHistory).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      expect(result.current.transactions[0]).toEqual(expect.objectContaining({
        id:          'tx-1',
        description: 'Compra original',
        category:    'Outros',
      }));
    });

    expect(mockUpdateTransaction).not.toHaveBeenCalled();
    expect(mockLogTransactionHistory).not.toHaveBeenCalled();

    unmount();
  });
});

describe('useTransactions - delete lógico manual com batch + history', () => {
  const transactionDoc = {
    id: 'tx-delete-1',
    data: () => ({
      id:          'tx-delete-1',
      uid:         'uid-1',
      value:       10,
      importHash:  'x'.repeat(64),
      description: 'Compra a apagar',
      value_cents: 1000,
      type:        'saida',
      category:    'Outros',
      date:        '2026-05-02',
      source:      'manual',
      schemaVersion: 2,
      createdAt:   1000,
      updatedAt:   1000,
    }),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockDeleteTransaction.mockResolvedValue(undefined);
    mockLogTransactionHistory.mockResolvedValue(undefined);
    mockSoftDeleteTransactionWithHistory.mockResolvedValue(undefined);
    mockOnSnapshot.mockImplementation((_queryArg: unknown, onNext: (snap: { docs: unknown[] }) => void) => {
      onNext({ docs: [transactionDoc] });
      return vi.fn();
    });
  });

  it('chama softDeleteTransactionWithHistory quando previous existe e não chama logTransactionHistory', async () => {
    const { result, unmount } = renderHook(() => useTransactions('uid-1'));
    await waitFor(() => expect(result.current.transactions).toHaveLength(1));

    await act(async () => {
      await result.current.remove('tx-delete-1');
    });

    await waitFor(() => expect(mockSoftDeleteTransactionWithHistory).toHaveBeenCalledWith(
      'uid-1',
      'tx-delete-1',
      expect.objectContaining({
        before: expect.objectContaining({
          description: 'Compra a apagar',
          category:    'Outros',
          value_cents: 1000,
        }),
        amount_cents: 1000,
        category:     'Outros',
      }),
    ));

    const [, , historyEvent] = mockSoftDeleteTransactionWithHistory.mock.calls[0] as [
      string,
      string,
      { before: Record<string, unknown> },
    ];
    for (const forbidden of ['id', 'uid', 'value', 'importHash']) {
      expect(historyEvent.before).not.toHaveProperty(forbidden);
    }
    expect(mockDeleteTransaction).not.toHaveBeenCalled();
    expect(mockLogTransactionHistory).not.toHaveBeenCalled();

    unmount();
  });

  it('mantém fallback para deleteTransaction quando previous não existe', async () => {
    const { result, unmount } = renderHook(() => useTransactions('uid-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.remove('tx-unknown');
    });

    await waitFor(() => expect(mockDeleteTransaction).toHaveBeenCalledWith('uid-1', 'tx-unknown'));
    expect(mockSoftDeleteTransactionWithHistory).not.toHaveBeenCalled();
    expect(mockLogTransactionHistory).not.toHaveBeenCalled();

    unmount();
  });

  it('restaura o estado otimista quando softDeleteTransactionWithHistory falha', async () => {
    const permissionError = Object.assign(new Error('permission denied'), {
      code: 'permission-denied',
    });
    mockSoftDeleteTransactionWithHistory.mockRejectedValueOnce(permissionError);

    const { result, unmount } = renderHook(() => useTransactions('uid-1'));
    await waitFor(() => expect(result.current.transactions[0]?.description).toBe('Compra a apagar'));

    await act(async () => {
      await result.current.remove('tx-delete-1');
    });

    await waitFor(() => expect(mockSoftDeleteTransactionWithHistory).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      expect(result.current.transactions[0]).toEqual(expect.objectContaining({
        id:          'tx-delete-1',
        description: 'Compra a apagar',
        category:    'Outros',
      }));
    });

    expect(mockDeleteTransaction).not.toHaveBeenCalled();
    expect(mockLogTransactionHistory).not.toHaveBeenCalled();

    unmount();
  });
});
