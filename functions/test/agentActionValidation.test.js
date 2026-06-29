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

  it('REJEITA proposta não confirmada com failed-precondition + reason confirmation_required', () => {
    const env = validEnvelope();
    env.proposal.status = 'pending';
    assert.throws(
      () => validateAgentActionRequest(env),
      (err) =>
        err instanceof AgentActionValidationError &&
        err.code === 'failed-precondition' &&
        err.reason === 'confirmation_required',
    );
  });

  it('REJEITA status arbitrário (não confirmado)', () => {
    const env = validEnvelope();
    env.proposal.status = 'auto-approved';
    assert.throws(
      () => validateAgentActionRequest(env),
      (err) =>
        err instanceof AgentActionValidationError &&
        err.code === 'failed-precondition' &&
        err.reason === 'confirmation_required',
    );
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

  it('valida register_income confirmado (type entrada no executor) e default de category', () => {
    const env = validEnvelope({
      intent: 'register_income_proposal',
      proposal: {
        kind: 'register_income', status: 'confirmed',
        payload: { description: 'Salário', amountCents: 500000, date: '2026-06-19' },
      },
    });
    const r = validateAgentActionRequest(env);
    assert.strictEqual(r.kind, 'register_income');
    assert.strictEqual(r.payload.amountCents, 500000);
    assert.strictEqual(r.payload.category, 'Outros'); // default
    assert.strictEqual(r.intent, 'register_income_proposal');
  });

  it('REJEITA register_income não confirmado (gate de confirmação humana)', () => {
    const env = validEnvelope({
      intent: 'register_income_proposal',
      proposal: {
        kind: 'register_income', status: 'pending',
        payload: { description: 'Salário', amountCents: 500000, date: '2026-06-19' },
      },
    });
    assert.throws(
      () => validateAgentActionRequest(env),
      (err) => err instanceof AgentActionValidationError && err.reason === 'confirmation_required',
    );
  });

  it('REJEITA campo extra no payload de register_income (strict)', () => {
    const env = validEnvelope({
      intent: 'register_income_proposal',
      proposal: {
        kind: 'register_income', status: 'confirmed',
        payload: { description: 'Salário', amountCents: 500000, date: '2026-06-19', installments: 2 },
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

  it('aceita installments=1 (à vista) e snapshotRef/simulationResult opcionais', () => {
    const env = validEnvelope({ snapshotRef: 'snap-1', simulationResult: { effectiveLimitAfterCents: 120000 } });
    env.proposal.payload.installments = 1;
    const r = validateAgentActionRequest(env);
    assert.strictEqual(r.payload.installments, 1);
    assert.strictEqual(r.snapshotRef, 'snap-1');
    assert.deepStrictEqual(r.simulationResult, { effectiveLimitAfterCents: 120000 });
  });

  it('REJEITA compra parcelada (installments>1) com erro estruturado p/ rotear ao formulário', () => {
    const env = validEnvelope();
    env.proposal.payload.installments = 10;
    assert.throws(
      () => validateAgentActionRequest(env),
      (err) =>
        err instanceof AgentActionValidationError &&
        err.code === 'failed-precondition' &&
        err.reason === 'use_installment_form',
    );
  });

  it('rejeita installments fora de 1..120', () => {
    const env = validEnvelope();
    env.proposal.payload.installments = 0;
    assert.throws(() => validateAgentActionRequest(env), AgentActionValidationError);
  });

  it('valida register_transfer confirmado e normaliza (description opcional)', () => {
    const env = validEnvelope({
      intent: 'register_transfer_proposal',
      proposal: {
        kind: 'register_transfer', status: 'confirmed',
        payload: { fromAccountId: 'acc-a', toAccountId: 'acc-b', amountCents: 50000, date: '2026-06-29' },
      },
    });
    const r = validateAgentActionRequest(env);
    assert.strictEqual(r.kind, 'register_transfer');
    assert.strictEqual(r.payload.fromAccountId, 'acc-a');
    assert.strictEqual(r.payload.toAccountId, 'acc-b');
    assert.strictEqual(r.payload.amountCents, 50000);
    assert.strictEqual(r.payload.description, undefined);
    assert.strictEqual(r.intent, 'register_transfer_proposal');
  });

  it('register_transfer: preserva description quando presente', () => {
    const env = validEnvelope({
      intent: 'register_transfer_proposal',
      proposal: {
        kind: 'register_transfer', status: 'confirmed',
        payload: { fromAccountId: 'acc-a', toAccountId: 'acc-b', amountCents: 50000, date: '2026-06-29', description: 'Reserva' },
      },
    });
    assert.strictEqual(validateAgentActionRequest(env).payload.description, 'Reserva');
  });

  it('REJEITA register_transfer com origem igual ao destino', () => {
    const env = validEnvelope({
      intent: 'register_transfer_proposal',
      proposal: {
        kind: 'register_transfer', status: 'confirmed',
        payload: { fromAccountId: 'acc-a', toAccountId: 'acc-a', amountCents: 50000, date: '2026-06-29' },
      },
    });
    assert.throws(() => validateAgentActionRequest(env), AgentActionValidationError);
  });

  it('REJEITA register_transfer não confirmado (gate de confirmação humana)', () => {
    const env = validEnvelope({
      intent: 'register_transfer_proposal',
      proposal: {
        kind: 'register_transfer', status: 'pending',
        payload: { fromAccountId: 'acc-a', toAccountId: 'acc-b', amountCents: 50000, date: '2026-06-29' },
      },
    });
    assert.throws(
      () => validateAgentActionRequest(env),
      (err) => err instanceof AgentActionValidationError && err.reason === 'confirmation_required',
    );
  });

  it('REJEITA campo extra no payload de register_transfer (strict)', () => {
    const env = validEnvelope({
      intent: 'register_transfer_proposal',
      proposal: {
        kind: 'register_transfer', status: 'confirmed',
        payload: { fromAccountId: 'acc-a', toAccountId: 'acc-b', amountCents: 50000, date: '2026-06-29', cardId: 'x' },
      },
    });
    assert.throws(() => validateAgentActionRequest(env), AgentActionValidationError);
  });

  it('REJEITA register_transfer com amountCents inválido', () => {
    const env = validEnvelope({
      intent: 'register_transfer_proposal',
      proposal: {
        kind: 'register_transfer', status: 'confirmed',
        payload: { fromAccountId: 'acc-a', toAccountId: 'acc-b', amountCents: 0, date: '2026-06-29' },
      },
    });
    assert.throws(() => validateAgentActionRequest(env), AgentActionValidationError);
  });

  it('expõe os kinds suportados (inclui register_income e register_transfer)', () => {
    assert.deepStrictEqual(
      [...AGENT_ACTION_KINDS],
      ['register_purchase', 'register_debt_payment', 'create_budget', 'contribute_to_goal', 'register_income', 'register_transfer'],
    );
  });
});
