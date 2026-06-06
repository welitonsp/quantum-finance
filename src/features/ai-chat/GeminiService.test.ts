import { describe, expect, it, vi } from 'vitest';
import type { Transaction } from '../../shared/types/transaction';
import type { Centavos } from '../../shared/types/money';

vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn(() => vi.fn()) }));
vi.mock('../../shared/api/firebase/index', () => ({ functions: {} }));

const { GeminiService } = await import('./GeminiService');

const cents = (n: number) => n as Centavos;

function tx(overrides: Partial<Transaction>): Transaction {
  return {
    id:            'tx-g',
    description:   'Test',
    value_cents:   cents(0),
    schemaVersion: 2,
    type:          'saida',
    category:      'Alimentação',
    date:          '2026-05-15',
    ...overrides,
  } as Transaction;
}

function historicalTxs(cat: string, monthlyCents: number, months: string[]): Transaction[] {
  return months.map((m, i) => tx({ id: `h-${i}`, date: `${m}-15`, category: cat, value_cents: cents(monthlyCents) }));
}

describe('GeminiService.detectAnomalies', () => {
  it('retorna lista vazia sem historico', () => {
    const current = [tx({ value_cents: cents(5000) })];
    expect(GeminiService.detectAnomalies(current, [])).toHaveLength(0);
  });

  it('retorna lista vazia sem transacoes do mes atual', () => {
    const hist = historicalTxs('Alimentação', 10000, ['2026-04', '2026-03']);
    expect(GeminiService.detectAnomalies([], hist)).toHaveLength(0);
  });

  it('detecta anomalia positiva acima do threshold', () => {
    const hist    = historicalTxs('Alimentação', 10000, ['2026-04', '2026-03', '2026-02']);
    const current = [tx({ date: '2026-05-10', category: 'Alimentação', value_cents: cents(20000) })];
    const results = GeminiService.detectAnomalies(current, hist, 25);
    expect(results).toHaveLength(1);
    expect(results[0]!.cat).toBe('Alimentação');
    expect(results[0]!.delta).toBeGreaterThan(0);
  });

  it('detecta anomalia negativa (gasto abaixo da media)', () => {
    const hist    = historicalTxs('Alimentação', 10000, ['2026-04', '2026-03', '2026-02']);
    const current = [tx({ date: '2026-05-10', category: 'Alimentação', value_cents: cents(2000) })];
    const results = GeminiService.detectAnomalies(current, hist, 25);
    expect(results).toHaveLength(1);
    expect(results[0]!.delta).toBeLessThan(0);
  });

  it('nao reporta categoria dentro do threshold', () => {
    const hist    = historicalTxs('Alimentação', 10000, ['2026-04', '2026-03', '2026-02']);
    const current = [tx({ date: '2026-05-10', category: 'Alimentação', value_cents: cents(11000) })]; // +10%
    const results = GeminiService.detectAnomalies(current, hist, 25);
    expect(results).toHaveLength(0);
  });

  it('ignora transacoes de entrada no historico', () => {
    const hist = [
      tx({ date: '2026-04-15', type: 'entrada', category: 'Salário', value_cents: cents(50000) }),
    ];
    const current = [tx({ date: '2026-05-10', type: 'entrada', category: 'Salário', value_cents: cents(100000) })];
    expect(GeminiService.detectAnomalies(current, hist, 25)).toHaveLength(0);
  });

  it('ignora transacoes de entrada no mes atual', () => {
    const hist    = historicalTxs('Alimentação', 10000, ['2026-04', '2026-03', '2026-02']);
    const current = [
      tx({ date: '2026-05-10', type: 'entrada',  category: 'Alimentação', value_cents: cents(50000) }),
      tx({ date: '2026-05-11', type: 'saida',    category: 'Alimentação', value_cents: cents(10500) }),
    ];
    const results = GeminiService.detectAnomalies(current, hist, 25);
    expect(results).toHaveLength(0);
  });

  it('categoria sem historico nao gera anomalia (avg == 0)', () => {
    const hist    = historicalTxs('Alimentação', 10000, ['2026-04', '2026-03']);
    const current = [tx({ date: '2026-05-10', category: 'Nova Cat', value_cents: cents(9999) })];
    expect(GeminiService.detectAnomalies(current, hist, 25)).toHaveLength(0);
  });

  it('ordena resultados por magnitude do delta decrescente', () => {
    const hist = [
      ...historicalTxs('Alimentação', 10000, ['2026-04', '2026-03']),
      ...historicalTxs('Transporte',  5000,  ['2026-04', '2026-03']),
    ];
    const current = [
      tx({ date: '2026-05-10', category: 'Alimentação', value_cents: cents(50000) }), // +400%
      tx({ date: '2026-05-11', category: 'Transporte',  value_cents: cents(20000) }), // +300%
    ];
    const results = GeminiService.detectAnomalies(current, hist, 25);
    expect(Math.abs(results[0]!.delta)).toBeGreaterThanOrEqual(Math.abs(results[1]!.delta));
  });

  it('aceita tipo legado despesa no historico', () => {
    const hist = [
      tx({ date: '2026-04-15', type: 'despesa', category: 'Lazer', value_cents: cents(8000) }),
      tx({ date: '2026-03-15', type: 'despesa', category: 'Lazer', value_cents: cents(8000) }),
    ];
    const current = [tx({ date: '2026-05-10', type: 'despesa', category: 'Lazer', value_cents: cents(20000) })];
    const results = GeminiService.detectAnomalies(current, hist, 25);
    expect(results).toHaveLength(1);
    expect(results[0]!.cat).toBe('Lazer');
  });

  it('retorna lista vazia em caso de excecao interna', () => {
    expect(() => GeminiService.detectAnomalies(null as never, null as never)).not.toThrow();
    expect(GeminiService.detectAnomalies(null as never, null as never)).toHaveLength(0);
  });

  it('usa threshold personalizado', () => {
    const hist    = historicalTxs('Alimentação', 10000, ['2026-04', '2026-03']);
    const current = [tx({ date: '2026-05-10', category: 'Alimentação', value_cents: cents(11500) })]; // +15%
    expect(GeminiService.detectAnomalies(current, hist, 10)).toHaveLength(1);
    expect(GeminiService.detectAnomalies(current, hist, 20)).toHaveLength(0);
  });
});
