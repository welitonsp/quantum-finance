/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest';
import type { Transaction } from '../shared/types/transaction';
import type { Centavos } from '../shared/types/money';
import {
  calculateRunningBalances,
  canonicalizeTransactionType,
  getTransactionOriginLabel,
  isExpense,
  isImportedTransaction,
  isIncome,
  isImportedUnreconciledTransaction,
  isReconciledTransaction,
  isTransfer,
} from './transactionUtils';

const cents = (value: number): Centavos => value as Centavos;

function tx(overrides: Partial<Transaction>): Transaction {
  return {
    id: 'tx-test',
    description: 'Movimentacao',
    value_cents: cents(0),
    schemaVersion: 2,
    type: 'saida',
    category: 'Outros',
    date: '2026-05-01',
    ...overrides,
  } as Transaction;
}

describe('transaction status helpers', () => {
  it('getTransactionOriginLabel identifica origens corretamente', () => {
    expect(getTransactionOriginLabel({ source: 'manual' })).toBe('Manual');
    expect(getTransactionOriginLabel({})).toBe('Manual');
    expect(getTransactionOriginLabel({ source: 'csv' })).toBe('CSV');
    expect(getTransactionOriginLabel({ source: 'ofx' })).toBe('OFX');
    expect(getTransactionOriginLabel({ source: 'pdf' })).toBe('PDF');
    expect(getTransactionOriginLabel({ source: 'unknown' as any })).toBe('UNKNOWN');
  });

  it('isImportedTransaction identifica transacoes nao manuais', () => {
    expect(isImportedTransaction({ source: 'manual' })).toBe(false);
    expect(isImportedTransaction({})).toBe(false);
    expect(isImportedTransaction({ source: 'csv' })).toBe(true);
    expect(isImportedTransaction({ source: 'ofx' })).toBe(true);
    expect(isImportedTransaction({ source: 'pdf' })).toBe(true);
    expect(isImportedTransaction({ source: 'unknown' as any })).toBe(false);
  });

  it('isReconciledTransaction identifica transacoes conciliadas', () => {
    expect(isReconciledTransaction({ reconciliationStatus: 'reconciled' })).toBe(true);
    expect(isReconciledTransaction({})).toBe(false);
    expect(isReconciledTransaction({ reconciliationStatus: 'pending' as any })).toBe(false);
  });

  it('isImportedUnreconciledTransaction identifica importadas pendentes de conciliacao', () => {
    expect(isImportedUnreconciledTransaction({})).toBe(false);
    expect(isImportedUnreconciledTransaction({ source: 'csv' })).toBe(true);
    expect(isImportedUnreconciledTransaction({ source: 'ofx' })).toBe(true);
    expect(isImportedUnreconciledTransaction({ source: 'pdf' })).toBe(true);
    expect(isImportedUnreconciledTransaction({ source: 'manual' })).toBe(false);
    expect(isImportedUnreconciledTransaction({ source: 'csv', reconciliationStatus: 'reconciled' })).toBe(false);
    expect(isImportedUnreconciledTransaction({ source: 'ofx', reconciliationStatus: 'reconciled' })).toBe(false);
    expect(isImportedUnreconciledTransaction({ source: 'pdf', reconciliationStatus: 'reconciled' })).toBe(false);
  });
});

