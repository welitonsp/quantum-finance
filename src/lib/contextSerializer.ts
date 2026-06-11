/**
 * contextSerializer.ts
 *
 * Serializes financial context into tokenized references so the LLM
 * never generates raw monetary digits — it only uses {{ref_X}} tokens
 * which are resolved back to real values on the client after the response.
 */

import type { Centavos } from '../shared/types/money';
import { formatBRL } from '../shared/types/money';

export interface SerializedContext {
  /** Map of token → formatted BRL value. e.g. {{ref_saldo}} → "R$ 1.234,00" */
  refs: Record<string, string>;
  /** System instruction to prepend to every prompt */
  systemInstruction: string;
}

/**
 * Builds a SerializedContext from the user's financial snapshot.
 * All monetary values are replaced by opaque tokens.
 */
export function serializeFinancialContext(params: {
  balance: number;
  monthlyIncome: Centavos;
  monthlyExpense: Centavos;
  topCategories: Array<{ name: string; amountCents: Centavos }>;
}): SerializedContext {
  const refs: Record<string, string> = {};

  refs['ref_saldo']   = formatBRL(Math.round(params.balance * 100) as Centavos);
  refs['ref_receita'] = formatBRL(params.monthlyIncome);
  refs['ref_despesa'] = formatBRL(params.monthlyExpense);

  params.topCategories.forEach((cat, i) => {
    refs[`ref_cat${i}_nome`]  = cat.name;
    refs[`ref_cat${i}_valor`] = formatBRL(cat.amountCents);
  });

  const tokenList = Object.keys(refs)
    .map(k => `{{${k}}}`)
    .join(', ');

  const systemInstruction =
    `REGRA CRÍTICA: Para valores monetários, use SOMENTE os tokens fornecidos: ${tokenList}. ` +
    `NUNCA escreva dígitos de dinheiro diretamente (ex: R$ 1.234,00). ` +
    `Sempre referencie valores assim: {{ref_saldo}}, {{ref_receita}}, {{ref_despesa}}, etc.`;

  return { refs, systemInstruction };
}

/**
 * Resolves {{ref_X}} tokens in the LLM response using the refs map.
 * Unknown tokens are kept as visible placeholders to surface bugs.
 */
export function resolveRefs(text: string, refs: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key: string) => refs[key] ?? `[?${key}]`);
}
