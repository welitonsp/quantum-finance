const assert = require('node:assert');
const { describe, it } = require('node:test');
const {
  validateAgentActionRequest,
  AgentActionValidationError,
  AGENT_ACTION_KINDS,
} = require('../lib/agentActionValidation');

function validEnvelope(overrides = {}) {
  return {
    intent: 'simulate_purchase',
    question: 'Posso comprar um notebook?',
    toolsUsed: ['purchaseSimulator'],
    proposal: {
      kind: 'register_purchase',
      status: 'confirmed',
      payload: { description: 'Notebook', amountCents: 400000, date: '2026-06-19', category: 'Eletrônicos' },
    },
    ...overrides,
  };
}

describe('validateAgentActionRequest (FASE H)', () => {
  it('aceita register_purchase confirmado e normaliza', () => {
    const r = validateAgentActionRequest(validEnvelope());
    assert.strictEqual(r.kind, 'register_purchase');
    assert.strictEqual(r.payload.amountCents, 400000);
    assert.strictEqual(r.intent, 'simulate_purchase');
    assert.deepStrictEqual(r.toolsUsed, ['purchaseSimulator']);
  });

  it('default de category é "Outros" quando ausente', () => {
    const env = validEnvelope();
    delete env.proposal.payload.category;
    const r = validateAgentActionRequest(env);
    assert.strictEqual(r.payload.category, 'Outros');
  });

  it('REJEITA proposta não confirmada (gate de confirmação humana)', () => {
    const env = validEnvelope();
    env.proposal.status = 'pending';
    assert.throws(() => validateAgentActionRequest(env), AgentActionValidationError);
  });

  it('REJEITA status arbitrário', () => {
    const env = validEnvelope();
    env.proposal.status = 'auto-approved';
    assert.throws(() => validateAgentActionRequest(env), AgentActionValidationError);
  });

  it('rejeita amountCents não-inteiro', () => {
    const env = validEnvelope();
    env.proposal.payload.amountCents = 4000.5;
    assert.throws(() => validateAgentActionRequest(env), AgentActionValidationError);
  });

  it('rejeita amountCents negativo/zero', () => {
    const env = validEnvelope();
    env.proposal.payload.amountCents = 0;
    assert.throws(() => validateAgentActionRequest(env), AgentActionValidationError);
  });

  it('rejeita data inválida', () => {
    const env = validEnvelope();
    env.proposal.payload.date = '19/06/2026';
    assert.throws(() => validateAgentActionRequest(env), AgentActionValidationError);
  });

  it('rejeita kind desconhecido', () => {
    const env = validEnvelope();
    env.proposal.kind = 'wire_transfer';
    assert.throws(() => validateAgentActionRequest(env), AgentActionValidationError);
  });

  it('rejeita intent fora do enum', () => {
    const env = validEnvelope({ intent: 'hack' });
    assert.throws(() => validateAgentActionRequest(env), AgentActionValidationError);
  });

  it('rejeita campo extra no payload (strict)', () => {
    const env = validEnvelope();
    env.proposal.payload.hacked = true;
    assert.throws(() => validateAgentActionRequest(env), AgentActionValidationError);
  });

  it('rejeita campo extra no envelope (strict)', () => {
    const env = validEnvelope({ secret: 'x' });
    assert.throws(() => validateAgentActionRequest(env), AgentActionValidationError);
  });

  it('rejeita toolsUsed que não é array', () => {
    const env = validEnvelope({ toolsUsed: 'purchaseSimulator' });
    assert.throws(() => validateAgentActionRequest(env), AgentActionValidationError);
  });

  it('valida create_budget com competência YYYY-MM', () => {
    const env = validEnvelope({
      intent: 'create_budget_proposal',
      proposal: {
        kind: 'create_budget', status: 'confirmed',
        payload: { category: 'Alimentação', limitCents: 80000, competencia: '2026-06' },
      },
    });
    const r = validateAgentActionRequest(env);
    assert.strictEqual(r.kind, 'create_budget');
    assert.strictEqual(r.payload.competencia, '2026-06');
  });

  it('rejeita competência em formato de data completa', () => {
    const env = validEnvelope({
      intent: 'create_budget_proposal',
      proposal: {
        kind: 'create_budget', status: 'confirmed',
        payload: { category: 'Alimentação', limitCents: 80000, competencia: '2026-06-01' },
      },
    });
    assert.throws(() => validateAgentActionRequest(env), AgentActionValidationError);
  });

  it('valida contribute_to_goal e register_debt_payment', () => {
    const goal = validateAgentActionRequest(validEnvelope({
      intent: 'contribute_to_goal_proposal',
      proposal: { kind: 'contribute_to_goal', status: 'confirmed', payload: { goalId: 'g1', amountCents: 50000, date: '2026-06-19' } },
    }));
    assert.strictEqual(goal.kind, 'contribute_to_goal');

    const debt = validateAgentActionRequest(validEnvelope({
      intent: 'plan_debt_payment',
      proposal: { kind: 'register_debt_payment', status: 'confirmed', payload: { debtId: 'd1', amountCents: 30000, date: '2026-06-19' } },
    }));
    assert.strictEqual(debt.kind, 'register_debt_payment');
  });

  it('aceita installments válido e snapshotRef/simulationResult opcionais', () => {
    const env = validEnvelope({ snapshotRef: 'snap-1', simulationResult: { effectiveLimitAfterCents: 120000 } });
    env.proposal.payload.installments = 10;
    const r = validateAgentActionRequest(env);
    assert.strictEqual(r.payload.installments, 10);
    assert.strictEqual(r.snapshotRef, 'snap-1');
    assert.deepStrictEqual(r.simulationResult, { effectiveLimitAfterCents: 120000 });
  });

  it('expõe os 4 kinds v1', () => {
    assert.deepStrictEqual(
      [...AGENT_ACTION_KINDS],
      ['register_purchase', 'register_debt_payment', 'create_budget', 'contribute_to_goal'],
    );
  });
});
