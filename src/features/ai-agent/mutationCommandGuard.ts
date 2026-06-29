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
import { buildRegisterPurchase, buildRegisterIncome, buildRegisterTransfer } from './proposalBuilders';
import { toCentavos, formatBRL } from '../../shared/types/money';
import { resolveAccountByName, type AccountRef } from './accountResolution';
import type { ActionProposal } from '../../shared/schemas/agentSchemas';

export type MutationGuardResult =
  | { type: 'expense_proposal'; proposal: ActionProposal; question: string }
  | { type: 'income_proposal'; proposal: ActionProposal; question: string }
  | {
      type: 'transfer_proposal';
      proposal: ActionProposal;
      question: string;
      /** Nomes legíveis das contas resolvidas — usados como display hints na sheet. */
      fromAccountName: string;
      toAccountName: string;
    }
  | { type: 'needs_details'; message: string }
  | { type: 'not_mutation' };

// Verbos imperativos de registro (NÃO inclui "comprar"/"posso comprar" — esses são
// consultas de simulação tratadas pelo classificador LLM).
const REGISTER_VERB = /\b(registr\w*|lan[çc]\w*|adicion\w*|cadastr\w*|inclu[ai]\w*|anot\w*)\b/i;
// Verbos de recebimento que, por si só, já são um comando imperativo de receita
// ("recebi 500 de pix", "ganhei 200 de bônus") — não exigem REGISTER_VERB.
const INCOME_VERB   = /\b(recebi|ganhei)\b/i;
// Verbo/substantivo de transferência ("transfere", "transferir", "transfira",
// "transferência"). \w* não casa acentos (sem flag u), mas o stem já garante o match.
const TRANSFER_VERB = /\btransfer\w*|\btransfir\w*/i;
const EXPENSE_NOUN  = /\b(despesa|despesas|gasto|gastos|compra|compras|sa[íi]da|pagamento|paguei|gastei)\b/i;
const INCOME_NOUN   = /\b(receita|receitas|ganho|ganhos|ganhei|recebi|entrada|sal[áa]rio|salario|provento)\b/i;
const GENERIC_NOUN  = /\b(transa[çc][ãa]o|lan[çc]amento|movimenta[çc][ãa]o)\b/i;

const DETAILS_MESSAGE =
  'Para registrar, me diga a descrição e o valor. Ex.: "registre uma despesa de R$ 35 no mercado hoje".';
const INCOME_DETAILS_MESSAGE =
  'Para registrar a receita, me diga a descrição e o valor. Ex.: "registre uma receita de R$ 1.000 de salário hoje".';
const TRANSFER_DETAILS_MESSAGE =
  'Para transferir, me diga o valor e as contas de origem e destino. Ex.: "transfere R$ 500 da poupança para a corrente".';

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

/**
 * Extração permissiva: primeiro número da frase (sem exigir R$/"reais").
 * Usada APENAS no caminho de receita, onde comandos como "recebi 500 de pix" ou
 * "registre uma receita de 1000 de salário" não ancoram o valor em R$. Mantém a
 * convenção em reais (`toCentavos("1000")` → R$ 1.000,00) e nunca calcula no LLM.
 */
