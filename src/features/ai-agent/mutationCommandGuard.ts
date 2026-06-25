/**
 * mutationCommandGuard.ts — Guarda DETERMINÍSTICA de comandos de mutação no chat (FASE H).
 *
 * Problema que resolve: um comando imperativo de escrita ("Registre uma despesa de R$ 35…")
 * que o classificador LLM não roteia como `proposal` cai no chat freeform do Gemini, que
 * pode ALUCINAR um "registrado" sem nunca persistir. Esta guarda intercepta esses comandos
 * de forma determinística e os transforma numa `ActionProposal` PENDENTE (confirmação humana
 * obrigatória) — NUNCA executa. Para receitas (sem `kind` de ação correspondente) e comandos
 * sem dados suficientes, devolve uma mensagem segura, sem hallucination e sem escrita.
 *
 * 100% puro e testável: sem I/O, sem LLM. Conversão reais→centavos via `toCentavos`
 * (canônico, zero float). Só PROPÕE — a execução continua atrás da confirmação humana.
 */
import { buildRegisterPurchase } from './proposalBuilders';
import { toCentavos, formatBRL } from '../../shared/types/money';
import type { ActionProposal } from '../../shared/schemas/agentSchemas';

export type MutationGuardResult =
  | { type: 'expense_proposal'; proposal: ActionProposal; question: string }
  | { type: 'income_unsupported'; message: string }
  | { type: 'needs_details'; message: string }
  | { type: 'not_mutation' };

// Verbos imperativos de registro (NÃO inclui "comprar"/"posso comprar" — esses são
// consultas de simulação tratadas pelo classificador LLM).
const REGISTER_VERB = /\b(registr\w*|lan[çc]\w*|adicion\w*|cadastr\w*|inclu[ai]\w*|anot\w*)\b/i;
const EXPENSE_NOUN  = /\b(despesa|despesas|gasto|gastos|compra|compras|sa[íi]da|pagamento|paguei|gastei)\b/i;
const INCOME_NOUN   = /\b(receita|receitas|ganho|ganhos|ganhei|recebi|entrada|sal[áa]rio|salario|provento)\b/i;
const GENERIC_NOUN  = /\b(transa[çc][ãa]o|lan[çc]amento|movimenta[çc][ãa]o)\b/i;

const INCOME_MESSAGE =
  'Por enquanto eu só registro despesas pelo assistente. Para lançar uma receita, use o formulário de transações.';
const DETAILS_MESSAGE =
  'Para registrar, me diga a descrição e o valor. Ex.: "registre uma despesa de R$ 35 no mercado hoje".';

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Extrai o primeiro valor monetário ancorado em R$ ou "reais/real". Retorna centavos + fim do match. */
function extractAmountCents(text: string): { cents: number; end: number } | null {
  // 1) "R$ 1.234,56" / "R$35"
  const withSymbol = text.match(/r\$\s*(\d[\d.,]*\d|\d)/i);
  // 2) "35 reais" / "1.234,56 reais"
  const withWord = text.match(/(\d[\d.,]*\d|\d)\s*(?:reais|real)\b/i);
  const chosen = withSymbol ?? withWord;
  if (!chosen || chosen.index === undefined) return null;
  try {
    const cents = toCentavos(chosen[1] as string);
    if (cents <= 0) return null;
    return { cents, end: chosen.index + chosen[0].length };
  } catch {
    return null;
  }
}

/** Captura uma descrição legível após o valor (ex.: "no mercado hoje" → "Mercado"). */
function extractDescription(text: string, amountEnd: number): string | null {
  let rest = text.slice(amountEnd);
  rest = rest.replace(/^\s*(reais|real|r\$)\b/i, '');
  // Preferir o trecho após uma preposição de lugar/objeto.
  const prep = rest.match(/\b(?:no|na|em|de|do|da|para|pra|pro|com)\s+(.+)$/i);
  let desc = (prep?.[1] ?? rest).trim();
  // Remover marcadores temporais e o que vier depois.
  desc = desc.replace(/\b(hoje|ontem|amanh[ãa]|de\s+hoje)\b.*$/i, '').trim();
  desc = desc.replace(/[.;,!?]+$/g, '').trim();
  if (!desc) return null;
  return desc.charAt(0).toUpperCase() + desc.slice(1);
}

/**
 * Interpreta um comando de mutação imperativo. Determinístico e puro.
 * Só retorna `expense_proposal` (PENDENTE) — nunca executa.
 */
export function interpretMutationCommand(text: string, now: Date = new Date()): MutationGuardResult {
  if (!text || !REGISTER_VERB.test(text)) return { type: 'not_mutation' };

  const hasExpense = EXPENSE_NOUN.test(text);
  const hasIncome  = INCOME_NOUN.test(text) && !hasExpense;
  const hasGeneric = GENERIC_NOUN.test(text);

  if (!hasExpense && !hasIncome && !hasGeneric) return { type: 'not_mutation' };
  if (hasIncome) return { type: 'income_unsupported', message: INCOME_MESSAGE };

  const amount = extractAmountCents(text);
  if (amount === null) return { type: 'needs_details', message: DETAILS_MESSAGE };

  const description = extractDescription(text, amount.end);
  const date = /\bontem\b/i.test(text)
    ? ymd(new Date(now.getTime() - 24 * 60 * 60 * 1000))
    : ymd(now);

  const built = buildRegisterPurchase({
    description: description ?? 'Despesa',
    amountCents: amount.cents,
    date,
  });
  if (!built.ok) return { type: 'needs_details', message: DETAILS_MESSAGE };

  const whenLabel = /\bontem\b/i.test(text) ? 'ontem' : 'hoje';
  const placePart = description ? ` em ${description}` : '';
  const question = `Detectei uma despesa de ${formatBRL(amount.cents)}${placePart} para ${whenLabel}. Deseja confirmar o registro?`;

  return { type: 'expense_proposal', proposal: built.proposal, question };
}

// ─── Confirmação / cancelamento por texto ────────────────────────────────────────

const CANCEL_RE  = /^\s*(n[ãa]o|nao|cancelar|cancela|cancelo|cancelado|deixa\s+pra\s+l[áa]|deixa|esquece|negativo)\b/i;
const CONFIRM_RE = /^\s*(sim|confirmar|confirma|confirmo|confirmado|pode\s+registrar|pode\s+confirmar|pode\s+sim|ok|okay|claro|isso|certo|positivo)\b/i;

export type ConfirmationReply = 'confirm' | 'cancel' | 'unclear';

/**
 * Classifica a resposta do usuário a uma proposta pendente. Determinístico.
 * Cancelamento é avaliado ANTES da confirmação para evitar falsos positivos.
 */
export function parseConfirmationReply(text: string): ConfirmationReply {
  const t = (text ?? '').trim();
  if (!t) return 'unclear';
  if (CANCEL_RE.test(t)) return 'cancel';
  if (CONFIRM_RE.test(t)) return 'confirm';
  return 'unclear';
}