describe('calculateRunningBalances', () => {
  it('retorna estrutura vazia para lista vazia', () => {
    expect(calculateRunningBalances([])).toEqual({});
  });

  it('calcula receita e despesa em ordem cronologica', () => {
    const balances = calculateRunningBalances([
      tx({ id: 'income', type: 'entrada', value_cents: cents(10000), date: '2026-05-01' }),
      tx({ id: 'expense', type: 'saida', value_cents: cents(3500), date: '2026-05-02' }),
    ]);

    expect(balances.income).toBe(10000);
    expect(balances.expense).toBe(6500);
  });

  it('nao depende da ordem recebida no array', () => {
    const balances = calculateRunningBalances([
      tx({ id: 'expense', type: 'saida', value_cents: cents(3500), date: '2026-05-02' }),
      tx({ id: 'income', type: 'entrada', value_cents: cents(10000), date: '2026-05-01' }),
    ]);

    expect(balances.income).toBe(10000);
    expect(balances.expense).toBe(6500);
  });

  it('usa createdAt asc e id como desempate deterministico para datas iguais', () => {
    const balances = calculateRunningBalances([
      tx({ id: 'c', type: 'entrada', value_cents: cents(8000), date: '2026-05-01', createdAt: 3 }),
      tx({ id: 'b', type: 'entrada', value_cents: cents(5000), date: '2026-05-01', createdAt: 2 }),
      tx({ id: 'a', type: 'saida', value_cents: cents(1000), date: '2026-05-01', createdAt: 2 }),
    ]);

    expect(balances.a).toBe(-1000);
    expect(balances.b).toBe(4000);
    expect(balances.c).toBe(12000);
  });

  it('reduz o acumulado em saidas', () => {
    const balances = calculateRunningBalances([
      tx({ id: 'income', type: 'entrada', value_cents: cents(10000), date: '2026-05-01' }),
      tx({ id: 'expense', type: 'saida', value_cents: cents(4000), date: '2026-05-02' }),
    ]);

    expect(balances.expense).toBe(6000);
  });

  it('ignora transacoes marcadas como deletadas', () => {
    const balances = calculateRunningBalances([
      tx({ id: 'deleted', type: 'entrada', value_cents: cents(10000), isDeleted: true }),
      tx({ id: 'expense', type: 'saida', value_cents: cents(4000), date: '2026-05-02' }),
    ]);

    expect(balances.deleted).toBeUndefined();
    expect(balances.expense).toBe(-4000);
  });

  it('nao muta o array original', () => {
    const transactions = [
      tx({ id: 'later', date: '2026-05-02', value_cents: cents(2000) }),
      tx({ id: 'older', date: '2026-05-01', value_cents: cents(1000) }),
    ];
    const before = transactions.map(item => item.id);

    calculateRunningBalances(transactions);

    expect(transactions.map(item => item.id)).toEqual(before);
  });

  it('usa apenas value_cents e nao deriva de value legado', () => {
    const legacyOnly = tx({ id: 'legacy-only', type: 'entrada', value: 999999, date: '2026-05-02' });
    delete legacyOnly.value_cents;

    const balances = calculateRunningBalances([
      tx({ id: 'canonical', type: 'entrada', value: 999999, value_cents: cents(100), date: '2026-05-01' }),
      legacyOnly,
    ]);

    expect(balances.canonical).toBe(100);
    expect(balances['legacy-only']).toBe(100);
  });

  // createdAtToMillis tiebreaker branches (linhas 76-90)
  // Duas transações com a mesma date → tiebreaker usa createdAt

  it('createdAt como string ISO é usado como tiebreaker (linha 76-77)', () => {
    const txs = [
      tx({ id: 'b', type: 'entrada', value_cents: cents(1000), date: '2026-05-01', createdAt: '2026-05-01T12:00:00Z' as any }),
      tx({ id: 'a', type: 'entrada', value_cents: cents(500),  date: '2026-05-01', createdAt: '2026-05-01T08:00:00Z' as any }),
    ];
    const balances = calculateRunningBalances(txs);
    // 'a' criado antes (8h) vem primeiro → balance 500, depois 'b' → 1500
    expect(balances['a']).toBe(500);
    expect(balances['b']).toBe(1500);
  });

  it('createdAt com objeto {toMillis} é usado como tiebreaker (linha 81-85)', () => {
    const txs = [
      tx({ id: 'late',  type: 'entrada', value_cents: cents(1000), date: '2026-05-01', createdAt: { toMillis: () => 2000 } as any }),
      tx({ id: 'early', type: 'entrada', value_cents: cents(500),  date: '2026-05-01', createdAt: { toMillis: () => 1000 } as any }),
    ];
    const balances = calculateRunningBalances(txs);
    expect(balances['early']).toBe(500);
    expect(balances['late']).toBe(1500);
  });

  it('createdAt com objeto {seconds, nanoseconds} é usado como tiebreaker (linha 86-90)', () => {
    const txs = [
      tx({ id: 'b', type: 'entrada', value_cents: cents(1000), date: '2026-05-01', createdAt: { seconds: 2, nanoseconds: 0 } as any }),
      tx({ id: 'a', type: 'entrada', value_cents: cents(500),  date: '2026-05-01', createdAt: { seconds: 1, nanoseconds: 0 } as any }),
    ];
    const balances = calculateRunningBalances(txs);
    expect(balances['a']).toBe(500);
    expect(balances['b']).toBe(1500);
  });

  it('createdAt com nanoseconds contribui para resolução sub-segundo', () => {
    const txs = [
      tx({ id: 'b', type: 'entrada', value_cents: cents(1000), date: '2026-05-01', createdAt: { seconds: 1, nanoseconds: 500_000_000 } as any }),
      tx({ id: 'a', type: 'entrada', value_cents: cents(500),  date: '2026-05-01', createdAt: { seconds: 1, nanoseconds: 0 } as any }),
    ];
    const balances = calculateRunningBalances(txs);
    expect(balances['a']).toBe(500);
    expect(balances['b']).toBe(1500);
  });

  it('createdAt null/undefined cai para tiebreaker por id', () => {
    const txs = [
      tx({ id: 'zzz', type: 'entrada', value_cents: cents(1000), date: '2026-05-01', createdAt: undefined as any }),
      tx({ id: 'aaa', type: 'entrada', value_cents: cents(500),  date: '2026-05-01', createdAt: undefined as any }),
    ];
    const balances = calculateRunningBalances(txs);
    // 'aaa' < 'zzz' lexicograficamente → aaa primeiro
    expect(balances['aaa']).toBe(500);
    expect(balances['zzz']).toBe(1500);
  });
});

