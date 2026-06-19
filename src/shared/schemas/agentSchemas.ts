/**
 * agentSchemas.ts — Schemas Zod do Agente Financeiro (FASE H / H-0).
 *
 * Define o contrato de `ActionProposal`: toda ação financeira proposta pelo agente
 * é validada por estes schemas `.strict()` ANTES de qualquer escrita, e só executa
 * após confirmação humana explícita. Ver docs/AI_AGENT_GUARDRAILS.md (§4) e
 * docs/AI_TOOL_ROUTER.md (§4).
 */
import { z } from 'zod';
import Decimal from 'decimal.js';
import { type Centavos } from '../types/money';

// ─── Helpers ────────────────────────────────────────────────────────────────────

const safeCentsSchema = (label: string) =>
  z
    .number()
    .int(`${label} deve ser inteiro`)
    .min(0, `${label} deve ser não-negativo`)
    .max(Number.MAX_SAFE_INTEGER, `${label} fora de limites seguros`)
    .refine((v) => new Decimal(v).isInteger(), `${label} deve ser centavos inteiros`)
    .transform((v) => v as Centavos);

const ymdSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (YYYY-MM-DD)');
const competenciaSchema = z.string().regex(/^\d{4}-\d{2}$/, 'Competência inválida (YYYY-MM)');

// ─── Tipos de ação permitidos (v1) ──────────────────────────────────────────────

export const ACTION_KINDS = [
  'register_purchase',
  'register_debt_payment',
  'create_budget',
  'contribute_to_goal',
] as const;

export type ActionKind = (typeof ACTION_KINDS)[number];

// ─── Payloads por tipo de ação ───────────────────────────────────────────────────

export const registerPurchasePayloadSchema = z
  .object({
    description: z.string().min(1).max(140),
    amountCents: safeCentsSchema('Valor da compra'),
    date: ymdSchema,
    installments: z.number().int().min(1).max(120).optional(),
    cardId: z.string().min(1).optional(),
  })
  .strict();

export const registerDebtPaymentPayloadSchema = z
  .object({
    debtId: z.string().min(1),
    amountCents: safeCentsSchema('Valor do pagamento'),
    date: ymdSchema,
  })
  .strict();

export const createBudgetPayloadSchema = z
  .object({
    category: z.string().min(1).max(60),
    limitCents: safeCentsSchema('Limite do orçamento'),
    competencia: competenciaSchema,
  })
  .strict();

export const contributeToGoalPayloadSchema = z
  .object({
    goalId: z.string().min(1),
    amountCents: safeCentsSchema('Valor da contribuição'),
    date: ymdSchema,
  })
  .strict();

// ─── ActionProposal (discriminated union) ─────────────────────────────────────────

export const PROPOSAL_STATUSES = ['pending', 'confirmed', 'rejected', 'expired'] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

/**
 * Uma `ActionProposal` é sempre criada com status `pending`. A confirmação humana
 * (transição para `confirmed`) é o ÚNICO gatilho que autoriza a escrita.
 */
export const actionProposalSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('register_purchase'),
    status: z.enum(PROPOSAL_STATUSES),
    payload: registerPurchasePayloadSchema,
  }).strict(),
  z.object({
    kind: z.literal('register_debt_payment'),
    status: z.enum(PROPOSAL_STATUSES),
    payload: registerDebtPaymentPayloadSchema,
  }).strict(),
  z.object({
    kind: z.literal('create_budget'),
    status: z.enum(PROPOSAL_STATUSES),
    payload: createBudgetPayloadSchema,
  }).strict(),
  z.object({
    kind: z.literal('contribute_to_goal'),
    status: z.enum(PROPOSAL_STATUSES),
    payload: contributeToGoalPayloadSchema,
  }).strict(),
]);

export type ActionProposal = z.infer<typeof actionProposalSchema>;

/** Valida e normaliza uma proposta crua. Lança ZodError em payload inválido. */
export function parseActionProposal(raw: unknown): ActionProposal {
  return actionProposalSchema.parse(raw);
}

/** Versão segura: retorna null em vez de lançar. */
export function safeParseActionProposal(raw: unknown): ActionProposal | null {
  const result = actionProposalSchema.safeParse(raw);
  return result.success ? result.data : null;
}
