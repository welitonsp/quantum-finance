import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockBatchCommit,
  mockBatchDelete,
  mockBatchSet,
  mockBatchUpdate,
  mockCollection,
  mockDoc,
  mockGenerateSafeOperationId,
  mockGetDoc,
  mockOnSnapshot,
  mockQuery,
  mockServerTimestamp,
  mockWriteBatch,
} = vi.hoisted(() => {
  let generatedAccountId = 0;

  const getPath = (value: unknown): string => {
    if (value && typeof value === 'object' && 'path' in value && typeof value.path === 'string') {
      return value.path;
    }
    return 'mock/path';
  };

  const mockBatchCommit = vi.fn().mockResolvedValue(undefined);
  const mockBatchDelete = vi.fn();
  const mockBatchSet = vi.fn();
  const mockBatchUpdate = vi.fn();

  return {
    mockBatchCommit,
    mockBatchDelete,
    mockBatchSet,
    mockBatchUpdate,
    mockCollection: vi.fn((_db: unknown, ...segments: string[]) => ({
      id:   segments[segments.length - 1] ?? 'collection',
      path: segments.join('/'),
    })),
    mockDoc: vi.fn((parentOrDb: unknown, ...segments: string[]) => {
      if (segments.length === 0) {
        const id = `account-created-${++generatedAccountId}`;
        return { id, path: `${getPath(parentOrDb)}/${id}` };
      }

      const id = segments[segments.length - 1] ?? 'doc-id';
      return { id, path: segments.join('/') };
    }),
    mockGenerateSafeOperationId: vi.fn(() => 'op_safe_accounts_0001'),
    mockGetDoc: vi.fn(),
    mockOnSnapshot: vi.fn(),
    mockQuery: vi.fn((ref: unknown) => ref),
    mockServerTimestamp: vi.fn(() => ({ _serverTimestamp: true })),
    mockWriteBatch: vi.fn(() => ({
      set:    mockBatchSet,
      update: mockBatchUpdate,
      delete: mockBatchDelete,
      commit: mockBatchCommit,
    })),
  };
});

vi.mock('firebase/firestore', () => ({
  collection:      mockCollection,
  doc:             mockDoc,
  getDoc:          mockGetDoc,
  onSnapshot:      mockOnSnapshot,
  query:           mockQuery,
  serverTimestamp: mockServerTimestamp,
  writeBatch:      mockWriteBatch,
}));

vi.mock('../shared/api/firebase/index', () => ({
  db: { _isMock: true },
  functions: { _isMock: true },
}));

vi.mock('../shared/lib/operationTrace', () => ({
  generateSafeOperationId: mockGenerateSafeOperationId,
}));

import {
  computeAccountChangedFields,
  normalizeBalance,
  sanitizeAccountForHistory,
  useAccounts,
} from './useAccounts';

function existingAccount(overrides: Record<string, unknown> = {}) {
  return {
    name:          'Conta Principal',
    type:          'corrente',
    balance:       150_050,
    schemaVersion: 2,
    createdAt:     { seconds: 1 },
    updatedAt:     { seconds: 1 },
    ...overrides,
  };
}

function existingSnap(data: Record<string, unknown> | undefined) {
  return {
    exists: () => data !== undefined,
    data:   () => data ?? {},
  };
}

function lastSetPayload(index: number): Record<string, unknown> {
  return (mockBatchSet.mock.calls[index] as [unknown, Record<string, unknown>])[1];
}

function lastUpdatePayload(index = 0): Record<string, unknown> {
  return (mockBatchUpdate.mock.calls[index] as [unknown, Record<string, unknown>])[1];
}

