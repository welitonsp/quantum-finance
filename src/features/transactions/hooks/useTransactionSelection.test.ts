// src/features/transactions/hooks/useTransactionSelection.test.ts
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Transaction } from '../../../shared/types/transaction';
import type { Centavos } from '../../../shared/types/money';
import { useTransactionSelection } from './useTransactionSelection';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const cents = (n: number): Centavos => n as Centavos;

function tx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id:            'tx-1',
    description:   'Salário',
    value_cents:   cents(100000),
    type:          'entrada',
    category:      'Salário',
    date:          '2026-06-01',
    schemaVersion: 2,
    ...overrides,
  } as Transaction;
}

// ─── Testes ───────────────────────────────────────────────────────────────────

describe('useTransactionSelection — seleção individual', () => {
  it('começa com seleção vazia', () => {
    const { result } = renderHook(() =>
      useTransactionSelection([tx()], [tx()], []),
    );
    expect(result.current.selected.size).toBe(0);
  });

  it('toggleOne adiciona ID à seleção', () => {
    const { result } = renderHook(() =>
      useTransactionSelection([tx()], [tx()], []),
    );
    act(() => result.current.toggleOne('tx-1'));
    expect(result.current.selected.has('tx-1')).toBe(true);
  });

  it('toggleOne remove ID já selecionado', () => {
    const { result } = renderHook(() =>
      useTransactionSelection([tx()], [tx()], []),
    );
    act(() => result.current.toggleOne('tx-1'));
    act(() => result.current.toggleOne('tx-1'));
    expect(result.current.selected.has('tx-1')).toBe(false);
  });
});

describe('useTransactionSelection — seleção múltipla', () => {
  const txs = [
    tx({ id: 'a', type: 'entrada', category: 'Salário'     }),
    tx({ id: 'b', type: 'saida',   category: 'Alimentação' }),
    tx({ id: 'c', type: 'entrada', category: 'Salário'     }),
  ];

  it('selectAll seleciona todos os filtered', () => {
    const { result } = renderHook(() =>
      useTransactionSelection(txs, txs, []),
    );
    act(() => result.current.selectAll());
    expect(result.current.selected.size).toBe(3);
  });

  it('selectByType entrada seleciona apenas entradas', () => {
    const { result } = renderHook(() =>
      useTransactionSelection(txs, txs, []),
    );
    act(() => result.current.selectByType('entrada'));
    expect(result.current.selected.has('a')).toBe(true);
    expect(result.current.selected.has('c')).toBe(true);
    expect(result.current.selected.has('b')).toBe(false);
  });

  it('selectByType saida seleciona apenas saídas', () => {
    const { result } = renderHook(() =>
      useTransactionSelection(txs, txs, []),
    );
    act(() => result.current.selectByType('saida'));
    expect(result.current.selected.has('b')).toBe(true);
    expect(result.current.selected.has('a')).toBe(false);
  });

  it('selectByCategory filtra por categoria', () => {
    const { result } = renderHook(() =>
      useTransactionSelection(txs, txs, []),
    );
    act(() => result.current.selectByCategory('Salário'));
    expect(result.current.selected.has('a')).toBe(true);
    expect(result.current.selected.has('c')).toBe(true);
    expect(result.current.selected.has('b')).toBe(false);
  });

  it('selectAllTransactions usa transactions (não filtered)', () => {
    // filtered tem só 1, mas transactions tem 3
    const { result } = renderHook(() =>
      useTransactionSelection(txs, [txs[0]!], []),
    );
    act(() => result.current.selectAllTransactions());
    expect(result.current.selected.size).toBe(3);
  });
});

describe('useTransactionSelection — limpar seleção', () => {
  it('clearSelected remove todos os IDs', () => {
    const { result } = renderHook(() =>
      useTransactionSelection([tx()], [tx()], []),
    );
    act(() => result.current.toggleOne('tx-1'));
    act(() => result.current.clearSelected());
    expect(result.current.selected.size).toBe(0);
  });

  it('clearSelected também fecha batchAction e confirmDelete', () => {
    const { result } = renderHook(() =>
      useTransactionSelection([tx()], [tx()], []),
    );
    act(() => { result.current.setBatchAction('delete'); result.current.setConfirmDelete(true); });
    act(() => result.current.clearSelected());
    expect(result.current.batchAction).toBeNull();
    expect(result.current.confirmDelete).toBe(false);
  });

  it('cancelBatch fecha batchAction mas mantém seleção', () => {
    const { result } = renderHook(() =>
      useTransactionSelection([tx()], [tx()], []),
    );
    act(() => { result.current.toggleOne('tx-1'); result.current.setBatchAction('recategorize'); });
    act(() => result.current.cancelBatch());
    expect(result.current.batchAction).toBeNull();
    expect(result.current.selected.has('tx-1')).toBe(true);
  });
});

describe('useTransactionSelection — batchAction e confirmDelete', () => {
  it('batchAction começa null', () => {
    const { result } = renderHook(() =>
      useTransactionSelection([], [], []),
    );
    expect(result.current.batchAction).toBeNull();
  });

  it('setBatchAction muda para delete', () => {
    const { result } = renderHook(() =>
      useTransactionSelection([], [], []),
    );
    act(() => result.current.setBatchAction('delete'));
    expect(result.current.batchAction).toBe('delete');
  });

  it('setBatchAction muda para recategorize', () => {
    const { result } = renderHook(() =>
      useTransactionSelection([], [], []),
    );
    act(() => result.current.setBatchAction('recategorize'));
    expect(result.current.batchAction).toBe('recategorize');
  });

  it('confirmDelete começa false', () => {
    const { result } = renderHook(() =>
      useTransactionSelection([], [], []),
    );
    expect(result.current.confirmDelete).toBe(false);
  });

  it('setConfirmDelete muda para true', () => {
    const { result } = renderHook(() =>
      useTransactionSelection([], [], []),
    );
    act(() => result.current.setConfirmDelete(true));
    expect(result.current.confirmDelete).toBe(true);
  });
});

describe('useTransactionSelection — derivados', () => {
  const txs = [
    tx({ id: 'a' }),
    tx({ id: 'b' }),
  ];

  it('allFilteredSelected false quando nada está selecionado', () => {
    const { result } = renderHook(() =>
      useTransactionSelection(txs, txs, []),
    );
    expect(result.current.allFilteredSelected).toBe(false);
  });

  it('allFilteredSelected true quando todos filtered estão selecionados', () => {
    const { result } = renderHook(() =>
      useTransactionSelection(txs, txs, []),
    );
    act(() => result.current.selectAll());
    expect(result.current.allFilteredSelected).toBe(true);
  });

  it('someSelected true quando seleção parcial', () => {
    const { result } = renderHook(() =>
      useTransactionSelection(txs, txs, []),
    );
    act(() => result.current.toggleOne('a'));
    expect(result.current.someSelected).toBe(true);
    expect(result.current.allFilteredSelected).toBe(false);
  });

  it('newCat começa com a primeira categoria permitida', () => {
    const { result } = renderHook(() =>
      useTransactionSelection([], [], []),
    );
    expect(typeof result.current.newCat).toBe('string');
    expect(result.current.newCat.length).toBeGreaterThan(0);
  });
});
