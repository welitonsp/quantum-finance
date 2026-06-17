/**
 * cardProjection.ts — Motor puro de projeção de faturas de cartão de crédito.
 * Zero React, zero Firebase, zero I/O. 100% testável.
 *
 * Responde, para um cartão e um conjunto de transações, a três perguntas que a
 * FASE C exige e que `calcCardMetrics` (fatura atual apenas) não respondia:
 *   1. Quais são as faturas FUTURAS já comprometidas, por competência/mês?
 *   2. Quanto do limite está comprometido além da fatura atual (parcelas futuras)?
 *   3. Qual o limite EFETIVO disponível = limite − (fatura atual + parcelas futuras)?
 *
 * ── Convenção de competência (importante) ─────────────────────────────────────
 * Aqui a competência rotula a fatura pelo MÊS DE INÍCIO da janela de faturamento
 * (mesma convenção usada por `payInvoice`/`calcCardMetrics` ao gravar e casar
 * `paidInvoiceMonth`). Isto é DIFERENTE de `computeCompetencia` em
 * `shared/lib/competencia`, que rotula uma parcela pelo mês de FECHAMENTO/cobrança.
 * As duas convenções descrevem a mesma fatura física, deslocadas em um mês; usar
 * a convenção de início é o que permite o abatimento correto de pagamentos.
 */
import type { Centavos } from '../shared/types/money';
import type { Transaction } from '../shared/types/transaction';
import { getTransactionAbsCentavos, isExpense } from '../utils/transactionUtils';

// ─── Tipos públicos ───────────────────────────────────────────────────────────

export interface CardInvoicePeriod {
  /** Competência da fatura no formato YYYY-MM (mês de início da janela). */
  competencia: string;
  /** Soma das cobranças do período em centavos inteiros. */
  chargesCents: Centavos;
  /** Soma dos pagamentos atribuídos ao período (paidInvoiceMonth) em centavos. */
  paymentsCents: Centavos;
  /** Fatura líquida do período = max(0, cobranças − pagamentos). */
  netCents: Centavos;
}

export interface CardProjectionInput {
  cardId: string;
  /** Dia de fechamento do cartão (1–31). */
  closingDay: number;
  /** Limite total do cartão em centavos inteiros. */
  limitCents: Centavos;
  /** Todas as transações do usuário (filtradas internamente por cardId). */
  transactions: Transaction[];
  /** Data de referência (hoje) no formato YYYY-MM-DD. */
  referenceDateISO: string;
}

export interface CardProjectionResult {
  /** Competência da fatura atual (YYYY-MM). */
  currentCompetencia: string;
  /** Fatura atual líquida em centavos. */
  currentInvoiceCents: Centavos;
  /** Faturas futuras com saldo líquido > 0, ordenadas por competência crescente. */
  futureInvoices: CardInvoicePeriod[];
  /** Total comprometido em faturas futuras (soma dos líquidos) em centavos. */
  committedFutureCents: Centavos;
  /** Total em aberto = fatura atual + comprometido futuro, em centavos. */
  openTotalCents: Centavos;
  /** Limite efetivo disponível = max(0, limite − total em aberto), em centavos. */
  effectiveAvailableCents: Centavos;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Competência (YYYY-MM) da fatura que contém `dateISO`, rotulada pelo mês de
 * início da janela de faturamento. Uma data com `dia < closingDay` pertence à
 * janela aberta no fechamento do mês anterior; caso contrário, ao mês corrente.
 *
 * Comparação feita sobre componentes inteiros (sem `Date`), evitando o
 * desencontro UTC/local que já causou regressão no cálculo de fatura.
 */
export function invoiceCompetenciaForDate(dateISO: string, closingDay: number): string {
  const parts = dateISO.slice(0, 10).split('-').map(Number);
  const y = parts[0] ?? 2000;
  const m = parts[1] ?? 1; // 1-based
  const d = parts[2] ?? 1;

  let labelYear = y;
  let labelMonth = m;
  if (closingDay >= 1 && closingDay <= 31 && d < closingDay) {
    labelMonth -= 1;
    if (labelMonth < 1) { labelMonth = 12; labelYear -= 1; }
  }
  return `${labelYear}-${String(labelMonth).padStart(2, '0')}`;
}

function txDateYMD(tx: Transaction): string {
  return String(tx.date ?? tx.createdAt ?? '').slice(0, 10);
}

function isActive(tx: Transaction): boolean {
  return tx.isDeleted !== true && !tx.deletedAt;
}

// ─── Função principal ─────────────────────────────────────────────────────────

export function projectCardInvoices(input: CardProjectionInput): CardProjectionResult {
  const { cardId, closingDay, limitCents, transactions, referenceDateISO } = input;

  const currentCompetencia = invoiceCompetenciaForDate(referenceDateISO, closingDay);

  const chargesByComp  = new Map<string, Centavos>();
  const paymentsByComp = new Map<string, Centavos>();

  for (const tx of transactions) {
    if (tx.cardId !== cardId) continue;
    if (!isActive(tx)) continue;

    // Pagamentos de fatura são atribuídos à competência que quitam.
    if (tx.paidInvoiceMonth !== undefined) {
      const comp = tx.paidInvoiceMonth;
      paymentsByComp.set(comp, ((paymentsByComp.get(comp) ?? 0) + getTransactionAbsCentavos(tx)) as Centavos);
      continue;
    }

    if (!isExpense(tx.type)) continue;
    const dateYMD = txDateYMD(tx);
    if (!dateYMD) continue;
    const comp = invoiceCompetenciaForDate(dateYMD, closingDay);
    chargesByComp.set(comp, ((chargesByComp.get(comp) ?? 0) + getTransactionAbsCentavos(tx)) as Centavos);
  }

  const buildPeriod = (competencia: string): CardInvoicePeriod => {
    const chargesCents  = (chargesByComp.get(competencia)  ?? 0) as Centavos;
    const paymentsCents = (paymentsByComp.get(competencia) ?? 0) as Centavos;
    const netCents = Math.max(0, chargesCents - paymentsCents) as Centavos;
    return { competencia, chargesCents, paymentsCents, netCents };
  };

  const currentInvoiceCents = buildPeriod(currentCompetencia).netCents;

  const futureInvoices = [...chargesByComp.keys()]
    .filter(comp => comp > currentCompetencia)
    .sort()
    .map(buildPeriod)
    .filter(period => period.netCents > 0);

  const committedFutureCents = futureInvoices.reduce(
    (sum, period) => (sum + period.netCents) as Centavos,
    0 as Centavos,
  );

  const openTotalCents = (currentInvoiceCents + committedFutureCents) as Centavos;
  const effectiveAvailableCents = Math.max(0, limitCents - openTotalCents) as Centavos;

  return {
    currentCompetencia,
    currentInvoiceCents,
    futureInvoices,
    committedFutureCents,
    openTotalCents,
    effectiveAvailableCents,
  };
}
