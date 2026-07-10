import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { generateInsight, computeMCInputs, useForecast } from './useForecast';
import type { Transaction } from '../shared/types/transaction';

let _id = 0;
function tx(over: Record<string, unknown>): Transaction {
  return {
    id: `tx-${++_id}`,
    description: 'Mov',
    type: 'saida',
    category: 'Outros',
    value_cents: 0,
    ...over,
  } as Transaction;
}

describe('generateInsight', () => {
  const base = {
    survivalRate: 95, ruinProbability: 0, burnRate: 100,
    expectedIncome: 200, balance: 1000, projectedBalance: 900, volatility: 10,
  };

  it('trajetória segura quando survivalRate > 90', () => {
    expect(generateInsight(base)).toMatch(/Trajetória segura/);
  });

  it('atenção quando survivalRate entre 70 e 90', () => {
    expect(generateInsight({ ...base, survivalRate: 80 })).toMatch(/Atenção/);
  });

  it('risco elevado quando survivalRate < 70', () => {
    expect(generateInsight({ ...base, survivalRate: 50 })).toMatch(/Risco elevado/);
  });

  it('acumula alertas: gasta mais que ganha + gastos inconsistentes + saldo negativo + ruína', () => {
    const msg = generateInsight({
      survivalRate: 40,
      ruinProbability: 60,
      burnRate: 300,
      expectedIncome: 200, // burnRate > income
      balance: -50,        // saldo negativo
      projectedBalance: -100,
      volatility: 200,     // 200/300 = 0.66 > 0.4
    });
    expect(msg).toMatch(/gastando mais do que ganha/);
    expect(msg).toMatch(/inconsistentes/);
    expect(msg).toMatch(/saldo atual já está negativo/);
    expect(msg).toMatch(/Alta probabilidade/);
  });

  it('não acusa "gasta mais" quando não há renda (expectedIncome = 0)', () => {
    const msg = generateInsight({ ...base, survivalRate: 95, expectedIncome: 0, burnRate: 500 });
    expect(msg).not.toMatch(/gastando mais/);
  });
});

describe('computeMCInputs', () => {
  const NOW = new Date('2026-06-30T12:00:00Z');

  it('retorna zeros sem transações', () => {
    const r = computeMCInputs([], NOW);
    expect(r).toEqual({ burnRate: 0, expectedIncome: 0, volatility: 0 });
  });

  it('agrega despesa e receita da janela de 30 dias', () => {
    const txs = [
      tx({ date: '2026-06-15', type: 'saida', value_cents: 3000 }),
      tx({ date: '2026-06-10', type: 'entrada', value_cents: 9000 }),
      // fora da janela (antiga): ignorada
      tx({ date: '2026-04-01', type: 'saida', value_cents: 99999 }),
      // futura (> hoje): ignorada
      tx({ date: '2026-07-05', type: 'saida', value_cents: 88888 }),
      // sem value_cents: ignorada
      tx({ date: '2026-06-12', type: 'saida' }),
    ];
    const r = computeMCInputs(txs, NOW);
    expect(r.burnRate).toBe(1);        // 3000/30 = 100 centavos = R$1
    expect(r.expectedIncome).toBe(3);  // 9000/30 = 300 centavos = R$3
    expect(r.volatility).toBeGreaterThan(0);
  });
});

describe('useForecast (hook)', () => {
  it('expõe os inputs Monte Carlo e o forecast determinístico sem lançar', () => {
    const txs = [
      tx({ date: '2026-06-15', type: 'saida', value_cents: 3000 }),
      tx({ date: '2026-06-10', type: 'entrada', value_cents: 9000 }),
    ];
    const { result } = renderHook(() => useForecast(txs, 100000, 30));
    expect(typeof result.current.burnRate).toBe('number');
    expect(typeof result.current.expectedIncome).toBe('number');
    expect(typeof result.current.volatility).toBe('number');
    expect(typeof result.current.mcLoading).toBe('boolean');
    // Passthrough do forecast determinístico (calculateForecast)
    expect(result.current).toHaveProperty('survivalRate');
    expect(result.current).toHaveProperty('riskLevel');
  });

  it('lida com lista vazia de transações', () => {
    const { result } = renderHook(() => useForecast([], 0, 30));
    expect(result.current.burnRate).toBe(0);
    expect(result.current.expectedIncome).toBe(0);
  });
});
