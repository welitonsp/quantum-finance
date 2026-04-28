import type { Transaction, Account } from '../shared/types/transaction';
import { isExpense, isIncome } from './transactionUtils';
import { fromCentavos, toCentavos } from '../shared/types/money';

export interface ParetoEntry {
  category: string;
  total: number;
  cumPct: number;
  isInTop20: boolean;
}

/**
 * Normaliza valor de transação para CENTAVOS.
 *
 * Prioridade:
 * 1. value_cents, quando existir: fonte canônica.
 * 2. value legado inteiro: tratado como centavos, preservando compatibilidade
 *    com testes e documentos legados do projeto.
 * 3. value legado decimal: tratado como reais e convertido para centavos.
 */
function getReportTransactionAbsCentavos(tx: Transaction): number {
  if (typeof tx.value_cents === 'number' && Number.isFinite(tx.value_cents)) {
    return Math.abs(Math.round(tx.value_cents));
  }

  if (typeof tx.value !== 'number' || !Number.isFinite(tx.value)) {
    return 0;
  }

  if (Number.isInteger(tx.value)) {
    return Math.abs(tx.value);
  }

  return Math.abs(toCentavos(tx.value));
}

/** balance da Account já vem em centavos — arredondamento defensivo. */
function getAccountBalanceCentavos(account: Account): number {
  const value = Number(account.balance);
  if (!Number.isFinite(value)) return 0;
  return Math.round(value);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Pareto 80/20 das despesas. */
export function calcPareto(transactions: Transaction[]): ParetoEntry[] {
  const totalsCentavos: Record<string, number> = {};
  let grandCentavos = 0;

  for (const tx of transactions) {
    if (!isExpense(tx.type)) continue;

    const valueCentavos = getReportTransactionAbsCentavos(tx);
    if (valueCentavos <= 0) continue;

    const category = tx.category ?? 'Diversos';
    totalsCentavos[category] = (totalsCentavos[category] ?? 0) + valueCentavos;
    grandCentavos += valueCentavos;
  }

  if (grandCentavos === 0) return [];

  const sorted = Object.entries(totalsCentavos).sort((a, b) => b[1] - a[1]);
  const top20Cutoff = Math.max(1, Math.ceil(sorted.length * 0.2));
  let cumulativeCentavos = 0;

  return sorted.map(([category, totalCentavos], index) => {
    cumulativeCentavos += totalCentavos;

    return {
      category,
      total: round2(fromCentavos(totalCentavos)),
      cumPct: Math.round((cumulativeCentavos / grandCentavos) * 1000) / 10,
      isInTop20: index < top20Cutoff,
    };
  });
}

export interface PatrimonyPoint {
  monthLabel: string;
  patrimonio: number;
}

const PT_MONTHS = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
];

/**
 * Evolução patrimonial determinística dos últimos 6 meses.
 *
 * Invariantes:
 * - Aritmética interna em CENTAVOS.
 * - referenceDate é obrigatório para determinismo em testes.
 * - accounts.balance vem em centavos após normalização.
 * - Conversão para reais ocorre somente na saída final.
 */
export function calcPatrimonyEvolution(
  transactions: Transaction[],
  accounts: Account[],
  referenceDate: Date,
): PatrimonyPoint[] {
  let balanceCentavos = accounts.reduce(
    (sum, account) => sum + getAccountBalanceCentavos(account),
    0,
  );

  const points: PatrimonyPoint[] = [];

  const cursor = new Date(Date.UTC(
    referenceDate.getUTCFullYear(),
    referenceDate.getUTCMonth(),
    1,
  ));

  for (let index = 0; index < 6; index += 1) {
    const month = cursor.getUTCMonth();
    const year = cursor.getUTCFullYear();
    const monthLabel = index === 0 ? 'Atual' : PT_MONTHS[month]!;

    points.unshift({
      monthLabel,
      patrimonio: round2(fromCentavos(balanceCentavos)),
    });

    for (const tx of transactions) {
      if (!tx.date) continue;

      const txDate = new Date(`${tx.date}T00:00:00Z`);
      if (Number.isNaN(txDate.getTime())) continue;

      const sameMonth =
        txDate.getUTCFullYear() === year &&
        txDate.getUTCMonth() === month;

      if (!sameMonth) continue;

      const valueCentavos = getReportTransactionAbsCentavos(tx);
      if (valueCentavos <= 0) continue;

      if (isIncome(tx.type)) {
        balanceCentavos -= valueCentavos;
      } else if (isExpense(tx.type)) {
        balanceCentavos += valueCentavos;
      }
    }

    cursor.setUTCMonth(cursor.getUTCMonth() - 1);
  }

  return points;
}