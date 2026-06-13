/**
 * Motor de cálculo de split de despesas compartilhadas.
 * Zero I/O, zero float — usa Decimal.js para todas as divisões.
 *
 * Métodos de split suportados:
 * - igual: divide o total em partes iguais; centavos residuais vão para o pagador
 * - proporcional: proporcional a pesos fornecidos
 * - personalizado: valores fornecidos explicitamente pelo criador (soma deve = total)
 */

import Decimal from 'decimal.js';
import type { Centavos } from '../shared/types/money';
import type { SharedExpenseShare } from '../shared/types/shared';

export interface SplitParticipant {
  uid: string;
  displayName: string;
  /** Peso para split proporcional (ignorado em igual/personalizado). Padrão 1. */
  weight?: number;
  /** Valor customizado em centavos (apenas split personalizado). */
  customCents?: Centavos;
}

export interface SplitResult {
  shares: SharedExpenseShare[];
  /** true se a soma dos shares bate com o total (sanity check) */
  valid: boolean;
  /** Diferença de arredondamento residual em centavos */
  residualCents: Centavos;
}

// ──────────────────────────────────────────────
// Métodos de split
// ──────────────────────────────────────────────

/**
 * Divide o total em partes iguais.
 * Centavos residuais de arredondamento vão para o primeiro participante (pagador).
 */
export function splitIgual(
  totalCents: Centavos,
  participants: SplitParticipant[],
): SplitResult {
  if (participants.length === 0) {
    return { shares: [], valid: true, residualCents: 0 as Centavos };
  }

  const n = participants.length;
  const baseDecimal = new Decimal(totalCents).dividedBy(n);
  const base = baseDecimal.toDecimalPlaces(0, Decimal.ROUND_FLOOR).toNumber() as Centavos;
  const residual = (totalCents - base * n) as Centavos;

  const shares: SharedExpenseShare[] = participants.map((p, i) => ({
    uid: p.uid,
    displayName: p.displayName,
    amountCents: (i === 0 ? base + residual : base) as Centavos,
    paid: false,
  }));

  return { shares, valid: true, residualCents: residual };
}

/**
 * Divide proporcional aos pesos de cada participante.
 * Participantes sem peso recebem peso 1.
 */
export function splitProporcional(
  totalCents: Centavos,
  participants: SplitParticipant[],
): SplitResult {
  if (participants.length === 0) {
    return { shares: [], valid: true, residualCents: 0 as Centavos };
  }

  const weights = participants.map((p) => new Decimal(p.weight ?? 1));
  const totalWeight = weights.reduce((acc, w) => acc.plus(w), new Decimal(0));

  let assigned = 0;
  const shares: SharedExpenseShare[] = participants.map((p, i) => {
    const isLast = i === participants.length - 1;
    const amountCents = isLast
      ? (totalCents - assigned) as Centavos
      : weights[i]!.times(totalCents).dividedBy(totalWeight)
          .toDecimalPlaces(0, Decimal.ROUND_FLOOR).toNumber() as Centavos;
    assigned += amountCents;
    return { uid: p.uid, displayName: p.displayName, amountCents, paid: false };
  });

  const residual = (totalCents - shares.reduce((a, s) => a + s.amountCents, 0)) as Centavos;
  return { shares, valid: residual === 0, residualCents: residual };
}

/**
 * Usa valores customizados fornecidos explicitamente.
 * Valida que a soma bate com o total.
 */
export function splitPersonalizado(
  totalCents: Centavos,
  participants: SplitParticipant[],
): SplitResult {
  const shares: SharedExpenseShare[] = participants.map((p) => ({
    uid: p.uid,
    displayName: p.displayName,
    amountCents: p.customCents ?? (0 as Centavos),
    paid: false,
  }));

  const soma = shares.reduce((a, s) => a + s.amountCents, 0) as Centavos;
  const residual = (totalCents - soma) as Centavos;
  return { shares, valid: residual === 0, residualCents: residual };
}

// ──────────────────────────────────────────────
// Balancetes
// ──────────────────────────────────────────────

export interface BalanceteItem {
  /** UID do devedor */
  devedorUid: string;
  devedorNome: string;
  /** UID do credor */
  credorUid: string;
  credorNome: string;
  /** Valor a transferir */
  valorCents: Centavos;
}

/**
 * Calcula o balancete do grupo: quem deve pagar para quem, minimizando transações.
 * Recebe as despesas com seus shares já definidos.
 */
export function calcularBalancete(
  expenses: Array<{
    payerUid: string;
    payerDisplayName: string;
    shares: SharedExpenseShare[];
  }>,
): BalanceteItem[] {
  // Saldo líquido por uid: positivo = a receber, negativo = a pagar
  const saldos = new Map<string, { nome: string; saldoCents: number }>();

  const upsert = (uid: string, nome: string, delta: number) => {
    const prev = saldos.get(uid);
    saldos.set(uid, { nome, saldoCents: (prev?.saldoCents ?? 0) + delta });
  };

  for (const expense of expenses) {
    for (const share of expense.shares) {
      if (share.paid) continue;
      if (share.uid === expense.payerUid) continue; // pagador não deve a si mesmo
      // Devedor deve ao pagador
      upsert(share.uid, share.displayName, -share.amountCents);
      upsert(expense.payerUid, expense.payerDisplayName, +share.amountCents);
    }
  }

  // Algoritmo guloso: maior credor recebe do maior devedor
  const credores = Array.from(saldos.entries())
    .filter(([, v]) => v.saldoCents > 0)
    .sort((a, b) => b[1].saldoCents - a[1].saldoCents);

  const devedores = Array.from(saldos.entries())
    .filter(([, v]) => v.saldoCents < 0)
    .sort((a, b) => a[1].saldoCents - b[1].saldoCents);

  const result: BalanceteItem[] = [];
  let ci = 0;
  let di = 0;

  while (ci < credores.length && di < devedores.length) {
    const [credUid, cred] = credores[ci]!;
    const [devUid, dev] = devedores[di]!;

    const valor = Math.min(cred.saldoCents, -dev.saldoCents) as Centavos;
    if (valor > 0) {
      result.push({
        devedorUid: devUid,
        devedorNome: dev.nome,
        credorUid: credUid,
        credorNome: cred.nome,
        valorCents: valor,
      });
    }

    cred.saldoCents -= valor;
    dev.saldoCents += valor;

    if (cred.saldoCents === 0) ci++;
    if (dev.saldoCents === 0) di++;
  }

  return result;
}