// ── FASE 11A-1: Primitivo de transferência ───────────────────────────────────

describe('isTransfer', () => {
  it('retorna true apenas para "transferencia"', () => {
    expect(isTransfer('transferencia')).toBe(true);
  });

  it('retorna false para tipos de receita e despesa', () => {
    expect(isTransfer('entrada')).toBe(false);
    expect(isTransfer('saida')).toBe(false);
    expect(isTransfer('receita')).toBe(false);
    expect(isTransfer('despesa')).toBe(false);
  });

  it('retorna false para strings vazias e desconhecidas', () => {
    expect(isTransfer('')).toBe(false);
    expect(isTransfer('outro')).toBe(false);
  });
});

describe('isIncome — exclui transferencia', () => {
  it('retorna true para entrada e receita', () => {
    expect(isIncome('entrada')).toBe(true);
    expect(isIncome('receita')).toBe(true);
  });

  it('retorna false para transferencia', () => {
    expect(isIncome('transferencia')).toBe(false);
  });

  it('retorna false para saida e despesa', () => {
    expect(isIncome('saida')).toBe(false);
    expect(isIncome('despesa')).toBe(false);
  });
});

describe('isExpense — exclui transferencia', () => {
  it('retorna true para saida e despesa', () => {
    expect(isExpense('saida')).toBe(true);
    expect(isExpense('despesa')).toBe(true);
  });

  it('retorna false para transferencia', () => {
    expect(isExpense('transferencia')).toBe(false);
  });

  it('retorna false para entrada e receita', () => {
    expect(isExpense('entrada')).toBe(false);
    expect(isExpense('receita')).toBe(false);
  });
});

describe('canonicalizeTransactionType — transferencia', () => {
  it('preserva transferencia sem alterar para entrada ou saida', () => {
    expect(canonicalizeTransactionType('transferencia')).toBe('transferencia');
  });

  it('continua mapeando entrada/receita para entrada', () => {
    expect(canonicalizeTransactionType('entrada')).toBe('entrada');
    expect(canonicalizeTransactionType('receita')).toBe('entrada');
  });

  it('continua mapeando saida/despesa/desconhecido para saida', () => {
    expect(canonicalizeTransactionType('saida')).toBe('saida');
    expect(canonicalizeTransactionType('despesa')).toBe('saida');
    expect(canonicalizeTransactionType('outro')).toBe('saida');
    expect(canonicalizeTransactionType(undefined)).toBe('saida');
  });
});

describe('calculateRunningBalances — transferencia neutra', () => {
  it('nao soma nem subtrai transferencia do saldo acumulado', () => {
    const balances = calculateRunningBalances([
      tx({ id: 'income',    type: 'entrada',      value_cents: cents(10000), date: '2026-05-01' }),
      tx({ id: 'transfer',  type: 'transferencia', value_cents: cents(5000),  date: '2026-05-02' }),
      tx({ id: 'expense',   type: 'saida',         value_cents: cents(2000),  date: '2026-05-03' }),
    ]);

    // income: +10000 → 10000
    // transfer: neutro → 10000
    // expense: -2000 → 8000
    expect(balances['income']).toBe(10000);
    expect(balances['transfer']).toBe(10000);
    expect(balances['expense']).toBe(8000);
  });
});
