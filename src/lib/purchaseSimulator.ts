/**
 * purchaseSimulator.ts — Motor puro de decisão de compra.
 * Zero React, zero Firebase, zero I/O. 100% testável.
 */
import type { Centavos } from '../shared/types/money';

// ─── Tipos públicos ───────────────────────────────────────────────────────────

export interface PurchaseSimulatorInput {
  /** Valor da compra em centavos */
  priceCents: Centavos;
  /** Número de parcelas (1 = à vista) */
  installments: number;
  /** Dia de fechamento do cartão (1–31) */
  closingDay: number;
  /** Data da compra no formato YYYY-MM-DD */
  purchaseDateISO: string;

  /** Saldo disponível em centavos */
  currentBalanceCents: Centavos;
  /** Renda mensal em centavos (opcional) */
  monthlyIncomeCents?: Centavos;
  /** % máximo do limite que pode ser comprometido (default 0.30 = 30%) */
  commitmentLimitPct?: number;
  /** Total já comprometido com parcelas existentes em centavos */
  currentCommittedCents?: Centavos;

  /** Taxa CDI mensal, ex: 0.0083 = 0,83% a.m. (default 0.0083) */
  cdiMonthlyRate?: number;
}

export type VerdictColor = 'green' | 'yellow' | 'red';

export interface InvoiceImpact {
  /** Mês de competência no formato YYYY-MM */
  competencia: string;
  /** Impacto desta compra na fatura (centavos) */
  additionalCents: Centavos;
}

export interface PurchaseSimulatorResult {
  verdict: VerdictColor;
  /** Explicações em português, máx 3 itens */
  verdictReasons: string[];

  /** Valor de cada parcela (divisão inteira; última recebe o restante) */
  installmentAmountCents: Centavos;
  /** Custo total da compra em centavos */
  totalCostCents: Centavos;
  /** Impacto por competência de fatura */
  invoiceImpact: InvoiceImpact[];

  /** Preço à vista (= priceCents, sem juros) */
  cashPriceCents: Centavos;
  /** Diferença de custo entre parcelado e à vista (0 quando sem juros) */
  installmentExtraCents: Centavos;

  /** Ganho potencial investindo o valor à vista em CDI pelo período das parcelas */
  investmentGainCents?: Centavos;
  /** Vantagem líquida de parcelar e investir (> 0 = melhor parcelar) */
  investmentNetAdvantage?: Centavos;

  /** Limite de comprometimento disponível após esta compra (centavos) */
  effectiveLimitAfterCents: Centavos;
  /** Percentual do limite comprometido após a compra */
  limitUsagePct: number;
}

// ─── Helper: competência de fatura ───────────────────────────────────────────

/**
 * Calcula o mês de competência (YYYY-MM) para uma parcela.
 *
 * Regra: se a data da compra for >= dia de fechamento, a competência base é
 * o mês seguinte; caso contrário é o mês corrente. Para parcelas > 1,
 * incrementa a competência base pelo índice da parcela.
 */
export function computeCompetencia(
  purchaseDateISO: string,
  closingDay: number,
  installmentIndex: number,
): string {
  const [y, m, d] = purchaseDateISO.split('-').map(Number) as [number, number, number];
  let baseYear = y;
  let baseMonth = m; // 1-12

  if (d >= closingDay) {
    // Após fechamento → próxima fatura
    baseMonth++;
    if (baseMonth > 12) {
      baseMonth = 1;
      baseYear++;
    }
  }

  const targetMonth = baseMonth + installmentIndex;
  const finalYear = baseYear + Math.floor((targetMonth - 1) / 12);
  const finalMonth = ((targetMonth - 1) % 12) + 1;

  return `${finalYear}-${String(finalMonth).padStart(2, '0')}`;
}

// ─── Função principal ─────────────────────────────────────────────────────────

