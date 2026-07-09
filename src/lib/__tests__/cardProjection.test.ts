import { describe, it, expect } from 'vitest';
import { invoiceCompetenciaForDate, projectCardInvoices, type CardProjectionInput } from '../cardProjection';
import type { Transaction } from '../../shared/types/transaction';
import type { Centavos } from '../../shared/types/money';

const cents = (n: number): Centavos => n as Centavos;

function tx(overrides: Partial<Omit<Transaction, 'value_cents'>> & { value_cents: number }): Transaction {
  const { value_cents, ...rest } = overrides;
  return {
    id: 'tx-1',
    description: 'Compra',
    value_cents: cents(value_cents),
    schemaVersion: 2,
    type: 'saida',
    cardId: 'card-1',
    date: '2026-07-05',
    ...rest,
  } as Transaction;
}

function baseInput(overrides: Partial<CardProjectionInput> = {}): CardProjectionInput {
  return {
    cardId: 'card-1',
    closingDay: 10,
    limitCents: cents(500000),
    transactions: [],
    referenceDateISO: '2026-07-09',
    ...overrides,
  };
}

// ─── invoiceCompetenciaForDate ────────────────────────────────────────────────

describe('invoiceCompetenciaForDate', () => {
  it('dia ANTES do fechamento → pertence ao mês anterior (início da janela)', () => {
    // closingDay=10, dia=5 → pertence à janela que fecha em 10/jul → início: junho
    expect(invoiceCompetenciaForDate('2026-07-05', 10)).toBe('2026-06');
  });

  it('dia IGUAL ao fechamento → pertence ao mês corrente', () => {
    // closingDay=10, dia=10 → 10 >= 10 → label é julho (mês corrente)
    expect(invoiceCompetenciaForDate('2026-07-10', 10)).toBe('2026-07');
  });

  it('dia DEPOIS do fechamento → pertence ao mês corrente', () => {
    expect(invoiceCompetenciaForDate('2026-07-15', 10)).toBe('2026-07');
  });

  it('dia < closingDay em janeiro → wrap para dezembro do ano anterior', () => {
    // closingDay=15, dia=5 em jan 2026 → label: dez 2025
    expect(invoiceCompetenciaForDate('2026-01-05', 15)).toBe('2025-12');
  });

  it('closingDay=1 → dia 1 pertence ao mês corrente (d >= 1)', () => {
    expect(invoiceCompetenciaForDate('2026-07-01', 1)).toBe('2026-07');
  });
});

// ─── projectCardInvoices ──────────────────────────────────────────────────────

describe('projectCardInvoices', () => {
  it('retorna fatura atual = 0 e efetivo = limite quando não há transações', () => {
    const result = projectCardInvoices(baseInput());
    expect(result.currentInvoiceCents).toBe(0);
    expect(result.effectiveAvailableCents).toBe(500000);
    expect(result.futureInvoices).toHaveLength(0);
  });

  it('soma cobranças no mês corrente da fatura', () => {
    // closingDay=10, reference=jul/09 → currentCompetencia=2026-06 (dia 9 < 10)
    // cobranças com data jul/05 → comp 2026-06 (=atual)
    const input = baseInput({
      transactions: [
        tx({ value_cents: 10000, date: '2026-07-05' }),
        tx({ value_cents: 5000,  date: '2026-07-08' }),
      ],
    });
    const result = projectCardInvoices(input);
    expect(result.currentInvoiceCents).toBe(15000);
  });

  it('fatura futura aparece em futureInvoices quando netCents > 0', () => {
    // closingDay=10, reference=jul/09 → currentCompetencia=2026-06
    // data 2026-07-15 → comp 2026-07 > 2026-06 → fatura futura
    const input = baseInput({
      transactions: [
        tx({ value_cents: 20000, date: '2026-07-15' }),
      ],
    });
    const result = projectCardInvoices(input);
    expect(result.futureInvoices).toHaveLength(1);
    expect(result.futureInvoices[0]!.competencia).toBe('2026-07');
    expect(result.committedFutureCents).toBe(20000);
  });

  it('pagamento (paidInvoiceMonth) reduz o netCents da fatura correspondente', () => {
    const input = baseInput({
      transactions: [
        tx({ value_cents: 10000, date: '2026-07-05' }),
        tx({ value_cents: 10000, type: 'saida', date: '2026-07-09', paidInvoiceMonth: '2026-06' }),
      ],
    });
    const result = projectCardInvoices(input);
    // cobrança 10000 - pagamento 10000 = 0
    expect(result.currentInvoiceCents).toBe(0);
  });

  it('exclui transações de outro cartão (cardId diferente)', () => {
    const input = baseInput({
      transactions: [
        tx({ value_cents: 30000, cardId: 'outro-cartao', date: '2026-07-05' }),
      ],
    });
    const result = projectCardInvoices(input);
    expect(result.currentInvoiceCents).toBe(0);
  });

  it('exclui transações deletadas (isDeleted=true)', () => {
    const input = baseInput({
      transactions: [
        tx({ value_cents: 50000, date: '2026-07-05', isDeleted: true }),
      ],
    });
    const result = projectCardInvoices(input);
    expect(result.currentInvoiceCents).toBe(0);
  });

  it('exclui transações deletadas (deletedAt definido)', () => {
    const input = baseInput({
      transactions: [
        tx({ value_cents: 50000, date: '2026-07-05', deletedAt: '2026-07-06' }),
      ],
    });
    const result = projectCardInvoices(input);
    expect(result.currentInvoiceCents).toBe(0);
  });

  it('effectiveAvailableCents = 0 quando total em aberto >= limite', () => {
    const input = baseInput({
      limitCents: cents(10000),
      transactions: [
        tx({ value_cents: 15000, date: '2026-07-05' }),
      ],
    });
    const result = projectCardInvoices(input);
    expect(result.effectiveAvailableCents).toBe(0);
  });

  it('transação de entrada não é cobrança (isExpense=false)', () => {
    const input = baseInput({
      transactions: [
        tx({ value_cents: 5000, type: 'entrada', date: '2026-07-05' }),
      ],
    });
    const result = projectCardInvoices(input);
    expect(result.currentInvoiceCents).toBe(0);
  });

  it('usa createdAt quando date é undefined (branch txDateYMD)', () => {
    const input = baseInput({
      transactions: [
        tx({ value_cents: 8000, date: undefined as unknown as string, createdAt: '2026-07-05' as unknown as number }),
      ],
    });
    // não deve lançar
    expect(() => projectCardInvoices(input)).not.toThrow();
  });

  it('openTotalCents = currentInvoiceCents + committedFutureCents', () => {
    const input = baseInput({
      transactions: [
        tx({ value_cents: 10000, date: '2026-07-05' }),  // atual (comp 2026-06)
        tx({ value_cents: 5000,  date: '2026-07-15' }),  // futuro (comp 2026-07)
      ],
    });
    const result = projectCardInvoices(input);
    expect(result.openTotalCents).toBe(result.currentInvoiceCents + result.committedFutureCents);
    expect(result.effectiveAvailableCents).toBe(
      Math.max(0, 500000 - result.openTotalCents),
    );
  });
});
