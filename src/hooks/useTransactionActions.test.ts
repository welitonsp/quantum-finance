import { renderHook, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from 'firebase/auth';
import type { Centavos } from '../shared/types/money';
import type { Transaction } from '../shared/types/transaction';
import { useTransactionActions } from './useTransactionActions';

const { mockToastSuccess, mockToastError } = vi.hoisted(() => ({
  mockToastSuccess: vi.fn(),
  mockToastError: vi.fn(),
}));

vi.mock('react-hot-toast', () => ({
  default: {
    success: mockToastSuccess,
    error: mockToastError,
  },
}));

describe('useTransactionActions', () => {
  const user = { uid: 'uid-1' } as User;
  const baseTransaction = {
    id: 'tx-1',
    uid: 'uid-1',
    description: 'Compra original',
    value: 10,
    value_cents: 1000,
    schemaVersion: 2,
    type: 'saida',
    category: 'Outros',
    date: '2026-05-01',
    source: 'manual',
    createdAt: 1000,
    updatedAt: 1000,
    importHash: 'x'.repeat(64),
  } as Transaction;

  const setup = (transactionToEdit: Transaction | null = baseTransaction) => {
    const update = vi.fn().mockResolvedValue(undefined);
    const add = vi.fn().mockResolvedValue('tx-created');
    const remove = vi.fn().mockResolvedValue(undefined);
    const removeBatch = vi.fn().mockResolvedValue(undefined);
    const setTransactionToEdit = vi.fn();
    const setIsFormOpen = vi.fn();
    const setTransactionToDelete = vi.fn();

    const hook = renderHook(() => useTransactionActions({
      user,
      update,
      add,
      remove,
      removeBatch,
      transactionToEdit,
      setTransactionToEdit,
      setIsFormOpen,
      setTransactionToDelete,
    }));

    return {
      ...hook,
      update,
      add,
      remove,
      removeBatch,
      setTransactionToEdit,
      setIsFormOpen,
      setTransactionToDelete,
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('editar categoria envia ao hook apenas o campo alterado, sem value legado nem identificadores', async () => {
    const { result, update, add, setIsFormOpen, setTransactionToEdit } = setup();

    await act(async () => {
      await result.current.handleSaveTransaction({
        description: 'Compra original',
        value: 10,
        value_cents: 1000 as Centavos,
        schemaVersion: 2,
        type: 'saida',
        category: 'Lazer',
        date: '2026-05-01',
        id: 'tx-forged',
        uid: 'uid-forged',
        importHash: 'y'.repeat(64),
      });
    });

    expect(update).toHaveBeenCalledWith('tx-1', { category: 'Lazer' });
    expect(add).not.toHaveBeenCalled();
    expect(setIsFormOpen).toHaveBeenCalledWith(false);
    expect(setTransactionToEdit).toHaveBeenCalledWith(null);
    expect(mockToastSuccess).toHaveBeenCalledWith('Movimentação atualizada com sucesso!');
  });

  it('soft-delete real chama remove pelo id selecionado', async () => {
    const { result, remove, setTransactionToDelete } = setup();

    await act(async () => {
      await result.current.confirmDelete(baseTransaction);
    });

    expect(setTransactionToDelete).toHaveBeenCalledWith(null);
    expect(remove).toHaveBeenCalledWith('tx-1');
  });
});