describe('normalizeBalance — tolerância de schema', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('schemaVersion: 2 → balance é centavos inteiros (passthrough)', () => {
    expect(normalizeBalance(150_050, 2)).toBe(150_050);   // R$ 1500,50
    expect(normalizeBalance(0, 2)).toBe(0);
    expect(normalizeBalance(-100_00, 2)).toBe(-10_000);   // R$ -100,00
  });

  it('schemaVersion: 2 com float (defensivo) → arredonda para inteiro', () => {
    expect(normalizeBalance(150_050.4, 2)).toBe(150_050);
    expect(normalizeBalance(150_050.6, 2)).toBe(150_051);
  });

  it('sem schemaVersion (legado) → trata como reais e converte para centavos', () => {
    expect(normalizeBalance(1500.50, undefined)).toBe(150_050);
    expect(normalizeBalance(0, undefined)).toBe(0);
    expect(normalizeBalance(-100, undefined)).toBe(-10_000);
  });

  it('schemaVersion: 1 ou outros valores → trata como legado', () => {
    expect(normalizeBalance(1500.50, 1)).toBe(150_050);
    expect(normalizeBalance(1500.50, null)).toBe(150_050);
    expect(normalizeBalance(1500.50, 'v1')).toBe(150_050);
  });

  it('valores inválidos → 0', () => {
    expect(normalizeBalance(NaN, 2)).toBe(0);
    expect(normalizeBalance(undefined, 2)).toBe(0);
    expect(normalizeBalance(null, 2)).toBe(0);
    expect(normalizeBalance('abc', 2)).toBe(0);
  });

  it('preserva sinal negativo em ambos os schemas', () => {
    expect(normalizeBalance(-50_025, 2)).toBe(-50_025);
    expect(normalizeBalance(-500.25, undefined)).toBe(-50_025);
  });
});

describe('accounts history helpers', () => {
  it('sanitiza snapshots sem uid/id/path/correlationId/_lastOpId', () => {
    expect(sanitizeAccountForHistory({
      ...existingAccount(),
      uid:           'uid-1',
      id:            'account-1',
      path:          'users/uid-1/accounts/account-1',
      correlationId: 'op_safe_accounts_0001',
      _lastOpId:     'op_safe_accounts_0001',
    })).toEqual(existingAccount());
  });

  it('calcula changedFields somente para campos financeiros/visíveis da conta', () => {
    expect(computeAccountChangedFields(
      existingAccount(),
      { ...existingAccount({ name: 'Nova Conta' }), updatedAt: { _serverTimestamp: true } },
    )).toEqual(['name']);
  });
});

