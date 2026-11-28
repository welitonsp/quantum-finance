// src/hooks/useFinancialMetrics.ts
// KPIs financeiros honestos:
// - ativos/passivos vêm das contas (não da soma histórica de transações)
// - endividamento = passivos / (ativos + passivos)
// - comprometimento = custoFixoMensal / receita
// - reservaMeses = ativos / custo essencial médio (média dos 3 meses anteriores)
// - passivos incluem faturas abertas e o saldo restante das dívidas cadastradas
import { useMemo } from 'react';
import { logSanitizedFirebaseError } from '../shared/lib/firebaseErrorHandling';
import Decimal from 'decimal.js';
import type { Transaction, Account } from '../shared/types/transaction';
import { fromCentavos, type Centavos } from '../shared/types/money';
import { getTransactionCentavos, isInvoicePayment } from '../utils/transactionUtils';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface FinancialMetrics {
  receita:           number;
  despesa:           number;
  /** Saldo líquido das contas de ativos (corrente + poupança + investimento) em reais */
  ativos:            number;
  /** Saldo líquido das contas de ativos em centavos inteiros — fonte canônica para GoalsPanel */
  ativosCents:       number;
  /** Soma absoluta das contas de passivos (cartão + dívida) */
  passivos:          number;
  patrimonioLiquido: number;
  custoFixoMensal:   number;
  /** Custo de vida essencial médio por mês (moradia, alimentação, transporte…) em reais. */
  custoEssencialMensal?: number;
  taxaPoupanca:      number;
  /** % do patrimônio total comprometido com dívidas (passivos / total) */
  endividamento:     number;
  /** % da renda comprometida em custos fixos (fixos / receita) */
  comprometimento:   number;
  /** Meses de sobrevivência: ativos / custoEssencialMensal */
  reservaMeses:      number;
}

