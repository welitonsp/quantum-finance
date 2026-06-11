/**
 * insightsEngine.ts — Motor puro de insights financeiros.
 *
 * Zero React · Zero Firebase · Zero I/O.
 * Toda lógica extraída dos widgets existentes, sem alteração de algoritmos.
 *
 * Regras invioláveis:
 * - Nunca usar parseFloat / Math.round(x*100) / toFixed para dinheiro.
 * - Operar em centavos (Centavos). fromCentavos só para display, nunca para acumular.
 * - Datas: split('-').map(Number) — nunca new Date(string) para parse de YYYY-MM-DD.
 */

import type { Transaction, Account } from '../shared/types/transaction';
import { type Centavos, fromCentavos } from '../shared/types/money';
import { getTransactionAbsCentavos } from '../utils/transactionUtils';
import Decimal from 'decimal.js';

// ─── Context ──────────────────────────────────────────────────────────────────

export interface InsightContext {
  transactions: Transaction[];
  accounts:     Account[];
  /** YYYY-MM-DD — injetado para testabilidade */
  today:        string;
  /** YYYY-MM */
  currentMonth: string;
  /**
   * Soma das faturas abertas de todos os cartões de crédito em centavos
   * inteiros (fonte: useCreditCards.totalFaturaCents).
   * Subtraída do net worth como passivo corrente.
   */
  cardOpenInvoicesCents?: Centavos;
  /**
   * Soma de parcelas futuras já contratadas em centavos inteiros.
   * Informativo: exibida como "compromissos futuros" — não reduz o net worth
   * diretamente, pois as parcelas já constam em transações futuras.
   */
  futureInstallmentsCents?: Centavos;
}

// ─── Result types ─────────────────────────────────────────────────────────────

export interface AnomalyResult {
  category:     string;
  currentCents: Centavos;
  avgCents:     Centavos;
  /** Percentual acima (ou abaixo) da média; pode ser negativo */
  deltaPct:     number;
  severity:     'low' | 'medium' | 'high';
}

export interface HealthScore {
  total:         number;   // 0-100
  pillarSavings: number;   // 0-25
  pillarDebt:    number;   // 0-25
  pillarReserve: number;   // 0-25
  pillarBudget:  number;   // 0-25
  details:       string[];
}

export interface ForecastResult {
  projectedBalanceCents:  Centavos;
  projectedIncomeCents:   Centavos;
  projectedExpenseCents:  Centavos;
  daysRemaining:          number;
}

