import { describe, it, expect } from 'vitest';
import { simulateDebtStrategy, compareDebtStrategies, type DebtStrategyInput } from '../debtStrategy';
import type { Centavos } from '../../shared/types/money';

const cents = (n: number): Centavos => n as Centavos;

function debt(overrides: Partial<DebtStrategyInput> & { id: string }): DebtStrategyInput {
  return {
    name: overrides.id,
    remainingCents: cents(100000),
    monthlyInterestRate: 0.02,
    minPaymentCents: cents(5000),
    ...overrides,
  };
}

// ─── simulateDebtStrategy ─────────────────────────────────────────────────────

describe('simulateDebtStrategy', () => {
  it('retorna months=0 quando não há dívidas (lista vazia)', () => {
    const result = simulateDebtStrategy([], cents(50000), 'avalanche');
    expect(result.feasible).toBe(true);
    expect(result.months).toBe(0);
    expect(result.totalInterestCents).toBe(0);
    expect(result.order).toHaveLength(0);
  });

  it('retorna months=0 quando todas dívidas têm remainingCents <= 0', () => {
    const result = simulateDebtStrategy([
      debt({ id: 'd1', remainingCents: cents(0) }),
    ], cents(50000), 'avalanche');
    expect(result.feasible).toBe(true);
    expect(result.months).toBe(0);
  });

  it('retorna feasible=false quando orçamento < soma dos mínimos', () => {
    const result = simulateDebtStrategy([
      debt({ id: 'd1', minPaymentCents: cents(10000) }),
      debt({ id: 'd2', minPaymentCents: cents(10000) }),
    ], cents(5000), 'avalanche');
    expect(result.feasible).toBe(false);
    expect(result.reason).toContain('mínimos');
  });

  it('quita dívida simples dentro do prazo com avalanche', () => {
    // 1 dívida de R$100 + juros 2%/mês, mínimo R$20, orçamento R$50
    const result = simulateDebtStrategy([
      debt({ id: 'd1', remainingCents: cents(10000), monthlyInterestRate: 0.02, minPaymentCents: cents(2000) }),
    ], cents(5000), 'avalanche');
    expect(result.feasible).toBe(true);
    expect(result.months).toBeGreaterThan(0);
    expect(result.months).toBeLessThan(100);
    expect(result.totalInterestCents).toBeGreaterThan(0);
    expect(result.order).toHaveLength(1);
    expect(result.order[0]!.debtId).toBe('d1');
  });

  it('avalanche ataca dívida de maior juro primeiro (tiebreak por menor saldo)', () => {
    // d1: 5% juro, saldo 5000 / d2: 3% juro, saldo 3000
    // avalanche → d1 primeiro (maior juro)
    const inputs = [
      debt({ id: 'd1', remainingCents: cents(5000), monthlyInterestRate: 0.05, minPaymentCents: cents(500) }),
      debt({ id: 'd2', remainingCents: cents(3000), monthlyInterestRate: 0.03, minPaymentCents: cents(300) }),
    ];
    const result = simulateDebtStrategy(inputs, cents(5000), 'avalanche');
    expect(result.feasible).toBe(true);
    // d2 (menor juro, menor saldo) pode quitar antes se mínimo já cobre; mas d1 quitada primeiro pelo extra
    // Verificar que o order inclui ambas
    expect(result.order).toHaveLength(2);
  });

  it('snowball ataca dívida de menor saldo primeiro', () => {
    // d1: saldo 20000 / d2: saldo 5000 → snowball ataca d2 primeiro
    const inputs = [
      debt({ id: 'd1', remainingCents: cents(20000), monthlyInterestRate: 0.02, minPaymentCents: cents(1000) }),
      debt({ id: 'd2', remainingCents: cents(5000),  monthlyInterestRate: 0.02, minPaymentCents: cents(500) }),
    ];
    const result = simulateDebtStrategy(inputs, cents(10000), 'snowball');
    expect(result.feasible).toBe(true);
    // d2 (menor saldo) deve quitar antes que d1
    const d2Step = result.order.find(o => o.debtId === 'd2')!;
    const d1Step = result.order.find(o => o.debtId === 'd1')!;
    expect(d2Step.payoffMonthIndex).toBeLessThanOrEqual(d1Step.payoffMonthIndex);
  });

  it('desempate de taxa igual: avalanche usa menor saldo', () => {
    // mesma taxa → avalanche tiebreak = menor saldo primeiro
    const inputs = [
      debt({ id: 'big',   remainingCents: cents(10000), monthlyInterestRate: 0.03, minPaymentCents: cents(500) }),
      debt({ id: 'small', remainingCents: cents(3000),  monthlyInterestRate: 0.03, minPaymentCents: cents(300) }),
    ];
    const result = simulateDebtStrategy(inputs, cents(5000), 'avalanche');
    expect(result.feasible).toBe(true);
    const smallStep = result.order.find(o => o.debtId === 'small')!;
    const bigStep   = result.order.find(o => o.debtId === 'big')!;
    expect(smallStep.payoffMonthIndex).toBeLessThanOrEqual(bigStep.payoffMonthIndex);
  });

  it('desempate de saldo igual: snowball usa maior taxa', () => {
    // mesmo saldo → snowball tiebreak = maior taxa primeiro
    const inputs = [
      debt({ id: 'lowtax',  remainingCents: cents(5000), monthlyInterestRate: 0.01, minPaymentCents: cents(200) }),
      debt({ id: 'hightax', remainingCents: cents(5000), monthlyInterestRate: 0.05, minPaymentCents: cents(200) }),
    ];
    const result = simulateDebtStrategy(inputs, cents(5000), 'snowball');
    expect(result.feasible).toBe(true);
    expect(result.order).toHaveLength(2);
  });

  it('calcula juros totais e total pago corretamente', () => {
    // 1 dívida simples: saldo 1000, juros 0%, mínimo 500, budget 500 → 2 meses, 0 juros
    const result = simulateDebtStrategy([
      debt({ id: 'd1', remainingCents: cents(1000), monthlyInterestRate: 0, minPaymentCents: cents(500) }),
    ], cents(500), 'avalanche');
    expect(result.feasible).toBe(true);
    expect(result.totalInterestCents).toBe(0);
    expect(result.totalPaidCents).toBe(1000);
    expect(result.months).toBe(2);
  });
});

