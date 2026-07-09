import { describe, it, expect } from 'vitest';
import { simulatePurchase, type PurchaseSimulatorInput } from '../purchaseSimulator';
import type { Centavos } from '../../shared/types/money';

const cents = (n: number): Centavos => n as Centavos;

function base(overrides: Partial<PurchaseSimulatorInput> = {}): PurchaseSimulatorInput {
  return {
    priceCents:          cents(10000),
    installments:        1,
    closingDay:          10,
    purchaseDateISO:     '2026-07-09',
    currentBalanceCents: cents(50000),
    ...overrides,
  };
}

// ─── Divisão de parcelas (modulo-safe) ───────────────────────────────────────

describe('simulatePurchase — divisão de parcelas', () => {
  it('à vista: 1 parcela = valor total', () => {
    const r = simulatePurchase(base({ priceCents: cents(10000), installments: 1 }));
    expect(r.installmentAmountCents).toBe(10000);
    expect(r.totalCostCents).toBe(10000);
    expect(r.invoiceImpact).toHaveLength(1);
    expect(r.invoiceImpact[0]!.additionalCents).toBe(10000);
  });

  it('3 parcelas exatas sem resto (9000/3 = 3000 cada)', () => {
    const r = simulatePurchase(base({ priceCents: cents(9000), installments: 3 }));
    expect(r.installmentAmountCents).toBe(3000);
    expect(r.invoiceImpact).toHaveLength(3);
    expect(r.invoiceImpact.every(p => p.additionalCents === 3000)).toBe(true);
  });

  it('parcelas com resto: últimas absorvem o centavo restante (10001/3)', () => {
    // (10001 - 2) / 3 = 3333 por parcela; última = 3333 + 2 = 3335
    const r = simulatePurchase(base({ priceCents: cents(10001), installments: 3 }));
    expect(r.installmentAmountCents).toBe(3333);
    expect(r.invoiceImpact[0]!.additionalCents).toBe(3333);
    expect(r.invoiceImpact[1]!.additionalCents).toBe(3333);
    expect(r.invoiceImpact[2]!.additionalCents).toBe(10001 - 3333 - 3333); // 3335
    // soma = preço total
    const soma = r.invoiceImpact.reduce((a, p) => a + p.additionalCents, 0);
    expect(soma).toBe(10001);
  });

  it('installments fracionário é truncado para inteiro (Math.floor)', () => {
    const r = simulatePurchase(base({ priceCents: cents(10000), installments: 2.9 }));
    expect(r.invoiceImpact).toHaveLength(2);
  });

  it('installments 0 ou negativo tratado como 1 (Math.max guard)', () => {
    const r = simulatePurchase(base({ priceCents: cents(10000), installments: 0 }));
    expect(r.invoiceImpact).toHaveLength(1);
  });
});

// ─── Impacto por competência ──────────────────────────────────────────────────

describe('simulatePurchase — invoiceImpact / competência', () => {
  it('compra antes do fechamento: parcelas acumulam a partir do mês corrente', () => {
    // dia 9 <= closingDay 10 → não desloca → competência base = 2026-07
    const r = simulatePurchase(base({
      priceCents: cents(6000), installments: 3,
      purchaseDateISO: '2026-07-09', closingDay: 10,
    }));
    expect(r.invoiceImpact[0]!.competencia).toBe('2026-07');
    expect(r.invoiceImpact[1]!.competencia).toBe('2026-08');
    expect(r.invoiceImpact[2]!.competencia).toBe('2026-09');
  });

  it('compra depois do fechamento: desloca a competência base em 1 mês', () => {
    // dia 15 > closingDay 10 → base = 2026-08
    const r = simulatePurchase(base({
      priceCents: cents(6000), installments: 2,
      purchaseDateISO: '2026-07-15', closingDay: 10,
    }));
    expect(r.invoiceImpact[0]!.competencia).toBe('2026-08');
    expect(r.invoiceImpact[1]!.competencia).toBe('2026-09');
  });
});

// ─── Veredito sem cardEffectiveLimitCents ────────────────────────────────────

describe('simulatePurchase — veredito sem cardEffectiveLimitCents', () => {
  it('green quando compra cabe no saldo e sem comprometimento excessivo', () => {
    const r = simulatePurchase(base({
      priceCents: cents(5000),
      currentBalanceCents: cents(50000),
    }));
    expect(r.verdict).toBe('green');
    expect(r.verdictReasons.some(s => s.includes('saudáveis'))).toBe(true);
  });

  it('red quando compra supera saldo disponível', () => {
    const r = simulatePurchase(base({
      priceCents: cents(60000),
      currentBalanceCents: cents(50000),
    }));
    expect(r.verdict).toBe('red');
    expect(r.verdictReasons.some(s => s.includes('saldo'))).toBe(true);
  });

  it('yellow quando comprometimento excede o limite com renda informada', () => {
    // renda 10000, comprometimento atual 0, parcela = 5000 = 50% (> 30%)
    const r = simulatePurchase(base({
      priceCents: cents(5000),
      installments: 1,
      currentBalanceCents: cents(50000),
      monthlyIncomeCents: cents(10000),
      commitmentLimitPct: 0.30,
      currentCommittedCents: cents(0),
    }));
    expect(r.verdict).toBe('yellow');
    expect(r.verdictReasons.some(s => s.includes('renda'))).toBe(true);
  });

  it('green sem alerta de comprometimento quando abaixo do limite de renda', () => {
    // renda 100000, parcela 5000 = 5% (< 30%)
    const r = simulatePurchase(base({
      priceCents: cents(5000),
      currentBalanceCents: cents(50000),
      monthlyIncomeCents: cents(100000),
    }));
    expect(r.verdict).toBe('green');
  });

  it('effectiveLimitAfterCents usa currentBalanceCents quando sem renda e sem cardLimit', () => {
    const r = simulatePurchase(base({
      priceCents: cents(10000),
      currentBalanceCents: cents(30000),
    }));
    expect(r.effectiveLimitAfterCents).toBe(30000 - 10000);
  });

  it('effectiveLimitAfterCents = 0 quando compra excede saldo', () => {
    const r = simulatePurchase(base({
      priceCents: cents(60000),
      currentBalanceCents: cents(50000),
    }));
    expect(r.effectiveLimitAfterCents).toBe(0);
  });

  it('effectiveLimitAfterCents usa margem de renda quando monthlyIncomeCents fornecida', () => {
    // renda 10000, limite 30%, piso 3000; comprometido atual 0, parcela 500
    // margem restante = 3000 - 500 = 2500
    const r = simulatePurchase(base({
      priceCents: cents(500),
      installments: 1,
      currentBalanceCents: cents(50000),
      monthlyIncomeCents: cents(10000),
      commitmentLimitPct: 0.30,
      currentCommittedCents: cents(0),
    }));
    expect(r.effectiveLimitAfterCents).toBe(3000 - 500);
  });
});

