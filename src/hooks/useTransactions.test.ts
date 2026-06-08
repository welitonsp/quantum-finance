import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Centavos } from '../shared/types/money';

const {
  mockCallable,
  mockCollection,
  mockCreateManualTransactionWithHistory,
  mockDoc,
  mockGetDoc,
  mockHttpsCallable,
  mockLimit,
  mockDeleteBatchTransactionsWithHistory,
  mockLogAction,
  mockLogTransactionHistory,
  mockOnSnapshot,
  mockOrderBy,
  mockQuery,
  mockSoftDeleteTransactionWithHistory,
  mockStartAfter,
  mockUpdateTransactionWithHistory,
  mockBatchUpdateTransactionsWithHistory,
  mockBatchUndoBulkUpdateTransactionsWithHistory,
} = vi.hoisted(() => {
  const callable = vi.fn().mockResolvedValue({ data: { id: 'tx-created-1' } });
  return {
    mockCallable:              callable,
    mockCollection:            vi.fn(() => ({ kind: 'collection' })),
    mockCreateManualTransactionWithHistory: vi.fn().mockResolvedValue('tx-created-1'),
    mockDeleteBatchTransactionsWithHistory: vi.fn().mockResolvedValue(undefined),
    mockDoc:                   vi.fn(),
    mockGetDoc:                vi.fn().mockResolvedValue({ exists: () => false, data: () => undefined }),
    mockHttpsCallable:         vi.fn(() => callable),
    mockLimit:                 vi.fn((count: number) => ({ kind: 'limit', count })),
    mockLogAction:             vi.fn(),
    mockLogTransactionHistory: vi.fn(),
    mockOnSnapshot:            vi.fn(),
    mockOrderBy:               vi.fn((field: string, direction: string) => ({ kind: 'orderBy', field, direction })),
    mockQuery:                 vi.fn(() => ({ kind: 'query' })),
    mockSoftDeleteTransactionWithHistory: vi.fn().mockResolvedValue(undefined),
    mockStartAfter:            vi.fn(),
    mockUpdateTransactionWithHistory: vi.fn().mockResolvedValue(undefined),
    mockBatchUpdateTransactionsWithHistory: vi.fn().mockResolvedValue(undefined),
    mockBatchUndoBulkUpdateTransactionsWithHistory: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('firebase/firestore', () => ({
  collection: mockCollection,
  doc:        mockDoc,
  getDoc:     mockGetDoc,
  getDocs:    vi.fn(),
  limit:      mockLimit,
  onSnapshot: mockOnSnapshot,
  orderBy:    mockOrderBy,
  query:      mockQuery,
  startAfter: mockStartAfter,
  where:      vi.fn((field: string, op: string, val: string) => ({ kind: 'where', field, op, val })),
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
    updateTransactionWithHistory: mockUpdateTransactionWithHistory,
    softDeleteTransactionWithHistory: mockSoftDeleteTransactionWithHistory,
    deleteBatchTransactionsWithHistory: mockDeleteBatchTransactionsWithHistory,
    batchUpdateTransactionsWithHistory: mockBatchUpdateTransactionsWithHistory,
    batchUndoBulkUpdateTransactionsWithHistory: mockBatchUndoBulkUpdateTransactionsWithHistory,
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

describe('useTransactions - criação manual Blaze via callable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    let generatedTxId = 0;
    mockDoc.mockImplementation((_parent: unknown, explicitId?: string) => ({
      kind: 'doc',
      id: explicitId ?? `tx-reserved-${++generatedTxId}`,
    }));
    mockCallable.mockResolvedValue({ data: { id: 'tx-created-1' } });
    mockLogAction.mockResolvedValue(undefined);
    mockLogTransactionHistory.mockResolvedValue(undefined);
    mockOnSnapshot.mockImplementation((_queryArg: unknown, onNext: (snap: { docs: never[] }) => void) => {
      onNext({ docs: [] });
      return vi.fn();
    });
  });

  it('chama o callable createTransaction e não chama createManualTransactionWithHistory', async () => {
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

    expect(mockHttpsCallable).toHaveBeenCalledWith(
      expect.anything(),
      'createTransaction',
    );
    expect(mockCallable).toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'Café manual',
        value_cents: 1234,
        type:        'saida',
        category:    'Alimentação',
        date:        '2026-05-05',
        source:      'manual',
      }),
    );
    expect(mockCreateManualTransactionWithHistory).not.toHaveBeenCalled();

    const [callPayload] = mockCallable.mock.calls[0] as [Record<string, unknown>];
    expect(callPayload).not.toHaveProperty('id');
    expect(callPayload).not.toHaveProperty('uid');
    expect(callPayload).not.toHaveProperty('importHash');
    expect(callPayload).not.toHaveProperty('value');

    unmount();
  });

  it('reusa o mesmo txId otimista e chama callable novamente no retry', async () => {
    const transientError = Object.assign(new Error('network timeout'), {
      code: 'unavailable',
    });
    mockCallable.mockRejectedValueOnce(transientError);
    mockCallable.mockResolvedValueOnce({ data: { id: 'tx-created-1' } });
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

    await waitFor(() => expect(mockCallable).toHaveBeenCalledTimes(1));
    // O item otimista reservado uma única vez
    expect(mockDoc).toHaveBeenCalledTimes(1);

    await act(async () => {
      window.dispatchEvent(new Event('online'));
      await Promise.resolve();
    });

    await expect(addPromise).resolves.toBe('tx-created-1');
    await waitFor(() => expect(mockCallable).toHaveBeenCalledTimes(2));
    expect(mockCreateManualTransactionWithHistory).not.toHaveBeenCalled();

    unmount();
  });

  it('não chama logTransactionHistory para CREATE — callable escreve history server-side', async () => {
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

    const createCalls = mockLogTransactionHistory.mock.calls.filter(
      (c) => (c[2] as { action: string }).action === 'CREATE',
    );
    expect(createCalls).toHaveLength(0);

    unmount();
  });

  it('remove o item otimista quando o callable falha permanentemente', async () => {
    const permissionError = Object.assign(new Error('permission denied'), {
      code: 'permission-denied',
    });
    mockCallable.mockRejectedValueOnce(permissionError);
    const { result, unmount } = renderHook(() => useTransactions('uid-1'));

    await act(async () => {
      await expect(result.current.add({
        description: 'Café manual',
        value_cents: 1234 as Centavos,
        type:        'saida',
        category:    'Alimentação',
        date:        '2026-05-05',
        source:      'manual',
      })).rejects.toThrow('Não foi possível concluir a operação porque as regras de segurança bloquearam a alteração');
    });

    await waitFor(() => expect(result.current.transactions).toHaveLength(0));
    expect(mockCallable).toHaveBeenCalledTimes(1);

    unmount();
  });

  it('remove importHash apenas do payload sanitizado para history', () => {
    const importHash = 'a'.repeat(64);
    const transactionWithTrace = {
      id:            'tx-imported-1',
      uid:           'uid-1',
      value:         123.45,
      importHash,
      correlationId: 'op_safe_history_01',
      description:   'Compra importada',
      value_cents:   12345 as Centavos,
      schemaVersion: 2,
      type:          'saida',
      category:      'Alimentação',
      date:          '2026-05-05',
      source:        'csv',
      fitId:         'fit-123',
      tags:          ['cartao'],
    } as Parameters<typeof sanitizeForHistory>[0] & { correlationId: string };
    const sanitized = sanitizeForHistory(transactionWithTrace);

    expect(sanitized).not.toHaveProperty('id');
    expect(sanitized).not.toHaveProperty('uid');
    expect(sanitized).not.toHaveProperty('value');
    expect(sanitized).not.toHaveProperty('importHash');
    expect(sanitized).not.toHaveProperty('correlationId');
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
      expect(mockUpdateTransactionWithHistory).toHaveBeenCalledWith(
        'uid-1',
        'tx-created-1',
        expect.objectContaining({ category: 'Transporte' }),
        expect.objectContaining({
          origin:        'ai',
          before:        { category: 'Outros' },
          after:         { category: 'Transporte' },
          changedFields: ['category'],
        }),
      ),
    );
    expect(mockLogTransactionHistory).not.toHaveBeenCalled();

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
    for (const forbidden of ['id', 'uid', 'value', 'importHash', '_lastOpId', 'correlationId']) {
      expect(historyEvent.before).not.toHaveProperty(forbidden);
      expect(historyEvent.after).not.toHaveProperty(forbidden);
    }
    expect(mockLogTransactionHistory).not.toHaveBeenCalled();

    unmount();
  });

  it('editar categoria no fluxo real usa history pareado, payload mínimo e snapshots sanitizados', async () => {
    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({
        id:          'tx-1',
        uid:         'uid-1',
        value:       10,
        importHash:  'x'.repeat(64),
        _lastOpId:   'op-anterior',
        correlationId: 'op_anterior_safe_01',
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
    });

    const { result, unmount } = renderHook(() => useTransactions('uid-1'));
    await waitFor(() => expect(result.current.transactions).toHaveLength(1));

    await act(async () => {
      await result.current.update('tx-1', { category: 'Lazer' });
    });

    await waitFor(() => expect(mockUpdateTransactionWithHistory).toHaveBeenCalledTimes(1));

    const [, , writeData, historyEvent] = mockUpdateTransactionWithHistory.mock.calls[0] as [
      string,
      string,
      Record<string, unknown>,
      {
        before: Record<string, unknown>;
        after: Record<string, unknown>;
        changedFields: string[];
        amount_cents?: number;
        category?: string;
      },
    ];

    expect(writeData).toEqual(expect.objectContaining({
      category: 'Lazer',
      schemaVersion: 2,
      type: 'saida',
      source: 'manual',
      value_cents: 1000,
    }));
    expect(writeData).not.toHaveProperty('description');
    expect(writeData).not.toHaveProperty('date');
    for (const forbidden of ['id', 'uid', 'value', 'importHash', '_lastOpId', 'correlationId']) {
      expect(writeData).not.toHaveProperty(forbidden);
      expect(historyEvent.before).not.toHaveProperty(forbidden);
      expect(historyEvent.after).not.toHaveProperty(forbidden);
    }
    expect(historyEvent.changedFields).toEqual(['category']);
    expect(historyEvent.amount_cents).toBe(1000);
    expect(historyEvent.category).toBe('Lazer');
    expect(mockLogTransactionHistory).not.toHaveBeenCalled();

    unmount();
  });

  it('Modelo A: update sem previous faz getDoc e ignora quando doc não existe', async () => {
    mockGetDoc.mockResolvedValueOnce({ exists: () => false, data: () => undefined });

    const { result, unmount } = renderHook(() => useTransactions('uid-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.update('tx-unknown', { description: 'Fallback' });
    });

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

    expect(mockLogTransactionHistory).not.toHaveBeenCalled();

    unmount();
  });

  it('normaliza type e source de transações legadas durante o update', async () => {
    const legacyTxDoc = {
      id: 'tx-legacy',
      data: () => ({
        id:          'tx-legacy',
        uid:         'uid-1',
        description: 'Legacy item',
        value_cents: 5000,
        type:        'DESPESA', // legada (caixa alta)
        source:      'INVALID_SRC', // inválida
        schemaVersion: 1,
        createdAt:   1000,
        updatedAt:   1000,
      }),
    };

    mockOnSnapshot.mockImplementationOnce((_queryArg: unknown, onNext: (snap: { docs: unknown[] }) => void) => {
      onNext({ docs: [legacyTxDoc] });
      return vi.fn();
    });

    const { result, unmount } = renderHook(() => useTransactions('uid-1'));
    await waitFor(() => expect(result.current.transactions).toHaveLength(1));

    await act(async () => {
      await result.current.update('tx-legacy', { category: 'Lazer' });
    });

    await waitFor(() => expect(mockUpdateTransactionWithHistory).toHaveBeenCalledWith(
      'uid-1',
      'tx-legacy',
      expect.objectContaining({ category: 'Lazer' }),
      expect.objectContaining({
        // O hook deve enviar os campos normalizados baseados no snapshot legado
        before: expect.objectContaining({
          type: 'DESPESA',
          source: 'INVALID_SRC',
        }),
      })
    ));

    const [,, writeData] = mockUpdateTransactionWithHistory.mock.calls[0] as [
      string,
      string,
      Record<string, unknown>,
      Record<string, unknown>
    ];
    // O writeData deve conter type normalizado para 'saida' e source para 'manual' (reparo de inválido presente)
    expect(writeData.type).toBe('saida');
    expect(writeData.source).toBe('manual');
    expect(writeData.schemaVersion).toBe(2);

    unmount();
  });

  it('não deriva value_cents de value legado durante o update', async () => {
    const incompleteTxDoc = {
      id: 'tx-incomplete',
      data: () => ({
        id:          'tx-incomplete',
        uid:         'uid-1',
        description: 'Incomplete item',
        value:       99.99, // Legado
        // value_cents ausente ou inválido
        type:        'saida',
        category:    'Outros',
        date:        '2026-05-01',
        source:      'manual',
        schemaVersion: 1,
      }),
    };

    mockOnSnapshot.mockImplementationOnce((_queryArg: unknown, onNext: (snap: { docs: unknown[] }) => void) => {
      onNext({ docs: [incompleteTxDoc] });
      return vi.fn();
    });

    const { result, unmount } = renderHook(() => useTransactions('uid-1'));
    await waitFor(() => expect(result.current.transactions).toHaveLength(1));

    await act(async () => {
      await result.current.update('tx-incomplete', { category: 'Lazer' });
    });

    await waitFor(() => expect(mockUpdateTransactionWithHistory).toHaveBeenCalled());

    const [,, writeData] = mockUpdateTransactionWithHistory.mock.calls[0] as [
      string,
      string,
      Record<string, unknown>,
      Record<string, unknown>
    ];

    // O writeData NÃO deve conter value_cents derivado de value
    expect(writeData).not.toHaveProperty('value_cents');
    expect(writeData.category).toBe('Lazer');
    expect(writeData.schemaVersion).toBe(2);

    unmount();
  });

  it('não inventa type, date ou description se estiverem ausentes no snapshot', async () => {
    const brokenTxDoc = {
      id: 'tx-broken',
      data: () => ({
        id:          'tx-broken',
        uid:         'uid-1',
        // type, date, description ausentes
        category:    'Outros',
        schemaVersion: 1,
      }),
    };

    mockOnSnapshot.mockImplementationOnce((_queryArg: unknown, onNext: (snap: { docs: unknown[] }) => void) => {
      onNext({ docs: [brokenTxDoc] });
      return vi.fn();
    });

    const { result, unmount } = renderHook(() => useTransactions('uid-1'));
    await waitFor(() => expect(result.current.transactions).toHaveLength(1));

    await act(async () => {
      await result.current.update('tx-broken', { category: 'Saúde' });
    });

    await waitFor(() => expect(mockUpdateTransactionWithHistory).toHaveBeenCalled());

    const [,, writeData] = mockUpdateTransactionWithHistory.mock.calls[0] as [
      string,
      string,
      Record<string, unknown>,
      Record<string, unknown>
    ];

    expect(writeData).not.toHaveProperty('type');
    expect(writeData).not.toHaveProperty('date');
    expect(writeData).not.toHaveProperty('description');
    expect(writeData.category).toBe('Saúde');
    expect(writeData.schemaVersion).toBe(2);

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
    for (const forbidden of ['id', 'uid', 'value', 'importHash', '_lastOpId', 'correlationId']) {
      expect(historyEvent.before).not.toHaveProperty(forbidden);
    }
    expect(mockLogTransactionHistory).not.toHaveBeenCalled();

    unmount();
  });

  it('Modelo A: delete sem previous faz getDoc e ignora quando doc não existe', async () => {
    mockGetDoc.mockResolvedValueOnce({ exists: () => false, data: () => undefined });

    const { result, unmount } = renderHook(() => useTransactions('uid-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.remove('tx-unknown');
    });

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

    expect(mockLogTransactionHistory).not.toHaveBeenCalled();

    unmount();
  });
});

