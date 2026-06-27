/**
 * intentRegistry.ts — Catálogo de intenções do Agente Financeiro (FASE H — intent router).
 *
 * Núcleo DETERMINÍSTICO e testável: declara cada intenção suportada, as ferramentas
 * READ-ONLY que ela consulta para montar contexto, e — quando aplicável — o `kind` de
 * `ActionProposal` que ela culmina (sempre sujeito a confirmação humana).
 *
 * Governança (AI_AGENT_GUARDRAILS): o agente LÊ via ferramentas read-only para informar,
 * mas só ESCREVE através de uma `ActionProposal` confirmada (executeAgentAction). A
 * classificação da intenção (LLM) é um adaptador externo — ver intentRouter.ts.
 */
import type { AgentIntent, ActionKind } from '../../shared/schemas/agentSchemas';

/** Ferramentas read-only disponíveis ao agente (somente leitura de contexto). */
export const AGENT_TOOLS = [
  'getBalances',
  'getInvoice',
  'getMonthlyReport',
  'getCashflowForecast',
  'purchaseSimulator',
  'getDebts',
  'getBudgets',
  'getGoals',
] as const;

export type AgentTool = (typeof AGENT_TOOLS)[number];

export interface IntentDefinition {
  id: AgentIntent;
  /** Rótulo curto em pt-BR. */
  label: string;
  /** Ferramentas read-only consultadas para esta intenção. */
  tools: AgentTool[];
  /** Quando a intenção culmina numa ação, o tipo de `ActionProposal`. */
  kind?: ActionKind;
  /** Slots (parâmetros) obrigatórios para montar a proposta. */
  requiredSlots?: string[];
}

export const INTENT_REGISTRY: Record<AgentIntent, IntentDefinition> = {
  // ── Intenções apenas-resposta (read-only, sem escrita) ──────────────────────
  get_balances:      { id: 'get_balances',      label: 'Consultar saldos',        tools: ['getBalances'] },
  get_invoice:       { id: 'get_invoice',        label: 'Consultar fatura',         tools: ['getInvoice'] },
  explain_month:     { id: 'explain_month',      label: 'Explicar o mês',           tools: ['getMonthlyReport'] },
  cashflow_briefing: { id: 'cashflow_briefing',  label: 'Briefing de fluxo de caixa', tools: ['getCashflowForecast', 'getBalances'] },

  // ── Intenções que culminam em ActionProposal (confirmação humana obrigatória) ─
  simulate_purchase: {
    id: 'simulate_purchase',
    label: 'Simular e registrar compra',
    tools: ['purchaseSimulator', 'getBalances'],
    kind: 'register_purchase',
    requiredSlots: ['description', 'amountCents'],
  },
  plan_debt_payment: {
    id: 'plan_debt_payment',
    label: 'Registrar pagamento de dívida',
    tools: ['getDebts'],
    kind: 'register_debt_payment',
    requiredSlots: ['debtId', 'amountCents'],
  },
  create_budget_proposal: {
    id: 'create_budget_proposal',
    label: 'Criar orçamento',
    tools: ['getBudgets', 'getMonthlyReport'],
    kind: 'create_budget',
    requiredSlots: ['category', 'limitCents'],
  },
  contribute_to_goal_proposal: {
    id: 'contribute_to_goal_proposal',
    label: 'Contribuir para meta',
    tools: ['getGoals'],
    kind: 'contribute_to_goal',
    requiredSlots: ['goalId', 'amountCents'],
  },
  register_income_proposal: {
    id: 'register_income_proposal',
    label: 'Registrar receita',
    tools: ['getBalances'],
    kind: 'register_income',
    requiredSlots: ['description', 'amountCents'],
  },
};

/** Intenções que produzem uma ação (vs. apenas-resposta). */
export function isActionIntent(intent: AgentIntent): boolean {
  return INTENT_REGISTRY[intent]?.kind !== undefined;
}
