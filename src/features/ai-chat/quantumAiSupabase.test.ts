import { describe, it, expect, vi, beforeEach } from 'vitest';

const invoke = vi.fn();
vi.mock('../../shared/api/supabase/client', () => ({
  getSupabase: () => ({ functions: { invoke } }),
}));

import { callQuantumAiSupabase, QuantumAiError } from './quantumAiSupabase';
import { getUserFriendlyErrorMessage } from '../../shared/lib/firebaseErrorHandling';

function httpError(status: number, body: unknown) {
  return { name: 'FunctionsHttpError', message: 'Edge Function returned a non-2xx status code', context: new Response(JSON.stringify(body), { status }) };
}

function rejected(p: Promise<unknown>): Promise<QuantumAiError> {
  return p.then(
    () => { throw new Error('esperava erro'); },
    (e: unknown) => e as QuantumAiError,
  );
}

describe('callQuantumAiSupabase', () => {
  beforeEach(() => invoke.mockReset());

  it('traduz o nome da callable para a operação e devolve o mesmo formato', async () => {
    invoke.mockResolvedValue({ data: { reply: 'ok' }, error: null });
    const out = await callQuantumAiSupabase('chatWithQuantumAI', { prompt: 'oi', financialContext: {} }, 60);
    expect(out).toEqual({ reply: 'ok' });
    expect(invoke).toHaveBeenCalledWith('quantum-ai', {
      body: { op: 'chat', prompt: 'oi', financialContext: {} },
      timeout: 60_000,
    });

    invoke.mockResolvedValue({ data: [{ id: 'a', category: 'Lazer' }], error: null });
    await callQuantumAiSupabase('categorizeTransactionsBatch', { transactions: [] }, 30);
    expect(invoke.mock.calls[1]?.[1]?.body.op).toBe('categorize');
    await callQuantumAiSupabase('generateAuditReport', { financialContext: {} }, 60);
    expect(invoke.mock.calls[2]?.[1]?.body.op).toBe('audit');
  });

  it('limite diário vira resource-exhausted com a mensagem amigável certa', async () => {
    invoke.mockResolvedValue({ data: null, error: httpError(429, { error: { code: 'resource-exhausted', message: 'Limite diário' } }) });
    const err = await rejected(callQuantumAiSupabase('chatWithQuantumAI', { prompt: 'oi' }, 60));
    expect(err).toBeInstanceOf(QuantumAiError);
    expect(err.code).toBe('resource-exhausted');
    expect(getUserFriendlyErrorMessage(err, 'callable_ai_chat')).toMatch(/limite de uso/);
  });

  it('consentimento ausente traz o motivo', async () => {
    invoke.mockResolvedValue({
      data: null,
      error: httpError(403, { error: { code: 'permission-denied', message: 'Consentimento', reason: 'ai_consent_required' } }),
    });
    const err = await rejected(callQuantumAiSupabase('generateAuditReport', {}, 60));
    expect(err.code).toBe('permission-denied');
    expect(err.reason).toBe('ai_consent_required');
  });

  it('erro de rede ou código desconhecido vira unavailable', async () => {
    invoke.mockResolvedValue({ data: null, error: { name: 'FunctionsFetchError', message: 'Failed to fetch', context: {} } });
    const err = await rejected(callQuantumAiSupabase('chatWithQuantumAI', {}, 60));
    expect(err.code).toBe('unavailable');

    invoke.mockResolvedValue({ data: null, error: httpError(500, { error: { code: 'hack', message: 'x' } }) });
    const err2 = await rejected(callQuantumAiSupabase('chatWithQuantumAI', {}, 60));
    expect(err2.code).toBe('unavailable');
  });
});
