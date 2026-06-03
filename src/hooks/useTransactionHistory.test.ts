import { renderHook, waitFor } from '@testing-library/react';
import { mapTransactionHistoryDoc } from './useTransactionHistory';
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

  it('callback de erro com instância Error propaga message', async () => {
    mockOnSnapshot.mockImplementation((_q, _onNext, onError) => {
      onError(new Error('permission-denied'));
      return vi.fn();
    });

    const { result } = renderHook(() => useTransactionHistory('uid-1', 'tx-1'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('permission-denied');
    expect(result.current.events).toEqual([]);
  });

  it('callback de erro com não-Error usa mensagem padrão', async () => {
    mockOnSnapshot.mockImplementation((_q, _onNext, onError) => {
      onError('string error');
      return vi.fn();
    });

    const { result } = renderHook(() => useTransactionHistory('uid-1', 'tx-1'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('Falha ao carregar histórico da movimentação.');
  });
});

// ─── Suite: mapTransactionHistoryDoc ──────────────────────────────────────────

describe('mapTransactionHistoryDoc', () => {
  function mkDoc(data: Record<string, unknown>) {
    return { id: 'hist-1', data: () => data };
  }

  it('campos opcionais reason, correlationId, importHash presentes', () => {
    const event = mapTransactionHistoryDoc(mkDoc({
      action: 'UPDATE',
      txId: 'tx-1',
      reason: 'correção manual',
      correlationId: 'op_safe123456789012',
      importHash: 'a'.repeat(64),
      createdAt: { toMillis: () => 5000 },
      schemaVersion: 1,
    }));
    expect(event.reason).toBe('correção manual');
    expect(event.correlationId).toBe('op_safe123456789012');
    expect(event.importHash).toBe('a'.repeat(64));
  });

  it('campos opcionais ausentes não são adicionados ao evento', () => {
    const event = mapTransactionHistoryDoc(mkDoc({
      action: 'CREATE',
      txId: 'tx-2',
      createdAt: { toMillis: () => 1000 },
    }));
    expect(event).not.toHaveProperty('reason');
    expect(event).not.toHaveProperty('correlationId');
    expect(event).not.toHaveProperty('importHash');
    expect(event).not.toHaveProperty('before');
    expect(event).not.toHaveProperty('after');
    expect(event).not.toHaveProperty('changedFields');
  });

  it('action ausente usa DEFAULT_ACTION (UPDATE)', () => {
    const event = mapTransactionHistoryDoc(mkDoc({ txId: 'tx-3', createdAt: 0 }));
    expect(event.action).toBe('UPDATE');
  });

  it('safeTimestamp com Date object', () => {
    const date = new Date('2026-01-01T00:00:00Z');
    const event = mapTransactionHistoryDoc(mkDoc({ action: 'CREATE', txId: 'tx-4', createdAt: date }));
    expect(event.timestamp).toBe(date.getTime());
  });

  it('safeTimestamp com number', () => {
    const event = mapTransactionHistoryDoc(mkDoc({ action: 'CREATE', txId: 'tx-5', createdAt: 9999 }));
    expect(event.timestamp).toBe(9999);
  });

  it('safeTimestamp com string ISO', () => {
    const event = mapTransactionHistoryDoc(mkDoc({ action: 'CREATE', txId: 'tx-6', createdAt: '2026-01-01T00:00:00Z' }));
    expect(event.timestamp).toBeGreaterThan(0);
  });

  it('safeTimestamp com valor inválido retorna 0', () => {
    const event = mapTransactionHistoryDoc(mkDoc({ action: 'CREATE', txId: 'tx-7', createdAt: null }));
    expect(event.timestamp).toBe(0);
  });

  it('before/after com array não são mapeados como record', () => {
    const event = mapTransactionHistoryDoc(mkDoc({ action: 'UPDATE', txId: 'tx-8', before: [1, 2], after: null }));
    expect(event).not.toHaveProperty('before');
    expect(event).not.toHaveProperty('after');
  });

  it('changedFields com array misto filtra apenas strings', () => {
    const event = mapTransactionHistoryDoc(mkDoc({
      action: 'UPDATE', txId: 'tx-9',
      changedFields: ['category', 42, null, 'value_cents'],
    }));
    expect(event.changedFields).toEqual(['category', 'value_cents']);
  });

  it('changedFields com array vazio ou só não-strings não é adicionado', () => {
    const event = mapTransactionHistoryDoc(mkDoc({ action: 'UPDATE', txId: 'tx-10', changedFields: [42, null] }));
    expect(event).not.toHaveProperty('changedFields');
  });
});
