import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { UpcomingEventsStrip } from './UpcomingEventsStrip';
import type { CreditCardWithMetrics, RecurringTask } from '../../shared/types/transaction';
import type { Centavos } from '../../shared/types/money';

const cents = (value: number): Centavos => value as Centavos;

function recurringTask(overrides: Partial<RecurringTask>): RecurringTask {
  return {
    id: 'task',
    description: 'Conta recorrente',
    value: 100,
    value_cents: cents(10_000),
    category: 'Casa',
    dueDay: 1,
    active: true,
    type: 'saida',
    frequency: 'mensal',
    ...overrides,
  };
}

function card(overrides: Partial<CreditCardWithMetrics>): CreditCardWithMetrics {
  return {
    id: 'card',
    name: 'Cartão Principal',
    limit: 1_000,
    closingDay: 1,
    dueDay: 2,
    color: '#fff',
    active: true,
    metrics: {
      limitVal: 1_000,
      faturaAtual: 100,
      faturaCents: cents(10_000),
      limitCents: cents(100_000),
      disponivelCents: cents(90_000),
      disponivel: 900,
      compromisso: 10,
      daysUntilDue: 5,
      isOverLimit: false,
      alertLevel: 'safe',
      committedFutureCents: cents(0),
      openTotalCents: cents(10_000),
      effectiveAvailableCents: cents(90_000),
      futureInvoices: [],
    },
    ...overrides,
  };
}

describe('UpcomingEventsStrip', () => {
  it('rolls monthly recurring and card events into the next month window', () => {
    render(
      <UpcomingEventsStrip
        recurringTasks={[recurringTask({ id: 'rent', description: 'Aluguel', dueDay: 2 })]}
        creditCards={[card({ closingDay: 1, dueDay: 2 })]}
        currentMonth={7}
        currentYear={2026}
        today="2026-07-29"
      />,
    );

    expect(screen.getByText('Aluguel')).toBeTruthy();
    expect(screen.getAllByText('Cartão Principal')).toHaveLength(2);
  });

  it('includes annual recurring tasks when their next occurrence is within 7 days', () => {
    render(
      <UpcomingEventsStrip
        recurringTasks={[
          recurringTask({
            id: 'iptu',
            description: 'IPTU',
            frequency: 'anual',
            dueMonth: 7,
            dueDay: 20,
          }),
        ]}
        creditCards={[]}
        currentMonth={7}
        currentYear={2026}
        today="2026-07-19"
      />,
    );

    expect(screen.getByText('IPTU')).toBeTruthy();
    expect(screen.getByText('Amanhã')).toBeTruthy();
  });

  it('does not show legacy recurring incomes as upcoming commitments', () => {
    const { container } = render(
      <UpcomingEventsStrip
        recurringTasks={[
          recurringTask({
            id: 'salary',
            description: 'Salário',
            type: 'receita',
            dueDay: 20,
          }),
        ]}
        creditCards={[]}
        currentMonth={7}
        currentYear={2026}
        today="2026-07-19"
      />,
    );

    expect(screen.queryByText('Salário')).toBeNull();
    expect(container.firstChild).toBeNull();
  });

  it('defaults annual recurring tasks without dueMonth to January', () => {
    const { container } = render(
      <UpcomingEventsStrip
        recurringTasks={[
          recurringTask({
            id: 'insurance',
            description: 'Seguro anual',
            frequency: 'anual',
            dueDay: 20,
          }),
        ]}
        creditCards={[]}
        currentMonth={7}
        currentYear={2026}
        today="2026-07-19"
      />,
    );

    expect(screen.queryByText('Seguro anual')).toBeNull();
    expect(container.firstChild).toBeNull();
  });
});
