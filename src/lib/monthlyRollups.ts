// P-01 (Fase 1) — leitura dos rollups mensais server-side.
//
// O servidor mantém users/{uid}/rollups/{YYYY-MM} (trigger maintainMonthlyRollups)
// e users/{uid}/rollups/_meta (gravado ao fim de cada rebuildMonthlyRollups).
// Este módulo é PURO: valida os documentos e expõe seletores que devolvem
// `null` sempre que os rollups não são confiáveis. Nesse caso o chamador cai
// no cálculo legado sobre as transações carregadas.
//
// Espelha functions/src/monthlyRollups.ts (functions/ e src/ não se importam).

import type { Centavos } from '../shared/types/money';

export const ROLLUP_META_DOC_ID = '_meta';
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export interface RollupAccountTotals {
  incomeCents: Centavos;
  expenseCents: Centavos;
  invoicePaymentCents: Centavos;
  transferCents: Centavos;
  txCount: number;
}

export interface MonthRollup extends RollupAccountTotals {
  month: string;
  expenseByCategory: Record<string, Centavos>;
  incomeByCategory: Record<string, Centavos>;
  byAccount: Record<string, RollupAccountTotals>;
  needsRebuild: boolean;
}

export interface RollupState {
  /** true só quando o snapshot chegou E existe _meta (histórico completo reconstruído). */
  ready: boolean;
  months: Record<string, MonthRollup>;
}

export const EMPTY_ROLLUP_STATE: RollupState = { ready: false, months: {} };

function int(raw: unknown): number {
  return Number.isSafeInteger(raw) && (raw as number) >= 0 ? (raw as number) : 0;
}

function cents(raw: unknown): Centavos {
  return int(raw) as Centavos;
}

function centsMap(raw: unknown): Record<string, Centavos> {
  const out: Record<string, Centavos> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (Number.isSafeInteger(value) && (value as number) > 0) out[key] = value as Centavos;
  }
  return out;
}

function accountTotals(raw: unknown): RollupAccountTotals {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    incomeCents: cents(src['incomeCents']),
    expenseCents: cents(src['expenseCents']),
    invoicePaymentCents: cents(src['invoicePaymentCents']),
    transferCents: cents(src['transferCents']),
    txCount: int(src['txCount']),
  };
}

export function isMonthKey(id: string): boolean {
  return MONTH_RE.test(id);
}

/** Valida um doc de rollup. Valor negativo/não inteiro → mês marcado needsRebuild. */
export function parseMonthRollup(id: string, data: Record<string, unknown> | undefined): MonthRollup | null {
  if (!isMonthKey(id) || !data) return null;
  const byAccount: Record<string, RollupAccountTotals> = {};
  const rawAccounts = data['byAccount'];
  if (rawAccounts && typeof rawAccounts === 'object') {
    for (const [key, value] of Object.entries(rawAccounts as Record<string, unknown>)) {
      byAccount[key] = accountTotals(value);
    }
  }
  const malformed = ['incomeCents', 'expenseCents', 'invoicePaymentCents', 'transferCents', 'txCount']
    .some(field => !Number.isSafeInteger(data[field]) || (data[field] as number) < 0);
  return {
    month: id,
    ...accountTotals(data),
    expenseByCategory: centsMap(data['expenseByCategory']),
    incomeByCategory: centsMap(data['incomeByCategory']),
    byAccount,
    needsRebuild: data['needsRebuild'] === true || malformed,
  };
}

export function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function totalsFor(rollup: MonthRollup, module: string): RollupAccountTotals {
  return module === 'geral' ? rollup : (rollup.byAccount[module] ?? accountTotals(null));
}

export function anyNeedsRebuild(state: RollupState): boolean {
  return Object.values(state.months).some(m => m.needsRebuild);
}

/**
 * Receitas e despesas de consumo do mês (despesa exclui pagamento de fatura e
 * transferência). null se os rollups não são confiáveis para este mês.
 * Mês sem documento = mês sem lançamentos (zero), desde que `ready`.
 */
export function selectMonthTotals(
  state: RollupState,
  module: string,
  year: number,
  month: number,
): { incomeCents: Centavos; expenseCents: Centavos } | null {
  if (!state.ready) return null;
  const rollup = state.months[monthKey(year, month)];
  if (!rollup) return { incomeCents: 0 as Centavos, expenseCents: 0 as Centavos };
  if (rollup.needsRebuild) return null;
  const t = totalsFor(rollup, module);
  return { incomeCents: t.incomeCents, expenseCents: t.expenseCents };
}

/**
 * Resultado acumulado de todo o histórico: Σ receitas − Σ despesas de consumo.
 * Transferências não entram (só movem saldo entre contas próprias) e pagamento
 * de fatura também não (a compra no cartão já foi contada como despesa).
 */
export function selectCumulativeNetCents(state: RollupState, module: string): number | null {
  if (!state.ready || anyNeedsRebuild(state)) return null;
  let net = 0;
  for (const rollup of Object.values(state.months)) {
    const t = totalsFor(rollup, module);
    net += t.incomeCents - t.expenseCents;
  }
  return Number.isSafeInteger(net) ? net : null;
}

/** Despesas por categoria do mês. Só para a visão geral (byAccount não guarda categorias). */
export function selectExpenseByCategory(
  state: RollupState,
  module: string,
  year: number,
  month: number,
): Record<string, Centavos> | null {
  if (!state.ready || module !== 'geral') return null;
  const rollup = state.months[monthKey(year, month)];
  if (!rollup) return {};
  if (rollup.needsRebuild) return null;
  return rollup.expenseByCategory;
}

/**
 * Totais de todo o histórico (visão geral): receitas, despesas de consumo e
 * despesas por categoria. Alimenta o painel no período "Tudo", que antes só
 * via as 500 transações mais recentes. null se os rollups não são confiáveis.
 */
export function selectAllTimeTotals(
  state: RollupState,
): { incomeCents: Centavos; expenseCents: Centavos; expenseByCategory: Record<string, Centavos> } | null {
  if (!state.ready || anyNeedsRebuild(state)) return null;
  let income = 0;
  let expense = 0;
  const byCategory = new Map<string, number>();
  for (const rollup of Object.values(state.months)) {
    income += rollup.incomeCents;
    expense += rollup.expenseCents;
    for (const [category, cents] of Object.entries(rollup.expenseByCategory)) {
      byCategory.set(category, (byCategory.get(category) ?? 0) + cents);
    }
  }
  if (!Number.isSafeInteger(income) || !Number.isSafeInteger(expense)) return null;
  const expenseByCategory: Record<string, Centavos> = {};
  for (const [category, cents] of byCategory) expenseByCategory[category] = cents as Centavos;
  return { incomeCents: income as Centavos, expenseCents: expense as Centavos, expenseByCategory };
}
