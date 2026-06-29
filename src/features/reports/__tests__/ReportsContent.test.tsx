import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Centavos } from '../../../shared/types/money';
import type { Transaction } from '../../../shared/types/transaction';
import ReportsContent from '../ReportsContent';

const cents = (value: number): Centavos => value as Centavos;

function expense(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx',
    type: 'saida',
    category: 'Mercado',
    date: new Date().toISOString().slice(0, 10),
    value_cents: cents(10000),
    schemaVersion: 2,
    ...overrides,
  } as Transaction;
}

describe('ReportsContent — filtro temporal do Pareto', () => {
  it('descarta transações sem data válida na janela de 30 dias (NaN guard)', () => {
    // Duas despesas datadas, com "Mercado" dominante (entra no top 80%).
    const dominante = expense({ id: 'tx-merc', category: 'Mercado', value_cents: cents(80000) });
    const menor     = expense({ id: 'tx-lazer', category: 'Lazer', value_cents: cents(20000) });
    // Transação órfã: sem `date` nem `createdAt` → new Date('') = Invalid Date → NaN.
    const orfa = expense({
      id: 'tx-orfa',
      category: 'Fantasma',
      date: undefined as unknown as string,
      value_cents: cents(500000),
    });

    render(<ReportsContent transactions={[dominante, menor, orfa]} />);

    // Filtro padrão '30d': a categoria órfã (valor enorme) NÃO pode poluir o
    // relatório datado; a despesa datada dominante deve aparecer no top 80%.
    expect(screen.queryByText(/Fantasma/)).toBeNull();
    expect(screen.getAllByText(/Mercado/).length).toBeGreaterThan(0);
  });
});
