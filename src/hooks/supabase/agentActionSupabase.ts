// Ação confirmada do Agente no Supabase: a função execute_agent_action (migração
// 0023) revalida a proposta, grava a ação com histórico de origem 'ai' e o
// Diário de Decisões na mesma transação, com idempotência pela chave.
import { getSupabase } from '../../shared/api/supabase/client';
import { logSanitizedFirebaseError } from '../../shared/lib/firebaseErrorHandling';

export interface AgentExecuteResponse {
  id: string;
  decisionId?: string | null;
}

/** Erro no mesmo formato da callable do Firebase (code / message / details.reason). */
export class AgentRpcError extends Error {
  code: string;
  details?: { reason: string };
  constructor(code: string, message: string, reason?: string) {
    super(message);
    this.name = 'AgentRpcError';
    this.code = code;
    if (reason) this.details = { reason };
  }
}

// SQLSTATE da função → código no padrão das callables, que a tela já entende.
const CODE_BY_SQLSTATE: Record<string, string> = {
  QF412: 'failed-precondition',
  '22023': 'invalid-argument',
  P0002: 'not-found',
  QF429: 'resource-exhausted',
  '42501': 'permission-denied',
};

// Só estas mensagens são curadas no servidor (em português, sem dados do usuário).
const CURATED = new Set(['QF412', '22023', 'P0002', 'QF429']);

export async function executeAgentActionSupabase(envelope: Record<string, unknown>): Promise<AgentExecuteResponse> {
  const { data, error } = await getSupabase().rpc('execute_agent_action', { p_request: envelope });
  if (error) {
    logSanitizedFirebaseError('agent_action_execute', error);
    const sqlstate = typeof error.code === 'string' ? error.code : '';
    const code = CODE_BY_SQLSTATE[sqlstate] ?? 'internal';
    const message = CURATED.has(sqlstate) && error.message ? error.message : 'Não foi possível concluir a ação.';
    const reason = sqlstate === 'QF412' && typeof error.details === 'string' && error.details ? error.details : undefined;
    throw new AgentRpcError(code, message, reason);
  }
  const out = (data ?? {}) as { id?: unknown; decisionId?: unknown };
  if (typeof out.id !== 'string') throw new AgentRpcError('internal', 'Não foi possível concluir a ação.');
  return { id: out.id, decisionId: typeof out.decisionId === 'string' ? out.decisionId : null };
}
