import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from 'firebase/auth';

const { mockSaveAll, mockToast, mockLog, mockGetMsg } = vi.hoisted(() => ({
  mockSaveAll: vi.fn(),
  mockToast: { loading: vi.fn(() => 'toast-id'), success: vi.fn(), error: vi.fn() },
  mockLog: vi.fn(),
  mockGetMsg: vi.fn(() => 'Erro genérico'),
}));

vi.mock('react-hot-toast', () => ({ default: mockToast }));
vi.mock('../shared/services/FirestoreService', () => ({
  FirestoreService: { saveAllTransactions: mockSaveAll },
}));
vi.mock('../shared/lib/firebaseErrorHandling', () => ({
  logSanitizedFirebaseError: mockLog,
  getUserFriendlyErrorMessage: mockGetMsg,
}));
vi.mock('../shared/lib/aiFeedbackToast', () => ({ showAIFeedbackBatch: vi.fn() }));

import { useImportActions } from './useImportActions';
import type { Transaction, ImportResult } from '../shared/types/transaction';

const user = { uid: 'u1' } as unknown as User;

function importResult(added: number): ImportResult {
  return { added, duplicates: 0, invalid: 0 };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockToast.loading.mockReturnValue('toast-id');
  mockGetMsg.mockReturnValue('Erro genérico');
});

describe('useImportActions', () => {
  it('user null: erro e retorna undefined sem salvar', async () => {
    const { result } = renderHook(() => useImportActions(null));
    const out = await result.current.handleImport([{ value: 10 } as Partial<Transaction>]);
    expect(out).toBeUndefined();
    expect(mockToast.error).toHaveBeenCalledWith('Ficheiro vazio ou dados corrompidos.');
    expect(mockSaveAll).not.toHaveBeenCalled();
  });

  it('array vazio: erro e retorna undefined sem salvar', async () => {
    const { result } = renderHook(() => useImportActions(user));
    const out = await result.current.handleImport([]);
    expect(out).toBeUndefined();
    expect(mockToast.error).toHaveBeenCalledWith('Ficheiro vazio ou dados corrompidos.');
    expect(mockSaveAll).not.toHaveBeenCalled();
  });

  it('importação bem-sucedida: salva com uid + dados mapeados e sinaliza sucesso', async () => {
    mockSaveAll.mockResolvedValue(importResult(2));
    const { result } = renderHook(() => useImportActions(user));

    const out = await result.current.handleImport([
      { value: 10 } as Partial<Transaction>,
      { value: 20 } as Partial<Transaction>,
    ]);

    expect(mockSaveAll).toHaveBeenCalledTimes(1);
    const [uidArg, dataArg] = mockSaveAll.mock.calls[0] as [string, Array<Partial<Transaction>>];
    expect(uidArg).toBe('u1');
    expect(dataArg).toHaveLength(2);
    expect(dataArg[0]!.value_cents).toBe(1000);
    expect(dataArg[0]!.schemaVersion).toBe(2);
    expect(dataArg[1]!.value_cents).toBe(2000);
    expect(mockToast.success).toHaveBeenCalledWith(
      '2 transações adicionadas ao cofre.',
      { id: 'toast-id' },
    );
    expect(out).toEqual(importResult(2));
  });

  it('mensagem singular quando apenas 1 adicionada', async () => {
    mockSaveAll.mockResolvedValue(importResult(1));
    const { result } = renderHook(() => useImportActions(user));
    await result.current.handleImport([{ value: 10 } as Partial<Transaction>]);
    expect(mockToast.success).toHaveBeenCalledWith(
      '1 transação adicionada ao cofre.',
      { id: 'toast-id' },
    );
  });

  it('preserva value_cents já presente (não recalcula por value)', async () => {
    mockSaveAll.mockResolvedValue(importResult(1));
    const { result } = renderHook(() => useImportActions(user));
    await result.current.handleImport([
      { value: 10, value_cents: 555 } as Partial<Transaction>,
    ]);
    const [, dataArg] = mockSaveAll.mock.calls[0] as [string, Array<Partial<Transaction>>];
    expect(dataArg[0]!.value_cents).toBe(555);
  });

  it('erro no save: log sanitizado + toast de erro e retorna undefined', async () => {
    const boom = new Error('firestore down');
    mockSaveAll.mockRejectedValue(boom);
    const { result } = renderHook(() => useImportActions(user));

    const out = await result.current.handleImport([{ value: 10 } as Partial<Transaction>]);

    expect(out).toBeUndefined();
    expect(mockLog).toHaveBeenCalledWith('transaction_import', boom);
    expect(mockGetMsg).toHaveBeenCalledWith(boom, 'transaction_import');
    expect(mockToast.error).toHaveBeenCalledWith('Erro genérico', { id: 'toast-id' });
  });
});
