import { describe, expect, it } from 'vitest';
import type { Transaction } from '../shared/types/transaction';
import type { Centavos } from '../shared/types/money';
import {
  DEFAULT_SAVINGS_GOAL_PERCENT,
  calculateBudgetAlerts,
  calcStatus,
  resolveSavingsGoalPercent,
} from './dashboardUtils';

const cents = (value: number): Centavos => value as Centavos;

function tx(overrides: Partial<Transaction>): Transaction {
  return {
    id:            'tx-test',
    description:   'Movimentacao',
    value_cents:   cents(0),
    schemaVersion: 2,
    type:          'saida',
    category:      'Outros',
    date:          '2026-05-01',
    ...overrides,
  } as Transaction;
}

describe('resolveSavingsGoalPercent', () => {
  it('usa a meta percentual numerica salva no app', () => {
    expect(resolveSavingsGoalPercent(35)).toBe(35);
  });

  it('usa a meta percentual vinda de objeto', () => {
    expect(resolveSavingsGoalPercent({ percent: 15 })).toBe(15);
  });

  it('mantem fallback explicito quando a meta esta ausente ou fora da faixa percentual', () => {
    expect(resolveSavingsGoalPercent(null)).toBe(DEFAULT_SAVINGS_GOAL_PERCENT);
    expect(resolveSavingsGoalPercent(0)).toBe(DEFAULT_SAVINGS_GOAL_PERCENT);
    expect(resolveSavingsGoalPercent(3500)).toBe(DEFAULT_SAVINGS_GOAL_PERCENT);
    expect(resolveSavingsGoalPercent({ percent: NaN })).toBe(DEFAULT_SAVINGS_GOAL_PERCENT);
  });
});

describe('calcStatus', () => {
  it('calcula progresso usando a meta real recebida pelo Dashboard', () => {
    const defaultGoal = calcStatus(200, 1000, 800, 200, 0, 20);
    const realGoal = calcStatus(200, 1000, 800, 200, 0, 40);

    expect(defaultGoal.savingsRate).toBe(20);
    expect(defaultGoal.goalProgress).toBe(100);
    expect(realGoal.goalProgress).toBe(50);
  });

  it('mantem base vazia estavel sem NaN ou Infinity', () => {
    const status = calcStatus(0, 0, 0, 0, 0, DEFAULT_SAVINGS_GOAL_PERCENT);

    expect(status.savingsRate).toBe(0);
    expect(status.debtRatio).toBe(0);
    expect(status.goalProgress).toBe(0);
    expect(Number.isFinite(status.score)).toBe(true);
    expect(Number.isFinite(status.patrimonyRisk)).toBe(true);
  });
});