export interface KPIResult {
  netWorthCents:       Centavos;
  monthlyIncomeCents:  Centavos;
  monthlyExpenseCents: Centavos;
  savingsRatePct:      number;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function isExpenseTx(tx: Transaction): boolean {
  return tx.type === 'saida' || tx.type === 'despesa';
}

function isIncomeTx(tx: Transaction): boolean {
  return tx.type === 'entrada' || tx.type === 'receita';
}

/** Parse YYYY-MM-DD sem usar new Date(string) para evitar timezone bugs */
function parseDateParts(dateStr: string): { y: number; m: number; d: number } | null {
  const parts = dateStr.split('-').map(Number);
  if (parts.length < 3) return null;
  const [y, m, d] = parts as [number, number, number];
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  return { y, m, d };
}

/** Retorna o número de dias no mês (month = 1-12) */
function daysInMonth(year: number, month: number): number {
  // Dia 0 do próximo mês = último dia do mês atual
  return new Date(year, month, 0).getDate();
}

// ─── computeAnomalies ─────────────────────────────────────────────────────────
// Extração fiel de GeminiService.detectAnomalies (threshold 25%)
// Mantém centavos canônicos internamente; converte para display só no retorno.

const ANOMALY_THRESHOLD_PCT = 25;

/**
 * Detecta categorias com gasto no mês corrente acima do limiar em relação
 * à média dos meses históricos.
 *
 * Algoritmo: idêntico ao GeminiService.detectAnomalies, porém com centavos
 * canônicos no resultado (sem fromCentavos interno).
 */
export function computeAnomalies(ctx: InsightContext): AnomalyResult[] {
  const { transactions, currentMonth } = ctx;
  const [curY, curM] = currentMonth.split('-').map(Number) as [number, number];

  // Separar transações do mês corrente vs. históricas
  const currentTxs:    Transaction[] = [];
  const historicalTxs: Transaction[] = [];

  for (const tx of transactions) {
    if (!tx.date) continue;
    const parts = parseDateParts(tx.date);
    if (!parts) continue;
    const { y, m } = parts;
    if (y === curY && m === curM) {
      currentTxs.push(tx);
    } else if (y < curY || (y === curY && m < curM)) {
      historicalTxs.push(tx);
    }
  }

  if (historicalTxs.length < 5) return [];

  // Agrupar histórico por mês→categoria (centavos inteiros)
  const byMonth: Record<string, Record<string, number>> = {};
  for (const tx of historicalTxs) {
    if (!isExpenseTx(tx)) continue;
    const parts = parseDateParts(tx.date!);
    if (!parts) continue;
    const key = `${parts.y}-${parts.m}`;
    if (!byMonth[key]) byMonth[key] = {};
    const cat = tx.category ?? 'Outros';
    byMonth[key]![cat] = (byMonth[key]![cat] ?? 0) + getTransactionAbsCentavos(tx);
  }

  const months = Object.values(byMonth);
  if (!months.length) return [];

  // Média por categoria (em centavos) — usando Decimal para somar sem float error
  const avgByCat: Record<string, Centavos> = {};
  const accumByCat: Record<string, number[]> = {};
  for (const m of months) {
    for (const [cat, val] of Object.entries(m)) {
      if (!accumByCat[cat]) accumByCat[cat] = [];
      accumByCat[cat]!.push(val);
    }
  }
  for (const [cat, vals] of Object.entries(accumByCat)) {
    const sum = vals.reduce((acc, v) => acc + v, 0);
    avgByCat[cat] = Math.round(sum / vals.length) as Centavos;
  }

  // Totais do mês corrente por categoria (centavos)
  const currentByCat: Record<string, number> = {};
  for (const tx of currentTxs) {
    if (!isExpenseTx(tx)) continue;
    const cat = tx.category ?? 'Outros';
    currentByCat[cat] = (currentByCat[cat] ?? 0) + getTransactionAbsCentavos(tx);
  }

  const results: AnomalyResult[] = [];
  for (const [cat, currentRaw] of Object.entries(currentByCat)) {
    const avg = avgByCat[cat] ?? (0 as Centavos);
    if (avg === 0) continue;
    const deltaPct = Math.round(((currentRaw - avg) / avg) * 100);
    if (Math.abs(deltaPct) < ANOMALY_THRESHOLD_PCT) continue;

    const absDelta = Math.abs(deltaPct);
    const severity: AnomalyResult['severity'] =
      absDelta >= 75 ? 'high' :
      absDelta >= 40 ? 'medium' :
      'low';

    results.push({
      category:     cat,
      currentCents: currentRaw as Centavos,
      avgCents:     avg,
      deltaPct,
      severity,
    });
  }

  return results.sort((a, b) => Math.abs(b.deltaPct) - Math.abs(a.deltaPct));
}

// ─── computeHealthScore ───────────────────────────────────────────────────────
// Extração fiel de FinancialHealthScore.computePillars + useFinancialMetrics

const FIXED_CATEGORIES = new Set([
  'moradia', 'assinaturas', 'educação', 'impostos',
  'impostos/taxas', 'saúde',
]);

/**
 * Calcula o score de saúde financeira (0-100) com decomposição por 4 pilares.
 *
 * Algoritmo: idêntico ao computePillars de FinancialHealthScore.tsx, usando
 * métricas derivadas de computeFinancialMetrics.
 */
export function computeHealthScore(ctx: InsightContext): HealthScore {
  const { transactions, accounts, currentMonth } = ctx;
  const [curY, curM] = currentMonth.split('-').map(Number) as [number, number];

  // ── Receitas, despesas e custo fixo do mês corrente ──────────────────────────
  let receita         = new Decimal(0);
  let despesa         = new Decimal(0);
  let custoFixoMensal = new Decimal(0);

  for (const tx of transactions) {
    if (!tx.date) continue;
    const parts = parseDateParts(tx.date);
    if (!parts) continue;
    // Filtrar mês corrente para KPIs transacionais
    if (parts.y !== curY || parts.m !== curM) continue;

    const abs = new Decimal(getTransactionAbsCentavos(tx));
    if (isIncomeTx(tx)) {
      receita = receita.plus(abs);
    } else if (isExpenseTx(tx)) {
      despesa = despesa.plus(abs);
      if (tx.category && FIXED_CATEGORIES.has(tx.category.toLowerCase())) {
        custoFixoMensal = custoFixoMensal.plus(abs);
      }
    }
  }

  // ── Ativos e passivos das contas ──────────────────────────────────────────────
  let ativos   = new Decimal(0);
  let passivos = new Decimal(0);

  if (accounts.length > 0) {
    for (const acc of accounts) {
      const val = new Decimal(acc.balance ?? 0);
      if (['corrente', 'poupanca', 'investimento'].includes(acc.type)) {
        ativos = ativos.plus(val);
      } else if (['cartao', 'divida'].includes(acc.type)) {
        passivos = passivos.plus(val.abs());
      }
    }
  } else {
    ativos   = receita;
    passivos = despesa;
  }

  // ── Métricas derivadas (em %) ─────────────────────────────────────────────────
  const taxaPoupanca = receita.greaterThan(0)
    ? receita.minus(despesa).dividedBy(receita).times(100).toDecimalPlaces(2).toNumber()
    : 0;

  const totalCapital = ativos.plus(passivos);
  const endividamento = totalCapital.greaterThan(0)
    ? passivos.dividedBy(totalCapital).times(100).toDecimalPlaces(2).toNumber()
    : 0;

  const comprometimento = receita.greaterThan(0)
    ? custoFixoMensal.dividedBy(receita).times(100).toDecimalPlaces(2).toNumber()
    : 0;

  const reservaMeses = custoFixoMensal.greaterThan(0)
    ? ativos.dividedBy(custoFixoMensal).toDecimalPlaces(1).toNumber()
    : 0;

  // ── Scores por pilar (idênticos a computePillars) ─────────────────────────────
  const pillarSavings: number =
    taxaPoupanca >= 30 ? 25 :
    taxaPoupanca >= 20 ? 20 :
    taxaPoupanca >= 10 ? 12 :
    taxaPoupanca >= 5  ? 6  : 0;

  const pillarDebt: number =
    endividamento <= 10 ? 25 :
    endividamento <= 30 ? 20 :
    endividamento <= 50 ? 12 :
    endividamento <= 70 ? 6  : 0;

  const pillarReserve: number =
    reservaMeses >= 6 ? 25 :
    reservaMeses >= 3 ? 18 :
    reservaMeses >= 1 ? 8  : 0;

  const pillarBudget: number =
    comprometimento <= 20 ? 25 :
    comprometimento <= 35 ? 18 :
    comprometimento <= 50 ? 8  : 0;

  const total = pillarSavings + pillarDebt + pillarReserve + pillarBudget;

  // ── Dicas por pilar ────────────────────────────────────────────────────────────
  const details: string[] = [
    taxaPoupanca >= 20
      ? 'Excelente! Manter acima de 20% é o padrão das finanças saudáveis.'
      : taxaPoupanca >= 10
      ? 'Razoável, mas tente chegar a 20% para construir patrimônio mais rápido.'
      : 'Crítico: quase nada está sendo guardado. Revise suas despesas variáveis.',

    endividamento <= 20
      ? 'Dívida controlada. Seu patrimônio está saudável.'
      : endividamento <= 40
      ? 'Dívida moderada. Evite assumir novos compromissos.'
      : 'Endividamento alto. Priorize a quitação das dívidas antes de investir.',

    reservaMeses >= 6
      ? 'Reserva sólida! Você tem 6+ meses de sobrevivência acumulados.'
      : reservaMeses >= 3
      ? 'Reserva parcial. Meta: chegar a 6 meses de custo de vida.'
      : 'Reserva insuficiente. Em caso de imprevisto, você ficaria vulnerável.',

    comprometimento <= 25
      ? 'Ótimo! Menos de 1/4 da renda está presa em despesas fixas.'
      : comprometimento <= 40
      ? 'Moderate. Considere revisar assinaturas e contratos fixos.'
      : 'Sua renda está muito comprometida. Cancele o que não é essencial.',
  ];

  return { total, pillarSavings, pillarDebt, pillarReserve, pillarBudget, details };
}

// ─── computeForecast ──────────────────────────────────────────────────────────
// Extração da lógica simplificada de useFinancialKPIs (projectedBalance)
// Projeção linear baseada em gastos diários do mês corrente.

/**
 * Projeta receita, despesa e saldo até o fim do mês corrente.
 *
 * Algoritmo: idêntico ao computeKPIs de useFinancialKPIs, usando centavos.
 */
export function computeForecast(ctx: InsightContext): ForecastResult {
  const { transactions, currentMonth, today } = ctx;
  const [curY, curM] = currentMonth.split('-').map(Number) as [number, number];

  const todayParts = parseDateParts(today);
  const daysPassed = todayParts ? Math.max(todayParts.d, 1) : 1;
  const totalDays  = daysInMonth(curY, curM);
  const daysRemaining = totalDays - daysPassed;

  let incomeCents  = new Decimal(0);
  let expenseCents = new Decimal(0);

  for (const tx of transactions) {
    if (!tx.date) continue;
    const parts = parseDateParts(tx.date);
    if (!parts || parts.y !== curY || parts.m !== curM) continue;

    const abs = new Decimal(getTransactionAbsCentavos(tx));
    if (isIncomeTx(tx))       incomeCents  = incomeCents.plus(abs);
    else if (isExpenseTx(tx)) expenseCents = expenseCents.plus(abs);
  }

  // Burn rate diário → projeção de despesa extra até o fim do mês
  const dailyBurnCents      = daysPassed > 0 ? expenseCents.dividedBy(daysPassed) : new Decimal(0);
  const projectedExtraSpend = dailyBurnCents.times(daysRemaining);
  const projectedExpense    = expenseCents.plus(projectedExtraSpend);
  const projectedBalance    = incomeCents.minus(projectedExpense);

  return {
    projectedBalanceCents:  projectedBalance.toDecimalPlaces(0, Decimal.ROUND_FLOOR).toNumber() as Centavos,
    projectedIncomeCents:   incomeCents.toDecimalPlaces(0, Decimal.ROUND_FLOOR).toNumber() as Centavos,
    projectedExpenseCents:  projectedExpense.toDecimalPlaces(0, Decimal.ROUND_FLOOR).toNumber() as Centavos,
    daysRemaining,
  };
}

// ─── computeKPIs ─────────────────────────────────────────────────────────────
// Net worth = soma de saldos de contas de ativos − passivos

/**
 * KPIs simples do mês corrente.
 *
 * - netWorthCents: ativos − passivos de contas − faturas abertas de cartões (ctx.cardOpenInvoicesCents).
 * - monthlyIncomeCents / monthlyExpenseCents: transações do mês corrente.
 * - savingsRatePct: (receita − despesa) / receita × 100.
 */
export function computeKPIs(ctx: InsightContext): KPIResult {
  const { transactions, accounts, currentMonth, cardOpenInvoicesCents } = ctx;
  const [curY, curM] = currentMonth.split('-').map(Number) as [number, number];

  // Net worth das contas
  let assetsCents      = new Decimal(0);
  let liabilitiesCents = new Decimal(0);

  for (const acc of accounts) {
    const val = new Decimal(acc.balance ?? 0);
    if (['corrente', 'poupanca', 'investimento'].includes(acc.type)) {
      assetsCents = assetsCents.plus(val);
    } else if (['cartao', 'divida'].includes(acc.type)) {
      liabilitiesCents = liabilitiesCents.plus(val.abs());
    }
  }

  // Faturas abertas de cartões de crédito reduzem o patrimônio líquido
  if (cardOpenInvoicesCents && Number.isFinite(cardOpenInvoicesCents) && cardOpenInvoicesCents > 0) {
    liabilitiesCents = liabilitiesCents.plus(
      new Decimal(Math.abs(Math.trunc(cardOpenInvoicesCents))),
    );
  }

  const netWorthCents = assetsCents.minus(liabilitiesCents);

  // Receita e despesa do mês corrente
  let incomeCents  = new Decimal(0);
  let expenseCents = new Decimal(0);

  for (const tx of transactions) {
    if (!tx.date) continue;
    const parts = parseDateParts(tx.date);
    if (!parts || parts.y !== curY || parts.m !== curM) continue;

    const abs = new Decimal(getTransactionAbsCentavos(tx));
    if (isIncomeTx(tx))       incomeCents  = incomeCents.plus(abs);
    else if (isExpenseTx(tx)) expenseCents = expenseCents.plus(abs);
  }

  const savingsRatePct = incomeCents.greaterThan(0)
    ? incomeCents.minus(expenseCents).dividedBy(incomeCents).times(100)
        .toDecimalPlaces(2).toNumber()
    : 0;

  return {
    netWorthCents:       netWorthCents.toDecimalPlaces(0, Decimal.ROUND_FLOOR).toNumber() as Centavos,
    monthlyIncomeCents:  incomeCents.toDecimalPlaces(0, Decimal.ROUND_FLOOR).toNumber() as Centavos,
    monthlyExpenseCents: expenseCents.toDecimalPlaces(0, Decimal.ROUND_FLOOR).toNumber() as Centavos,
    savingsRatePct,
  };
}

// Re-export money helper para uso conveniente nos widgets
export { fromCentavos };
