/**
 * intentRouter.ts — Orquestração DETERMINÍSTICA do intent router (FASE H).
 *
 * Dada uma classificação de intenção (vinda de um `IntentClassifier`), decide o que o
 * agente faz: responder (read-only), propor uma `ActionProposal` (confirmação humana),
 * pedir dados que faltam, ou recusar por baixa confiança / intenção desconhecida.
 *
 * Esta camada é PURA e testável. A classificação em si (mensagem → intenção+slots) é um
 * adaptador externo via `IntentClassifier` — a implementação de produção usa o LLM
 * (Gemini) e DEVE ser validada com emulator antes de ir a produção. Aqui incluímos
 * apenas um classificador HEURÍSTICO determinístico (palavras-chave) como fallback/teste,
 * que NÃO substitui o LLM (não extrai valores/ids).
 */
import { AGENT_INTENTS, type AgentIntent } from '../../shared/schemas/agentSchemas';
import { formatBRL } from '../../shared/types/money';
import { INTENT_REGISTRY, isActionIntent, type AgentTool } from './intentRegistry';
import { buildProposal, type Slots, type BuildResult } from './proposalBuilders';
import type { ActionProposal, ActionKind } from '../../shared/schemas/agentSchemas';

/** Saída do classificador (contrato com o adaptador LLM). */
export interface IntentClassification {
  intent: string;
  slots: Slots;
  /** 0..1 — confiança da classificação. */
  confidence: number;
}

/** Adaptador de classificação (produção: Gemini; teste/fallback: heurístico). */
export type IntentClassifier = (input: {
  message: string;
  context?: unknown;
}) => Promise<IntentClassification>;

export type RouteResult =
  | { type: 'answer'; intent: AgentIntent; tools: AgentTool[] }
  | { type: 'proposal'; intent: AgentIntent; kind: ActionKind; proposal: ActionProposal; question: string; tools: AgentTool[] }
  | { type: 'need_more_info'; intent: AgentIntent; kind: ActionKind; missing: string[] }
  | { type: 'low_confidence'; intent?: AgentIntent }
  | { type: 'unknown_intent' };

export const CONFIDENCE_THRESHOLD = 0.6;

function isAgentIntent(value: string): value is AgentIntent {
  return (AGENT_INTENTS as readonly string[]).includes(value);
}

/** Pergunta de confirmação legível por kind (sem markdown). */
export function buildActionQuestion(proposal: ActionProposal): string {
  switch (proposal.kind) {
    case 'register_purchase': {
      const { description, amountCents, installments } = proposal.payload;
      const parcela = installments && installments > 1 ? `em ${installments}x` : 'à vista';
      return `Registrar a compra "${description}" de ${formatBRL(amountCents)} ${parcela}?`;
    }
    case 'register_debt_payment':
      return `Registrar um pagamento de ${formatBRL(proposal.payload.amountCents)} nesta dívida?`;
    case 'contribute_to_goal':
      return `Contribuir com ${formatBRL(proposal.payload.amountCents)} para esta meta?`;
    case 'create_budget':
      return `Criar um orçamento de ${formatBRL(proposal.payload.limitCents)} para "${proposal.payload.category}" em ${proposal.payload.competencia}?`;
  }
}

/**
 * Roteia uma classificação para a próxima ação do agente. Puro e determinístico.
 */
export function routeIntent(classification: IntentClassification): RouteResult {
  const { intent, slots, confidence } = classification;

  if (!isAgentIntent(intent)) return { type: 'unknown_intent' };
  if (confidence < CONFIDENCE_THRESHOLD) return { type: 'low_confidence', intent };

  const def = INTENT_REGISTRY[intent];

  // Intenções apenas-resposta (read-only).
  if (!isActionIntent(intent) || !def.kind) {
    return { type: 'answer', intent, tools: def.tools };
  }

  const kind = def.kind;
  const built: BuildResult = buildProposal(kind, slots);
  if (!built.ok) {
    return { type: 'need_more_info', intent, kind, missing: built.issues };
  }

  return {
    type: 'proposal',
    intent,
    kind,
    proposal: built.proposal,
    question: buildActionQuestion(built.proposal),
    tools: def.tools,
  };
}

// ─── Classificador heurístico (fallback determinístico — NÃO substitui o LLM) ──────
const KEYWORD_RULES: Array<{ intent: AgentIntent; re: RegExp }> = [
  { intent: 'simulate_purchase',           re: /\b(posso\s+comprar|comprar|compra|gastar\s+em)\b/i },
  { intent: 'plan_debt_payment',           re: /\b(d[ií]vida|pagar.*(d[ií]vida|empr[eé]stimo|parcela)|quitar)\b/i },
  { intent: 'create_budget_proposal',      re: /\b(or[çc]amento|limite\s+de\s+gasto)\b/i },
  { intent: 'contribute_to_goal_proposal', re: /\b(meta|guardar|poupar|juntar)\b/i },
  { intent: 'get_invoice',                 re: /\b(fatura|cart[ãa]o)\b/i },
  { intent: 'cashflow_briefing',           re: /\b(fluxo\s+de\s+caixa|proje[çc][ãa]o|previs[ãa]o)\b/i },
  { intent: 'explain_month',               re: /\b(este\s+m[êe]s|do\s+m[êe]s|gastei|resumo\s+do\s+m[êe]s)\b/i },
  { intent: 'get_balances',                re: /\b(saldo|quanto\s+(eu\s+)?tenho|dispon[íi]vel)\b/i },
];

/**
 * Classificador determinístico por palavras-chave. Útil como fallback offline e em
 * testes. NÃO extrai valores/ids (slots vazios) — a extração de slots é responsabilidade
 * do classificador LLM de produção.
 */
export const heuristicIntentClassifier: IntentClassifier = async ({ message }) => {
  const text = message ?? '';
  for (const { intent, re } of KEYWORD_RULES) {
    if (re.test(text)) return { intent, slots: {}, confidence: 0.7 };
  }
  return { intent: 'get_balances', slots: {}, confidence: 0 };
};
