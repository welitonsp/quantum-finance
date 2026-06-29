import { describe, it, expect } from 'vitest';
import { interpretMutationCommand, parseConfirmationReply } from './mutationCommandGuard';
import type { AccountRef } from './accountResolution';

const NOW = new Date('2026-06-25T12:00:00Z');
const ACCOUNTS: AccountRef[] = [
  { id: 'acc-poup', name: 'Poupança' },
  { id: 'acc-corr', name: 'Conta Corrente' },
];

describe('interpretMutationCommand', () => {
  it('builds a PENDING expense proposal from an imperative command (never executes)', () => {
    const r = interpretMutationCommand('Registre uma despesa de 35 reais no mercado hoje.', NOW);
    expect(r.type).toBe('expense_proposal');
    if (r.type !== 'expense_proposal') return;
    expect(r.proposal.status).toBe('pending'); // crucial: never pre-confirmed
    if (r.proposal.kind !== 'register_purchase') throw new Error('expected register_purchase');
    expect(r.proposal.payload.amountCents).toBe(3500);
    expect(r.proposal.payload.description).toBe('Mercado');
    expect(r.proposal.payload.date).toBe('2026-06-25');
    // formatBRL usa espaco nao-quebravel (U+00A0); \s normaliza para comparar.
    expect(r.question.replace(/\s/g, ' ')).toBe(
      'Detectei uma despesa de R$ 35,00 em Mercado para hoje. Deseja confirmar o registro?',
    );
  });

  it('parses "R$" amounts with thousands/decimals', () => {
    const r = interpretMutationCommand('lance um gasto de R$ 1.234,56 em viagem', NOW);
    expect(r.type).toBe('expense_proposal');
    if (r.type !== 'expense_proposal') return;
    if (r.proposal.kind !== 'register_purchase') throw new Error('expected register_purchase');
    expect(r.proposal.payload.amountCents).toBe(123456);
    expect(r.proposal.payload.description).toBe('Viagem');
  });

  it('builds a PENDING income proposal from "registre uma receita ..." (never executes)', () => {
    const r = interpretMutationCommand('Registre uma receita de 1000 de salário hoje.', NOW);
    expect(r.type).toBe('income_proposal');
    if (r.type !== 'income_proposal') return;
    expect(r.proposal.status).toBe('pending'); // crucial: never pre-confirmed
    if (r.proposal.kind !== 'register_income') throw new Error('expected register_income');
    expect(r.proposal.payload.amountCents).toBe(100000); // "1000" reais → R$ 1.000,00
    expect(r.proposal.payload.description).toBe('Salário');
    expect(r.proposal.payload.date).toBe('2026-06-25');
    expect(r.question.replace(/\s/g, ' ')).toBe(
      'Detectei uma receita de R$ 1.000,00 de Salário para hoje. Deseja confirmar o registro?',
    );
  });

  it('builds an income proposal from a bare income verb ("recebi 500 de pix")', () => {
    const r = interpretMutationCommand('recebi 500 de pix', NOW);
    expect(r.type).toBe('income_proposal');
    if (r.type !== 'income_proposal') return;
    if (r.proposal.kind !== 'register_income') throw new Error('expected register_income');
    expect(r.proposal.payload.amountCents).toBe(50000); // "500" reais → R$ 500,00
    expect(r.proposal.payload.description).toBe('Pix');
  });

  it('builds an income proposal from "lança entrada de 250 de reembolso"', () => {
    const r = interpretMutationCommand('lança entrada de 250 de reembolso', NOW);
    expect(r.type).toBe('income_proposal');
    if (r.type !== 'income_proposal') return;
    if (r.proposal.kind !== 'register_income') throw new Error('expected register_income');
    expect(r.proposal.payload.amountCents).toBe(25000);
    expect(r.proposal.payload.description).toBe('Reembolso');
  });

  it('keeps expense precedence when both expense and income words appear', () => {
    // "paguei" (despesa) presente ⇒ não é receita, mesmo com "recebi"? Aqui usamos um caso
    // claro: comando de despesa não vira receita.
    const r = interpretMutationCommand('registre uma despesa de 35 reais de salário', NOW);
    expect(r.type).toBe('expense_proposal');
  });

  it('asks for details (income variant) when the income amount cannot be extracted', () => {
    const r = interpretMutationCommand('recebi um pix de salário', NOW);
    expect(r.type).toBe('needs_details');
  });

  it('asks for details when the amount cannot be extracted', () => {
    const r = interpretMutationCommand('registre uma despesa no mercado', NOW);
    expect(r.type).toBe('needs_details');
  });

  it('builds a PENDING transfer proposal resolving account names to IDs', () => {
    const r = interpretMutationCommand('transfere 500 da poupança para a corrente', NOW, ACCOUNTS);
    expect(r.type).toBe('transfer_proposal');
    if (r.type !== 'transfer_proposal') return;
    expect(r.proposal.status).toBe('pending'); // never pre-confirmed
    if (r.proposal.kind !== 'register_transfer') throw new Error('expected register_transfer');
    expect(r.proposal.payload.fromAccountId).toBe('acc-poup');
    expect(r.proposal.payload.toAccountId).toBe('acc-corr');
    expect(r.proposal.payload.amountCents).toBe(50000); // "500" → R$ 500,00
    expect(r.fromAccountName).toBe('Poupança');
    expect(r.toAccountName).toBe('Conta Corrente');
    expect(r.question.replace(/\s/g, ' ')).toBe(
      'Detectei uma transferência de R$ 500,00 de Poupança para Conta Corrente para hoje. Deseja confirmar?',
    );
  });

  it('transfer: parses "R$" amount and account in either order', () => {
    const r = interpretMutationCommand('transferir R$ 200 da conta corrente pra poupança', NOW, ACCOUNTS);
    expect(r.type).toBe('transfer_proposal');
    if (r.type !== 'transfer_proposal') return;
    if (r.proposal.kind !== 'register_transfer') throw new Error('expected register_transfer');
    expect(r.proposal.payload.fromAccountId).toBe('acc-corr');
    expect(r.proposal.payload.toAccountId).toBe('acc-poup');
    expect(r.proposal.payload.amountCents).toBe(20000);
  });

  it('transfer: needs_details when there are no accounts', () => {
    const r = interpretMutationCommand('transfere 500 da poupança para a corrente', NOW, []);
    expect(r.type).toBe('needs_details');
    if (r.type !== 'needs_details') return;
    expect(r.message).toMatch(/não tem contas/i);
  });

  it('transfer: needs_details when amount is missing', () => {
    const r = interpretMutationCommand('transfere da poupança para a corrente', NOW, ACCOUNTS);
    expect(r.type).toBe('needs_details');
  });

  it('transfer: needs_details when an account cannot be resolved', () => {
    const r = interpretMutationCommand('transfere 500 da poupança para investimentos', NOW, ACCOUNTS);
    expect(r.type).toBe('needs_details');
    if (r.type !== 'needs_details') return;
    expect(r.message).toMatch(/conta de destino/i);
  });

  it('transfer: needs_details when origin equals destination', () => {
    const r = interpretMutationCommand('transfere 500 da poupança para poupança', NOW, ACCOUNTS);
    expect(r.type).toBe('needs_details');
    if (r.type !== 'needs_details') return;
    expect(r.message).toMatch(/mesma conta/i);
  });

  it('ignores non-mutation phrasing (handled by the LLM classifier)', () => {
    expect(interpretMutationCommand('posso comprar um notebook de 4000?', NOW).type).toBe('not_mutation');
    expect(interpretMutationCommand('qual o meu saldo?', NOW).type).toBe('not_mutation');
    expect(interpretMutationCommand('comprar um notebook de 4000', NOW).type).toBe('not_mutation');
  });

  it('resolves "ontem" to the previous day', () => {
    const r = interpretMutationCommand('registre uma despesa de 10 reais no café ontem', NOW);
    expect(r.type).toBe('expense_proposal');
    if (r.type !== 'expense_proposal') return;
    if (r.proposal.kind !== 'register_purchase') throw new Error('expected register_purchase');
    expect(r.proposal.payload.date).toBe('2026-06-24');
  });
});

describe('parseConfirmationReply', () => {
  it('recognizes confirmations', () => {
    for (const t of ['sim', 'confirmar', 'confirmo', 'pode registrar', 'ok', 'Confirmar!']) {
      expect(parseConfirmationReply(t)).toBe('confirm');
    }
  });

  it('recognizes cancellations', () => {
    for (const t of ['não', 'nao', 'cancelar', 'cancela', 'esquece']) {
      expect(parseConfirmationReply(t)).toBe('cancel');
    }
  });

  it('returns unclear for ambiguous replies', () => {
    for (const t of ['', 'talvez', 'e o saldo?', 'pode cancelar']) {
      expect(parseConfirmationReply(t)).toBe('unclear');
    }
  });
});
