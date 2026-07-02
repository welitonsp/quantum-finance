import { describe, it, expect } from 'vitest';
import {
  buildRegisterPurchase,
  buildRegisterTransfer,
  buildRegisterDebtPayment,
  buildContributeToGoal,
  buildCreateBudget,
  buildProposal,
  today,
  currentCompetencia,
} from './proposalBuilders';

describe('proposalBuilders', () => {
  it('register_purchase: monta proposta pending com defaults (date/category)', () => {
    const r = buildRegisterPurchase({ description: 'Notebook', amountCents: 400000 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.proposal.kind).toBe('register_purchase');
    expect(r.proposal.status).toBe('pending');
    expect(r.proposal.payload).toMatchObject({ description: 'Notebook', amountCents: 400000, date: today() });
  });

  it('register_purchase: preserva installments e cardId', () => {
    const r = buildRegisterPurchase({ description: 'TV', amountCents: 300000, installments: 6, cardId: 'card-1', category: 'Eletrônicos' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.proposal.payload).toMatchObject({ installments: 6, cardId: 'card-1', category: 'Eletrônicos' });
  });

  it('register_purchase: reporta slots faltantes', () => {
    const r = buildRegisterPurchase({ description: '' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.issues).toEqual(expect.arrayContaining(['description', 'amountCents']));
  });

  it('register_purchase: rejeita amountCents não-inteiro/negativo', () => {
    expect(buildRegisterPurchase({ description: 'X', amountCents: -1 }).ok).toBe(false);
    expect(buildRegisterPurchase({ description: 'X', amountCents: 10.5 }).ok).toBe(false);
  });

  it('create_budget: default de competência = mês atual', () => {
    const r = buildCreateBudget({ category: 'Alimentação', limitCents: 80000 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.proposal.payload).toMatchObject({ category: 'Alimentação', limitCents: 80000, competencia: currentCompetencia() });
  });

  it('debt e goal: montam com date default e reportam faltantes', () => {
    expect(buildRegisterDebtPayment({ debtId: 'd1', amountCents: 5000 }).ok).toBe(true);
    expect(buildContributeToGoal({ goalId: 'g1', amountCents: 5000 }).ok).toBe(true);
    expect(buildRegisterDebtPayment({ amountCents: 5000 }).ok).toBe(false);
    expect(buildContributeToGoal({ goalId: 'g1' }).ok).toBe(false);
  });

  it('register_transfer: monta proposta pending com date default', () => {
    const r = buildRegisterTransfer({ fromAccountId: 'a', toAccountId: 'b', amountCents: 50000 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.proposal.kind).toBe('register_transfer');
    expect(r.proposal.status).toBe('pending');
    expect(r.proposal.payload).toMatchObject({ fromAccountId: 'a', toAccountId: 'b', amountCents: 50000, date: today() });
  });

  it('register_transfer: preserva description opcional', () => {
    const r = buildRegisterTransfer({ fromAccountId: 'a', toAccountId: 'b', amountCents: 50000, description: 'Reserva' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.proposal.payload).toMatchObject({ description: 'Reserva' });
  });

  it('register_transfer: reporta slots faltantes', () => {
    const r = buildRegisterTransfer({ fromAccountId: 'a' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.issues).toEqual(expect.arrayContaining(['toAccountId', 'amountCents']));
  });

  it('register_transfer: rejeita origem igual ao destino (schema refine)', () => {
    const r = buildRegisterTransfer({ fromAccountId: 'a', toAccountId: 'a', amountCents: 50000 });
    expect(r.ok).toBe(false);
  });

  it('buildProposal despacha pelo kind', () => {
    const r = buildProposal('contribute_to_goal', { goalId: 'g1', amountCents: 1000 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.proposal.kind).toBe('contribute_to_goal');
  });
});
