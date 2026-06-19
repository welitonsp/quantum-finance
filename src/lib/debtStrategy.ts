/**
 * debtStrategy.ts — Motor puro de estratégia de quitação de dívidas (FASE E).
 * Zero React, zero Firebase, zero I/O. 100% testável.
 *
 * Compara duas estratégias clássicas de quitação, simulando mês a mês em centavos
 * inteiros (Decimal.js para o juro, sem float):
 *   • avalanche — ataca primeiro a dívida de MAIOR taxa de juros (minimiza juros);
 *   • snowball  — ataca primeiro a dívida de MENOR saldo (efeito psicológico/momentum).
 *
 * Modelo de simulação (padrão de mercado):
 *   1. Acumula juros do mês sobre o saldo de cada dívida ativa.
 *   2. Paga o mínimo de cada dívida (limitado ao saldo).
 *   3. Distribui o orçamento restante (incluindo mínimos liberados por dívidas já
 *      quitadas — efeito "rollover") na ordem da estratégia, em cascata.
 *   4. Repete até zerar tudo (ou atingir o teto de meses → inviável).
 *
 * O motor é DESACOPLADO de `useDebts`: recebe os pagamentos mínimos já calculados
 * (ex.: via `calcMonthlyPaymentCents`), mantendo-se puro e testável.
 */
import Decimal from 'decimal.js';
import type { Centavos } from '../shared/types/money';

// ─── Tipos públicos ───────────────────────────────────────────────────────────

export type DebtStrategyKind = 'avalanche' | 'snowball';

export interface DebtStrategyInput {
  id: string;
  name: string;
  /** Saldo devedor restante em centavos inteiros. */
  remainingCents: Centavos;
  /** Taxa de juros MENSAL (ex.: 0.0185 = 1,85% a.m.). */
  monthlyInterestRate: number;
  /** Pagamento mínimo mensal em centavos inteiros. */
  minPaymentCents: Centavos;
}

export interface DebtPayoffStep {
  debtId: string;
  name: string;
  /** Índice 0-based do mês em que a dívida foi totalmente quitada. */
  payoffMonthIndex: number;
  /** Juros totais pagos nesta dívida em centavos. */
  interestPaidCents: Centavos;
}

export interface DebtStrategyResult {
  strategy: DebtStrategyKind;
  /** Viável dentro do teto de meses e com orçamento ≥ soma dos mínimos. */
  feasible: boolean;
  /** Motivo quando inviável. */
  reason?: string;
  /** Número de meses até a quitação total (0 se nada a pagar). */
  months: number;
  /** Juros totais pagos no plano, em centavos. */
  totalInterestCents: Centavos;
  /** Total desembolsado (principal + juros), em centavos. */
  totalPaidCents: Centavos;
  /** Ordem de quitação das dívidas. */
  order: DebtPayoffStep[];
}

export interface DebtStrategyComparison {
  avalanche: DebtStrategyResult;
  snowball: DebtStrategyResult;
  /** Estratégia recomendada (avalanche minimiza juros; empate → snowball). */
  recommended: DebtStrategyKind;
  /** Economia de juros do avalanche vs snowball (≥ 0), em centavos. */
  interestSavingsCents: Centavos;
  /** Diferença de prazo: snowball.months − avalanche.months. */
  monthsDifference: number;
}

// ─── Constantes ─────────────────────────────────────────────────────────────────

/** Teto de meses (50 anos) para detectar planos inviáveis sem loop infinito. */
const MAX_MONTHS = 600;

// ─── Helpers internos ─────────────────────────────────────────────────────────

interface SimDebt {
  id: string;
  name: string;
  balance: number;          // centavos inteiros
  rate: number;
  minPayment: number;       // centavos inteiros
  interestPaid: number;     // centavos inteiros acumulados
  payoffMonthIndex: number; // -1 enquanto ativa
}

/** Juros do mês sobre o saldo, em centavos inteiros (Decimal, sem float). */
function monthlyInterestCents(balanceCents: number, rate: number): number {
  if (balanceCents <= 0 || rate <= 0) return 0;
  return new Decimal(balanceCents)
    .times(new Decimal(rate.toString()))
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
    .toNumber();
}

/** Ordena índices de dívidas ativas conforme a estratégia (alvo primeiro). */
function targetOrder(debts: SimDebt[], strategy: DebtStrategyKind): number[] {
  const activeIdx = debts
    .map((d, i) => ({ d, i }))
    .filter(({ d }) => d.balance > 0)
    .map(({ i }) => i);

  return activeIdx.sort((a, b) => {
    const da = debts[a]!;
    const db = debts[b]!;
    if (strategy === 'avalanche') {
      // maior juro primeiro; desempate por menor saldo
      if (db.rate !== da.rate) return db.rate - da.rate;
      return da.balance - db.balance;
    }
    // snowball: menor saldo primeiro; desempate por maior juro
    if (da.balance !== db.balance) return da.balance - db.balance;
    return db.rate - da.rate;
  });
}

// ─── Simulação de uma estratégia ────────────────────────────────────────────────

