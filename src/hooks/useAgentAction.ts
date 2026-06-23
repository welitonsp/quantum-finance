/**
 * useAgentAction.ts — Ponte client → callable server-trusted `executeAgentAction` (FASE H).
 *
 * É o ÚNICO caminho de escrita de uma ação proposta pelo Agente Financeiro. O gate de
 * governança é a CONFIRMAÇÃO HUMANA: este hook só é invocado quando o usuário confirma a
 * proposta, e envia `proposal.status === 'confirmed'`. O servidor revalida (App Check +
 * `validateAgentActionRequest`), escreve de forma atômica (tx + history origin 'ai' +
 * `/decisions`) e é idempotente por `idempotencyKey` (UUID v4).
 *
 * Erros do servidor chegam como `HttpsError` com `details.reason` ESTRUTURADO — ex.:
 * `use_installment_form` (compra parcelada → roteia ao formulário). A UI usa o `reason`,
 * nunca a prosa da mensagem. Ver `functions/src/agentActionValidation.ts` e
 * `docs/AI_AGENT_GUARDRAILS.md`.
 */
import { useCallback, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../shared/api/firebase/index';
import { parseActionProposal, type ActionProposal } from '../shared/schemas/agentSchemas';

export type AgentActionStatus = 'idle' | 'running' | 'success' | 'error';

export interface AgentActionContext {
  /** Intenção do agente (enum server: `simulate_purchase`, `create_budget_proposal`, …). */
  intent: string;
  /** Pergunta/resumo legível mostrado ao humano antes da confirmação (auditado). */
  question: string;
  /** Ferramentas read-only consultadas para montar a proposta (auditadas). */
  toolsUsed?: string[];
  /** Referência opcional ao snapshot que originou a proposta. */
  snapshotRef?: string;
  /** Resultado de simulação opcional (registrado em `/decisions`). */
  simulationResult?: Record<string, unknown>;
}

export interface AgentActionResult {
  /** ID do documento materializado (ex.: transação). */
  id: string;
  /** ID do registro no Diário de Decisões (`/decisions`), quando disponível. */
  decisionId: string | null;
}

export interface AgentActionError {
  /** Código do `HttpsError` (ex.: 'failed-precondition', 'invalid-argument'). */
  code: string;
  /** Mensagem curada do servidor (sem PII/stack). */
  message: string;
  /** Sinal estável e legível por máquina para a UI rotear (ex.: 'use_installment_form'). */
  reason?: string;
}

interface ExecuteResponse {
  id: string;
  decisionId?: string | null;
}

/** Lê `code`/`message`/`details.reason` de um erro de callable sem depender de tipos internos. */
function toAgentActionError(err: unknown): AgentActionError {
  const e = (err ?? {}) as { code?: unknown; message?: unknown; details?: unknown };
  const details = (e.details ?? null) as { reason?: unknown } | null;
  const reason = details && typeof details.reason === 'string' ? details.reason : undefined;
  return {
    code: typeof e.code === 'string' ? e.code : 'internal',
    message: typeof e.message === 'string' && e.message ? e.message : 'Não foi possível concluir a ação.',
    ...(reason ? { reason } : {}),
  };
}

/**
 * Hook de execução de ação confirmada do Agente. Retorna estado observável
 * (`status`/`error`/`result`), o disparador `runAction` e `reset`.
 */
export function useAgentAction() {
  const [status, setStatus] = useState<AgentActionStatus>('idle');
  const [error, setError]   = useState<AgentActionError | null>(null);
  const [result, setResult] = useState<AgentActionResult | null>(null);

  const reset = useCallback(() => {
    setStatus('idle');
    setError(null);
    setResult(null);
  }, []);

  const runAction = useCallback(
    async (proposal: ActionProposal, ctx: AgentActionContext): Promise<AgentActionResult> => {
      setStatus('running');
      setError(null);
      setResult(null);
      try {
        // Confirmação humana: a proposta é selada como `confirmed` no momento do clique.
        // `parseActionProposal` revalida o payload (Zod `.strict()`) antes de sair do cliente.
        const confirmed = parseActionProposal({ ...proposal, status: 'confirmed' });

        const envelope: Record<string, unknown> = {
          proposal:       confirmed,
          intent:         ctx.intent,
          question:       ctx.question,
          toolsUsed:      ctx.toolsUsed ?? [],
          idempotencyKey: crypto.randomUUID(),
        };
        if (ctx.snapshotRef !== undefined)      envelope['snapshotRef']      = ctx.snapshotRef;
        if (ctx.simulationResult !== undefined) envelope['simulationResult'] = ctx.simulationResult;

        const call = httpsCallable<Record<string, unknown>, ExecuteResponse>(functions, 'executeAgentAction');
        const res  = await call(envelope);
        const out: AgentActionResult = { id: res.data.id, decisionId: res.data.decisionId ?? null };

        setResult(out);
        setStatus('success');
        return out;
      } catch (err) {
        const agentErr = toAgentActionError(err);
        setError(agentErr);
        setStatus('error');
        throw agentErr;
      }
    },
    [],
  );

  return { status, error, result, runAction, reset };
}
