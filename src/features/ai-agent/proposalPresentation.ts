/**
 * proposalPresentation.ts — Apresentação PURA de uma `ActionProposal` no chat (FASE H).
 *
 * Mapeia uma proposta (já validada) para o que a `ActionConfirmationSheet` precisa
 * exibir: título, rótulo do botão, mensagem de sucesso e linhas de resumo já
 * formatadas (sem lógica monetária na UI — formatação via `formatBRL`).
 *
 * Também formata a pergunta de "falta informação" (`need_more_info`) em pt-BR a
 * partir dos slots faltantes — só o RÓTULO do que falta, nunca conteúdo financeiro.
 * 100% determinístico e testável: sem I/O, sem LLM.
 */
import { formatBRL } from '../../shared/types/money';
import type { ActionProposal } from '../../shared/schemas/agentSchemas';
import type { ActionSummaryRow } from './ActionConfirmationSheet';

export interface ProposalPresentation {
  title: string;
  confirmLabel: string;
  successMessage: string;
  rows: ActionSummaryRow[];
}

/** YYYY-MM-DD → DD/MM/YYYY (apresentação). */
function formatYmd(ymd: string): string {
  return ymd.split('-').reverse().join('/');
}

/** Mapeia uma proposta confirmável para o resumo legível da sheet. */
export function presentProposal(proposal: ActionProposal): ProposalPresentation {
  switch (proposal.kind) {
    case 'register_purchase': {
      const { description, amountCents, date, category, installments } = proposal.payload;
      return {
        title: 'Registrar compra',
        confirmLabel: 'Registrar compra',
        successMessage: 'Compra registrada pelo assistente.',
        rows: [
          { label: 'Descrição', value: description },
          { label: 'Valor', value: formatBRL(amountCents), emphasis: true },
          { label: 'Data', value: formatYmd(date) },
          { label: 'Categoria', value: category ?? 'Outros' },
          ...(installments && installments > 1
            ? [{ label: 'Parcelas', value: `${installments}x` }]
            : []),
        ],
      };
    }
    case 'register_debt_payment': {
      const { amountCents, date } = proposal.payload;
      return {
        title: 'Registrar pagamento de dívida',
        confirmLabel: 'Registrar pagamento',
        successMessage: 'Pagamento registrado pelo assistente.',
        rows: [
          { label: 'Valor', value: formatBRL(amountCents), emphasis: true },
          { label: 'Data', value: formatYmd(date) },
        ],
      };
    }
    case 'contribute_to_goal': {
      const { amountCents, date } = proposal.payload;
      return {
        title: 'Contribuir para meta',
        confirmLabel: 'Contribuir',
        successMessage: 'Contribuição registrada pelo assistente.',
        rows: [
          { label: 'Valor', value: formatBRL(amountCents), emphasis: true },
          { label: 'Data', value: formatYmd(date) },
        ],
      };
    }
    case 'create_budget': {
      const { category, limitCents, competencia } = proposal.payload;
      return {
        title: 'Criar orçamento',
        confirmLabel: 'Criar orçamento',
        successMessage: 'Orçamento criado pelo assistente.',
        rows: [
          { label: 'Categoria', value: category },
          { label: 'Limite', value: formatBRL(limitCents), emphasis: true },
          { label: 'Competência', value: competencia },
        ],
      };
    }
  }
}

/** Rótulos pt-BR dos slots que o agente pode pedir (sem conteúdo financeiro). */
const SLOT_LABELS: Record<string, string> = {
  description: 'a descrição da compra',
  amountCents: 'o valor',
  category: 'a categoria',
  limitCents: 'o limite do orçamento',
  competencia: 'o mês (competência)',
  debtId: 'qual dívida',
  goalId: 'qual meta',
  cardId: 'qual cartão',
  installments: 'o número de parcelas',
};

/**
 * Monta a pergunta de "falta informação" em pt-BR a partir dos slots faltantes.
 * Usa apenas o RÓTULO do que falta — nunca o conteúdo informado pelo usuário.
 */
export function formatMissingInfoMessage(missing: string[]): string {
  const labels = missing.map((slot) => SLOT_LABELS[slot] ?? slot);
  const list =
    labels.length <= 1
      ? labels[0] ?? 'mais alguns detalhes'
      : `${labels.slice(0, -1).join(', ')} e ${labels[labels.length - 1]}`;
  return `Para isso eu preciso saber ${list}. Pode me informar?`;
}