describe('useTransactions - removeBatch com batch + history', () => {
  const transactionA = {
    id: 'tx-a',
    description: 'Compra A',
    value_cents: 1000,
    category: 'Lazer',
    type: 'saida',
    date: '2026-05-12',
    source: 'manual',
    schemaVersion: 2,
  };
  const transactionB = {
    id: 'tx-b',
    description: 'Compra B',
    value_cents: 2000,
    category: 'Saúde',
    type: 'saida',
    date: '2026-05-12',
    source: 'manual',
    schemaVersion: 2,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockDeleteBatchTransactionsWithHistory.mockResolvedValue(undefined);
    mockLogTransactionHistory.mockResolvedValue(undefined);
    mockOnSnapshot.mockImplementation((_queryArg: unknown, onNext: (snap: { docs: unknown[] }) => void) => {
      onNext({ docs: [
        { id: 'tx-a', data: () => transactionA },
        { id: 'tx-b', data: () => transactionB },
      ] });
      return vi.fn();
    });
  });

  it('chama deleteBatchTransactionsWithHistory quando previousBatch existe e não chama logTransactionHistory', async () => {
    const { result, unmount } = renderHook(() => useTransactions('uid-1'));
    await waitFor(() => expect(result.current.transactions).toHaveLength(2));

    await act(async () => {
      await result.current.removeBatch(['tx-a', 'tx-b']);
    });

    await waitFor(() => expect(mockDeleteBatchTransactionsWithHistory).toHaveBeenCalledWith(
      'uid-1',
      expect.arrayContaining([
        expect.objectContaining({ id: 'tx-a' }),
        expect.objectContaining({ id: 'tx-b' }),
      ]),
    ));

    expect(mockLogTransactionHistory).not.toHaveBeenCalled();

    unmount();
  });

  it('Modelo A: deleteBatch sem previousBatch faz getDoc e ignora quando docs não existem', async () => {
    mockGetDoc.mockResolvedValue({ exists: () => false, data: () => undefined });

    const { result, unmount } = renderHook(() => useTransactions('uid-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.removeBatch(['tx-unknown-1', 'tx-unknown-2']);
    });

    expect(mockDeleteBatchTransactionsWithHistory).not.toHaveBeenCalled();
    expect(mockLogTransactionHistory).not.toHaveBeenCalled();

    unmount();
  });

  it('restaura o estado otimista quando deleteBatchTransactionsWithHistory falha', async () => {
    mockDeleteBatchTransactionsWithHistory.mockRejectedValueOnce(new Error('invalid operation'));

    const { result, unmount } = renderHook(() => useTransactions('uid-1'));
    await waitFor(() => expect(result.current.transactions).toHaveLength(2));

    await act(async () => {
      await result.current.removeBatch(['tx-a', 'tx-b']);
    });

    unmount();
  });
});

