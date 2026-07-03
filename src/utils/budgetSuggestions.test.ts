import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { computeBudgetSuggestions } from './budgetSuggestions';
import type { Transaction } from '../shared/types/transaction';
import type { Centavos } from '../shared/types/money';

// Fixa a data atual para testes determinísticos — prevMonths(3) depende de "agora".
const FIXED_NOW = new Date('2026-07-15T12:00:00Z'); // julho/2026

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});
afterEach(() => vi.useRealTimers());

const cents = (value: number): Centavos => value as Centavos;

function expenseTx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id:            `tx-${Math.random()}`,
    description:   'Despesa',
    value_cents:   cents(10000),
    schemaVersion: 2,
    type:          'saida',
    category:      'Alimentação',
    date:          '2026-06-10',
    ...overrides,
  } as Transaction;
}

describe('computeBudgetSuggestions — sugestão de orçamento por categoria (lookback 3 meses)', () => {
  it('sugere orçamento com buffer de 10% sobre a média, arredondado para cima ao R$10 mais próximo', () => {
    // 3 meses (jun/mai/abr 2026) com R$100,00 (10000 cents) de gasto cada → média 10000
    const txs = [
      expenseTx({ date: '2026-06-10', value_cents: cents(10000) }),
      expenseTx({ date: '2026-05-10', value_cents: cents(10000) }),
      expenseTx({ date: '2026-04-10', value_cents: cents(10000) }),
    ];
    const [suggestion] = computeBudgetSuggestions(txs);

    expect(suggestion).toBeDefined();
    expect(suggestion!.category).toBe('Alimentação');
    expect(suggestion!.avgCents).toBe(10000);
    expect(suggestion!.months).toBe(3);
    // buffer: 10000*1.10=11000, arredondado para cima ao múltiplo de 1000 → 11000
    expect(suggestion!.suggestedCents).toBe(11000);
  });

  it('ignora transações fora da janela de lookback (mais de 3 meses atrás)', () => {
    const txs = [
      expenseTx({ date: '2026-06-10', value_cents: cents(10000) }),
      expenseTx({ date: '2025-01-10', value_cents: cents(999999) }), // fora da janela
    ];
    const [suggestion] = computeBudgetSuggestions(txs);

    expect(suggestion!.months).toBe(1);
    expect(suggestion!.avgCents).toBe(10000);
  });

  it('ignora receitas — só considera despesas', () => {
    const txs = [
      expenseTx({ date: '2026-06-10', value_cents: cents(10000), type: 'entrada' }),
    ];
    expect(computeBudgetSuggestions(txs)).toEqual([]);
  });

  it('pula categorias já orçadas (existingCategories)', () => {
    const txs = [
      expenseTx({ date: '2026-06-10', category: 'Alimentação', value_cents: cents(10000) }),
      expenseTx({ date: '2026-06-10', category: 'Transporte',  value_cents: cents(5000) }),
    ];
    const result = computeBudgetSuggestions(txs, new Set(['Alimentação']));

    expect(result).toHaveLength(1);
    expect(result[0]!.category).toBe('Transporte');
  });

  it('ignora categorias com média abaixo de R$ 1,00 (100 centavos)', () => {
    const txs = [expenseTx({ date: '2026-06-10', value_cents: cents(50) })];
    expect(computeBudgetSuggestions(txs)).toEqual([]);
  });

  it('ordena sugestões por gasto médio decrescente e limita a 8', () => {
    const categories = Array.from({ length: 10 }, (_, i) => `Categoria${i}`);
    const txs = categories.map((cat, i) =>
      expenseTx({ date: '2026-06-10', category: cat, value_cents: cents((i + 1) * 1000) }),
    );
    const result = computeBudgetSuggestions(txs);

    expect(result).toHaveLength(8);
    expect(result[0]!.category).toBe('Categoria9'); // maior gasto (10000) primeiro
    expect(result[0]!.avgCents).toBeGreaterThan(result[1]!.avgCents);
  });

  it('mensagem no singular quando há só 1 mês de dado, plural quando há mais', () => {
    const singleMonth = computeBudgetSuggestions([
      expenseTx({ date: '2026-06-10', value_cents: cents(10000) }),
    ]);
    expect(singleMonth[0]!.reason).toContain('último mês');

    const multiMonth = computeBudgetSuggestions([
      expenseTx({ date: '2026-06-10', value_cents: cents(10000) }),
      expenseTx({ date: '2026-05-10', value_cents: cents(10000) }),
    ]);
    expect(multiMonth[0]!.reason).toContain('meses');
  });

  it('normaliza espaços em branco no nome da categoria', () => {
    const txs = [
      expenseTx({ date: '2026-06-10', category: '  Alimentação  ', value_cents: cents(10000) }),
    ];
    const [suggestion] = computeBudgetSuggestions(txs);
    expect(suggestion!.category).toBe('Alimentação');
  });

  it('retorna array vazio quando não há transações', () => {
    expect(computeBudgetSuggestions([])).toEqual([]);
  });
});
