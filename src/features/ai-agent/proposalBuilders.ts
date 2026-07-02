/**
 * proposalBuilders.ts — Construtores PUROS de `ActionProposal` (FASE H — intent router).
 *
 * Dado os "slots" (parâmetros extraídos da intenção), monta uma `ActionProposal` em
 * status `pending` e a valida com o schema Zod `.strict()`. 100% determinístico e
 * testável — sem I/O, sem LLM. Retorna issues legíveis quando faltam/são inválidos os
 * slots, para o agente pedir o que falta antes de propor.
 */
import {
  safeParseActionProposal,
  type ActionProposal,
  type ActionKind,
} from '../../shared/schemas/agentSchemas';
import type { Centavos } from '../../shared/types/money';

export type Slots = Record<string, unknown>;

export type BuildResult =
  | { ok: true; proposal: ActionProposal }
  | { ok: false; issues: string[] };

// ─── Coerções seguras ────────────────────────────────────────────────────────────
function posIntCents(v: unknown): number | null {
  return Number.isSafeInteger(v) && (v as number) > 0 ? (v as number) : null;
}
function nonEmptyString(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;
}
function ymdOr(v: unknown, fallback: string): string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : fallback;
}
export function today(): string {
  return new Date().toISOString().slice(0, 10);
}
export function currentCompetencia(): string {
  return new Date().toISOString().slice(0, 7);
}

/** Valida a proposta montada; converte falha de schema em issue genérica. */
function finalize(raw: unknown): BuildResult {
  const proposal = safeParseActionProposal(raw);
  return proposal ? { ok: true, proposal } : { ok: false, issues: ['payload inválido para o schema da ação'] };
}

// ─── Builders por kind ─────────────────────────────────────────────────────────
export function buildRegisterPurchase(slots: Slots): BuildResult {
  const issues: string[] = [];
  const description = nonEmptyString(slots['description']);
  const amountCents = posIntCents(slots['amountCents']);
  if (!description) issues.push('description');
  if (amountCents === null) issues.push('amountCents');
  if (issues.length) return { ok: false, issues };

  const installments = Number.isSafeInteger(slots['installments']) ? (slots['installments'] as number) : undefined;
  const cardId = nonEmptyString(slots['cardId']);
  const category = nonEmptyString(slots['category']);
  return finalize({
    kind: 'register_purchase',
    status: 'pending',
    payload: {
      description,
      amountCents: amountCents as Centavos,
      date: ymdOr(slots['date'], today()),
      ...(category ? { category } : {}),
      ...(installments !== undefined ? { installments } : {}),
      ...(cardId ? { cardId } : {}),
    },
  });
}

export function buildRegisterIncome(slots: Slots): BuildResult {
  const issues: string[] = [];
  const description = nonEmptyString(slots['description']);
  const amountCents = posIntCents(slots['amountCents']);
  if (!description) issues.push('description');
  if (amountCents === null) issues.push('amountCents');
  if (issues.length) return { ok: false, issues };

  const category = nonEmptyString(slots['category']);
  return finalize({
    kind: 'register_income',
    status: 'pending',
    payload: {
      description,
      amountCents: amountCents as Centavos,
      date: ymdOr(slots['date'], today()),
      ...(category ? { category } : {}),
    },
  });
}

export function buildRegisterTransfer(slots: Slots): BuildResult {
  const issues: string[] = [];
  const fromAccountId = nonEmptyString(slots['fromAccountId']);
  const toAccountId = nonEmptyString(slots['toAccountId']);
  const amountCents = posIntCents(slots['amountCents']);
  if (!fromAccountId) issues.push('fromAccountId');
  if (!toAccountId) issues.push('toAccountId');
  if (amountCents === null) issues.push('amountCents');
  if (issues.length) return { ok: false, issues };

  const description = nonEmptyString(slots['description']);
  return finalize({
    kind: 'register_transfer',
    status: 'pending',
    payload: {
      fromAccountId,
      toAccountId,
      amountCents: amountCents as Centavos,
      date: ymdOr(slots['date'], today()),
      ...(description ? { description } : {}),
    },
  });
}

export function buildRegisterDebtPayment(slots: Slots): BuildResult {
  const issues: string[] = [];
  const debtId = nonEmptyString(slots['debtId']);
  const amountCents = posIntCents(slots['amountCents']);
  if (!debtId) issues.push('debtId');
  if (amountCents === null) issues.push('amountCents');
  if (issues.length) return { ok: false, issues };
  return finalize({
    kind: 'register_debt_payment',
    status: 'pending',
    payload: { debtId, amountCents: amountCents as Centavos, date: ymdOr(slots['date'], today()) },
  });
}

export function buildContributeToGoal(slots: Slots): BuildResult {
  const issues: string[] = [];
  const goalId = nonEmptyString(slots['goalId']);
  const amountCents = posIntCents(slots['amountCents']);
  if (!goalId) issues.push('goalId');
  if (amountCents === null) issues.push('amountCents');
  if (issues.length) return { ok: false, issues };
  return finalize({
    kind: 'contribute_to_goal',
    status: 'pending',
    payload: { goalId, amountCents: amountCents as Centavos, date: ymdOr(slots['date'], today()) },
  });
}

export function buildCreateBudget(slots: Slots): BuildResult {
  const issues: string[] = [];
  const category = nonEmptyString(slots['category']);
  const limitCents = posIntCents(slots['limitCents']);
  if (!category) issues.push('category');
  if (limitCents === null) issues.push('limitCents');
  if (issues.length) return { ok: false, issues };
  const competencia =
    typeof slots['competencia'] === 'string' && /^\d{4}-\d{2}$/.test(slots['competencia'] as string)
      ? (slots['competencia'] as string)
      : currentCompetencia();
  return finalize({
    kind: 'create_budget',
    status: 'pending',
    payload: { category, limitCents: limitCents as Centavos, competencia },
  });
}

/** Despacha o builder pelo `kind` da ação. */
export function buildProposal(kind: ActionKind, slots: Slots): BuildResult {
  switch (kind) {
    case 'register_purchase':     return buildRegisterPurchase(slots);
    case 'register_income':       return buildRegisterIncome(slots);
    case 'register_transfer':     return buildRegisterTransfer(slots);
    case 'register_debt_payment': return buildRegisterDebtPayment(slots);
    case 'contribute_to_goal':    return buildContributeToGoal(slots);
    case 'create_budget':         return buildCreateBudget(slots);
  }
}