describe('useTransactions - bulkUpdateTransactions com batch + history', () => {
  const transactionA = {
    id: 'tx-a',
    uid: 'forged-uid',
    description: 'Compra A',
    value: 10,
    value_cents: 1000,
    importHash: 'x'.repeat(64),
    category: 'Lazer',
    type: 'saida',
    date: '2026-05-12',
    source: 'manual',
    schemaVersion: 2,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockLogAction.mockResolvedValue(undefined);
    mockLogTransactionHistory.mockResolvedValue(undefined);
    mockBatchUpdateTransactionsWithHistory.mockResolvedValue(undefined);
    mockBatchUndoBulkUpdateTransactionsWithHistory.mockResolvedValue(undefined);
    mockOnSnapshot.mockImplementation((_queryArg: unknown, onNext: (snap: { docs: unknown[] }) => void) => {
      onNext({ docs: [{ id: 'tx-a', data: () => transactionA }] });
      return vi.fn();
    });
  });

  it('chama batchUpdateTransactionsWithHistory quando snapshot existe e não chama logTransactionHistory', async () => {
    const { result, unmount } = renderHook(() => useTransactions('uid-1'));
    await waitFor(() => expect(result.current.transactions).toHaveLength(1));

    await act(async () => {
      await result.current.bulkUpdateTransactions(['tx-a'], { category: 'Alimentação' });
    });

    await waitFor(() => expect(mockBatchUpdateTransactionsWithHistory).toHaveBeenCalledWith(
      'uid-1',
      expect.arrayContaining([
        expect.objectContaining({
          id: 'tx-a',
          oldCategory: 'Lazer',
          before: expect.objectContaining({
            category: 'Lazer',
            value_cents: 1000,
          }),
        })
      ]),
      { category: 'Alimentação' },
      expect.stringMatching(/^[A-Za-z0-9_-]{16,80}$/)
    ));

    const [, snapshot, , correlationId] = mockBatchUpdateTransactionsWithHistory.mock.calls[0] as [
      string,
      Array<{ before?: Record<string, unknown> }>,
      Record<string, unknown>,
      string,
    ];
    expect(correlationId).toMatch(/^bulk_[A-Za-z0-9_-]{12,76}$/);
    const before = snapshot[0]?.before;
    expect(before).toEqual(expect.objectContaining({
      category: 'Lazer',
      value_cents: 1000,
      description: 'Compra A',
    }));
    for (const forbidden of ['id', 'uid', 'value', 'importHash', '_lastOpId', 'correlationId']) {
      expect(before).not.toHaveProperty(forbidden);
    }

    expect(mockLogTransactionHistory).not.toHaveBeenCalled();
    expect(mockLogAction).toHaveBeenCalledWith(expect.objectContaining({ action: 'BULK_UPDATE' }));

    unmount();
  });

  it('Modelo A: bulkUpdate sem snapshot faz getDoc e ignora quando doc não existe', async () => {
    mockGetDoc.mockResolvedValueOnce({ exists: () => false, data: () => undefined });

    const { result, unmount } = renderHook(() => useTransactions('uid-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.bulkUpdateTransactions(['tx-unknown'], { category: 'Alimentação' });
    });

    expect(mockBatchUpdateTransactionsWithHistory).not.toHaveBeenCalled();
    expect(mockLogTransactionHistory).not.toHaveBeenCalled();

    unmount();
  });

  it('Modelo A: orphan doc existe sem value_cents — deleta value_cents do before (linha 1019)', async () => {
    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({
        description: 'Legado sem cents',
        category: 'Outros',
        type: 'saida',
        date: '2026-01-01',
        source: 'manual',
        schemaVersion: 2,
        // sem value_cents propositalmente
      }),
    });

    const { result, unmount } = renderHook(() => useTransactions('uid-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.bulkUpdateTransactions(['tx-orphan-no-cents'], { category: 'Alimentação' });
    });

    expect(mockBatchUpdateTransactionsWithHistory).toHaveBeenCalledOnce();
    const [, snap] = mockBatchUpdateTransactionsWithHistory.mock.calls[0] as [string, Array<{ before?: Record<string, unknown> }>];
    expect(snap[0]?.before).not.toHaveProperty('value_cents');

    unmount();
  });

  it('Modelo A: orphan doc existe + updates sem category — não define newCategory (linha 1021)', async () => {
    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({
        description: 'Orphan sem category update',
        category: 'Lazer',
        type: 'saida',
        date: '2026-01-01',
        source: 'manual',
        schemaVersion: 2,
        value_cents: 500,
      }),
    });

    const { result, unmount } = renderHook(() => useTransactions('uid-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    // bulkUpdate sem campo category → item.newCategory não deve ser definido
    await act(async () => {
      await result.current.bulkUpdateTransactions(['tx-orphan-no-cat'], {});
    });

    expect(mockBatchUpdateTransactionsWithHistory).toHaveBeenCalledOnce();
    const [, snap] = mockBatchUpdateTransactionsWithHistory.mock.calls[0] as [string, Array<{ newCategory?: string }>];
    expect(snap[0]).not.toHaveProperty('newCategory');

    unmount();
  });

  it('restaura o estado otimista quando batchUpdateTransactionsWithHistory falha', async () => {
    mockBatchUpdateTransactionsWithHistory.mockRejectedValueOnce(new Error('invalid operation'));

    const { result, unmount } = renderHook(() => useTransactions('uid-1'));
    await waitFor(() => expect(result.current.transactions).toHaveLength(1));

    await act(async () => {
      await expect(result.current.bulkUpdateTransactions(['tx-a'], { category: 'Erro' })).rejects.toThrow();
    });

    await waitFor(() => {
      expect(result.current.transactions[0]?.category).toBe('Lazer');
    });

    unmount();
  });

  it('undoLastBulkUpdate chama helper atômico e não chama logTransactionHistory por item', async () => {
    const { result, unmount } = renderHook(() => useTransactions('uid-1'));
    await waitFor(() => expect(result.current.transactions).toHaveLength(1));

    await act(async () => {
      await result.current.bulkUpdateTransactions(['tx-a'], { category: 'Alimentação' });
    });

    await waitFor(() => expect(result.current.hasUndoSnapshot).toBe(true));

    await act(async () => {
      await result.current.undoLastBulkUpdate();
    });

    await waitFor(() => expect(mockBatchUndoBulkUpdateTransactionsWithHistory).toHaveBeenCalledWith(
      'uid-1',
      expect.arrayContaining([
        expect.objectContaining({
          id: 'tx-a',
          oldCategory: 'Lazer',
          newCategory: 'Alimentação',
          before: expect.objectContaining({
            category: 'Lazer',
            value_cents: 1000,
          }),
        }),
      ]),
      expect.stringMatching(/^[A-Za-z0-9_-]{16,80}$/),
    ));

    const [, snapshot, correlationId] = mockBatchUndoBulkUpdateTransactionsWithHistory.mock.calls[0] as [
      string,
      Array<{ before?: Record<string, unknown> }>,
      string,
    ];
    expect(correlationId).toMatch(/^undo_[A-Za-z0-9_-]{11,75}$/);
    const before = snapshot[0]?.before;
    expect(before).toEqual(expect.objectContaining({
      category: 'Lazer',
      value_cents: 1000,
      description: 'Compra A',
    }));
    for (const forbidden of ['id', 'uid', 'value', 'importHash', '_lastOpId', 'correlationId']) {
      expect(before).not.toHaveProperty(forbidden);
    }

    expect(mockLogTransactionHistory).not.toHaveBeenCalled();
    expect(mockLogAction).toHaveBeenCalledWith(expect.objectContaining({ action: 'UNDO_BULK_UPDATE' }));
    expect(result.current.hasUndoSnapshot).toBe(false);

    unmount();
  });

  it('undoLastBulkUpdate sem snapshot não faz writes', async () => {
    const { result, unmount } = renderHook(() => useTransactions('uid-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.undoLastBulkUpdate();
    });

    expect(mockBatchUndoBulkUpdateTransactionsWithHistory).not.toHaveBeenCalled();
    expect(mockLogAction).not.toHaveBeenCalled();
    expect(mockLogTransactionHistory).not.toHaveBeenCalled();

    unmount();
  });

  it('preserva snapshot e reseta flags quando helper de undo falha', async () => {
    const { result, unmount } = renderHook(() => useTransactions('uid-1'));
    await waitFor(() => expect(result.current.transactions).toHaveLength(1));

    await act(async () => {
      await result.current.bulkUpdateTransactions(['tx-a'], { category: 'Alimentação' });
    });

    await waitFor(() => expect(result.current.hasUndoSnapshot).toBe(true));
    mockLogAction.mockClear();
    mockLogTransactionHistory.mockClear();
    mockBatchUndoBulkUpdateTransactionsWithHistory.mockRejectedValueOnce(new Error('undo failed'));

    await act(async () => {
      await expect(result.current.undoLastBulkUpdate()).rejects.toThrow('undo failed');
    });

    expect(result.current.hasUndoSnapshot).toBe(true);
    expect(result.current.isUndoing).toBe(false);
    expect(mockLogAction).not.toHaveBeenCalled();
    expect(mockLogTransactionHistory).not.toHaveBeenCalled();

    mockBatchUndoBulkUpdateTransactionsWithHistory.mockResolvedValueOnce(undefined);
    await act(async () => {
      await result.current.undoLastBulkUpdate();
    });

    expect(mockBatchUndoBulkUpdateTransactionsWithHistory).toHaveBeenCalledTimes(2);
    expect(result.current.hasUndoSnapshot).toBe(false);

    unmount();
  });

  it('ignora uma segunda chamada enquanto o undo está em execução', async () => {
    const undoRef: { current?: () => Promise<void> } = {};
    mockBatchUndoBulkUpdateTransactionsWithHistory.mockImplementationOnce(async () => {
      await undoRef.current?.();
    });

    const { result, unmount } = renderHook(() => useTransactions('uid-1'));
    await waitFor(() => expect(result.current.transactions).toHaveLength(1));

    await act(async () => {
      await result.current.bulkUpdateTransactions(['tx-a'], { category: 'Alimentação' });
    });

    await waitFor(() => expect(result.current.hasUndoSnapshot).toBe(true));
    undoRef.current = result.current.undoLastBulkUpdate;

    await act(async () => {
      await result.current.undoLastBulkUpdate();
    });

    expect(mockBatchUndoBulkUpdateTransactionsWithHistory).toHaveBeenCalledTimes(1);
    expect(mockLogTransactionHistory).not.toHaveBeenCalled();

    unmount();
  });
});

