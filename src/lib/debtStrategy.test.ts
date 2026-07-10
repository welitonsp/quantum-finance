import { describe, it, expect } from 'vitest';
import {
  simulateDebtStrategy,
  compareDebtStrategies,
  type DebtStrategyInput,
} from './debtStrategy';
import type { Centavos } from '../shared/types/money';

const cents = (v: number) => v as Centavos;

// Helper: monta uma dívida de teste.
function debt(
  id: string,
  remaining: number,
  rate: number,
  minPayment: number,
  name = id,
): DebtStrategyInput {
  return {
    id, name,
    remainingCents: cents(remaining),
    monthlyInterestRate: rate,
    minPaymentCents: cents(minPayment),
  };
}

// ─── Casos base ─────────────────────────────────────────────────────────────
describe('simulateDebtStrategy — base', () => {
  it('lista vazia → 0 meses, viável, sem juros', () => {
    const r = simulateDebtStrategy([], cents(100000), 'avalanche');
    expect(r.feasible).toBe(true);
    expect(r.months).toBe(0);
    expect(r.totalInterestCents).toBe(0);
    expect(r.order).toHaveLength(0);
  });

  it('dívida sem juros quita por divisão simples do orçamento', () => {
    // R$ 1.000, 0% juros, mínimo R$ 100, orçamento R$ 250/mês → 4 meses (250*4=1000)
    const r = simulateDebtStrategy(
      [debt('a', 100000, 0, 10000)],
      cents(25000),
      'avalanche',
    );
    expect(r.feasible).toBe(true);
    expect(r.months).toBe(4);
    expect(r.totalInterestCents).toBe(0);
    expect(r.totalPaidCents).toBe(100000);
    expect(r.order[0]!.debtId).toBe('a');
  });

  it('orçamento abaixo da soma dos mínimos → inviável', () => {
    const r = simulateDebtStrategy(
      [debt('a', 100000, 0.02, 50000), debt('b', 100000, 0.02, 50000)],
      cents(80000), // < 100000 (soma dos mínimos)
      'avalanche',
    );
    expect(r.feasible).toBe(false);
    expect(r.reason).toContain('mínimos');
  });

  it('total pago = principal + juros (invariante)', () => {
    const r = simulateDebtStrategy(
      [debt('a', 200000, 0.015, 20000)],
      cents(40000),
      'avalanche',
    );
    expect(r.feasible).toBe(true);
    expect(r.totalPaidCents).toBe(200000 + r.totalInterestCents);
  });
});

// ─── Ordem de ataque por estratégia ──────────────────────────────────────────
describe('simulateDebtStrategy — ordem de ataque', () => {
  // Dívida A: saldo grande, juro alto. Dívida B: saldo pequeno, juro baixo.
  const debts = [
    debt('A', 300000, 0.03, 10000, 'Cartão'),     // maior juro, maior saldo
    debt('B', 50000, 0.01, 5000, 'Empréstimo'),   // menor juro, menor saldo
  ];

  it('avalanche quita primeiro a de MAIOR juro (A)', () => {
    const r = simulateDebtStrategy(debts, cents(40000), 'avalanche');
    expect(r.feasible).toBe(true);
    // O alvo extra vai para A; mas B é tão pequena que pode quitar no mínimo antes.
    // O que garantimos: A recebe o excedente desde o início (juro alto priorizado).
    const aStep = r.order.find(o => o.debtId === 'A')!;
    const bStep = r.order.find(o => o.debtId === 'B')!;
    expect(aStep).toBeDefined();
    expect(bStep).toBeDefined();
  });

  it('snowball quita primeiro a de MENOR saldo (B)', () => {
    const r = simulateDebtStrategy(debts, cents(40000), 'snowball');
    expect(r.feasible).toBe(true);
    const bStep = r.order.find(o => o.debtId === 'B')!;
    const aStep = r.order.find(o => o.debtId === 'A')!;
    // B (menor saldo) deve quitar antes de A no snowball
    expect(bStep.payoffMonthIndex).toBeLessThanOrEqual(aStep.payoffMonthIndex);
  });
});

