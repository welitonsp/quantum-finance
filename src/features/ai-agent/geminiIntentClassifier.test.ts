import { describe, it, expect, vi } from 'vitest';
import {
  parseClassification,
  createGeminiIntentClassifier,
} from './geminiIntentClassifier';
import { routeIntent } from './intentRouter';

describe('parseClassification', () => {
  it('converte amount em REAIS para centavos canônicos (toCentavos)', () => {
    const c = parseClassification('{"intent":"simulate_purchase","confidence":0.9,"slots":{"description":"Notebook","amount":4000}}');
    expect(c.intent).toBe('simulate_purchase');
    expect(c.confidence).toBe(0.9);
    expect(c.slots['amountCents']).toBe(400000); // R$4000 → 400000 centavos
    expect(c.slots['description']).toBe('Notebook');
  });

  it('tolera cercas de código markdown', () => {
    const c = parseClassification('```json\n{"intent":"get_balances","confidence":0.8,"slots":{}}\n```');
    expect(c.intent).toBe('get_balances');
    expect(c.confidence).toBe(0.8);
  });

  it('limita confidence a 0..1', () => {
    expect(parseClassification('{"intent":"get_balances","confidence":5,"slots":{}}').confidence).toBe(1);
    expect(parseClassification('{"intent":"get_balances","confidence":-2,"slots":{}}').confidence).toBe(0);
  });

  it('mapeia limit (reais) → limitCents para orçamento', () => {
    const c = parseClassification('{"intent":"create_budget_proposal","confidence":0.7,"slots":{"category":"Lazer","limit":800}}');
    expect(c.slots['limitCents']).toBe(80000);
    expect(c.slots['category']).toBe('Lazer');
  });

  it('intenção fora do enum → fallback seguro (confidence 0)', () => {
    const c = parseClassification('{"intent":"wire_transfer","confidence":0.99,"slots":{}}');
    expect(c).toEqual({ intent: 'get_balances', slots: {}, confidence: 0 });
  });

  it('resposta sem JSON → fallback seguro', () => {
    expect(parseClassification('desculpe, não entendi').confidence).toBe(0);
  });

  it('descarta slot monetário inválido sem quebrar', () => {
    const c = parseClassification('{"intent":"simulate_purchase","confidence":0.9,"slots":{"description":"X","amount":"abc"}}');
    expect(c.slots['amountCents']).toBeUndefined();
  });
});

describe('createGeminiIntentClassifier', () => {
  it('usa o transporte injetado e devolve classificação', async () => {
    const transport = vi.fn().mockResolvedValue('{"intent":"simulate_purchase","confidence":0.9,"slots":{"description":"TV","amount":3000}}');
    const classify = createGeminiIntentClassifier(transport);
    const c = await classify({ message: 'posso comprar uma TV de 3 mil?' });
    expect(transport).toHaveBeenCalledOnce();
    expect(c.intent).toBe('simulate_purchase');
    expect(c.slots['amountCents']).toBe(300000);
  });

  it('transporte que lança → fallback seguro', async () => {
    const classify = createGeminiIntentClassifier(() => Promise.reject(new Error('rede')));
    const c = await classify({ message: 'x' });
    expect(c.confidence).toBe(0);
  });

  it('integra com routeIntent: compra com slots completos → proposal', async () => {
    const transport = () => Promise.resolve('{"intent":"simulate_purchase","confidence":0.95,"slots":{"description":"Notebook","amount":4000}}');
    const classify = createGeminiIntentClassifier(transport);
    const result = routeIntent(await classify({ message: 'comprar notebook 4000' }));
    expect(result.type).toBe('proposal');
    if (result.type === 'proposal' && result.proposal.kind === 'register_purchase') {
      expect(result.proposal.payload.amountCents).toBe(400000);
    }
  });

  it('integra com routeIntent: baixa confiança → low_confidence', async () => {
    const transport = () => Promise.resolve('{"intent":"simulate_purchase","confidence":0.3,"slots":{}}');
    const classify = createGeminiIntentClassifier(transport);
    expect(routeIntent(await classify({ message: 'talvez' })).type).toBe('low_confidence');
  });
});
