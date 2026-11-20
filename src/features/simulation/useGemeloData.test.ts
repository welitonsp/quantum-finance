import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useGemeloData } from './useGemeloData';
import type { RecurringTask } from '../../shared/types/transaction';
import type { Centavos } from '../../shared/types/money';

const cents = (value: number): Centavos => value as Centavos;

function recurringTask(overrides: Partial<RecurringTask>): RecurringTask {
  return {
    id: 'task',
    description: 'Recorrente',
    value: 100,
    value_cents: cents(10_000),
    category: 'Outros',
    dueDay: 5,
    active: true,
    type: 'saida',
    frequency: 'mensal',
    ...overrides,
  };
}

describe('useGemeloData', () => {
  it('classifies legacy receita recurring tasks as fixed income', () => {
    const { result } = renderHook(() =>
      useGemeloData({
        recurringTasks: [
          recurringTask({ id: 'salary', type: 'receita', value_cents: cents(500_000) }),
          recurringTask({ id: 'rent', type: 'saida', value_cents: cents(100_000) }),
        ],
        debts: [],
        creditCards: [],
        transactions: [],
        historicalIncomeCents: cents(0),
        historicalExpenseCents: cents(0),
      }),
    );

    expect(result.current.fixedIncomeCents).toBe(500_000);
    expect(result.current.fixedExpensesCents).toBe(100_000);
    expect(result.current.netMonthlyCents).toBe(400_000);
  });
});