function extractFirstNumberCents(text: string): { cents: number; end: number } | null {
  const m = text.match(/(\d[\d.,]*\d|\d)/);
  if (!m || m.index === undefined) return null;
  try {
    const cents = toCentavos(m[1] as string);
    if (cents <= 0) return null;
    return { cents, end: m.index + m[0].length };
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
 * Extrai os nomes crus de conta de origem e destino de um comando de transferência.
 * Padrão: "… de/da/do <origem> para/pra/pro <destino> [hoje|ontem]". Retorna null se
 * o par origem→destino não puder ser isolado.
 */
function extractTransferParties(text: string): { from: string; to: string } | null {
  const m = text.match(
    /\bd[aeo]s?\s+(.+?)\s+(?:para|pra|pro)\s+(.+?)(?:\s+(?:hoje|ontem|amanh[ãa]))?[.;,!?]*$/i,
  );
  if (!m) return null;
  const from = (m[1] ?? '').trim();
  const to = (m[2] ?? '').trim();
  if (!from || !to) return null;
  return { from, to };
}

/**
 * Interpreta um comando de mutação imperativo. Determinístico e puro.
 * Só retorna propostas PENDENTES — nunca executa. Despesa vence em ambiguidade
 * (substantivo de despesa presente ⇒ não é receita). Transferências exigem a lista de
 * `accounts` para resolver nomes → IDs (o LLM/usuário nunca digita o ID cru).
 */
export function interpretMutationCommand(
  text: string,
  now: Date = new Date(),
  accounts: AccountRef[] = [],
): MutationGuardResult {
  if (!text) return { type: 'not_mutation' };

  const isYesterday = /\bontem\b/i.test(text);
  const date = isYesterday
    ? ymd(new Date(now.getTime() - 24 * 60 * 60 * 1000))
    : ymd(now);
  const whenLabel = isYesterday ? 'ontem' : 'hoje';

  // ── Transferência entre contas próprias (verbo "transferir"). Vem antes dos demais
  // porque não usa REGISTER_VERB/INCOME_VERB. Resolve nomes → IDs via `accounts`. ──────
  if (TRANSFER_VERB.test(text)) {
    if (accounts.length === 0) {
      return { type: 'needs_details', message: 'Você ainda não tem contas cadastradas para transferir.' };
    }
    const amount = extractAmountCents(text) ?? extractFirstNumberCents(text);
    if (amount === null) return { type: 'needs_details', message: TRANSFER_DETAILS_MESSAGE };

    const parties = extractTransferParties(text);
    if (!parties) return { type: 'needs_details', message: TRANSFER_DETAILS_MESSAGE };

    const accountNames = accounts.map((a) => a.name).filter(Boolean).join(', ');
    const from = resolveAccountByName(parties.from, accounts);
    if (!from.ok) {
      return { type: 'needs_details', message: `Não identifiquei a conta de origem. Suas contas: ${accountNames}.` };
    }
    const to = resolveAccountByName(parties.to, accounts);
    if (!to.ok) {
      return { type: 'needs_details', message: `Não identifiquei a conta de destino. Suas contas: ${accountNames}.` };
    }
    if (from.id === to.id) {
      return { type: 'needs_details', message: 'Origem e destino não podem ser a mesma conta.' };
    }

    const built = buildRegisterTransfer({
      fromAccountId: from.id,
      toAccountId: to.id,
      amountCents: amount.cents,
      date,
    });
    if (!built.ok) return { type: 'needs_details', message: TRANSFER_DETAILS_MESSAGE };

    const question =
      `Detectei uma transferência de ${formatBRL(amount.cents)} de ${from.name} para ${to.name} para ${whenLabel}. Deseja confirmar?`;
    return { type: 'transfer_proposal', proposal: built.proposal, question, fromAccountName: from.name, toAccountName: to.name };
  }

  const hasRegisterVerb = REGISTER_VERB.test(text);
  const hasIncomeVerb   = INCOME_VERB.test(text);
  if (!hasRegisterVerb && !hasIncomeVerb) return { type: 'not_mutation' };

  const hasExpense   = EXPENSE_NOUN.test(text);
  const hasIncomeNoun = INCOME_NOUN.test(text);
  const hasGeneric   = GENERIC_NOUN.test(text);

  // ── Receita: verbo de recebimento (recebi/ganhei) OU verbo de registro + substantivo
  // de receita. Nunca quando há substantivo de despesa (despesa vence). ──────────────
  const incomeRequested = !hasExpense && (hasIncomeVerb || (hasRegisterVerb && hasIncomeNoun));
  if (incomeRequested) {
    // Receita aceita valor sem âncora R$ ("1000", "500"); fallback permissivo.
    const amount = extractAmountCents(text) ?? extractFirstNumberCents(text);
    if (amount === null) return { type: 'needs_details', message: INCOME_DETAILS_MESSAGE };

    const description = extractDescription(text, amount.end);
    const built = buildRegisterIncome({
      description: description ?? 'Receita',
      amountCents: amount.cents,
      date,
    });
    if (!built.ok) return { type: 'needs_details', message: INCOME_DETAILS_MESSAGE };

    const placePart = description ? ` de ${description}` : '';
    const question = `Detectei uma receita de ${formatBRL(amount.cents)}${placePart} para ${whenLabel}. Deseja confirmar o registro?`;
    return { type: 'income_proposal', proposal: built.proposal, question };
  }

  // ── Despesa: exige verbo de registro + substantivo de despesa/genérico. ────────────
  if (!hasRegisterVerb || (!hasExpense && !hasGeneric)) return { type: 'not_mutation' };

  const amount = extractAmountCents(text);
  if (amount === null) return { type: 'needs_details', message: DETAILS_MESSAGE };

  const description = extractDescription(text, amount.end);
  const built = buildRegisterPurchase({
    description: description ?? 'Despesa',
    amountCents: amount.cents,
    date,
  });
  if (!built.ok) return { type: 'needs_details', message: DETAILS_MESSAGE };

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