// ─── Veredito com cardEffectiveLimitCents ─────────────────────────────────────

describe('simulatePurchase — veredito com cardEffectiveLimitCents', () => {
  it('red quando compra excede o limite efetivo do cartão', () => {
    const r = simulatePurchase(base({
      priceCents: cents(20000),
      cardEffectiveLimitCents: cents(10000),
    }));
    expect(r.verdict).toBe('red');
    expect(r.verdictReasons.some(s => s.includes('limite efetivo'))).toBe(true);
  });

  it('yellow quando limite OK mas comprometimento excede renda', () => {
    const r = simulatePurchase(base({
      priceCents: cents(5000),
      cardEffectiveLimitCents: cents(50000),
      monthlyIncomeCents: cents(10000),
      commitmentLimitPct: 0.30,
      currentCommittedCents: cents(0),
    }));
    expect(r.verdict).toBe('yellow');
  });

  it('green quando dentro do limite efetivo e sem excesso de comprometimento', () => {
    const r = simulatePurchase(base({
      priceCents: cents(5000),
      cardEffectiveLimitCents: cents(50000),
    }));
    expect(r.verdict).toBe('green');
  });

  it('effectiveLimitAfterCents usa cardEffectiveLimitCents', () => {
    const r = simulatePurchase(base({
      priceCents: cents(10000),
      cardEffectiveLimitCents: cents(40000),
    }));
    expect(r.effectiveLimitAfterCents).toBe(40000 - 10000);
  });

  it('effectiveLimitAfterCents = 0 quando limite efetivo excedido', () => {
    const r = simulatePurchase(base({
      priceCents: cents(50000),
      cardEffectiveLimitCents: cents(10000),
    }));
    expect(r.effectiveLimitAfterCents).toBe(0);
  });
});

// ─── CDI / comparação de investimento ────────────────────────────────────────

describe('simulatePurchase — comparação CDI', () => {
  it('investmentGainCents é calculado quando n > 1 e cdiMonthlyRate > 0', () => {
    const r = simulatePurchase(base({
      priceCents: cents(10000),
      installments: 12,
      cdiMonthlyRate: 0.0083,
    }));
    expect(r.investmentGainCents).toBeDefined();
    expect(r.investmentGainCents!).toBeGreaterThan(0);
    expect(r.investmentNetAdvantage).toBeDefined();
    expect(r.verdictReasons.some(s => s.includes('CDI'))).toBe(true);
  });

  it('investmentGainCents é undefined quando à vista (n=1)', () => {
    const r = simulatePurchase(base({ installments: 1 }));
    expect(r.investmentGainCents).toBeUndefined();
    expect(r.investmentNetAdvantage).toBeUndefined();
  });

  it('investmentGainCents é undefined quando cdiMonthlyRate = 0', () => {
    const r = simulatePurchase(base({ installments: 3, cdiMonthlyRate: 0 }));
    expect(r.investmentGainCents).toBeUndefined();
  });
});

// ─── Propriedades gerais ──────────────────────────────────────────────────────

describe('simulatePurchase — propriedades gerais', () => {
  it('cashPriceCents = priceCents (sem juros de parcelamento)', () => {
    const r = simulatePurchase(base({ priceCents: cents(12345) }));
    expect(r.cashPriceCents).toBe(12345);
    expect(r.installmentExtraCents).toBe(0);
  });

  it('limitUsagePct = 0 quando monthlyIncomeCents não fornecida', () => {
    // Omitindo monthlyIncomeCents → fallback para 0
    const r = simulatePurchase({
      priceCents: cents(5000),
      installments: 1,
      closingDay: 10,
      purchaseDateISO: '2026-07-09',
      currentBalanceCents: cents(50000),
    });
    expect(r.limitUsagePct).toBe(0);
  });

  it('verdictReasons tem no máximo 3 itens', () => {
    const r = simulatePurchase(base({
      priceCents: cents(60000),
      currentBalanceCents: cents(50000),
      installments: 12,
      cdiMonthlyRate: 0.0083,
      monthlyIncomeCents: cents(10000),
    }));
    expect(r.verdictReasons.length).toBeLessThanOrEqual(3);
  });
});