export function simulateDebtStrategy(
  inputs: DebtStrategyInput[],
  monthlyBudgetCents: Centavos,
  strategy: DebtStrategyKind,
): DebtStrategyResult {
  const debts: SimDebt[] = inputs
    .filter(d => d.remainingCents > 0)
    .map(d => ({
      id: d.id,
      name: d.name,
      balance: d.remainingCents,
      rate: d.monthlyInterestRate,
      minPayment: d.minPaymentCents,
      interestPaid: 0,
      payoffMonthIndex: -1,
    }));

  const principalTotal = debts.reduce((s, d) => s + d.balance, 0);

  // Nada a pagar.
  if (debts.length === 0) {
    return {
      strategy, feasible: true, months: 0,
      totalInterestCents: 0 as Centavos,
      totalPaidCents: 0 as Centavos,
      order: [],
    };
  }

  // Viabilidade: o orçamento precisa cobrir a soma dos mínimos.
  const sumMin = debts.reduce((s, d) => s + d.minPayment, 0);
  if (monthlyBudgetCents < sumMin) {
    return {
      strategy, feasible: false,
      reason: 'Orçamento mensal insuficiente para cobrir os pagamentos mínimos',
      months: 0,
      totalInterestCents: 0 as Centavos,
      totalPaidCents: 0 as Centavos,
      order: [],
    };
  }

  let month = 0;
  while (debts.some(d => d.balance > 0) && month < MAX_MONTHS) {
    // 1. Juros do mês.
    for (const d of debts) {
      if (d.balance <= 0) continue;
      const interest = monthlyInterestCents(d.balance, d.rate);
      d.balance += interest;
      d.interestPaid += interest;
    }

    // 2. Pagamento mínimo de cada dívida ativa (limitado ao saldo).
    let pool = monthlyBudgetCents as number;
    for (const d of debts) {
      if (d.balance <= 0) continue;
      const pay = Math.min(d.minPayment, d.balance);
      d.balance -= pay;
      pool -= pay;
    }

    // 3. Distribui o restante (inclui mínimos liberados) na ordem da estratégia.
    if (pool > 0) {
      for (const idx of targetOrder(debts, strategy)) {
        if (pool <= 0) break;
        const d = debts[idx]!;
        if (d.balance <= 0) continue;
        const pay = Math.min(pool, d.balance);
        d.balance -= pay;
        pool -= pay;
      }
    }

    // 4. Marca quitações deste mês.
    for (const d of debts) {
      if (d.balance <= 0 && d.payoffMonthIndex === -1) {
        d.payoffMonthIndex = month;
      }
    }

    month++;
  }

  const stillOpen = debts.some(d => d.balance > 0);
  if (stillOpen) {
    return {
      strategy, feasible: false,
      reason: 'Plano não converge dentro do horizonte máximo (orçamento muito próximo dos juros)',
      months: month,
      totalInterestCents: debts.reduce((s, d) => s + d.interestPaid, 0) as Centavos,
      totalPaidCents: (principalTotal + debts.reduce((s, d) => s + d.interestPaid, 0)) as Centavos,
      order: [],
    };
  }

  const totalInterest = debts.reduce((s, d) => s + d.interestPaid, 0);
  const order: DebtPayoffStep[] = debts
    .slice()
    .sort((a, b) => a.payoffMonthIndex - b.payoffMonthIndex)
    .map(d => ({
      debtId: d.id,
      name: d.name,
      payoffMonthIndex: d.payoffMonthIndex,
      interestPaidCents: d.interestPaid as Centavos,
    }));

  return {
    strategy,
    feasible: true,
    months: month,
    totalInterestCents: totalInterest as Centavos,
    totalPaidCents: (principalTotal + totalInterest) as Centavos,
    order,
  };
}

// ─── Comparação avalanche × snowball ────────────────────────────────────────────

export function compareDebtStrategies(
  inputs: DebtStrategyInput[],
  monthlyBudgetCents: Centavos,
): DebtStrategyComparison {
  const avalanche = simulateDebtStrategy(inputs, monthlyBudgetCents, 'avalanche');
  const snowball  = simulateDebtStrategy(inputs, monthlyBudgetCents, 'snowball');

  // Avalanche minimiza juros por definição; só recomenda snowball em empate de juros.
  let recommended: DebtStrategyKind = 'avalanche';
  if (avalanche.feasible && snowball.feasible) {
    recommended = avalanche.totalInterestCents <= snowball.totalInterestCents
      ? 'avalanche'
      : 'snowball';
  } else if (!avalanche.feasible && snowball.feasible) {
    recommended = 'snowball';
  }

  const interestSavingsCents = (avalanche.feasible && snowball.feasible
    ? Math.max(0, snowball.totalInterestCents - avalanche.totalInterestCents)
    : 0) as Centavos;

  const monthsDifference = (avalanche.feasible && snowball.feasible)
    ? snowball.months - avalanche.months
    : 0;

  return { avalanche, snowball, recommended, interestSavingsCents, monthsDifference };
}
