import { describe, it, expect } from 'vitest';
import {
  splitIgual,
  splitProporcional,
  splitPersonalizado,
  calcularBalancete,
} from './sharedSplitEngine';
import type { Centavos } from '../shared/types/money';
import type { SharedExpenseShare } from '../shared/types/shared';

const p = (uid: string, opts?: { weight?: number; customCents?: Centavos }) => ({
  uid,
  displayName: `User ${uid}`,
  ...opts,
});

// ──────────────────────────────────────────────
// splitIgual
// ──────────────────────────────────────────────

describe('splitIgual', () => {
  it('divide igualmente sem residuo', () => {
    const r = splitIgual(3000 as Centavos, [p('A'), p('B'), p('C')]);
    expect(r.shares.map((s) => s.amountCents)).toEqual([1000, 1000, 1000]);
    expect(r.residualCents).toBe(0);
  });

  it('coloca residuo no primeiro participante', () => {
    // 100 / 3 = 33.33 → base=33, residual=1
    const r = splitIgual(100 as Centavos, [p('A'), p('B'), p('C')]);
    expect(r.shares[0]!.amountCents).toBe(34);
    expect(r.shares[1]!.amountCents).toBe(33);
    expect(r.shares[2]!.amountCents).toBe(33);
    expect(r.residualCents).toBe(1);
  });

  it('total dos shares = totalCents', () => {
    const total = 7777 as Centavos;
    const r = splitIgual(total, [p('A'), p('B'), p('C')]);
    const soma = r.shares.reduce((a, s) => a + s.amountCents, 0);
    expect(soma).toBe(total);
  });

  it('retorna lista vazia para zero participantes', () => {
    const r = splitIgual(1000 as Centavos, []);
    expect(r.shares).toHaveLength(0);
  });

  it('funciona com 1 participante', () => {
    const r = splitIgual(5000 as Centavos, [p('A')]);
    expect(r.shares[0]!.amountCents).toBe(5000);
  });

  it('shares iniciam com paid=false', () => {
    const r = splitIgual(1000 as Centavos, [p('A'), p('B')]);
    expect(r.shares.every((s) => !s.paid)).toBe(true);
  });
});

// ──────────────────────────────────────────────
// splitProporcional
// ──────────────────────────────────────────────

describe('splitProporcional', () => {
  it('divide 2:1 corretamente', () => {
    // 3000 / (2+1) → A=2000, B=1000
    const r = splitProporcional(3000 as Centavos, [p('A', { weight: 2 }), p('B', { weight: 1 })]);
    expect(r.shares[0]!.amountCents).toBe(2000);
    expect(r.shares[1]!.amountCents).toBe(1000);
    expect(r.valid).toBe(true);
  });

  it('usa peso 1 como padrão quando não especificado', () => {
    const r = splitProporcional(2000 as Centavos, [p('A'), p('B')]);
    expect(r.shares[0]!.amountCents).toBe(1000);
    expect(r.shares[1]!.amountCents).toBe(1000);
  });

  it('total dos shares = totalCents', () => {
    const total = 9999 as Centavos;
    const r = splitProporcional(total, [p('A', { weight: 3 }), p('B', { weight: 2 }), p('C', { weight: 1 })]);
    const soma = r.shares.reduce((a, s) => a + s.amountCents, 0);
    expect(soma).toBe(total);
  });
});

// ──────────────────────────────────────────────
// splitPersonalizado
// ──────────────────────────────────────────────

describe('splitPersonalizado', () => {
  it('valid=true quando soma bate com total', () => {
    const r = splitPersonalizado(5000 as Centavos, [
      p('A', { customCents: 3000 as Centavos }),
      p('B', { customCents: 2000 as Centavos }),
    ]);
    expect(r.valid).toBe(true);
    expect(r.residualCents).toBe(0);
  });

  it('valid=false quando soma diverge do total', () => {
    const r = splitPersonalizado(5000 as Centavos, [
      p('A', { customCents: 3000 as Centavos }),
      p('B', { customCents: 1000 as Centavos }),
    ]);
    expect(r.valid).toBe(false);
    expect(r.residualCents).toBe(1000);
  });

  it('usa zero para customCents ausente', () => {
    const r = splitPersonalizado(5000 as Centavos, [p('A')]);
    expect(r.shares[0]!.amountCents).toBe(0);
  });
});

// ──────────────────────────────────────────────
// calcularBalancete
// ──────────────────────────────────────────────

const share = (uid: string, amountCents: number, paid = false): SharedExpenseShare => ({
  uid,
  displayName: `User ${uid}`,
  amountCents: amountCents as Centavos,
  paid,
});

describe('calcularBalancete', () => {
  it('A paga despesa, B deve pagar A sua parte', () => {
    const expenses = [{
      payerUid: 'A',
      payerDisplayName: 'User A',
      shares: [share('A', 1000), share('B', 1000)],
    }];
    const b = calcularBalancete(expenses);
    expect(b).toHaveLength(1);
    expect(b[0]!.devedorUid).toBe('B');
    expect(b[0]!.credorUid).toBe('A');
    expect(b[0]!.valorCents).toBe(1000);
  });

  it('ignora shares marcados como pagos', () => {
    const expenses = [{
      payerUid: 'A',
      payerDisplayName: 'User A',
      shares: [share('A', 1000), share('B', 1000, true)],
    }];
    const b = calcularBalancete(expenses);
    expect(b).toHaveLength(0);
  });

  it('compensa débitos cruzados (A deve B, B deve A)', () => {
    const expenses = [
      { payerUid: 'A', payerDisplayName: 'User A', shares: [share('A', 500), share('B', 500)] },
      { payerUid: 'B', payerDisplayName: 'User B', shares: [share('A', 300), share('B', 300)] },
    ];
    const b = calcularBalancete(expenses);
    // B deve A 500, A deve B 300 → B deve pagar 200 a A
    const total = b.reduce((a, item) => a + item.valorCents, 0);
    expect(total).toBe(200);
  });

  it('retorna vazio quando não há dívidas', () => {
    const b = calcularBalancete([]);
    expect(b).toHaveLength(0);
  });

  it('minimiza número de transações com 3 membros', () => {
    // A pagou tudo, B e C devem pagar A
    const expenses = [{
      payerUid: 'A',
      payerDisplayName: 'User A',
      shares: [share('A', 1000), share('B', 1000), share('C', 1000)],
    }];
    const b = calcularBalancete(expenses);
    // B → A e C → A = 2 transações, não mais
    expect(b.length).toBeLessThanOrEqual(2);
    const total = b.reduce((a, item) => a + item.valorCents, 0);
    expect(total).toBe(2000);
  });
});