// ── AI categorization atomic update ──────────────────────────────────────────
import { categorizeWithAI } from '../services/AICategorizationService';

describe('useTransactions - AI categorization usa updateTransactionWithHistory atômico', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDoc.mockImplementation((_parent: unknown, explicitId?: string) => ({
      kind: 'doc',
      id: explicitId ?? 'tx-created-ai',
    }));
    mockCreateManualTransactionWithHistory.mockResolvedValue('tx-created-ai');
    mockLogAction.mockResolvedValue(undefined);
    mockOnSnapshot.mockImplementation((_queryArg: unknown, onNext: (snap: { docs: never[] }) => void) => {
      onNext({ docs: [] });
      return vi.fn();
    });
  });

  it('após add sem categoria determinística, AI chama updateTransactionWithHistory com origin ai', async () => {
    const mockCategorize = vi.mocked(categorizeWithAI);
    mockCategorize.mockResolvedValueOnce('Alimentação');

    const { result, unmount } = renderHook(() => useTransactions('uid-1'));

    await act(async () => {
      await result.current.add({ description: 'Padaria Central', value_cents: 1500 as Centavos });
    });

    await waitFor(() => expect(mockUpdateTransactionWithHistory).toHaveBeenCalledTimes(1));

    expect(mockLogTransactionHistory).not.toHaveBeenCalled();

    const [, , updateData, historyEvent] = mockUpdateTransactionWithHistory.mock.calls[0] as [
      string, string, Record<string, unknown>, Record<string, unknown>
    ];

    expect(updateData).toEqual(expect.objectContaining({ category: 'Alimentação' }));
    expect(historyEvent['origin']).toBe('ai');
    expect(historyEvent['changedFields']).toEqual(['category']);
    expect(historyEvent['after']).toEqual(expect.objectContaining({ category: 'Alimentação' }));
    for (const forbidden of ['id', 'uid', 'value', 'importHash', '_lastOpId', 'correlationId']) {
      expect(historyEvent['before']).not.toHaveProperty(forbidden);
      expect(historyEvent['after']).not.toHaveProperty(forbidden);
    }

    unmount();
  });

  it('não chama updateTransactionWithHistory se aiCat === Outros', async () => {
    const mockCategorize = vi.mocked(categorizeWithAI);
    mockCategorize.mockResolvedValueOnce('Outros');

    const { result, unmount } = renderHook(() => useTransactions('uid-1'));

    await act(async () => {
      await result.current.add({ description: 'Compra genérica', value_cents: 500 as Centavos });
    });

    await new Promise(r => setTimeout(r, 50));

    expect(mockUpdateTransactionWithHistory).not.toHaveBeenCalled();

    unmount();
  });

  it('não dispara IA se categoria determinística já foi definida', async () => {
    const mockCategorize = vi.mocked(categorizeWithAI);

    const { result, unmount } = renderHook(() => useTransactions('uid-1'));

    await act(async () => {
      await result.current.add({ description: 'Mercado', category: 'Alimentação', value_cents: 800 as Centavos });
    });

    await new Promise(r => setTimeout(r, 50));

    expect(mockCategorize).not.toHaveBeenCalled();
    expect(mockUpdateTransactionWithHistory).not.toHaveBeenCalled();

    unmount();
  });
});

