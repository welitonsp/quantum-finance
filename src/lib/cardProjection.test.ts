import { describe, it, expect } from 'vitest';
import { projectCardInvoices, invoiceCompetenciaForDate } from './cardProjection';
import type { Centavos } from '../shared/types/money';
import type { Transaction } from '../shared/types/transaction';

const cents = (v: number) => v as Centavos;

interface ChargeSpec {
  id: string;
  date: string;
  value_cents: number;
  cardId?: string;
  isDeleted?: boolean;
  installmentGroupId?: string;
  installmentIndex?: number;
  installmentCount?: number;
}

function charge(spec: ChargeSpec): Transaction {
  const { value_cents, ...rest } = spec;
  return {
    cardId: 'card-1',
    type:   'saida',
    category: 'Outros',
    source: 'manual',
    ...rest,
    value_cents: cents(value_cents),
  } as Transaction;
}

// ─── invoiceCompetenciaForDate ────────────────────────────────────────────────
describe('invoiceCompetenciaForDate', () => {
  it('dia < closingDay → janela aberta no mês anterior', () => {
    expect(invoiceCompetenciaForDate('2025-03-05', 10)).toBe('2025-02');
  });

  it('dia == closingDay → janela do mês corrente (fechamento ainda integra)', () => {
    expect(invoiceCompetenciaForDate('2025-03-10', 10)).toBe('2025-03');
  });

  it('dia > closingDay → janela do mês corrente', () => {
    expect(invoiceCompetenciaForDate('2025-03-15', 10)).toBe('2025-03');
  });

  it('virada de ano: janeiro antes do fechamento → dezembro anterior', () => {
    expect(invoiceCompetenciaForDate('2025-01-05', 10)).toBe('2024-12');
  });
});

// ─── projectCardInvoices — R$ 100,00 em 3x ────────────────────────────────────
describe('projectCardInvoices — compra R$ 100,00 em 3x', () => {
  // 10000 centavos / 3 → 3333, 3333, 3334 (resto na última), como o installmentRepo.
  const installments: Transaction[] = [
    charge({ id: 'i1', date: '2025-03-15', value_cents: 3333, installmentGroupId: 'g', installmentIndex: 1, installmentCount: 3 }),
    charge({ id: 'i2', date: '2025-04-15', value_cents: 3333, installmentGroupId: 'g', installmentIndex: 2, installmentCount: 3 }),
    charge({ id: 'i3', date: '2025-05-15', value_cents: 3334, installmentGroupId: 'g', installmentIndex: 3, installmentCount: 3 }),
  ];

  it('distribui parcelas em fatura atual + 2 futuras e calcula limite efetivo', () => {
    const result = projectCardInvoices({
      cardId:          'card-1',
      closingDay:      10,
      limitCents:      cents(500000), // R$ 5.000
      transactions:    installments,
      referenceDateISO:'2025-03-20',
    });

    expect(result.currentCompetencia).toBe('2025-03');
    expect(result.currentInvoiceCents).toBe(3333);

    expect(result.futureInvoices).toHaveLength(2);
    expect(result.futureInvoices.map(f => f.competencia)).toEqual(['2025-04', '2025-05']);
    expect(result.futureInvoices.map(f => f.netCents)).toEqual([3333, 3334]);

    expect(result.committedFutureCents).toBe(6667);
    expect(result.openTotalCents).toBe(10000);
    // Limite efetivo desconta TODAS as parcelas, não só a fatura atual.
    expect(result.effectiveAvailableCents).toBe(490000);
  });

  it('nenhum centavo se perde na soma das faturas', () => {
    const result = projectCardInvoices({
      cardId: 'card-1', closingDay: 10, limitCents: cents(500000),
      transactions: installments, referenceDateISO: '2025-03-20',
    });
    const soma = result.currentInvoiceCents + result.committedFutureCents;
    expect(soma).toBe(10000);
  });
});

