import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { httpsCallable } from 'firebase/functions';
import { useAgentAction } from './useAgentAction';
import type { ActionProposal } from '../shared/schemas/agentSchemas';

vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));
vi.mock('../shared/api/firebase/index', () => ({ functions: {} }));

const callMock = vi.fn();
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function pendingPurchase(): ActionProposal {
  return {
    kind: 'register_purchase',
    status: 'pending',
    payload: { description: 'Notebook', amountCents: 400000, date: '2026-06-23' },
  } as ActionProposal;
}

beforeEach(() => {
  vi.clearAllMocks();
  (httpsCallable as unknown as ReturnType<typeof vi.fn>).mockReturnValue(callMock);
});

describe('useAgentAction', () => {
  it('envia proposta SELADA como confirmed + idempotencyKey UUID v4 e retorna id/decisionId', async () => {
    callMock.mockResolvedValue({ data: { id: 'tx-1', decisionId: 'dec-1' } });
    const { result } = renderHook(() => useAgentAction());

    let out: { id: string; decisionId: string | null } | undefined;
    await act(async () => {
      out = await result.current.runAction(pendingPurchase(), {
        intent: 'simulate_purchase',
        question: 'Registrar a compra do notebook à vista?',
        toolsUsed: ['purchaseSimulator'],
        simulationResult: { effectiveLimitAfterCents: 120000 },
      });
    });

    expect(out).toEqual({ id: 'tx-1', decisionId: 'dec-1' });
    expect(result.current.status).toBe('success');

    const envelope = callMock.mock.calls[0]![0] as {
      proposal: { status: string };
      intent: string;
      toolsUsed: string[];
      simulationResult: unknown;
      idempotencyKey: string;
    };
    expect(envelope.proposal.status).toBe('confirmed');
    expect(envelope.intent).toBe('simulate_purchase');
    expect(envelope.toolsUsed).toEqual(['purchaseSimulator']);
    expect(envelope.simulationResult).toEqual({ effectiveLimitAfterCents: 120000 });
    expect(envelope.idempotencyKey).toMatch(UUID_V4);
  });

  it('normaliza decisionId ausente para null', async () => {
    callMock.mockResolvedValue({ data: { id: 'tx-2' } });
    const { result } = renderHook(() => useAgentAction());
    await act(async () => {
      await result.current.runAction(pendingPurchase(), { intent: 'simulate_purchase', question: 'q' });
    });
    expect(result.current.result).toEqual({ id: 'tx-2', decisionId: null });
  });

  it('mapeia erro estruturado do servidor preservando reason (use_installment_form)', async () => {
    callMock.mockRejectedValue({
      code: 'failed-precondition',
      message: 'O assistente registra apenas compras à vista. Para parcelar, use o formulário de compra.',
      details: { reason: 'use_installment_form' },
    });
    const { result } = renderHook(() => useAgentAction());

    await act(async () => {
      await expect(
        result.current.runAction(pendingPurchase(), { intent: 'simulate_purchase', question: 'q' }),
      ).rejects.toMatchObject({ code: 'failed-precondition', reason: 'use_installment_form' });
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error?.reason).toBe('use_installment_form');
  });

  it('rejeita payload inválido no cliente antes de chamar o servidor (Zod strict)', async () => {
    const { result } = renderHook(() => useAgentAction());
    const bad = {
      kind: 'register_purchase',
      status: 'pending',
      payload: { description: 'X', amountCents: -5, date: '2026-06-23' },
    } as ActionProposal;

    await act(async () => {
      await expect(
        result.current.runAction(bad, { intent: 'simulate_purchase', question: 'q' }),
      ).rejects.toBeTruthy();
    });

    expect(callMock).not.toHaveBeenCalled();
    expect(result.current.status).toBe('error');
  });

  it('reset volta ao estado idle', async () => {
    callMock.mockResolvedValue({ data: { id: 'tx-3', decisionId: null } });
    const { result } = renderHook(() => useAgentAction());
    await act(async () => {
      await result.current.runAction(pendingPurchase(), { intent: 'simulate_purchase', question: 'q' });
    });
    act(() => result.current.reset());
    expect(result.current.status).toBe('idle');
    expect(result.current.result).toBeNull();
    expect(result.current.error).toBeNull();
  });
});
