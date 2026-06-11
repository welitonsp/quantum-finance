import { describe, it, expect } from 'vitest';
import { simulatePurchase, computeCompetencia } from './purchaseSimulator';
import type { Centavos } from '../shared/types/money';

// ─── Helper ───────────────────────────────────────────────────────────────────
const cents = (v: number) => v as Centavos;

// ─── computeCompetencia ───────────────────────────────────────────────────────
describe('computeCompetencia', () => {
  it('compra antes do fechamento → mesma competência', () => {
    // Compra dia 5, fechamento dia 10 → parcela 0 = mês corrente
    expect(computeCompetencia('2025-01-05', 10, 0)).toBe('2025-01');
  });

  it('compra no dia do fechamento → próxima competência', () => {
    // Compra dia 10, fechamento dia 10 → parcela 0 = mês seguinte
    expect(computeCompetencia('2025-01-10', 10, 0)).toBe('2025-02');
  });

  it('compra após fechamento → próxima competência', () => {
    // Compra dia 15, fechamento dia 10 → parcela 0 = mês seguinte
    expect(computeCompetencia('2025-01-15', 10, 0)).toBe('2025-02');
  });

  it('parcela 1 avança um mês em relação à base', () => {
    // Compra dia 5 (antes do fechamento dia 10) → base = Jan; parcela 1 = Fev
    expect(computeCompetencia('2025-01-05', 10, 1)).toBe('2025-02');
  });

  it('virada de ano correta', () => {
    // Compra dia 15 (após fechamento dia 10) em dezembro → base = Jan próximo
    expect(computeCompetencia('2025-12-15', 10, 0)).toBe('2026-01');
    // parcela 1 → Fev
    expect(computeCompetencia('2025-12-15', 10, 1)).toBe('2026-02');
  });

  it('3 parcelas — sequência correta de competências', () => {
    const result = [0, 1, 2].map(i => computeCompetencia('2025-03-20', 15, i));
    expect(result).toEqual(['2025-04', '2025-05', '2025-06']);
  });
});

// ─── simulatePurchase — veredito verde ───────────────────────────────────────
describe('simulatePurchase — veredito verde', () => {
  it('compra pequena com saldo suficiente retorna green', () => {
    const result = simulatePurchase({
      priceCents:           cents(50000),  // R$ 500
      installments:         1,
      closingDay:           10,
      purchaseDateISO:      '2025-06-05',
      currentBalanceCents:  cents(500000), // R$ 5.000
      monthlyIncomeCents:   cents(600000), // R$ 6.000
      currentCommittedCents: cents(0),
    });
    expect(result.verdict).toBe('green');
    expect(result.verdictReasons.length).toBeGreaterThan(0);
  });

  it('à vista tem parcela igual ao preço total', () => {
    const result = simulatePurchase({
      priceCents:          cents(100000),
      installments:        1,
      closingDay:          10,
      purchaseDateISO:     '2025-06-05',
      currentBalanceCents: cents(500000),
    });
    expect(result.installmentAmountCents).toBe(100000);
    expect(result.totalCostCents).toBe(100000);
    expect(result.invoiceImpact).toHaveLength(1);
  });

  it('installmentExtraCents é zero (sem juros)', () => {
    const result = simulatePurchase({
      priceCents:          cents(300000),
      installments:        3,
      closingDay:          10,
      purchaseDateISO:     '2025-06-05',
      currentBalanceCents: cents(1000000),
    });
    expect(result.installmentExtraCents).toBe(0);
    expect(result.totalCostCents).toBe(300000);
  });
});

// ─── simulatePurchase — veredito vermelho ────────────────────────────────────
describe('simulatePurchase — veredito vermelho', () => {
  it('compra maior que saldo retorna red', () => {
    const result = simulatePurchase({
      priceCents:          cents(600000),  // R$ 6.000
      installments:        1,
      closingDay:          10,
      purchaseDateISO:     '2025-06-05',
      currentBalanceCents: cents(500000),  // R$ 5.000
    });
    expect(result.verdict).toBe('red');
    expect(result.verdictReasons[0]).toContain('saldo');
  });

  it('red mesmo que parcelado quando preço > saldo', () => {
    const result = simulatePurchase({
      priceCents:          cents(200000),
      installments:        6,
      closingDay:          10,
      purchaseDateISO:     '2025-06-05',
      currentBalanceCents: cents(100000), // menor que o preço total
    });
    expect(result.verdict).toBe('red');
  });
});

