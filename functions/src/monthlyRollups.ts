// P-01 (Auditoria Premium 2026-11-20) — Rollups mensais server-side.
//
// Problema: dashboard, IR, planejamento e copiloto somavam no cliente apenas as
// 500 transações mais recentes (PAGE_SIZE). Usuários com histórico maior viam
// totais incompletos sem aviso.
//
// Solução: o servidor mantém `users/{uid}/rollups/{YYYY-MM}` com os totais do
// mês, atualizados por trigger a cada escrita em `transactions/{txId}`. Este
// módulo é o motor PURO (zero I/O): recebe o documento antes/depois e devolve
// o delta por mês. A semântica espelha `src/hooks/useFinancialData.ts` e
// `src/utils/transactionUtils.ts` (functions/ não importa src/ — ver CLAUDE.md):
//
//   • receita  = type 'entrada' | 'receita'
//   • despesa  = type 'saida' | 'despesa' SEM `paidInvoiceMonth` (consumo real)
//   • pagamento de fatura = despesa COM `paidInvoiceMonth` (liquidação de passivo,
//     não consumo — contado à parte para não duplicar o gasto do cartão)
//   • transferência = type 'transferencia' (contada à parte, nunca receita/despesa)
//   • soft-delete (`isDeleted === true` ou `deletedAt`) não contribui
//   • valor = |value_cents| inteiro seguro; documento sem value_cents válido não
//     contribui (legado float segue bloqueado — zero docs em produção, 2026-07-04)
//   • mês = `date` (YYYY-MM-DD) ou, na falta, `createdAt` em America/Sao_Paulo
//   • conta = `account` ou 'conta_corrente' (mesmo default do filtro de módulo)
//
// Somas são inteiras em centavos (regra dos centavos); nenhuma operação float.

export const ROLLUP_SCHEMA_VERSION = 1;
export const ROLLUP_TIME_ZONE = 'America/Sao_Paulo';
export const DEFAULT_ACCOUNT_KEY = 'conta_corrente';
export const DEFAULT_CATEGORY_KEY = 'Diversos';
const MAX_KEY_LEN = 120;

export type RollupKind = 'income' | 'expense' | 'invoicePayment' | 'transfer';

export interface RollupContribution {
  month: string;      // YYYY-MM
  kind: RollupKind;
  cents: number;      // inteiro seguro, > 0
  category: string;
  account: string;
}

export interface AccountTotals {
  incomeCents: number;
  expenseCents: number;
  invoicePaymentCents: number;
  transferCents: number;
  txCount: number;
}

export interface MonthTotals extends AccountTotals {
  expenseByCategory: Record<string, number>;
  incomeByCategory: Record<string, number>;
  byAccount: Record<string, AccountTotals>;
}

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
const DATE_RE = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
// Firestore reserva nomes de campo no formato __nome__.
const RESERVED_FIELD_RE = /^__.*__$/;

export function emptyAccountTotals(): AccountTotals {
  return { incomeCents: 0, expenseCents: 0, invoicePaymentCents: 0, transferCents: 0, txCount: 0 };
}

export function emptyMonthTotals(): MonthTotals {
  return { ...emptyAccountTotals(), expenseByCategory: {}, incomeByCategory: {}, byAccount: {} };
}

export function isValidMonthKey(month: unknown): month is string {
  return typeof month === 'string' && MONTH_RE.test(month);
}

function safeKey(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string') return fallback;
  const trimmed = raw.trim();
  if (!trimmed || RESERVED_FIELD_RE.test(trimmed)) return fallback;
  return trimmed.length > MAX_KEY_LEN ? trimmed.slice(0, MAX_KEY_LEN) : trimmed;
}

function toMillis(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (raw && typeof raw === 'object') {
    const maybe = raw as { toMillis?: unknown; seconds?: unknown; _seconds?: unknown };
    if (typeof maybe.toMillis === 'function') {
      const ms = (maybe.toMillis as () => number)();
      return Number.isFinite(ms) ? ms : null;
    }
    const seconds = typeof maybe.seconds === 'number' ? maybe.seconds : maybe._seconds;
    if (typeof seconds === 'number' && Number.isFinite(seconds)) return seconds * 1000;
  }
  return null;
}

const monthFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: ROLLUP_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
});

/** Mês de competência de exibição (mesma regra do dashboard): `date` ou `createdAt`. */
export function resolveMonthKey(tx: Record<string, unknown>): string | null {
  const date = tx['date'];
  if (typeof date === 'string') {
    const match = DATE_RE.exec(date.slice(0, 10));
    return match ? `${match[1]}-${match[2]}` : null;
  }
  const ms = toMillis(tx['createdAt']);
  if (ms === null) return null;
  const parts = monthFormatter.formatToParts(new Date(ms));
  const year = parts.find(p => p.type === 'year')?.value;
  const month = parts.find(p => p.type === 'month')?.value;
  const key = `${year}-${month}`;
  return isValidMonthKey(key) ? key : null;
}