describe('useAccounts — history Modelo A leve', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBatchCommit.mockResolvedValue(undefined);
    mockGenerateSafeOperationId.mockReturnValue('op_safe_accounts_0001');
    mockGetDoc.mockResolvedValue(existingSnap(existingAccount()));
    mockOnSnapshot.mockImplementation((_queryArg: unknown, onNext: (snap: { docs: never[] }) => void) => {
      onNext({ docs: [] });
      return vi.fn();
    });
  });

  it('cria conta com account + history CREATE no mesmo batch', async () => {
    const { result, unmount } = renderHook(() => useAccounts('uid-1'));

    let createdId = '';
    await act(async () => {
      createdId = await result.current.addAccount({
        name:    'Reserva',
        type:    'poupanca',
        balance: 100.25,
      });
    });

    expect(createdId).toBe('account-created-1');
    expect(mockWriteBatch).toHaveBeenCalledTimes(1);
    expect(mockBatchSet).toHaveBeenCalledTimes(2);
    expect(mockBatchCommit).toHaveBeenCalledTimes(1);

    const accountPayload = lastSetPayload(0);
    const historyPayload = lastSetPayload(1);

    expect(accountPayload).toEqual(expect.objectContaining({
      name:          'Reserva',
      type:          'poupanca',
      balance:       10025,
      schemaVersion: 2,
      createdAt:     { _serverTimestamp: true },
      updatedAt:     { _serverTimestamp: true },
    }));
    expect(accountPayload).not.toHaveProperty('correlationId');
    expect(accountPayload).not.toHaveProperty('_lastOpId');

    expect(historyPayload).toEqual(expect.objectContaining({
      action:        'CREATE',
      accountId:     'account-created-1',
      origin:        'manual',
      correlationId: 'op_safe_accounts_0001',
      schemaVersion: 1,
      after: expect.objectContaining({
        name:          'Reserva',
        type:          'poupanca',
        balance:       10025,
        schemaVersion: 2,
      }),
      changedFields: ['name', 'type', 'balance', 'schemaVersion'],
    }));
    expect(historyPayload['after']).not.toHaveProperty('correlationId');
    expect(historyPayload['after']).not.toHaveProperty('_lastOpId');

    unmount();
  });

  it('atualiza conta com _lastOpId técnico e history UPDATE sanitizado', async () => {
    const { result, unmount } = renderHook(() => useAccounts('uid-1'));

    await act(async () => {
      await result.current.updateAccount('account-1', { name: 'Conta Atualizada' });
    });

    expect(mockGetDoc).toHaveBeenCalledTimes(1);
    expect(mockBatchUpdate).toHaveBeenCalledTimes(1);
    expect(mockBatchSet).toHaveBeenCalledTimes(1);
    expect(mockBatchCommit).toHaveBeenCalledTimes(1);

    const updatePayload = lastUpdatePayload();
    expect(updatePayload).toEqual(expect.objectContaining({
      name:      'Conta Atualizada',
      updatedAt: { _serverTimestamp: true },
      _lastOpId: 'op_safe_accounts_0001',
    }));
    expect(updatePayload).not.toHaveProperty('correlationId');

    const historyPayload = lastSetPayload(0);
    expect(historyPayload).toEqual(expect.objectContaining({
      action:        'UPDATE',
      accountId:     'account-1',
      origin:        'manual',
      correlationId: 'op_safe_accounts_0001',
      before: expect.objectContaining({ name: 'Conta Principal' }),
      after:  expect.objectContaining({ name: 'Conta Atualizada' }),
      changedFields: ['name'],
    }));
    expect(historyPayload['before']).not.toHaveProperty('uid');
    expect(historyPayload['after']).not.toHaveProperty('correlationId');
    expect(historyPayload['after']).not.toHaveProperty('_lastOpId');

    unmount();
  });

  it('remove conta com history DELETE sanitizado no mesmo batch', async () => {
    const { result, unmount } = renderHook(() => useAccounts('uid-1'));

    await act(async () => {
      await result.current.removeAccount('account-1');
    });

    expect(mockBatchSet).toHaveBeenCalledTimes(1);
    expect(mockBatchDelete).toHaveBeenCalledTimes(1);
    expect(mockBatchCommit).toHaveBeenCalledTimes(1);

    const historyPayload = lastSetPayload(0);
    expect(historyPayload).toEqual(expect.objectContaining({
      action:        'DELETE',
      accountId:     'account-1',
      origin:        'manual',
      correlationId: 'op_safe_accounts_0001',
      before:        expect.objectContaining({ name: 'Conta Principal' }),
      changedFields: ['name', 'type', 'balance', 'schemaVersion'],
    }));
    expect(historyPayload).not.toHaveProperty('after');
    expect(historyPayload['before']).not.toHaveProperty('id');
    expect(historyPayload['before']).not.toHaveProperty('path');

    unmount();
  });

  it('não escreve history quando a conta não existe no update/delete', async () => {
    mockGetDoc.mockResolvedValue(existingSnap(undefined));
    const { result, unmount } = renderHook(() => useAccounts('uid-1'));

    await act(async () => {
      await result.current.updateAccount('account-missing', { name: 'Ignorada' });
      await result.current.removeAccount('account-missing');
    });

    expect(mockBatchSet).not.toHaveBeenCalled();
    expect(mockBatchUpdate).not.toHaveBeenCalled();
    expect(mockBatchDelete).not.toHaveBeenCalled();
    expect(mockBatchCommit).not.toHaveBeenCalled();

    unmount();
  });
});