export function simulatePurchase(input: PurchaseSimulatorInput): PurchaseSimulatorResult {
  const {
    priceCents,
    installments,
    closingDay,
    purchaseDateISO,
    currentBalanceCents,
    monthlyIncomeCents,
    commitmentLimitPct = 0.30,
    currentCommittedCents = 0 as Centavos,
    cdiMonthlyRate = 0.0083,
  } = input;

  // ── 1. Parcelas (divisão inteira; restante na última) ──────────────────────
  const n = Math.max(1, Math.floor(installments));
  // Safe integer division: compute remainder first so (priceCents - rem) divides n exactly.
  const _rem = priceCents % n;
  const installmentCents = ((priceCents - _rem) / n) as Centavos;
  const lastInstallmentCents = (installmentCents + _rem) as Centavos;
  const totalCostCents = priceCents; // sem juros (cartão padrão)

  // ── 2. Impacto por competência ─────────────────────────────────────────────
  const invoiceImpact: InvoiceImpact[] = [];
  for (let i = 0; i < n; i++) {
    const competencia = computeCompetencia(purchaseDateISO, closingDay, i);
    const additionalCents = (i === n - 1 ? lastInstallmentCents : installmentCents) as Centavos;
    invoiceImpact.push({ competencia, additionalCents });
  }

  // ── 3. Comprometimento mensal ──────────────────────────────────────────────
  const newCommittedCents = (currentCommittedCents + installmentCents) as Centavos;

  const limitUsagePct =
    monthlyIncomeCents && monthlyIncomeCents > 0
      ? newCommittedCents / monthlyIncomeCents
      : 0;

  const effectiveLimitAfterCents = monthlyIncomeCents
    ? (Math.max(0, Math.floor(monthlyIncomeCents * commitmentLimitPct) - newCommittedCents) as Centavos)
    : (Math.max(0, currentBalanceCents - priceCents) as Centavos);

  // ── 4. Comparação CDI (parcelar vs pagar à vista e investir) ───────────────
  let investmentGainCents: Centavos | undefined;
  let investmentNetAdvantage: Centavos | undefined;

  if (n > 1 && cdiMonthlyRate > 0) {
    // Ganho de investir o valor à vista pelo período das parcelas
    const gain = Math.floor(priceCents * (Math.pow(1 + cdiMonthlyRate, n) - 1));
    investmentGainCents = gain as Centavos;
    // Sem juros no cartão → ganho líquido = ganho CDI inteiro
    investmentNetAdvantage = gain as Centavos;
  }

  // ── 5. Veredito ────────────────────────────────────────────────────────────
  const reasons: string[] = [];
  let verdict: VerdictColor = 'green';

  if (priceCents > currentBalanceCents) {
    verdict = 'red';
    reasons.push('Compra supera o saldo disponível');
  } else if (monthlyIncomeCents && limitUsagePct > commitmentLimitPct) {
    verdict = 'yellow';
    reasons.push(
      `Comprometimento chegaria a ${(limitUsagePct * 100).toFixed(0)}% da renda mensal`,
    );
  }

  if (n > 1 && investmentGainCents !== undefined && investmentGainCents > 0) {
    const gainDisplay = (investmentGainCents / 100).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      maximumFractionDigits: 0,
    });
    reasons.push(
      `Parcelar libera capital para investir — ganho CDI potencial de ${gainDisplay}`,
    );
  }

  if (reasons.length === 0 || (reasons.length === 1 && verdict === 'green')) {
    if (!reasons.some(r => r.includes('saldo') || r.includes('renda'))) {
      reasons.unshift('Compra dentro das margens financeiras saudáveis');
    }
  }

  return {
    verdict,
    verdictReasons: reasons.slice(0, 3),
    installmentAmountCents: installmentCents,
    totalCostCents,
    invoiceImpact,
    cashPriceCents: priceCents,
    installmentExtraCents: 0 as Centavos,
    ...(investmentGainCents !== undefined ? { investmentGainCents } : {}),
    ...(investmentNetAdvantage !== undefined ? { investmentNetAdvantage } : {}),
    effectiveLimitAfterCents,
    limitUsagePct,
  };
}
