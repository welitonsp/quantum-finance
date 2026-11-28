import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TrendsChart from '../TrendsChart';
import type { Transaction } from '../../../shared/types/transaction';

const EMPTY_TITLE = 'Sem dados suficientes para gerar tendências.';

function tx(over: Record<string, unknown>): Transaction {
  return {
    id: `tx-${Math.random()}`,
    description: 'Mov',
    type: 'saida',
    category: 'Outros',
    value_cents: 10000,
    ...over,
  } as Transaction;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-06-15T12:00:00Z'));
});
afterEach(() => vi.useRealTimers());

describe('TrendsChart', () => {
  it('mostra estado vazio sem transações', () => {
    render(<TrendsChart transactions={[]} />);
    expect(screen.getByText(EMPTY_TITLE)).toBeInTheDocument();
  });

  it('mostra estado vazio quando nenhuma transação cai na janela de 6 meses', () => {
    render(<TrendsChart transactions={[tx({ date: '2025-01-10' })]} />);
    expect(screen.getByText(EMPTY_TITLE)).toBeInTheDocument();
  });

  it('renderiza o gráfico quando há movimento na janela', () => {
    render(<TrendsChart transactions={[tx({ date: '2026-06-10', type: 'entrada' })]} />);
    expect(screen.queryByText(EMPTY_TITLE)).not.toBeInTheDocument();
    expect(screen.getByText('Tendência Histórica (6 Meses)')).toBeInTheDocument();
  });
});
