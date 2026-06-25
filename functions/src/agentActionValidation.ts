/**
 * agentActionValidation.ts — Validação pura (server-trusted) de ações do Agente
 * Financeiro (FASE H). Sem Admin SDK, sem I/O — 100% testável via `node --test`.
 *
 * Espelha o contrato client `src/shared/schemas/agentSchemas.ts` (ActionProposal) e
 * `docs/AI_AGENT_GUARDRAILS.md`/`AI_DECISION_JOURNAL.md`:
 *   • só executa ação com `status === 'confirmed'` (gate de confirmação humana);
 *   • valores sempre em centavos inteiros;
 *   • registra contexto da decisão (intent/question/toolsUsed/...).
 *
 * A camada de EXECUÇÃO (index.ts) decide quais kinds materializa; este módulo
 * valida o envelope e os 4 payloads v1.
 */

export const AGENT_ACTION_KINDS = [
  'register_purchase',
  'register_debt_payment',
  'create_budget',
  'contribute_to_goal',
] as const;
export type AgentActionKind = (typeof AGENT_ACTION_KINDS)[number];

export const AGENT_INTENTS = [
  'get_balances',
  'get_invoice',
  'explain_month',
  'cashflow_briefing',
  'simulate_purchase',
  'plan_debt_payment',
  'create_budget_proposal',
  'contribute_to_goal_proposal',
] as const;

export class AgentActionValidationError extends Error {
  /** Código de erro HTTPS Callable (default 'invalid-argument'). */
  code: string;
  /** Sinal estável, legível por máquina, para a UI rotear sem parsear prosa. */
  reason?: string;
  constructor(message: string, options?: { code?: string; reason?: string }) {
    super(message);
    this.name = 'AgentActionValidationError';
    this.code = options?.code ?? 'invalid-argument';
    if (options?.reason) this.reason = options.reason;
  }
}

function invalid(message: string): never {
  throw new AgentActionValidationError(message);
}

function asObject(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    invalid(`${label} deve ser um objeto.`);
  }
  return value as Record<string, unknown>;
}

function asStringSized(value: unknown, field: string, min: number, max: number): string {
  if (typeof value !== 'string') invalid(`${field} deve ser uma string.`);
  const trimmed = (value as string).trim();
  if (trimmed.length < min || trimmed.length > max) {
    invalid(`${field} deve ter entre ${min} e ${max} caracteres.`);
  }
  return trimmed;
}

function asSafePositiveCents(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    invalid(`${field} deve ser um inteiro de centavos positivo e seguro.`);
  }
  return value as number;
}

function asYmd(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    invalid(`${field} deve ser uma data no formato YYYY-MM-DD.`);
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    invalid(`${field} deve ser uma data válida (YYYY-MM-DD).`);
  }
  return value as string;
}

function assertOnlyKeys(data: Record<string, unknown>, allowed: string[], label: string): void {
  const extra = Object.keys(data).filter(k => !allowed.includes(k));
  if (extra.length > 0) invalid(`${label}: campos não permitidos: ${extra.sort().join(', ')}.`);
}

// ─── Payloads por kind ────────────────────────────────────────────────────────

export interface RegisterPurchasePayload {
  description: string;
  amountCents: number;
  date: string;
  category: string;
  installments?: number;
  cardId?: string;
}

function validateRegisterPurchase(p: Record<string, unknown>): RegisterPurchasePayload {
  assertOnlyKeys(p, ['description', 'amountCents', 'date', 'category', 'installments', 'cardId'], 'register_purchase');
  const out: RegisterPurchasePayload = {
    description: asStringSized(p['description'], 'description', 1, 140),
    amountCents: asSafePositiveCents(p['amountCents'], 'amountCents'),
    date: asYmd(p['date'], 'date'),
    category: p['category'] === undefined ? 'Outros' : asStringSized(p['category'], 'category', 1, 120),
  };
  if (p['installments'] !== undefined) {
    if (!Number.isSafeInteger(p['installments']) || (p['installments'] as number) < 1 || (p['installments'] as number) > 120) {
      invalid('installments deve ser inteiro entre 1 e 120.');
    }
    // Decisão de produto (CLAUDE.md): o Agente registra apenas compras À VISTA.
    // Parcelamento é um fluxo próprio (formulário/installmentRepo: divisão modulo-safe
    // + competência por cartão + N transações com history Modelo A). NÃO duplicar lógica
    // monetária no Admin SDK (Zonas Proibidas). A UI roteia pelo `reason` estruturado.
    if ((p['installments'] as number) > 1) {
      throw new AgentActionValidationError(
        'O assistente registra apenas compras à vista. Para parcelar, use o formulário de compra.',
        { code: 'failed-precondition', reason: 'use_installment_form' },
      );
    }
    out.installments = p['installments'] as number;
  }
  if (p['cardId'] !== undefined) out.cardId = asStringSized(p['cardId'], 'cardId', 1, 120);
  return out;
}

