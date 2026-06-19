import { describe, it, expect } from 'vitest';
import {
  parseActionProposal,
  safeParseActionProposal,
  ACTION_KINDS,
  PROPOSAL_STATUSES,
} from './agentSchemas';

describe('agentSchemas — ActionProposal', () => {
  const validPurchase = {
    kind: 'register_purchase',
    status: 'pending',
    payload: {
      description: 'Notebook',
      amountCents: 400000,
      date: '2026-06-19',
    },
  };

  it('aceita proposta de compra válida em pending', () => {
    const p = parseActionProposal(validPurchase);
    expect(p.kind).toBe('register_purchase');
    expect(p.status).toBe('pending');
  });

  it('aceita compra parcelada com cardId', () => {
    const p = parseActionProposal({
      ...validPurchase,
      payload: { ...validPurchase.payload, installments: 10, cardId: 'card-1' },
    });
    expect(p.kind).toBe('register_purchase');
  });

  it('rejeita amountCents não-inteiro (centavos)', () => {
    expect(safeParseActionProposal({
      ...validPurchase,
      payload: { ...validPurchase.payload, amountCents: 400000.5 },
    })).toBeNull();
  });

  it('rejeita amountCents negativo', () => {
    expect(safeParseActionProposal({
      ...validPurchase,
      payload: { ...validPurchase.payload, amountCents: -100 },
    })).toBeNull();
  });

  it('rejeita data em formato inválido', () => {
    expect(safeParseActionProposal({
      ...validPurchase,
      payload: { ...validPurchase.payload, date: '19/06/2026' },
    })).toBeNull();
  });

  it('rejeita campo extra (strict)', () => {
    expect(safeParseActionProposal({
      ...validPurchase,
      payload: { ...validPurchase.payload, hacked: true },
    })).toBeNull();
  });

  it('rejeita kind desconhecido', () => {
    expect(safeParseActionProposal({
      kind: 'wire_transfer_to_attacker',
      status: 'pending',
      payload: {},
    })).toBeNull();
  });

  it('rejeita status fora do enum', () => {
    expect(safeParseActionProposal({ ...validPurchase, status: 'auto-approved' })).toBeNull();
  });

  it('valida create_budget com competência YYYY-MM', () => {
    const p = parseActionProposal({
      kind: 'create_budget',
      status: 'pending',
      payload: { category: 'Alimentação', limitCents: 80000, competencia: '2026-06' },
    });
    expect(p.kind).toBe('create_budget');
  });

  it('rejeita competência em formato de data completa', () => {
    expect(safeParseActionProposal({
      kind: 'create_budget',
      status: 'pending',
      payload: { category: 'Alimentação', limitCents: 80000, competencia: '2026-06-01' },
    })).toBeNull();
  });

  it('valida contribute_to_goal e register_debt_payment', () => {
    expect(parseActionProposal({
      kind: 'contribute_to_goal',
      status: 'confirmed',
      payload: { goalId: 'g1', amountCents: 50000, date: '2026-06-19' },
    }).kind).toBe('contribute_to_goal');

    expect(parseActionProposal({
      kind: 'register_debt_payment',
      status: 'pending',
      payload: { debtId: 'd1', amountCents: 30000, date: '2026-06-19' },
    }).kind).toBe('register_debt_payment');
  });

  it('expõe os enums esperados', () => {
    expect(ACTION_KINDS).toContain('register_purchase');
    expect(PROPOSAL_STATUSES).toEqual(['pending', 'confirmed', 'rejected', 'expired']);
  });
});
