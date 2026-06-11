import { renderHook } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useRunningBalance } from './useRunningBalance';
import type { Transaction } from '../shared/types/transaction';
import type { Centavos } from '../shared/types/money';

const C = (n: number): Centavos => n as Centavos;

function tx(overrides: Partial<Transaction> & { id: string; value_cents: Centavos; type: 'entrada' | 'saida' | 'transferencia'; date: string }): Transaction {
  return {
    uid: 'uid-1',
    description: 'test',
    category: 'Outros',
    source: 'manual',
    schemaVersion: 2,
    value: (overrides.value_cents as number) / 100,
    ...overrides,
  } as Transaction;
}

describe('useRunningBalance', () => {
  it('retorna mapa vazio para lista vazia', () => {
    const { result } = renderHook(() => useRunningBalance([]));
    expect(result.current.balances.size).toBe(0);
    expect(result.current.overflowWarning).toBe(false);
  });

  it('acumula entradas positivamente', () => {
    const txs = [
      tx({ id: 'a', date: '2026-01-01', type: 'entrada', value_cents: C(10000) }),
      tx({ id: 'b', date: '2026-01-02', type: 'entrada', value_cents: C(5000) }),
    ];
    const { result } = renderHook(() => useRunningBalance(txs));
    expect(result.current.balances.get('a')).toBe(10000);
    expect(result.current.balances.get('b')).toBe(15000);
    expect(result.current.overflowWarning).toBe(false);
  });

  it('subtrai saídas corretamente', () => {
    const txs = [
      tx({ id: 'a', date: '2026-01-01', type: 'entrada', value_cents: C(10000) }),
      tx({ id: 'b', date: '2026-01-02', type: 'saida',   value_cents: C(3000)  }),
    ];
    const { result } = renderHook(() => useRunningBalance(txs));
    expect(result.current.balances.get('a')).toBe(10000);
    expect(result.current.balances.get('b')).toBe(7000);
  });

  it('ordena por data independente da ordem do array', () => {
    const txs = [
      tx({ id: 'b', date: '2026-01-02', type: 'saida',   value_cents: C(3000)  }),
      tx({ id: 'a', date: '2026-01-01', type: 'entrada', value_cents: C(10000) }),
    ];
    const { result } = renderHook(() => useRunningBalance(txs));
    expect(result.current.balances.get('a')).toBe(10000);
    expect(result.current.balances.get('b')).toBe(7000);
  });

  it('ignora transações com value_cents inválido', () => {
    const txs: Transaction[] = [
      tx({ id: 'a', date: '2026-01-01', type: 'entrada', value_cents: C(10000) }),
      { ...tx({ id: 'b', date: '2026-01-02', type: 'saida', value_cents: C(3000) }), value_cents: undefined as unknown as Centavos },
    ];
    const { result } = renderHook(() => useRunningBalance(txs));
    expect(result.current.balances.get('a')).toBe(10000);
    expect(result.current.balances.has('b')).toBe(false);
  });

  it('detecta overflow e retorna overflowWarning true', () => {
    const huge = C(Number.MAX_SAFE_INTEGER - 1);
    const txs = [
      tx({ id: 'a', date: '2026-01-01', type: 'entrada', value_cents: huge }),
      tx({ id: 'b', date: '2026-01-02', type: 'entrada', value_cents: C(100) }),
    ];
    const { result } = renderHook(() => useRunningBalance(txs));
    expect(result.current.overflowWarning).toBe(true);
    expect(result.current.balances.has('b')).toBe(false);
  });

  it('não altera saldo acumulado em transferências', () => {
    const txs = [
      tx({ id: 'a', date: '2026-01-01', type: 'entrada',      value_cents: C(10000) }),
      tx({ id: 'b', date: '2026-01-02', type: 'transferencia', value_cents: C(4000)  }),
      tx({ id: 'c', date: '2026-01-03', type: 'saida',         value_cents: C(2000)  }),
    ];
    const { result } = renderHook(() => useRunningBalance(txs));
    expect(result.current.balances.get('a')).toBe(10000);
    expect(result.current.balances.get('b')).toBe(10000); // unchanged by transfer
    expect(result.current.balances.get('c')).toBe(8000);
  });

  it('permite saldo negativo sem overflow', () => {
    const txs = [
      tx({ id: 'a', date: '2026-01-01', type: 'saida', value_cents: C(5000) }),
    ];
    const { result } = renderHook(() => useRunningBalance(txs));
    expect(result.current.balances.get('a')).toBe(-5000);
    expect(result.current.overflowWarning).toBe(false);
  });
});
