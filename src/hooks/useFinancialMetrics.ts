// src/hooks/useFinancialMetrics.ts
// KPIs financeiros honestos:
// - ativos/passivos vêm das contas (não da soma histórica de transações)
// - endividamento = passivos / (ativos + passivos)
// - comprometimento = custoFixoMensal / receita
// - reservaMeses = ativos / custoFixoMensal (em meses de sobrevivência)
import { useMemo } from 'react';
import Decimal from 'decimal.js';
import type { Transaction, Account } from '../shared/types/transaction';
import { fromCentavos, toCentavos, type Centavos } from '../shared/types/money';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface FinancialMetrics {
  receita:           number;
  despesa:           number;
  /** Saldo líquido das contas de ativos (corrente + poupança + investimento) */
  ativos:            number;
  /** Soma absoluta das contas de passivos (cartão + dívida) */
  passivos:          number;
  patrimonioLiquido: number;
  custoFixoMensal:   number;
  taxaPoupanca:      number;
  /** % do patrimônio total comprometido com dívidas (passivos / total) */
  endividamento:     number;
  /** % da renda comprometida em custos fixos (fixos / receita) */
  comprometimento:   number;
  /** Meses de sobrevivência: ativos / custoFixoMensal */
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
  const amount = tx.value_cents !== undefined
    ? tx.value_cents
    : toCentavos(tx.value ?? 0);

  return amount;
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
 * - tx.value pode estar em centavos OU reais — função normaliza
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
    } else if (isExpense(tx.type)) {
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

  // Reserva = ativos / custoFixoMensal (em meses)
  const reservaMeses = custoFixoMensal.greaterThan(0)
    ? ativos.dividedBy(custoFixoMensal)
    : new Decimal(0);

  return {
    receita:           fromCentavos(receita.toNumber()),
    despesa:           fromCentavos(despesa.toNumber()),
    ativos:            fromCentavos(ativos.toNumber()),
    passivos:          fromCentavos(passivos.toNumber()),
    patrimonioLiquido: fromCentavos(patrimonioLiquido.toNumber()),
    custoFixoMensal:   fromCentavos(custoFixoMensal.toNumber()),
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
): UseFinancialMetricsReturn {
  const metrics = useMemo<FinancialMetrics | null>(() => {
    if (!uid) return null;
    if (!transactions || transactions.length === 0) {
      // Sem transações mas com contas → ainda computa ativos/passivos
      if (accounts.length === 0) return null;
    }

    try {
      return computeFinancialMetrics(transactions ?? [], accounts, currentMonth, currentYear);
    } catch (err) {
      console.error('[useFinancialMetrics]', err);
      return null;
    }
  }, [uid, transactions, accounts, currentMonth, currentYear]);

  return {
    metrics,
    loadingMetrics: !metrics && Boolean(uid),
    error:          null,
  };
}