// ─── simulatePurchase — veredito amarelo ─────────────────────────────────────
describe('simulatePurchase — veredito amarelo (comprometimento > 30%)', () => {
  it('comprometimento acima do limite padrão retorna yellow', () => {
    const result = simulatePurchase({
      priceCents:             cents(200000), // R$ 2.000 → parcela 1x = R$ 2.000
      installments:           1,
      closingDay:             10,
      purchaseDateISO:        '2025-06-05',
      currentBalanceCents:    cents(1000000),
      monthlyIncomeCents:     cents(500000), // R$ 5.000
      currentCommittedCents:  cents(0),
      // comprometimento após: 2000/5000 = 40% > 30%
    });
    expect(result.verdict).toBe('yellow');
    expect(result.verdictReasons[0]).toContain('renda');
  });

  it('comprometimento abaixo do limite retorna green', () => {
    const result = simulatePurchase({
      priceCents:            cents(100000), // R$ 1.000 → 1000/5000 = 20% < 30%
      installments:          1,
      closingDay:            10,
      purchaseDateISO:       '2025-06-05',
      currentBalanceCents:   cents(1000000),
      monthlyIncomeCents:    cents(500000),
      currentCommittedCents: cents(0),
    });
    expect(result.verdict).toBe('green');
  });

  it('comprometimento customizado (20%) é respeitado', () => {
    const result = simulatePurchase({
      priceCents:            cents(120000), // R$ 1.200 → 1200/5000 = 24% > 20%
      installments:          1,
      closingDay:            10,
      purchaseDateISO:       '2025-06-05',
      currentBalanceCents:   cents(1000000),
      monthlyIncomeCents:    cents(500000),
      commitmentLimitPct:    0.20,
      currentCommittedCents: cents(0),
    });
    expect(result.verdict).toBe('yellow');
  });
});

// ─── simulatePurchase — parcelamento e CDI ────────────────────────────────────
describe('simulatePurchase — parcelamento 3x com CDI', () => {
  it('investmentGainCents > 0 para parcelamento com CDI', () => {
    const result = simulatePurchase({
      priceCents:          cents(300000), // R$ 3.000
      installments:        3,
      closingDay:          10,
      purchaseDateISO:     '2025-06-05',
      currentBalanceCents: cents(1000000),
      cdiMonthlyRate:      0.0083,
    });
    expect(result.investmentGainCents).toBeDefined();
    expect(result.investmentGainCents!).toBeGreaterThan(0);
  });

  it('investmentNetAdvantage igual a investmentGainCents (sem juros no cartão)', () => {
    const result = simulatePurchase({
      priceCents:          cents(300000),
      installments:        3,
      closingDay:          10,
      purchaseDateISO:     '2025-06-05',
      currentBalanceCents: cents(1000000),
      cdiMonthlyRate:      0.0083,
    });
    expect(result.investmentNetAdvantage).toBe(result.investmentGainCents);
  });

  it('à vista não gera investmentGainCents', () => {
    const result = simulatePurchase({
      priceCents:          cents(300000),
      installments:        1,
      closingDay:          10,
      purchaseDateISO:     '2025-06-05',
      currentBalanceCents: cents(1000000),
    });
    expect(result.investmentGainCents).toBeUndefined();
  });

  it('parcelas corretas: divisão inteira + restante na última', () => {
    // R$ 1.000 / 3 = 333,33… → 333 por parcela, última = 334
    const result = simulatePurchase({
      priceCents:          cents(100000),
      installments:        3,
      closingDay:          10,
      purchaseDateISO:     '2025-06-05',
      currentBalanceCents: cents(500000),
    });
    expect(result.installmentAmountCents).toBe(33333);
    expect(result.invoiceImpact[0]!.additionalCents).toBe(33333);
    expect(result.invoiceImpact[1]!.additionalCents).toBe(33333);
    expect(result.invoiceImpact[2]!.additionalCents).toBe(33334); // restante
    const total = result.invoiceImpact.reduce((s, x) => s + x.additionalCents, 0);
    expect(total).toBe(100000);
  });
});

// ─── simulatePurchase — impacto de competência ───────────────────────────────
describe('simulatePurchase — impacto por competência', () => {
  it('compra após fechamento → primeira competência é o mês seguinte', () => {
    const result = simulatePurchase({
      priceCents:          cents(60000),
      installments:        3,
      closingDay:          10,
      purchaseDateISO:     '2025-06-15', // dia 15 >= fechamento 10
      currentBalanceCents: cents(500000),
    });
    expect(result.invoiceImpact[0]!.competencia).toBe('2025-07');
    expect(result.invoiceImpact[1]!.competencia).toBe('2025-08');
    expect(result.invoiceImpact[2]!.competencia).toBe('2025-09');
  });

  it('compra antes do fechamento → primeira competência é o mesmo mês', () => {
    const result = simulatePurchase({
      priceCents:          cents(60000),
      installments:        2,
      closingDay:          20,
      purchaseDateISO:     '2025-06-05', // dia 5 < fechamento 20
      currentBalanceCents: cents(500000),
    });
    expect(result.invoiceImpact[0]!.competencia).toBe('2025-06');
    expect(result.invoiceImpact[1]!.competencia).toBe('2025-07');
  });
});
