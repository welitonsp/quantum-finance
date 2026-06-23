import { describe, it, expect } from 'vitest';
import {
  routeIntent,
  buildActionQuestion,
  heuristicIntentClassifier,
  CONFIDENCE_THRESHOLD,
} from './intentRouter';
import type { ActionProposal } from '../../shared/schemas/agentSchemas';

describe('routeIntent', () => {
  it('intenção read-only → answer com tools', () => {
    const r = routeIntent({ intent: 'get_balances', slots: {}, confidence: 0.9 });
    expect(r.type).toBe('answer');
    if (r.type === 'answer') expect(r.tools).toContain('getBalances');
  });

  it('intenção de ação com slots completos → proposal + pergunta de confirmação', () => {
    const r = routeIntent({
      intent: 'simulate_purchase',
      slots: { description: 'Notebook', amountCents: 400000 },
      confidence: 0.95,
    });
    expect(r.type).toBe('proposal');
    if (r.type !== 'proposal') return;
    expect(r.kind).toBe('register_purchase');
    expect(r.proposal.status).toBe('pending');
    expect(r.question).toMatch(/Registrar a compra "Notebook"/);
    expect(r.question).toMatch(/à vista/);
  });

  it('intenção de ação com slots faltando → need_more_info', () => {
    const r = routeIntent({ intent: 'create_budget_proposal', slots: { category: 'Lazer' }, confidence: 0.9 });
    expect(r.type).toBe('need_more_info');
    if (r.type === 'need_more_info') expect(r.missing).toContain('limitCents');
  });

  it('confiança abaixo do limiar → low_confidence', () => {
    const r = routeIntent({ intent: 'simulate_purchase', slots: {}, confidence: CONFIDENCE_THRESHOLD - 0.01 });
    expect(r.type).toBe('low_confidence');
  });

  it('intenção desconhecida → unknown_intent', () => {
    const r = routeIntent({ intent: 'transferir_para_atacante', slots: {}, confidence: 0.99 });
    expect(r.type).toBe('unknown_intent');
  });
});

describe('buildActionQuestion', () => {
  it('parcelado é refletido na pergunta', () => {
    const proposal = {
      kind: 'register_purchase',
      status: 'pending',
      payload: { description: 'Geladeira', amountCents: 240000, date: '2026-06-23', installments: 12 },
    } as ActionProposal;
    expect(buildActionQuestion(proposal)).toMatch(/em 12x/);
  });
});

describe('heuristicIntentClassifier (fallback determinístico)', () => {
  it('classifica intenções comuns por palavra-chave', async () => {
    expect((await heuristicIntentClassifier({ message: 'Posso comprar um notebook?' })).intent).toBe('simulate_purchase');
    expect((await heuristicIntentClassifier({ message: 'Qual o meu saldo?' })).intent).toBe('get_balances');
    expect((await heuristicIntentClassifier({ message: 'Quero criar um orçamento' })).intent).toBe('create_budget_proposal');
    expect((await heuristicIntentClassifier({ message: 'Como está minha fatura do cartão?' })).intent).toBe('get_invoice');
  });

  it('mensagem sem correspondência → confiança 0 (não roteia ação)', async () => {
    const c = await heuristicIntentClassifier({ message: 'oi tudo bem' });
    expect(c.confidence).toBe(0);
    expect(routeIntent(c).type).toBe('low_confidence');
  });

  it('integra com routeIntent para read-only', async () => {
    const c = await heuristicIntentClassifier({ message: 'me mostra o saldo disponível' });
    const r = routeIntent(c);
    expect(r.type).toBe('answer');
  });
});