// ─── SnapshotWindow ────────────────────────────────────────────────────────────

describe('useTransactions — SnapshotWindow', () => {
  beforeEach(() => {
    mockQuery.mockClear();
    mockOrderBy.mockClear();
    mockOnSnapshot.mockReset();
    mockOnSnapshot.mockReturnValue(() => {});
  });

  it('sem snapshotWindow usa orderBy("createdAt") — comportamento padrão', () => {
    const { unmount } = renderHook(() => useTransactions('uid-1'));

    const createdAtCall = mockOrderBy.mock.calls.find(
      (args: unknown[]) => args[0] === 'createdAt',
    );
    expect(createdAtCall).toBeDefined();
    unmount();
  });

  it('com snapshotWindow usa orderBy("date", "desc")', () => {
    const { unmount } = renderHook(() =>
      useTransactions('uid-1', [], { dateFrom: '2026-06-01', dateTo: '2026-06-30' }),
    );

    const dateCall = mockOrderBy.mock.calls.find(
      (args: unknown[]) => args[0] === 'date',
    );
    expect(dateCall).toBeDefined();
    expect(dateCall?.[1]).toBe('desc');
    unmount();
  });

  it('com snapshotWindow query recebe cláusulas where de intervalo de datas', () => {
    // mockQuery recebe os args da query — incluindo os objetos retornados por where()
    // O mock de where retorna { kind: 'where', field, op, val }
    const { unmount } = renderHook(() =>
      useTransactions('uid-1', [], { dateFrom: '2026-06-01', dateTo: '2026-06-30' }),
    );

    // query foi chamada com os argumentos construídos pela hook
    const queryArgs: unknown[] = mockQuery.mock.calls.flat();

    // Deve conter cláusula where para dateFrom
    const hasDateFrom = queryArgs.some(
      (a: unknown) =>
        typeof a === 'object' && a !== null &&
        (a as Record<string, unknown>)['kind'] === 'where' &&
        (a as Record<string, unknown>)['field'] === 'date' &&
        (a as Record<string, unknown>)['op'] === '>=' &&
        (a as Record<string, unknown>)['val'] === '2026-06-01',
    );
    const hasDateTo = queryArgs.some(
      (a: unknown) =>
        typeof a === 'object' && a !== null &&
        (a as Record<string, unknown>)['kind'] === 'where' &&
        (a as Record<string, unknown>)['field'] === 'date' &&
        (a as Record<string, unknown>)['op'] === '<=' &&
        (a as Record<string, unknown>)['val'] === '2026-06-30',
    );

    expect(hasDateFrom).toBe(true);
    expect(hasDateTo).toBe(true);
    unmount();
  });

  it('sem snapshotWindow query NÃO usa where de data', () => {
    const { unmount } = renderHook(() => useTransactions('uid-1'));

    const queryArgs: unknown[] = mockQuery.mock.calls.flat();
    const hasDateWhere = queryArgs.some(
      (a: unknown) =>
        typeof a === 'object' && a !== null &&
        (a as Record<string, unknown>)['kind'] === 'where' &&
        (a as Record<string, unknown>)['field'] === 'date',
    );
    expect(hasDateWhere).toBe(false);
    unmount();
  });

  it('com snapshotWindow hasMoreTransactions é sempre false', () => {
    const { result, unmount } = renderHook(() =>
      useTransactions('uid-1', [], { dateFrom: '2026-06-01', dateTo: '2026-06-30' }),
    );
    expect(result.current.hasMoreTransactions).toBe(false);
    unmount();
  });

  it('com snapshotWindow loadMoreTransactions é noop que resolve sem erro', async () => {
    const { result, unmount } = renderHook(() =>
      useTransactions('uid-1', [], { dateFrom: '2026-06-01', dateTo: '2026-06-30' }),
    );

    await act(async () => {
      await expect(result.current.loadMoreTransactions()).resolves.toBeUndefined();
    });

    unmount();
  });
});
