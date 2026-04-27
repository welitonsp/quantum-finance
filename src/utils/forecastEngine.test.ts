import { describe, it, expect } from 'vitest';
import { calculateForecast } from './forecastEngine';
import type { Transaction } from '../shared/types/transaction';

const FIXED_DATE = new Date('2026-04-15T12:00:00Z');

const tx = (type: 'entrada' | 'saida', value: number, date: string): Transaction =>
  ({ id: crypto.randomUUID(), description: `tx-${date}`, value, type, category: 'Outros', date }) as Transaction;

describe('calculateForecast — determinismo', () => {
  it('mesmo input + mesma data produz resultado idêntico', () => {
    const txs = [tx('saida', 100, '2026-04-10'), tx('entrada', 200, '2026-04-05')];
    const r1 = calculateForecast(txs, 1000, 30, FIXED_DATE);
    const r2 = calculateForecast(txs, 1000, 30, FIXED_DATE);
    expect(r1).toEqual(r2);
  });

  it('não muta referenceDate passada', () => {
    const ref = new Date(FIXED_DATE.getTime());
    calculateForecast([], 1000, 30, FIXED_DATE);
    expect(FIXED_DATE.getTime()).toBe(ref.getTime());
  });
});

describe('calculateForecast — estrutura do resultado', () => {
  it('retorna exatamente `days` pontos de projeção', () => {
    const result = calculateForecast([tx('saida', 100, '2026-04-10')], 1000, 30, FIXED_DATE);
    expect(result.points).toHaveLength(30);
  });

  it('sem transações → retorna EMPTY com currentBalance preservado', () => {
    const result = calculateForecast([], 999, 30, FIXED_DATE);
    expect(result.finalBalance).toBe(999);
    expect(result.minBalance).toBe(999);
    expect(result.points).toHaveLength(0);
    expect(result.health).toBe('good');
  });

  it('health = danger quando saldo projectado fica negativo', () => {
    // Despesa enorme → mínimo negativo
    const txs = Array.from({ length: 10 }, (_, i) =>
      tx('saida', 5000, `2026-04-${String(i + 1).padStart(2, '0')}`),
    );
    const result = calculateForecast(txs, 100, 30, FIXED_DATE);
    expect(result.health).toBe('danger');
  });

  it('pontos de projeção começam APÓS today (futuro apenas)', () => {
    const txs = [tx('saida', 50, '2026-04-10')];
    const result = calculateForecast(txs, 500, 5, FIXED_DATE);
    // todayStr = '2026-04-15', logo points[0].date >= '2026-04-16'
    if (result.points.length > 0) {
      expect(result.points[0]!.date > '2026-04-15').toBe(true);
    }
  });

  it('finalBalance === points[last].balance', () => {
    const txs = [tx('saida', 30, '2026-04-10')];
    const result = calculateForecast(txs, 500, 10, FIXED_DATE);
    if (result.points.length > 0) {
      expect(result.finalBalance).toBe(result.points[result.points.length - 1]!.balance);
    }
  });
});
