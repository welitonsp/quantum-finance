/**
 * geminiIntentClassifier.ts — Adaptador LLM do intent router (FASE H).
 *
 * Implementa o `IntentClassifier` usando o transporte LLM existente (`chatWithQuantumAI`
 * via `GeminiService` — chave no servidor, App Check, PII mascarada). O LLM atua só nas
 * PONTAS (classificar intenção + extrair slots em linguagem natural); toda a decisão e a
 * conversão MONETÁRIA são determinísticas aqui.
 *
 * Segurança:
 *  • O LLM NUNCA calcula centavos. Ele informa o valor em REAIS (`amount`/`limit`); a
 *    conversão para centavos inteiros usa `toCentavos` (Decimal.js). Centavos canônicos.
 *  • Saída estritamente validada: intenção ∈ enum fechado, confiança 0..1, slots coeridos.
 *  • Qualquer falha (sem JSON, intenção inválida, transporte caído) → confiança 0, que o
 *    `routeIntent` trata como `low_confidence` → cai no chat normal. Degradação segura.
 *  • Nenhuma escrita ocorre aqui: classificação só PROPÕE; a escrita exige confirmação
 *    humana (ActionConfirmationSheet) + revalidação server-trusted.
 */
import { GeminiService } from '../ai-chat/GeminiService';
import { AGENT_INTENTS } from '../../shared/schemas/agentSchemas';
import { toCentavos, type MoneyInput } from '../../shared/types/money';
import type { IntentClassification, IntentClassifier } from './intentRouter';
import type { Slots } from './proposalBuilders';

/** Transporte LLM: recebe um prompt e devolve o texto cru da resposta. */
export type LlmTransport = (prompt: string) => Promise<string>;

const SAFE_FALLBACK: IntentClassification = { intent: 'get_balances', slots: {}, confidence: 0 };

function buildClassificationPrompt(message: string): string {
  return [
    'Você é um classificador de intenções de um app financeiro. NÃO converse, NÃO calcule, NÃO opine.',
    'Sua única tarefa: classificar a mensagem do usuário em EXATAMENTE uma intenção do enum e extrair os campos.',
    '',
    `INTENÇÕES VÁLIDAS (enum fechado): ${AGENT_INTENTS.join(', ')}.`,
    '',
    'CAMPOS (slots) por intenção (use só os aplicáveis; valores monetários SEMPRE em REAIS como número, NUNCA centavos):',
    '• simulate_purchase: description (texto), amount (reais), installments (int), category (texto), cardId',
    '• plan_debt_payment: debtId, amount (reais)',
    '• create_budget_proposal: category (texto), limit (reais), competencia (YYYY-MM)',
    '• contribute_to_goal_proposal: goalId, amount (reais)',
    '• get_balances / get_invoice / explain_month / cashflow_briefing: sem campos.',
    '',
    'REGRAS:',
    '1. Valores em REAIS, como número puro: "4 mil" → 4000; "R$ 1.250,50" → 1250.5. NUNCA multiplique por 100.',
    '2. NUNCA invente IDs. Só preencha debtId/goalId/cardId se o usuário fornecer um identificador explícito;',
    '   caso contrário, OMITA o campo (o app pedirá depois). Nomes genéricos ("minha dívida") NÃO são IDs.',
    '3. Extraia só o que estiver claramente na mensagem; não preencha campos por suposição.',
    '4. confidence reflete sua certeza da INTENÇÃO (0..1). Mensagem ambígua/saudação/fora de escopo → confidence < 0.6.',
    '5. Responda APENAS com JSON válido, uma linha, sem markdown e sem texto fora do objeto.',
    '',
    'FORMATO: {"intent":"<enum>","confidence":<0..1>,"slots":{...}}',
    '',
    'EXEMPLOS:',
    'Mensagem: "posso comprar um notebook de 4 mil?"',
    '{"intent":"simulate_purchase","confidence":0.95,"slots":{"description":"notebook","amount":4000}}',
    'Mensagem: "quanto tenho de saldo?"',
    '{"intent":"get_balances","confidence":0.97,"slots":{}}',
    'Mensagem: "cria um orçamento de 800 para lazer"',
    '{"intent":"create_budget_proposal","confidence":0.93,"slots":{"category":"lazer","limit":800}}',
    'Mensagem: "quero guardar 200 na minha meta de viagem"',
    '{"intent":"contribute_to_goal_proposal","confidence":0.9,"slots":{"amount":200}}',
    'Mensagem: "bom dia, tudo bem?"',
    '{"intent":"get_balances","confidence":0.1,"slots":{}}',
    '',
    `Mensagem do usuário: ${JSON.stringify(message)}`,
  ].join('\n');
}

/** Extrai o primeiro objeto JSON da resposta (tolerante a cercas de código). */
function extractJsonObject(raw: string): string | null {
  if (!raw) return null;
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced?.[1] ?? raw;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  return start >= 0 && end > start ? body.slice(start, end + 1) : null;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/** Converte um valor monetário (reais) em centavos inteiros; descarta se inválido. */
function coerceCents(v: unknown): number | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  try {
    return toCentavos(v as MoneyInput);
  } catch {
    return undefined;
  }
}

/** Mapeia os slots do LLM (reais) para os slots dos builders (centavos canônicos). */
function mapSlots(raw: unknown): Slots {
  const r = (raw ?? {}) as Record<string, unknown>;
  const slots: Slots = {};
  if (typeof r['description'] === 'string') slots['description'] = r['description'];
  if (typeof r['category'] === 'string') slots['category'] = r['category'];
  if (typeof r['cardId'] === 'string') slots['cardId'] = r['cardId'];
  if (typeof r['debtId'] === 'string') slots['debtId'] = r['debtId'];
  if (typeof r['goalId'] === 'string') slots['goalId'] = r['goalId'];
  if (typeof r['competencia'] === 'string') slots['competencia'] = r['competencia'];
  if (Number.isSafeInteger(r['installments'])) slots['installments'] = r['installments'] as number;

  const amountCents = coerceCents(r['amount']);
  if (amountCents !== undefined) slots['amountCents'] = amountCents;
  const limitCents = coerceCents(r['limit']);
  if (limitCents !== undefined) slots['limitCents'] = limitCents;
  return slots;
}

/** Faz o parse + validação estrita da resposta do LLM. Falha → fallback seguro. */
export function parseClassification(raw: string): IntentClassification {
  const json = extractJsonObject(raw);
  if (!json) return SAFE_FALLBACK;

  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(json) as Record<string, unknown>;
  } catch {
    return SAFE_FALLBACK;
  }

  const intent = obj['intent'];
  if (typeof intent !== 'string' || !(AGENT_INTENTS as readonly string[]).includes(intent)) {
    return SAFE_FALLBACK;
  }

  const confidence = clamp01(Number(obj['confidence']));
  return { intent, slots: mapSlots(obj['slots']), confidence };
}

/** Cria um `IntentClassifier` a partir de um transporte LLM injetável (testável). */
export function createGeminiIntentClassifier(transport: LlmTransport): IntentClassifier {
  return async ({ message }) => {
    try {
      const raw = await transport(buildClassificationPrompt(message));
      return parseClassification(raw);
    } catch {
      return SAFE_FALLBACK;
    }
  };
}

/**
 * Classificador de produção: usa o callable `chatWithQuantumAI` como transporte.
 * ⚠️ Requer validação com emulator antes de ligar no chat (ver docs/AI_TOOL_ROUTER.md §7.2).
 */
export const geminiIntentClassifier: IntentClassifier = createGeminiIntentClassifier(
  (prompt) => GeminiService.getFinancialAdvice(prompt, {}),
);