// ─── projectCardInvoices — compra próxima ao fechamento ───────────────────────
describe('projectCardInvoices — compra próxima ao fechamento', () => {
  it('compra após o fechamento cai na fatura seguinte, não na atual', () => {
    // Hoje 05/03 (antes do fechamento 10) → fatura atual = 2025-02.
    // Compra 15/03 (após fechamento) → fatura 2025-03 (futura).
    const result = projectCardInvoices({
      cardId: 'card-1', closingDay: 10, limitCents: cents(500000),
      transactions: [charge({ id: 'c1', date: '2025-03-15', value_cents: 20000 })],
      referenceDateISO: '2025-03-05',
    });

    expect(result.currentCompetencia).toBe('2025-02');
    expect(result.currentInvoiceCents).toBe(0);
    expect(result.futureInvoices).toEqual([
      expect.objectContaining({ competencia: '2025-03', netCents: 20000 }),
    ]);
    expect(result.committedFutureCents).toBe(20000);
  });

  it('compra no dia exato do fechamento integra a fatura corrente daquele mês', () => {
    const result = projectCardInvoices({
      cardId: 'card-1', closingDay: 10, limitCents: cents(500000),
      transactions: [charge({ id: 'c1', date: '2025-03-10', value_cents: 20000 })],
      referenceDateISO: '2025-03-25',
    });
    expect(result.currentCompetencia).toBe('2025-03');
    expect(result.currentInvoiceCents).toBe(20000);
    expect(result.futureInvoices).toHaveLength(0);
  });
});

// ─── projectCardInvoices — pagamentos e cancelamentos ─────────────────────────
describe('projectCardInvoices — abatimentos', () => {
  it('pagamento de fatura futura reduz o comprometimento daquele mês', () => {
    const txs: Transaction[] = [
      charge({ id: 'i1', date: '2025-03-15', value_cents: 10000 }),
      charge({ id: 'i2', date: '2025-04-15', value_cents: 10000 }),
      // pagamento atribuído à competência futura 2025-04
      { id: 'pay', cardId: 'card-1', type: 'saida', value_cents: cents(4000), date: '2025-03-21', paidInvoiceMonth: '2025-04', source: 'manual', category: 'Outros' } as Transaction,
    ];
    const result = projectCardInvoices({
      cardId: 'card-1', closingDay: 10, limitCents: cents(500000),
      transactions: txs, referenceDateISO: '2025-03-20',
    });
    expect(result.currentInvoiceCents).toBe(10000);
    expect(result.futureInvoices).toEqual([
      expect.objectContaining({ competencia: '2025-04', chargesCents: 10000, paymentsCents: 4000, netCents: 6000 }),
    ]);
    expect(result.committedFutureCents).toBe(6000);
  });

  it('parcela futura cancelada (soft-delete) não compromete o limite', () => {
    const txs: Transaction[] = [
      charge({ id: 'i1', date: '2025-03-15', value_cents: 10000 }),
      charge({ id: 'i2', date: '2025-04-15', value_cents: 10000, isDeleted: true }),
    ];
    const result = projectCardInvoices({
      cardId: 'card-1', closingDay: 10, limitCents: cents(500000),
      transactions: txs, referenceDateISO: '2025-03-20',
    });
    expect(result.committedFutureCents).toBe(0);
    expect(result.futureInvoices).toHaveLength(0);
    expect(result.effectiveAvailableCents).toBe(490000);
  });

  it('limite efetivo nunca fica negativo (compra acima do limite)', () => {
    const txs: Transaction[] = [
      charge({ id: 'i1', date: '2025-03-15', value_cents: 60000 }),
      charge({ id: 'i2', date: '2025-04-15', value_cents: 60000 }),
    ];
    const result = projectCardInvoices({
      cardId: 'card-1', closingDay: 10, limitCents: cents(100000),
      transactions: txs, referenceDateISO: '2025-03-20',
    });
    expect(result.openTotalCents).toBe(120000);
    expect(result.effectiveAvailableCents).toBe(0);
  });

  it('ignora transações de outros cartões', () => {
    const txs: Transaction[] = [
      charge({ id: 'i1', date: '2025-03-15', value_cents: 10000 }),
      charge({ id: 'other', cardId: 'card-2', date: '2025-03-15', value_cents: 99999 }),
    ];
    const result = projectCardInvoices({
      cardId: 'card-1', closingDay: 10, limitCents: cents(500000),
      transactions: txs, referenceDateISO: '2025-03-20',
    });
    expect(result.openTotalCents).toBe(10000);
  });
});
