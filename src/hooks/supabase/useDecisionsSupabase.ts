// Diário de Decisões do Agente no Supabase (public.ai_decisions).
// Gravado só pelo servidor; o dono apenas lê (RLS + sem INSERT/UPDATE do cliente).
import { useMemo } from 'react';
import {
  decisionStats, toOutcomeStatus, toProposedAction, toStringField, toUserDecision,
  type AIDecision, type UseDecisionsReturn,
} from '../useDecisions';
import { useSupabaseTable } from './useSupabaseTable';

/** Quantidade de decisões mais recentes exibidas (as duas versões). Fica aqui, e não em
 *  useDecisions.ts, porque é lida no carregamento deste módulo (import circular). */
export const DECISIONS_LIMIT = 50;

export interface DecisionRow {
  id: string;
  intent: string | null;
  question: string | null;
  user_decision: string | null;
  outcome_status: string | null;
  proposed_action: unknown;
  created_at: string | null;
}

export function mapDecisionRow(row: DecisionRow): AIDecision {
  const ms = row.created_at ? Date.parse(row.created_at) : Number.NaN;
  return {
    id: row.id,
    intent: toStringField(row.intent),
    question: toStringField(row.question),
    userDecision: toUserDecision(row.user_decision),
    outcomeStatus: toOutcomeStatus(row.outcome_status),
    createdAt: Number.isNaN(ms) ? null : new Date(ms),
    proposedAction: toProposedAction(row.proposed_action),
  };
}

const DECISION_OPTIONS = {
  table: 'ai_decisions',
  columns: 'id, intent, question, user_decision, outcome_status, proposed_action, created_at',
  orderBy: 'created_at',
  ascending: false,
  limit: DECISIONS_LIMIT,
  map: mapDecisionRow,
  loadOp: 'firestore_query',
} as const;

export function useDecisionsSupabase(uid: string): UseDecisionsReturn {
  const { items: decisions, loading } = useSupabaseTable<DecisionRow, AIDecision>(uid, DECISION_OPTIONS);
  const stats = useMemo(() => decisionStats(decisions), [decisions]);
  return { decisions, loading, stats };
}