function resolveKind(tx: Record<string, unknown>): RollupKind | null {
  const type = tx['type'];
  if (type === 'transferencia') return 'transfer';
  if (type === 'entrada' || type === 'receita') return 'income';
  if (type === 'saida' || type === 'despesa') {
    return tx['paidInvoiceMonth'] !== undefined ? 'invoicePayment' : 'expense';
  }
  return null;
}

/** Contribuição de UMA transação para os rollups, ou null se não contribui. */
export function transactionContribution(tx: Record<string, unknown> | null | undefined): RollupContribution | null {
  if (!tx || typeof tx !== 'object') return null;
  if (tx['isDeleted'] === true || (tx['deletedAt'] !== undefined && tx['deletedAt'] !== null)) return null;

  const rawCents = tx['value_cents'];
  if (!Number.isSafeInteger(rawCents) || rawCents === 0) return null;
  const cents = Math.abs(rawCents as number);

  const kind = resolveKind(tx);
  if (!kind) return null;

  const month = resolveMonthKey(tx);
  if (!month) return null;

  return {
    month,
    kind,
    cents,
    category: safeKey(tx['category'], DEFAULT_CATEGORY_KEY),
    account: safeKey(tx['account'], DEFAULT_ACCOUNT_KEY),
  };
}

function addToAccount(totals: AccountTotals, c: RollupContribution, sign: 1 | -1): void {
  const amount = sign * c.cents;
  if (c.kind === 'income') totals.incomeCents += amount;
  else if (c.kind === 'expense') totals.expenseCents += amount;
  else if (c.kind === 'invoicePayment') totals.invoicePaymentCents += amount;
  else totals.transferCents += amount;
  totals.txCount += sign;
}

/**
 * Leitura segura de mapa indexado por texto do usuário: só propriedades
 * próprias. Sem isso, uma categoria/conta "constructor" ou "toString" lê
 * Object.prototype e corrompe o total (NaN/string).
 */
function ownValue<T>(map: Record<string, T>, key: string): T | undefined {
  return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : undefined;
}

function addToMap(map: Record<string, number>, key: string, amount: number): void {
  map[key] = (ownValue(map, key) ?? 0) + amount;
}

/** Aplica (sign=+1) ou remove (sign=-1) uma contribuição num MonthTotals (muta). */
export function applyContribution(month: MonthTotals, c: RollupContribution, sign: 1 | -1): void {
  addToAccount(month, c, sign);
  if (c.kind === 'expense') addToMap(month.expenseByCategory, c.category, sign * c.cents);
  if (c.kind === 'income') addToMap(month.incomeByCategory, c.category, sign * c.cents);
  const account = ownValue(month.byAccount, c.account) ?? emptyAccountTotals();
  addToAccount(account, c, sign);
  month.byAccount[c.account] = account;
}

/**
 * Delta por mês causado por uma escrita (create/update/delete) numa transação.
 * Retorna só os meses afetados. Um update que não muda nada relevante → {}.
 */
export function computeRollupDelta(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
): Record<string, MonthTotals> {
  const prev = transactionContribution(before);
  const next = transactionContribution(after);

  if (prev && next
    && prev.month === next.month && prev.kind === next.kind && prev.cents === next.cents
    && prev.category === next.category && prev.account === next.account) {
    return {};
  }

  const deltas: Record<string, MonthTotals> = {};
  if (prev) {
    const m = ownValue(deltas, prev.month) ?? emptyMonthTotals();
    applyContribution(m, prev, -1);
    deltas[prev.month] = m;
  }
  if (next) {
    const m = ownValue(deltas, next.month) ?? emptyMonthTotals();
    applyContribution(m, next, 1);
    deltas[next.month] = m;
  }
  return deltas;
}

function readInt(raw: unknown): number {
  return Number.isSafeInteger(raw) ? (raw as number) : 0;
}

function readIntMap(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (Number.isSafeInteger(value)) out[key] = value as number;
  }
  return out;
}

function readAccountTotals(raw: unknown): AccountTotals {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    incomeCents: readInt(src['incomeCents']),
    expenseCents: readInt(src['expenseCents']),
    invoicePaymentCents: readInt(src['invoicePaymentCents']),
    transferCents: readInt(src['transferCents']),
    txCount: readInt(src['txCount']),
  };
}

/** Lê um documento de rollup persistido de forma tolerante (campos ausentes = 0). */
export function parseMonthTotals(raw: Record<string, unknown> | null | undefined): MonthTotals {
  if (!raw) return emptyMonthTotals();
  const byAccount: Record<string, AccountTotals> = {};
  const rawAccounts = raw['byAccount'];
  if (rawAccounts && typeof rawAccounts === 'object') {
    for (const [key, value] of Object.entries(rawAccounts as Record<string, unknown>)) {
      byAccount[key] = readAccountTotals(value);
    }
  }
  return {
    ...readAccountTotals(raw),
    expenseByCategory: readIntMap(raw['expenseByCategory']),
    incomeByCategory: readIntMap(raw['incomeByCategory']),
    byAccount,
  };
}

function pruneMap(map: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(map)) if (value !== 0) out[key] = value;
  return out;
}