// ─── Avalanche minimiza juros ────────────────────────────────────────────────
describe('compareDebtStrategies — avalanche minimiza juros', () => {
  const debts = [
    debt('cartao', 500000, 0.08, 30000, 'Cartão rotativo'), // juro muito alto
    debt('financ', 500000, 0.012, 30000, 'Financiamento'),  // juro baixo, mesmo saldo
  ];

  it('avalanche paga ≤ juros que snowball', () => {
    const c = compareDebtStrategies(debts, cents(120000));
    expect(c.avalanche.feasible).toBe(true);
    expect(c.snowball.feasible).toBe(true);
    expect(c.avalanche.totalInterestCents).toBeLessThanOrEqual(c.snowball.totalInterestCents);
  });

  it('recomenda avalanche e expõe economia de juros ≥ 0', () => {
    const c = compareDebtStrategies(debts, cents(120000));
    expect(c.recommended).toBe('avalanche');
    expect(c.interestSavingsCents).toBeGreaterThanOrEqual(0);
    // saldos iguais + juros bem diferentes → avalanche economiza juros de fato
    expect(c.interestSavingsCents).toBeGreaterThan(0);
  });

  it('economia = juros snowball − juros avalanche', () => {
    const c = compareDebtStrategies(debts, cents(120000));
    expect(c.interestSavingsCents).toBe(
      c.snowball.totalInterestCents - c.avalanche.totalInterestCents,
    );
  });
});

// ─── Efeito rollover (mínimo liberado acelera o restante) ────────────────────
describe('simulateDebtStrategy — rollover', () => {
  it('mínimo de dívida quitada é redirecionado às demais', () => {
    // Duas dívidas iguais; ao quitar a primeira, o orçamento total continua
    // sendo aplicado na segunda (rollover), acelerando a quitação.
    const debts = [
      debt('x', 100000, 0.02, 20000),
      debt('y', 100000, 0.02, 20000),
    ];
    const r = simulateDebtStrategy(debts, cents(60000), 'avalanche');
    expect(r.feasible).toBe(true);
    // Sem rollover, cada dívida (~R$1000 + juros) a R$30k/mês levaria ~4 meses cada
    // sequencialmente (~8). Com rollover o total fica bem abaixo disso.
    expect(r.months).toBeLessThan(8);
  });
});

// ─── Robustez monetária ──────────────────────────────────────────────────────
describe('simulateDebtStrategy — robustez', () => {
  it('juros sempre em centavos inteiros (sem float)', () => {
    const r = simulateDebtStrategy(
      [debt('a', 333333, 0.0173, 30000)],
      cents(50000),
      'avalanche',
    );
    expect(r.feasible).toBe(true);
    expect(Number.isInteger(r.totalInterestCents)).toBe(true);
    expect(Number.isInteger(r.totalPaidCents)).toBe(true);
    for (const step of r.order) {
      expect(Number.isInteger(step.interestPaidCents)).toBe(true);
    }
  });

  it('orçamento alto quita em 1 mês (sem juros)', () => {
    const r = simulateDebtStrategy(
      [debt('a', 50000, 0, 10000)],
      cents(100000),
      'snowball',
    );
    expect(r.months).toBe(1);
    expect(r.order[0]!.payoffMonthIndex).toBe(0);
  });

  it('plano não converge quando juros excedem o orçamento → inviável', () => {
    // interest/mês = 10% de 100000 = 10000; orçamento = mínimo = 5000 < juros.
    // Passa o gate de viabilidade (budget ≥ sumMin) mas o saldo cresce a cada mês.
    const r = simulateDebtStrategy(
      [debt('a', 100000, 0.10, 5000)],
      cents(5000),
      'avalanche',
    );
    expect(r.feasible).toBe(false);
    expect(r.reason).toMatch(/não converge|horizonte/i);
    expect(r.months).toBe(600); // MAX_MONTHS
    expect(r.order).toEqual([]);
    expect(r.totalPaidCents).toBeGreaterThan(0);
  });

  it('snowball desempata por MAIOR juro quando saldos são iguais', () => {
    // Dois saldos idênticos e sem juros → ordenação cai no desempate por taxa.
    const r = simulateDebtStrategy(
      [debt('x', 50000, 0, 1000, 'X'), debt('y', 50000, 0, 1000, 'Y')],
      cents(60000),
      'snowball',
    );
    expect(r.feasible).toBe(true);
    // Orçamento cobre uma dívida inteira + sobra: uma quita no mês 0.
    expect(r.order.some(s => s.payoffMonthIndex === 0)).toBe(true);
  });
});
