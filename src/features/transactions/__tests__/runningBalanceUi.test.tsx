import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Transaction } from '../../../shared/types/transaction';
import type { Centavos } from '../../../shared/types/money';

vi.mock('../../../shared/api/firebase/auth', () => ({
  auth: { currentUser: null },
}));

vi.mock('../../../hooks/useCategories', () => ({
  useCategories: vi.fn(() => ({ categories: [] })),
}));

vi.mock('../../../components/AuditTimeline', () => ({
  default: () => null,
}));

vi.mock('../../../components/TransactionHistoryDrawer', () => ({
  default: () => null,
}));

import TransactionsManager from '../TransactionsManager';

const cents = (value: number): Centavos => value as Centavos;

function tx(overrides: Partial<Transaction>): Transaction {
  return {
    id: 'tx-test',
    description: 'Movimentacao',
    value_cents: cents(0),
    schemaVersion: 2,
    type: 'saida',
    category: 'Outros',
    date: '2026-05-01',
    ...overrides,
  } as Transaction;
}

function renderManager(transactions: Transaction[]) {
  return render(
    <TransactionsManager
      uid="uid-test"
      transactions={transactions}
      loading={false}
      onEdit={vi.fn()}
      onDeleteRequest={vi.fn()}
      onBatchDelete={vi.fn().mockResolvedValue(undefined)}
      categories={[]}
    />,
  );
}

describe('TransactionsManager running balance UI', () => {
  it('renderiza o rotulo Acumulado visivel por linha', () => {
    renderManager([
      tx({ id: 'income', description: 'Salario', type: 'entrada', value_cents: cents(100000), date: '2026-05-01' }),
    ]);

    expect(screen.getByText('Acumulado visível')).toBeInTheDocument();
    expect(screen.queryByText('Fluxo acumulado')).not.toBeInTheDocument();
  });

  it('explica que o acumulado considera somente lancamentos visiveis e carregados', () => {
    renderManager([
      tx({ id: 'income', description: 'Salario', type: 'entrada', value_cents: cents(100000), date: '2026-05-01' }),
    ]);

    expect(screen.getByTitle(
      'Considera apenas os lançamentos visíveis/carregados após filtros. Não representa o saldo da conta.',
    )).toBeInTheDocument();
  });

  it('mantem base vazia sem NaN ou Infinity', () => {
    const { container } = renderManager([]);

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/NaN|Infinity/);
  });

  it('filtro Importadas nao conciliadas exclui manuais e conciliadas', () => {
    renderManager([
      tx({
        id: 'manual-pending',
        description: 'Manual pendente',
        source: 'manual',
      }),
      tx({
        id: 'csv-pending',
        description: 'CSV pendente',
        source: 'csv',
      }),
      tx({
        id: 'csv-reconciled',
        description: 'CSV conciliada',
        source: 'csv',
        reconciliationStatus: 'reconciled',
      }),
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Importadas não conciliadas' }));

    expect(screen.getByText('CSV pendente')).toBeInTheDocument();
    expect(screen.queryByText('Manual pendente')).not.toBeInTheDocument();
    expect(screen.queryByText('CSV conciliada')).not.toBeInTheDocument();
    expect(screen.getByText('Conciliação: Importadas não conciliadas')).toBeInTheDocument();
  });

  it('filtro Importadas nao conciliadas mantem base vazia estavel', () => {
    const { container } = renderManager([]);

    fireEvent.click(screen.getByRole('button', { name: 'Importadas não conciliadas' }));

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/NaN|Infinity/);
  });
});
