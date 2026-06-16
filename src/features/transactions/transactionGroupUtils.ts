// src/features/transactions/transactionGroupUtils.ts
// Utilitários puros de agrupamento, formatação e parsing para TransactionsManager.
import type { Transaction } from '../../shared/types/transaction';
import { fromCentavos, toCentavos } from '../../shared/types/money';
import {
  getTransactionAbsCentavos,
  isIncome as checkIncome,
} from '../../utils/transactionUtils';

// ─── Tipos exportados ─────────────────────────────────────────────────────────

export type TransactionTotalSource = Pick<Transaction, 'type' | 'value_cents' | 'value' | 'schemaVersion'>;

export interface Group {
  key:           string;
  label:         string;
  items:         Transaction[];
  count:         number;
  totalInCents:  number;
  totalOutCents: number;
  netCents:      number;
}

export const RUNNING_BALANCE_HELP =
  'Considera apenas os lançamentos visíveis/carregados após filtros. Não representa o saldo da conta.';

// ─── Totais ───────────────────────────────────────────────────────────────────

export function calculateTransactionTotalsCents(transactions: TransactionTotalSource[]) {
  let totalInCents  = 0;
  let totalOutCents = 0;

  transactions.forEach(tx => {
    const cents = getTransactionAbsCentavos(tx);
    if (checkIncome(tx.type)) totalInCents  += cents;
    else                      totalOutCents += cents;
  });

  return { totalInCents, totalOutCents, netCents: totalInCents - totalOutCents };
}

export function calculateTransactionTotals(transactions: TransactionTotalSource[]) {
  const totals = calculateTransactionTotalsCents(transactions);

  return {
    totalIn:  fromCentavos(totals.totalInCents),
    totalOut: fromCentavos(totals.totalOutCents),
    net:      fromCentavos(totals.netCents),
  };
}

export function buildTransactionGroup(key: string, label: string, items: Transaction[]): Group {
  return {
    key,
    label,
    items,
    count: items.length,
    ...calculateTransactionTotalsCents(items),
  };
}

// ─── Formatadores de data ─────────────────────────────────────────────────────

export function getDateLabel(dateStr: string): string {
  if (!dateStr) return 'Sem Data';
  const today = new Date();
  const d     = new Date(dateStr + 'T12:00:00');
  const diff  = Math.round((today.getTime() - d.getTime()) / 86400000);
  if (diff ===  0) return 'Hoje';
  if (diff ===  1) return 'Ontem';
  if (diff === -1) return 'Amanhã';
  return d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateShort(dateStr: string | undefined): string {
  if (!dateStr) return '—';
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

// ─── Parser BRL → centavos (strict) ──────────────────────────────────────────

export function parseBRLToCents(s: string): number | null {
  const cleaned = s.trim().replace(/^R\$\s*/, '').replace(/\s/g, '');
  if (!cleaned) return null;
  // Aceita: "50", "50,00", "1.234,56", "1.234" — rejeita "50abc", "-50", etc.
  if (!/^(\d{1,3}(\.\d{3})*(,\d{1,2})?|\d+(,\d{1,2})?)$/.test(cleaned)) return null;
  try {
    return toCentavos(cleaned);
  } catch {
    return null;
  }
}
