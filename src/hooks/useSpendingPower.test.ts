import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useSpendingPower } from './useSpendingPower';
import type { Centavos } from '../shared/types/money';
import type { RecurringTask } from '../shared/types/transaction';

/** Constrói uma RecurringTask com defaults sensatos, sobrescrevíveis por caso. */
function task(overrides: Partial<RecurringTask>): RecurringTask {
  return {
    id: 'r1',
    description: 'Aluguel',
    value: 1000,
    category: 'Moradia',
    dueDay: 5,
    active: true,
    type: 'saida',
    frequency: 'mensal',
    ...overrides,
  };
}

describe('useSpendingPower', () => {
  it('sem tarefas: available = saldo − fatura; zona safe quando ≥20% do saldo', () => {
    const { result } = renderHook(() =>
      useSpendingPower({
        saldo: 1000,
        recurringTasks: [],
        cardInvoiceCents: 0 as Centavos,
        currentYYYYMM: '2026-07',
      }),
    );
    expect(result.current.saldoCents).toBe(100000);
    expect(result.current.pendingCommitmentsCents).toBe(0);
    expect(result.current.availableCents).toBe(100000);
    expect(result.current.zone).toBe('safe');
  });

  it('soma compromissos fixos mensais ainda não executados neste mês', () => {
    const { result } = renderHook(() =>
      useSpendingPower({
        saldo: 1000,
        recurringTasks: [
          task({ id: 'a', value_cents: 30000 as Centavos, lastExecutedMonth: '2026-06' }),
          task({ id: 'b', value: 200 }),
        ],
        cardInvoiceCents: 0 as Centavos,
        currentYYYYMM: '2026-07',
      }),
    );
    // 30000 (value_cents) + 20000 (toCentavos(200))
    expect(result.current.pendingCommitmentsCents).toBe(50000);
    expect(result.current.availableCents).toBe(50000);
  });

  it('prefere value_cents sobre value quando presente', () => {
    const { result } = renderHook(() =>
      useSpendingPower({
        saldo: 1000,
        recurringTasks: [task({ value_cents: 12345 as Centavos, value: 999 })],
        cardInvoiceCents: 0 as Centavos,
        currentYYYYMM: '2026-07',
      }),
    );
    expect(result.current.pendingCommitmentsCents).toBe(12345);
  });

  it('ignora tarefas inativas, entrada, anuais e já executadas neste mês', () => {
    const { result } = renderHook(() =>
      useSpendingPower({
        saldo: 1000,
        recurringTasks: [
          task({ id: 'inactive', active: false, value: 100 }),
          task({ id: 'entrada', type: 'entrada', value: 100 }),
          task({ id: 'anual', frequency: 'anual', value: 100 }),
          task({ id: 'executed', lastExecutedMonth: '2026-07', value: 100 }),
        ],
        cardInvoiceCents: 0 as Centavos,
        currentYYYYMM: '2026-07',
      }),
    );
    expect(result.current.pendingCommitmentsCents).toBe(0);
    expect(result.current.availableCents).toBe(100000);
  });

  it('desconta a fatura corrente do cartão', () => {
    const { result } = renderHook(() =>
      useSpendingPower({
        saldo: 1000,
        recurringTasks: [],
        cardInvoiceCents: 40000 as Centavos,
        currentYYYYMM: '2026-07',
      }),
    );
    expect(result.current.cardInvoiceCents).toBe(40000);
    expect(result.current.availableCents).toBe(60000);
  });

  it('zona caution quando disponível entre 0 e 20% do saldo', () => {
    // saldo 1000, compromissos 850 → available 15000 (<20% de 100000)
    const { result } = renderHook(() =>
      useSpendingPower({
        saldo: 1000,
        recurringTasks: [task({ value_cents: 85000 as Centavos })],
        cardInvoiceCents: 0 as Centavos,
        currentYYYYMM: '2026-07',
      }),
    );
    expect(result.current.availableCents).toBe(15000);
    expect(result.current.zone).toBe('caution');
  });

  it('zona danger quando disponível é zero', () => {
    const { result } = renderHook(() =>
      useSpendingPower({
        saldo: 1000,
        recurringTasks: [task({ value_cents: 100000 as Centavos })],
        cardInvoiceCents: 0 as Centavos,
        currentYYYYMM: '2026-07',
      }),
    );
    expect(result.current.availableCents).toBe(0);
    expect(result.current.zone).toBe('danger');
  });

  it('zona danger quando disponível é negativo', () => {
    const { result } = renderHook(() =>
      useSpendingPower({
        saldo: 1000,
        recurringTasks: [],
        cardInvoiceCents: 150000 as Centavos,
        currentYYYYMM: '2026-07',
      }),
    );
    expect(result.current.availableCents).toBe(-50000);
    expect(result.current.zone).toBe('danger');
  });

  it('saldo zero com disponível não-positivo é danger (guarda saldoCents > 0)', () => {
    const { result } = renderHook(() =>
      useSpendingPower({
        saldo: 0,
        recurringTasks: [],
        cardInvoiceCents: 0 as Centavos,
        currentYYYYMM: '2026-07',
      }),
    );
    expect(result.current.saldoCents).toBe(0);
    expect(result.current.availableCents).toBe(0);
    expect(result.current.zone).toBe('danger');
  });
});
