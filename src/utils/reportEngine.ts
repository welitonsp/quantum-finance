import type { Transaction, Account } from '../shared/types/transaction';
import { isExpense, isIncome } from './transactionUtils';

export interface ParetoEntry {
  category:  string;
  total:     number;
  cumPct:    number;
  isInTop20: boolean;
}

/** Pareto 80/20 das despesas. */
export function calcPareto(transactions: Transaction[]): ParetoEntry[] {
  const totals: Record<string, number> = {};
  let grand = 0;

  for (const tx of transactions) {
    if (!isExpense(tx.type)) continue;
    const v = Math.abs(Number(tx.value ?? 0));
    const cat = tx.category ?? 'Diversos';
    totals[cat] = (totals[cat] ?? 0) + v;
    grand += v;
  }

  if (grand === 0) return [];

  const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  const top20Cutoff = Math.max(1, Math.ceil(sorted.length * 0.2));
  let cumulative = 0;

  return sorted.map(([category, total], idx) => {
    cumulative += total;
    return {
      category,
      total:     Math.round(total * 100) / 100,
      cumPct:    Math.round((cumulative / grand) * 1000) / 10,
      isInTop20: idx < top20Cutoff,
    };
  });
}

export interface PatrimonyPoint {
  monthLabel: string;
  patrimonio: number;
}

const PT_MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
                   'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

/**
 * Evolução patrimonial determinística dos últimos 6 meses.
 *
 * INVARIANTES:
 * - Aritmética interna em CENTAVOS (inteiros) — zero drift float
 * - referenceDate é OBRIGATÓRIO (sem default new Date()) — habilita
 *   determinismo total e snapshot tests
 * - accounts.balance JÁ vem em centavos do useAccounts (normalizeBalance)
 */
export function calcPatrimonyEvolution(
  transactions: Transaction[],
  accounts: Account[],
  referenceDate: Date,
): PatrimonyPoint[] {
  // Soma inicial em CENTAVOS — accounts.balance já vem normalizado pelo hook
  let balanceCentavos = accounts.reduce(
    (sum, a) => sum + asCentavos(a.balance),
    0,
  );

  const points: PatrimonyPoint[] = [];
  const ref = new Date(referenceDate.getTime());   // cópia defensiva

  for (let i = 0; i < 6; i++) {
    const month = ref.getMonth();
    const year  = ref.getFullYear();
    const label = i === 0 ? 'Atual' : PT_MONTHS[month]!;

    points.unshift({
      monthLabel: label,
      // Converte para reais APENAS na fronteira de saída (Recharts)
      patrimonio: balanceCentavos / 100,
    });

    // Rebobinar: reverte transações deste mês para o saldo do mês anterior
    for (const tx of transactions) {
      if (!tx.date) continue;
      const d = new Date(tx.date + 'T00:00:00Z');   // UTC strict (determinismo)
      if (d.getUTCFullYear() === year && d.getUTCMonth() === month) {
        const vCentavos = txValueToCentavos(Number(tx.value ?? 0));
        if (isIncome(tx.type))   balanceCentavos -= vCentavos;
        if (isExpense(tx.type))  balanceCentavos += vCentavos;
      }
    }

    ref.setMonth(ref.getMonth() - 1);
  }

  return points;
}

// ─── Helpers internos ───────────────────────────────────────────────────────

/** balance da Account já vem em centavos — só arredonda defensivo. */
function asCentavos(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.round(v);
}

/**
 * tx.value pode vir em centavos (Firestore) OU em reais (após hook que
 * desnormaliza). Auto-detect: se é inteiro, assume centavos; se float,
 * converte de reais.
 */
function txValueToCentavos(v: number): number {
  const abs = Math.abs(v);
  if (!Number.isFinite(abs)) return 0;
  if (Number.isInteger(abs)) return abs;
  return Math.round(abs * 100);
}
