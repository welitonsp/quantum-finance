import { describe, it, expect, vi, beforeEach } from 'vitest';

let rpcResult: { data: unknown; error: unknown } = { data: null, error: null };
const rpc = vi.fn((..._args: unknown[]) => Promise.resolve(rpcResult));
vi.mock('../../shared/api/supabase/client', () => ({ getSupabase: () => ({ rpc }) }));
vi.mock('../../shared/lib/firebaseErrorHandling', () => ({ logSanitizedFirebaseError: vi.fn() }));

import { executeAgentActionSupabase, AgentRpcError } from './agentActionSupabase';

const envelope = { proposal: { kind: 'register_purchase', status: 'confirmed', payload: {} }, intent: 'simulate_purchase' };

beforeEach(() => { rpc.mockClear(); rpcResult = { data: null, error: null }; });

describe('executeAgentActionSupabase', () => {
  it('envia o envelope inteiro à função e devolve id e decisão', async () => {
    rpcResult = { data: { id: 'tx1', decisionId: 'd1' }, error: null };
    await expect(executeAgentActionSupabase(envelope)).resolves.toEqual({ id: 'tx1', decisionId: 'd1' });
    expect(rpc).toHaveBeenCalledWith('execute_agent_action', { p_request: envelope });
  });

  it('QF412 vira failed-precondition com o motivo estável', async () => {
    rpcResult = { data: null, error: { code: 'QF412', message: 'Use o formulário.', details: 'use_installment_form' } };
    const err = await executeAgentActionSupabase(envelope).catch((e: unknown) => e) as AgentRpcError;
    expect(err.code).toBe('failed-precondition');
    expect(err.details).toEqual({ reason: 'use_installment_form' });
    expect(err.message).toBe('Use o formulário.');
  });

  it('validação e não encontrado mantêm a mensagem do servidor', async () => {
    rpcResult = { data: null, error: { code: '22023', message: 'date deve ser uma data válida (YYYY-MM-DD).' } };
    await expect(executeAgentActionSupabase(envelope)).rejects.toMatchObject({ code: 'invalid-argument' });
    rpcResult = { data: null, error: { code: 'P0002', message: 'Meta não encontrada.' } };
    await expect(executeAgentActionSupabase(envelope)).rejects.toMatchObject({ code: 'not-found', message: 'Meta não encontrada.' });
  });

  it('erro inesperado não vaza mensagem do banco', async () => {
    rpcResult = { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "x"' } };
    const err = await executeAgentActionSupabase(envelope).catch((e: unknown) => e) as AgentRpcError;
    expect(err.code).toBe('internal');
    expect(err.message).toBe('Não foi possível concluir a ação.');
    expect(err.details).toBeUndefined();
  });

  it('resposta sem id é erro', async () => {
    rpcResult = { data: {}, error: null };
    await expect(executeAgentActionSupabase(envelope)).rejects.toMatchObject({ code: 'internal' });
  });
});