interface UseFinancialMetricsReturn {
  metrics:        FinancialMetrics | null;
  loadingMetrics: boolean;
  error:          Error | null;
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────

const FIXED_CATEGORIES = new Set([
  'moradia', 'assinaturas', 'educação', 'impostos',
  'impostos/taxas', 'saúde',
]);

/**
 * Custo de vida essencial para a reserva de emergência: o que continua sendo
 * pago se a renda parar. Inclui o dia a dia (alimentação, transporte), não só
 * os contratos fixos.
 */
const ESSENTIAL_CATEGORIES = new Set([
  'moradia', 'alimentação', 'mercado', 'transporte', 'saúde', 'educação',
  'impostos', 'impostos/taxas', 'contas da casa', 'contas',
]);

/** Meses completos antes do mês de referência usados na média do custo essencial. */
const ESSENTIAL_WINDOW_MONTHS = 3;

function isEssentialCategory(category: string | undefined): boolean {
  if (!category) return false;
  return ESSENTIAL_CATEGORIES.has(category.toLowerCase());
}

/** Chave YYYY-MM de uma transação (null se a data for inválida). */
function txMonthKey(tx: Transaction): string | null {
  const rawDate = tx.date || tx.createdAt;
  if (!rawDate) return null;
  if (typeof rawDate === 'string' && /^\d{4}-\d{2}/.test(rawDate)) return rawDate.slice(0, 7);
  const d = rawDate instanceof Date ? rawDate : new Date(String(rawDate));
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthKey(month: number, year: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

/** Os `n` meses (YYYY-MM) imediatamente anteriores ao mês de referência. */
function previousMonthKeys(month: number, year: number, n: number): string[] {
  const keys: string[] = [];
  let m = month;
  let y = year;
  for (let i = 0; i < n; i++) {
    m -= 1;
    if (m < 1) { m = 12; y -= 1; }
    keys.push(monthKey(m, y));
  }
  return keys;
}

/**
 * Custo essencial médio mensal, em centavos. Média dos 3 meses anteriores ao
 * mês de referência em que houve algum lançamento (mês sem gasto essencial conta
 * como zero). Sem histórico, usa o próprio mês de referência.
 */
export function computeEssentialMonthlyCents(
  transactions: Transaction[],
  currentMonth?: number,
  currentYear?: number,
): Decimal {
  const essentialByMonth = new Map<string, Decimal>();
  const activeMonths = new Set<string>();
  for (const tx of transactions) {
    const key = txMonthKey(tx);
    if (!key) continue;
    activeMonths.add(key);
    if (!isExpense(tx.type) || isInvoicePayment(tx) || !isEssentialCategory(tx.category)) continue;
    const cents = Number(getTxCentavos(tx));
    if (!Number.isFinite(cents)) continue;
    essentialByMonth.set(key, (essentialByMonth.get(key) ?? new Decimal(0)).plus(Math.abs(cents)));
  }

  if (!currentMonth || !currentYear) {
    // Sem mês de referência: média de todos os meses com lançamento.
    if (activeMonths.size === 0) return new Decimal(0);
    let total = new Decimal(0);
    for (const k of activeMonths) total = total.plus(essentialByMonth.get(k) ?? 0);
    return total.dividedBy(activeMonths.size);
  }

  const window = previousMonthKeys(currentMonth, currentYear, ESSENTIAL_WINDOW_MONTHS)
    .filter(k => activeMonths.has(k));
  if (window.length === 0) {
    return essentialByMonth.get(monthKey(currentMonth, currentYear)) ?? new Decimal(0);
  }
  let total = new Decimal(0);
  for (const k of window) total = total.plus(essentialByMonth.get(k) ?? 0);
  return total.dividedBy(window.length);
}

function isFixedCategory(category: string | undefined): boolean {
  if (!category) return false;
  return FIXED_CATEGORIES.has(category.toLowerCase());
}

function isIncome(type: string | undefined): boolean {
  return type === 'receita' || type === 'entrada';
}

function isExpense(type: string | undefined): boolean {
  return type === 'saida' || type === 'despesa';
}

function getTxCentavos(tx: Transaction): Centavos {
  return getTransactionCentavos(tx) ?? (0 as Centavos);
}

function txMatchesPeriod(tx: Transaction, currentMonth?: number, currentYear?: number): boolean {
  if (!currentMonth || !currentYear) return true;

  const rawDate = tx.date || tx.createdAt;
  if (!rawDate) return false;

  const txDate = rawDate instanceof Date ? rawDate : new Date(String(rawDate));
  if (Number.isNaN(txDate.getTime())) return false;

  return txDate.getMonth() + 1 === currentMonth && txDate.getFullYear() === currentYear;
}

// ─── Pure compute (testável sem React) ────────────────────────────────────────

/**
 * Calcula KPIs financeiros honestos a partir de transações + contas.
 *
 * INVARIANTES:
 * - accounts.balance está em CENTAVOS (após PR 11.A)
 * - tx.value_cents é a fonte canônica; value legado só é aceito em docs pre-v2
 * - ativos/passivos vêm das CONTAS (não da soma de transações)
 * - se accounts vazio: usa fallback legado (soma de transações) — para
 *   preservar compatibilidade durante migração de call sites
 *
 * @param transactions Transações do período de análise
 * @param accounts Contas (com balance em centavos). Vazio → fallback legado.
 * @returns Métricas com 2 casas decimais (compatível com Recharts/UI)
 */
export function computeFinancialMetrics(
  transactions: Transaction[],
  accounts: Account[] = [],
  currentMonth?: number,
  currentYear?: number,
  cardOpenInvoicesCents?: number,
  /** Saldo restante das dívidas ativas do módulo Dívidas, em centavos. */
  debtsRemainingCents?: number,
): FinancialMetrics {
  // ── 1. Receitas, despesas e custos fixos das transações ────────────────
  let receita = new Decimal(0);
  let despesa = new Decimal(0);
  let custoFixoMensal = new Decimal(0);

  for (const tx of transactions) {
    if (!txMatchesPeriod(tx, currentMonth, currentYear)) continue;

    const amount = getTxCentavos(tx);
    const rawVal = Number(amount);
    if (!Number.isFinite(rawVal)) continue;
    const val = new Decimal(Math.abs(rawVal));
    if (isIncome(tx.type)) {
      receita = receita.plus(val);
    } else if (isExpense(tx.type) && !isInvoicePayment(tx)) {
      despesa = despesa.plus(val);
      if (isFixedCategory(tx.category)) {
        custoFixoMensal = custoFixoMensal.plus(val);
      }
    }
  }

  // ── 2. Ativos e passivos das CONTAS (fonte da verdade) ─────────────────
  let ativos   = new Decimal(0);
  let passivos = new Decimal(0);

  if (accounts.length > 0) {
    // Modo correto: ativos/passivos vêm das contas
    for (const acc of accounts) {
      const val = new Decimal(acc.balance ?? 0);
      if (['corrente', 'poupanca', 'investimento'].includes(acc.type)) {
        ativos = ativos.plus(val);
      } else if (['cartao', 'divida'].includes(acc.type)) {
        passivos = passivos.plus(val.abs());
      }
    }
  } else {
    // Fallback legado: usa soma de transações (preserva contratos antigos)
    ativos   = receita;
    passivos = despesa;
  }

  // ── 2b. Faturas abertas de cartões (fonte: useCreditCards.totalFaturaCents) ──
  if (cardOpenInvoicesCents && Number.isFinite(cardOpenInvoicesCents) && cardOpenInvoicesCents > 0) {
    passivos = passivos.plus(new Decimal(Math.abs(Math.trunc(cardOpenInvoicesCents))));
  }

  // ── 2c. Dívidas do módulo Dívidas (financiamentos, empréstimos) ────────
  if (debtsRemainingCents && Number.isFinite(debtsRemainingCents) && debtsRemainingCents > 0) {
    passivos = passivos.plus(new Decimal(Math.abs(Math.trunc(debtsRemainingCents))));
  }

  // ── 3. KPIs derivados ─────────────────────────────────────────────────
  const patrimonioLiquido = ativos.minus(passivos);

  const taxaPoupanca = receita.greaterThan(0)
    ? receita.minus(despesa).dividedBy(receita).times(100)
    : new Decimal(0);

  // Endividamento = passivos / (ativos + passivos) * 100
  // Mede % do capital total comprometido com dívidas
  const totalCapital = ativos.plus(passivos);
  const endividamento = totalCapital.greaterThan(0)
    ? passivos.dividedBy(totalCapital).times(100)
    : new Decimal(0);

  // Comprometimento = custoFixoMensal / receita * 100
  // Mede % da renda já alocada em despesas fixas
  const comprometimento = receita.greaterThan(0)
    ? custoFixoMensal.dividedBy(receita).times(100)
    : new Decimal(0);

  // Reserva = ativos / custo essencial médio (em meses)
  const custoEssencial = computeEssentialMonthlyCents(transactions, currentMonth, currentYear);
  const reservaMeses = custoEssencial.greaterThan(0)
    ? Decimal.max(ativos, 0).dividedBy(custoEssencial)
    : new Decimal(0);

  return {
    receita:           fromCentavos(receita.toNumber()),
    despesa:           fromCentavos(despesa.toNumber()),
    ativos:            fromCentavos(ativos.toNumber()),
    ativosCents:       ativos.toDecimalPlaces(0, Decimal.ROUND_FLOOR).toNumber(),
    passivos:          fromCentavos(passivos.toNumber()),
    patrimonioLiquido: fromCentavos(patrimonioLiquido.toNumber()),
    custoFixoMensal:   fromCentavos(custoFixoMensal.toNumber()),
    custoEssencialMensal: fromCentavos(custoEssencial.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber()),
    taxaPoupanca:      taxaPoupanca.toDecimalPlaces(2).toNumber(),
    endividamento:     endividamento.toDecimalPlaces(2).toNumber(),
    comprometimento:   comprometimento.toDecimalPlaces(2).toNumber(),
    reservaMeses:      reservaMeses.toDecimalPlaces(1).toNumber(),
  };
}

// ─── React hook (apenas wrapper) ──────────────────────────────────────────────

/**
 * Hook React que expõe FinancialMetrics calculadas via computeFinancialMetrics.
 *
 * @param uid Usuário autenticado (guard contra cálculo prematuro)
 * @param transactions Transações do período
 * @param accounts (NOVO) Contas para ativos/passivos REAIS — opcional para retrocompat
 * @param currentMonth Mes selecionado para KPIs transacionais (1-12)
 * @param currentYear Ano selecionado para KPIs transacionais
 */
export function useFinancialMetrics(
  uid: string,
  transactions: Transaction[],
  accounts: Account[] = [],
  currentMonth?: number,
  currentYear?: number,
  cardOpenInvoicesCents?: number,
  debtsRemainingCents?: number,
): UseFinancialMetricsReturn {
  const metrics = useMemo<FinancialMetrics | null>(() => {
    if (!uid) return null;
    if (!transactions || transactions.length === 0) {
      // Sem transações mas com contas → ainda computa ativos/passivos
      if (accounts.length === 0) return null;
    }

    try {
      return computeFinancialMetrics(transactions ?? [], accounts, currentMonth, currentYear, cardOpenInvoicesCents, debtsRemainingCents);
    } catch (err) {
      logSanitizedFirebaseError('financial_metrics_compute', err);
      return null;
    }
  }, [uid, transactions, accounts, currentMonth, currentYear, cardOpenInvoicesCents, debtsRemainingCents]);

  return {
    metrics,
    loadingMetrics: !metrics && Boolean(uid),
    error:          null,
  };
}