describe('calculateBudgetAlerts', () => {
  const foodBudget = {
    id: 'budget-food',
    category: 'Alimentação',
    month: '2026-05',
    targetAmountCents: cents(10000),
  };

  it('sem budgets retorna lista vazia', () => {
    expect(calculateBudgetAlerts([], [tx({ value_cents: cents(10000) })])).toEqual([]);
  });

  it('budget saudavel nao aparece no bloco de alertas', () => {
    const alerts = calculateBudgetAlerts([
      foodBudget,
    ], [
      tx({ category: 'Alimentação', value_cents: cents(7900), date: '2026-05-10' }),
    ]);

    expect(alerts).toEqual([]);
  });

  it('budget em atencao aparece corretamente', () => {
    const alerts = calculateBudgetAlerts([
      foodBudget,
    ], [
      tx({ category: 'Alimentação', value_cents: cents(8000), date: '2026-05-10' }),
    ]);

    expect(alerts).toMatchObject([
      {
        id: 'budget-food',
        category: 'Alimentação',
        spentCents: cents(8000),
        limitCents: cents(10000),
        percentUsed: 80,
        status: 'attention',
      },
    ]);
  });

  it('budget critico aparece corretamente', () => {
    const alerts = calculateBudgetAlerts([
      foodBudget,
    ], [
      tx({ category: 'Alimentação', value_cents: cents(10000), date: '2026-05-10' }),
    ]);

    expect(alerts[0]?.status).toBe('critical');
    expect(alerts[0]?.percentUsed).toBe(100);
  });

  it('budget acima de 100 por cento exibe percentual real', () => {
    const alerts = calculateBudgetAlerts([
      foodBudget,
    ], [
      tx({ category: 'Alimentação', value_cents: cents(12500), date: '2026-05-10' }),
    ]);

    expect(alerts[0]?.status).toBe('critical');
    expect(alerts[0]?.percentUsed).toBe(125);
  });

  it('usa value_cents e ignora value legado', () => {
    const alerts = calculateBudgetAlerts([
      foodBudget,
    ], [
      tx({ category: 'Alimentação', value: 999999, value_cents: cents(100), date: '2026-05-10' }),
      (() => {
        const legacyOnly = tx({ category: 'Alimentação', value: 999999, date: '2026-05-11' });
        delete legacyOnly.value_cents;
        return legacyOnly;
      })(),
    ]);

    expect(alerts).toEqual([]);
  });

  it('transacoes de outras categorias nao contaminam o orcamento', () => {
    const alerts = calculateBudgetAlerts([
      foodBudget,
    ], [
      tx({ category: 'Transporte', value_cents: cents(10000), date: '2026-05-10' }),
    ]);

    expect(alerts).toEqual([]);
  });

  it('receitas nao contam como gasto', () => {
    const alerts = calculateBudgetAlerts([
      foodBudget,
    ], [
      tx({ category: 'Alimentação', type: 'entrada', value_cents: cents(10000), date: '2026-05-10' }),
    ]);

    expect(alerts).toEqual([]);
  });

  it('base sem transacoes nao gera NaN ou Infinity', () => {
    const alerts = calculateBudgetAlerts([
      foodBudget,
    ], []);

    expect(alerts).toEqual([]);
  });

  it('dois alertas: critical aparece antes de attention na ordenação (linha 145-147)', () => {
    const budgets = [
      { id: 'b1', category: 'Lazer',       month: '2026-05', targetAmountCents: cents(1000) },
      { id: 'b2', category: 'Alimentação', month: '2026-05', targetAmountCents: cents(1000) },
    ];
    const txs = [
      tx({ category: 'Lazer',       value_cents: cents(1100), date: '2026-05-01' }), // critical (110%)
      tx({ category: 'Alimentação', value_cents: cents(850),  date: '2026-05-01' }), // attention (85%)
    ];
    const alerts = calculateBudgetAlerts(budgets, txs);
    expect(alerts.length).toBe(2);
    expect(alerts[0]!.status).toBe('critical');
    expect(alerts[1]!.status).toBe('attention');
  });
});

// ─── calcStatus — branches CRÍTICO, ATENÇÃO, EXCELENTE (linhas 61-62) ─────────

describe('calcStatus — todos os ramos de status', () => {
  it('status CRÍTICO quando saldo negativo', () => {
    const result = calcStatus(-100, 500, 600, 1000, 0, 20);
    expect(result.status).toBe('CRÍTICO');
    expect(result.risk).toBe('ALTO');
    expect(result.color).toBe('red');
  });

  it('status CRÍTICO quando debtRatio > 90', () => {
    const result = calcStatus(100, 1000, 950, 1000, 0, 20);
    expect(result.status).toBe('CRÍTICO');
  });

  it('status CRÍTICO quando patrimonyRisk > 150', () => {
    // patrimônio = 100, dívidas = 200 → risco = 200%
    const result = calcStatus(100, 1000, 800, 100, 200, 20);
    expect(result.status).toBe('CRÍTICO');
  });

  it('status ATENÇÃO quando debtRatio > 70 e ≤ 90 (não CRÍTICO)', () => {
    // receitas=1000, despesas=850 → debtRatio=85 (>70 ATENÇÃO, ≤90 não CRÍTICO)
    const result = calcStatus(150, 1000, 850, 5000, 0, 20);
    expect(result.status).toBe('ATENÇÃO');
    expect(result.risk).toBe('MÉDIO');
  });

  it('status EXCELENTE quando score >= 80', () => {
    const result = calcStatus(5000, 10000, 2000, 50000, 0, 20);
    expect(result.status).toBe('EXCELENTE');
    expect(result.score).toBeGreaterThanOrEqual(80);
  });

  it('status SAUDÁVEL quando score 70-79: savingsRate=30%, debtRatio=70%, patrimonyRisk=50%', () => {
    // score = 25+14+25+14 = 78 → SAUDÁVEL (não EXCELENTE, não ATENÇÃO)
    const result = calcStatus(300, 1000, 700, 1000, 500, 20);
    expect(result.status).toBe('SAUDÁVEL');
    expect(result.score).toBeLessThan(80);
  });
});