/** Soma dois MonthTotals e remove entradas zeradas (contas/categorias que esvaziaram). */
export function mergeMonthTotals(base: MonthTotals, delta: MonthTotals): MonthTotals {
  const expenseByCategory = { ...base.expenseByCategory };
  for (const [k, v] of Object.entries(delta.expenseByCategory)) addToMap(expenseByCategory, k, v);
  const incomeByCategory = { ...base.incomeByCategory };
  for (const [k, v] of Object.entries(delta.incomeByCategory)) addToMap(incomeByCategory, k, v);

  const byAccount: Record<string, AccountTotals> = {};
  const accountKeys = new Set([...Object.keys(base.byAccount), ...Object.keys(delta.byAccount)]);
  for (const key of accountKeys) {
    const a = ownValue(base.byAccount, key) ?? emptyAccountTotals();
    const b = ownValue(delta.byAccount, key) ?? emptyAccountTotals();
    const merged: AccountTotals = {
      incomeCents: a.incomeCents + b.incomeCents,
      expenseCents: a.expenseCents + b.expenseCents,
      invoicePaymentCents: a.invoicePaymentCents + b.invoicePaymentCents,
      transferCents: a.transferCents + b.transferCents,
      txCount: a.txCount + b.txCount,
    };
    if (merged.txCount !== 0 || merged.incomeCents !== 0 || merged.expenseCents !== 0
      || merged.invoicePaymentCents !== 0 || merged.transferCents !== 0) {
      byAccount[key] = merged;
    }
  }

  return {
    incomeCents: base.incomeCents + delta.incomeCents,
    expenseCents: base.expenseCents + delta.expenseCents,
    invoicePaymentCents: base.invoicePaymentCents + delta.invoicePaymentCents,
    transferCents: base.transferCents + delta.transferCents,
    txCount: base.txCount + delta.txCount,
    expenseByCategory: pruneMap(expenseByCategory),
    incomeByCategory: pruneMap(incomeByCategory),
    byAccount,
  };
}

/**
 * Invariante: totais nunca negativos e soma por conta == total do mês.
 * Violação indica drift (evento perdido/duplicado) → o chamador deve logar e
 * marcar o mês para reconstrução, nunca gravar silenciosamente.
 */
export function isConsistentMonthTotals(m: MonthTotals): boolean {
  const fields: (keyof AccountTotals)[] = ['incomeCents', 'expenseCents', 'invoicePaymentCents', 'transferCents', 'txCount'];
  for (const field of fields) {
    if (m[field] < 0 || !Number.isSafeInteger(m[field])) return false;
    let sum = 0;
    for (const account of Object.values(m.byAccount)) {
      if (account[field] < 0) return false;
      sum += account[field];
    }
    if (sum !== m[field]) return false;
  }
  for (const v of Object.values(m.expenseByCategory)) if (v < 0) return false;
  for (const v of Object.values(m.incomeByCategory)) if (v < 0) return false;
  return true;
}

/** Recalcula os rollups do zero a partir de uma lista de transações (backfill/reconciliação). */
export function buildRollupsFromTransactions(txs: Iterable<Record<string, unknown>>): Record<string, MonthTotals> {
  const months: Record<string, MonthTotals> = {};
  for (const tx of txs) {
    const c = transactionContribution(tx);
    if (!c) continue;
    const m = ownValue(months, c.month) ?? emptyMonthTotals();
    applyContribution(m, c, 1);
    months[c.month] = m;
  }
  return months;
}

/**
 * Campo persistido que pede reconstrução de forma "pegajosa": só a
 * reconstrução (que regrava o documento do zero) o limpa. Usado quando um
 * delta foi descartado (evento atrasado) e o mês pode parecer consistente
 * sem estar correto.
 */
export const ROLLUP_REBUILD_REQUIRED_FIELD = 'rebuildRequired';

export type MonthWritePlan =
  | { action: 'delete' }
  | { action: 'set'; totals: MonthTotals; needsRebuild: boolean; rebuildRequired: boolean };

/**
 * Decide como persistir um mês após aplicar um delta. Usado pelo trigger e
 * pelos testes (mesma regra nos dois lados).
 *   • mês consistente e vazio → apaga o documento;
 *   • mês inconsistente → grava com needsRebuild=true. Pode ser transitório
 *     (eventos fora de ordem convergem quando o evento faltante chega e o
 *     flag volta a false) ou drift real (a reconstrução corrige). Nunca apaga
 *     um mês inconsistente, para não perder o delta pendente.
 *   • rebuildRequired=true (delta descartado antes) → mantém o pedido e
 *     needsRebuild=true mesmo que o agregado pareça consistente, e não apaga.
 */
export function planMonthWrite(existing: MonthTotals, delta: MonthTotals, rebuildRequired = false): MonthWritePlan {
  const totals = mergeMonthTotals(existing, delta);
  const consistent = isConsistentMonthTotals(totals);
  if (!rebuildRequired && consistent && totals.txCount === 0) return { action: 'delete' };
  return { action: 'set', totals, needsRebuild: rebuildRequired || !consistent, rebuildRequired };
}
