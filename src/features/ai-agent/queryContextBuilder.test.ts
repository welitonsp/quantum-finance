import { describe, it, expect } from 'vitest';
import { buildQueryContext } from './queryContextBuilder';
import type { Transaction, ModuleBalances } from '../../shared/types/transaction';

const YM = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
})();

const mockTxs = [
  {
    id: 't1', description: 'Mercado', category: 'Alimentação',
    type: 'saida', date: `${YM}-05`, value_cents: 15000,
    source: 'manual', uid: 'u1',
  },
  {
    id: 't2', description: 'Salário', category: 'Receita',
    type: 'entrada', date: `${YM}-01`, value_cents: 500000,
    source: 'manual', uid: 'u1',
  },
  {
    id: 't3', description: 'Uber', category: 'Transporte',
    type: 'saida', date: `${YM}-10`, value_cents: 3200,
    source: 'manual', uid: 'u1',
  },
] as unknown as Transaction[];

const mockBalances: Partial<ModuleBalances> = {
  geral: { saldo: 3500.00, receitas: 5000.00, despesas: 1500.00 },
};

describe('buildQueryContext — get_balances', () => {
  it('retorna bloco estruturado com saldo e resultado', () => {
    const ctx = buildQueryContext('get_balances', [], mockBalances);
    expect(ctx).not.toBeNull();
    expect(ctx).toContain('DADOS DE SALDO');
    expect(ctx).toContain('3.500,00');
    expect(ctx).toContain('5.000,00');
    expect(ctx).toContain('1.500,00');
  });

  it('retorna null quando balances é null', () => {
    expect(buildQueryContext('get_balances', [], null)).toBeNull();
  });

  it('retorna null quando geral está ausente', () => {
    expect(buildQueryContext('get_balances', [], {})).toBeNull();
  });
});

describe('buildQueryContext — explain_month', () => {
  it('retorna resumo mensal com categorias de gasto', () => {
    const ctx = buildQueryContext('explain_month', mockTxs, mockBalances);
    expect(ctx).not.toBeNull();
    expect(ctx).toContain('RESUMO DO MÊS');
    expect(ctx).toContain('Alimentação');
    expect(ctx).toContain('Transporte');
  });

  it('retorna null quando não há transações no mês corrente', () => {
    const oldTxs = [{ ...mockTxs[0], date: '2020-01-05' }] as Transaction[];
    expect(buildQueryContext('explain_month', oldTxs, null)).toBeNull();
  });

  it('retorna null para array vazio', () => {
    expect(buildQueryContext('explain_month', [], null)).toBeNull();
  });
});

describe('buildQueryContext — cashflow_briefing', () => {
  it('retorna projeção baseada em despesas disponíveis', () => {
    const ctx = buildQueryContext('cashflow_briefing', mockTxs, mockBalances);
    expect(ctx).not.toBeNull();
    expect(ctx).toContain('FLUXO DE CAIXA');
    expect(ctx).toContain('Saldo atual');
    expect(ctx).toContain('Projeção');
  });

  it('retorna null quando não há despesas nos últimos 3 meses', () => {
    const incomeTxs = [{ ...mockTxs[1] }] as Transaction[];
    expect(buildQueryContext('cashflow_briefing', incomeTxs, mockBalances)).toBeNull();
  });
});

describe('buildQueryContext — get_invoice', () => {
  it('retorna resumo de transações de cartão quando existem', () => {
    const cardTxs = [
      {
        id: 'c1', description: 'Compra X', category: 'Cartão',
        type: 'saida', date: `${YM}-15`, value_cents: 20000,
        source: 'manual', uid: 'u1',
      },
    ] as unknown as Transaction[];
    const ctx = buildQueryContext('get_invoice', cardTxs, null);
    expect(ctx).not.toBeNull();
    expect(ctx).toContain('CARTÃO');
    expect(ctx).toContain('200,00');
  });

  it('retorna null quando não há transações de cartão no mês', () => {
    const nonCardTxs = [{ ...mockTxs[0], category: 'Alimentação' }] as unknown as Transaction[];
    expect(buildQueryContext('get_invoice', nonCardTxs, null)).toBeNull();
  });
});

describe('buildQueryContext — intents de ação', () => {
  it('retorna null para todos os action intents', () => {
    const actionIntents = [
      'simulate_purchase', 'plan_debt_payment', 'create_budget_proposal',
      'contribute_to_goal_proposal', 'register_income_proposal', 'register_transfer_proposal',
    ] as const;
    for (const intent of actionIntents) {
      expect(buildQueryContext(intent, mockTxs, mockBalances)).toBeNull();
    }
  });
});