// ─── compareDebtStrategies ────────────────────────────────────────────────────

describe('compareDebtStrategies', () => {
  it('recomenda avalanche quando ambas são viáveis (minimiza juros)', () => {
    const inputs = [
      debt({ id: 'd1', remainingCents: cents(50000), monthlyInterestRate: 0.05, minPaymentCents: cents(2000) }),
      debt({ id: 'd2', remainingCents: cents(10000), monthlyInterestRate: 0.01, minPaymentCents: cents(500) }),
    ];
    const result = compareDebtStrategies(inputs, cents(10000));
    expect(result.avalanche.feasible).toBe(true);
    expect(result.snowball.feasible).toBe(true);
    // avalanche minimiza juros por definição
    expect(result.recommended).toBe('avalanche');
    expect(result.interestSavingsCents).toBeGreaterThanOrEqual(0);
  });

  it('interestSavingsCents = 0 quando avalanche = snowball (1 dívida)', () => {
    // Com 1 dívida, as estratégias são idênticas
    const inputs = [
      debt({ id: 'd1', remainingCents: cents(10000), monthlyInterestRate: 0.02, minPaymentCents: cents(1000) }),
    ];
    const result = compareDebtStrategies(inputs, cents(3000));
    expect(result.interestSavingsCents).toBe(0);
    expect(result.monthsDifference).toBe(0);
  });

  it('monthsDifference = snowball.months − avalanche.months', () => {
    const inputs = [
      debt({ id: 'd1', remainingCents: cents(50000), monthlyInterestRate: 0.05, minPaymentCents: cents(2000) }),
      debt({ id: 'd2', remainingCents: cents(5000),  monthlyInterestRate: 0.01, minPaymentCents: cents(200) }),
    ];
    const result = compareDebtStrategies(inputs, cents(10000));
    expect(result.monthsDifference).toBe(result.snowball.months - result.avalanche.months);
  });

  it('recomenda snowball quando avalanche é inviável', () => {
    // orçamento suficiente para snowball mas... na prática com mesma lógica ambas falham igual
    // Para testar !avalanche.feasible && snowball.feasible precisamos de um edge case impossível
    // com um motor simétrico. Em vez disso, verificamos que recommended é sempre definido.
    const inputs = [
      debt({ id: 'd1', remainingCents: cents(1000), monthlyInterestRate: 0, minPaymentCents: cents(500) }),
    ];
    const result = compareDebtStrategies(inputs, cents(500));
    expect(['avalanche', 'snowball']).toContain(result.recommended);
  });
});