function validateGenericMoneyAction(p: Record<string, unknown>, idField: string, kind: string): Record<string, unknown> {
  assertOnlyKeys(p, [idField, 'amountCents', 'date'], kind);
  return {
    [idField]: asStringSized(p[idField], idField, 1, 120),
    amountCents: asSafePositiveCents(p['amountCents'], 'amountCents'),
    date: asYmd(p['date'], 'date'),
  };
}

function validateCreateBudget(p: Record<string, unknown>): Record<string, unknown> {
  assertOnlyKeys(p, ['category', 'limitCents', 'competencia'], 'create_budget');
  const competencia = p['competencia'];
  if (typeof competencia !== 'string' || !/^\d{4}-\d{2}$/.test(competencia)) {
    invalid('competencia deve ser YYYY-MM.');
  }
  return {
    category: asStringSized(p['category'], 'category', 1, 60),
    limitCents: asSafePositiveCents(p['limitCents'], 'limitCents'),
    competencia,
  };
}

// ─── Envelope completo ──────────────────────────────────────────────────────────

export interface ValidatedAgentAction {
  kind: AgentActionKind;
  payload: Record<string, unknown>;
  intent: string;
  question: string;
  toolsUsed: string[];
  snapshotRef?: string;
  simulationResult?: Record<string, unknown>;
}

/**
 * Valida o envelope de execução de uma ação do agente. Lança
 * `AgentActionValidationError` (code 'invalid-argument') em qualquer violação.
 * REJEITA propostas cujo `status` não seja exatamente `'confirmed'`.
 */
export function validateAgentActionRequest(raw: unknown): ValidatedAgentAction {
  const data = asObject(raw, 'Payload');
  assertOnlyKeys(
    data,
    ['proposal', 'intent', 'question', 'toolsUsed', 'snapshotRef', 'simulationResult', 'idempotencyKey'],
    'Envelope',
  );

  const proposal = asObject(data['proposal'], 'proposal');
  assertOnlyKeys(proposal, ['kind', 'status', 'payload'], 'proposal');

  const kind = proposal['kind'];
  if (typeof kind !== 'string' || !(AGENT_ACTION_KINDS as readonly string[]).includes(kind)) {
    invalid(`proposal.kind deve ser um de: ${AGENT_ACTION_KINDS.join(', ')}.`);
  }

  // Gate de confirmação humana — núcleo da governança (AI_AGENT_GUARDRAILS §4).
  // Falha de PRÉ-CONDIÇÃO (não de forma do argumento): a UI roteia pelo `reason`
  // estável `confirmation_required`, nunca pela prosa da mensagem.
  if (proposal['status'] !== 'confirmed') {
    throw new AgentActionValidationError(
      'Ação só pode ser executada após confirmação humana explícita (status "confirmed").',
      { code: 'failed-precondition', reason: 'confirmation_required' },
    );
  }

  const rawPayload = asObject(proposal['payload'], 'proposal.payload');
  let payload: Record<string, unknown>;
  switch (kind as AgentActionKind) {
    case 'register_purchase':
      payload = validateRegisterPurchase(rawPayload) as unknown as Record<string, unknown>;
      break;
    case 'register_debt_payment':
      payload = validateGenericMoneyAction(rawPayload, 'debtId', 'register_debt_payment');
      break;
    case 'contribute_to_goal':
      payload = validateGenericMoneyAction(rawPayload, 'goalId', 'contribute_to_goal');
      break;
    case 'create_budget':
      payload = validateCreateBudget(rawPayload);
      break;
  }

  const intent = data['intent'];
  if (typeof intent !== 'string' || !(AGENT_INTENTS as readonly string[]).includes(intent)) {
    invalid(`intent deve ser um de: ${AGENT_INTENTS.join(', ')}.`);
  }

  const toolsUsedRaw = data['toolsUsed'];
  if (!Array.isArray(toolsUsedRaw) || toolsUsedRaw.length > 16) {
    invalid('toolsUsed deve ser um array com no máximo 16 itens.');
  }
  const toolsUsed = toolsUsedRaw.map((t, i) => asStringSized(t, `toolsUsed[${i}]`, 1, 60));

  const result: ValidatedAgentAction = {
    kind: kind as AgentActionKind,
    payload,
    intent: intent as string,
    question: asStringSized(data['question'], 'question', 1, 2000),
    toolsUsed,
  };
  if (data['snapshotRef'] !== undefined) {
    result.snapshotRef = asStringSized(data['snapshotRef'], 'snapshotRef', 1, 200);
  }
  if (data['simulationResult'] !== undefined) {
    result.simulationResult = asObject(data['simulationResult'], 'simulationResult');
  }
  return result;
}
