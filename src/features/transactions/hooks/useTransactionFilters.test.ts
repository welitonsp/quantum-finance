// src/features/transactions/hooks/useTransactionFilters.test.ts
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Transaction } from '../../../shared/types/transaction';
import type { Centavos } from '../../../shared/types/money';
import { useTransactionFilters } from './useTransactionFilters';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const cents = (n: number): Centavos => n as Centavos;

function tx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id:            'tx-1',
    description:   'Salário',
    value_cents:   cents(100000),
    type:          'entrada',
    category:      'Salário',
    date:          '2026-06-01',
    source:        'manual',
    schemaVersion: 2,
    ...overrides,
  } as Transaction;
}

const base = [
  tx({ id: 'a', description: 'Salário',    type: 'entrada', category: 'Salário',     date: '2026-06-01', source: 'manual', value_cents: cents(500000) }),
  tx({ id: 'b', description: 'Mercado',    type: 'saida',   category: 'Alimentação', date: '2026-06-02', source: 'csv',    value_cents: cents(15000)  }),
  tx({ id: 'c', description: 'Netflix',    type: 'saida',   category: 'Assinaturas', date: '2026-06-03', source: 'manual', value_cents: cents(4990)   }),
  tx({ id: 'd', description: 'Freelance',  type: 'entrada', category: 'Freelance',   date: '2026-05-15', source: 'ofx',    value_cents: cents(200000), reconciliationStatus: 'reconciled' }),
];

// ─── Testes de filtragem ──────────────────────────────────────────────────────

describe('useTransactionFilters — filtro por texto', () => {
  it('filtra por descrição (case insensitive)', () => {
    const { result } = renderHook(() => useTransactionFilters(base, []));
    act(() => result.current.setSearch('netflix'));
    expect(result.current.filtered).toHaveLength(1);
    expect(result.current.filtered[0]!.id).toBe('c');
  });

  it('filtra por categoria via texto', () => {
    const { result } = renderHook(() => useTransactionFilters(base, []));
    act(() => result.current.setSearch('freelance'));
    expect(result.current.filtered).toHaveLength(1);
    expect(result.current.filtered[0]!.id).toBe('d');
  });

  it('texto vazio retorna todos', () => {
    const { result } = renderHook(() => useTransactionFilters(base, []));
    act(() => result.current.setSearch(''));
    expect(result.current.filtered).toHaveLength(4);
  });
});

describe('useTransactionFilters — filtro por tipo', () => {
  it('filterType entrada retorna só entradas', () => {
    const { result } = renderHook(() => useTransactionFilters(base, []));
    act(() => result.current.setFilterType('entrada'));
    const ids = result.current.filtered.map(t => t.id);
    expect(ids).toContain('a');
    expect(ids).toContain('d');
    expect(ids).not.toContain('b');
    expect(ids).not.toContain('c');
  });

  it('filterType saida retorna só saídas', () => {
    const { result } = renderHook(() => useTransactionFilters(base, []));
    act(() => result.current.setFilterType('saida'));
    const ids = result.current.filtered.map(t => t.id);
    expect(ids).toContain('b');
    expect(ids).toContain('c');
    expect(ids).not.toContain('a');
  });

  it('filterType all retorna tudo', () => {
    const { result } = renderHook(() => useTransactionFilters(base, []));
    act(() => result.current.setFilterType('all'));
    expect(result.current.filtered).toHaveLength(4);
  });
});

describe('useTransactionFilters — filtro por categoria', () => {
  it('filtra por categoria exata', () => {
    const { result } = renderHook(() => useTransactionFilters(base, []));
    act(() => result.current.setFilterCat('Alimentação'));
    expect(result.current.filtered).toHaveLength(1);
    expect(result.current.filtered[0]!.id).toBe('b');
  });

  it('categoria vazia retorna todos', () => {
    const { result } = renderHook(() => useTransactionFilters(base, []));
    act(() => result.current.setFilterCat('Alimentação'));
    act(() => result.current.setFilterCat(''));
    expect(result.current.filtered).toHaveLength(4);
  });
});

describe('useTransactionFilters — filtro por origem', () => {
  it('filtra por source csv', () => {
    const { result } = renderHook(() => useTransactionFilters(base, []));
    act(() => result.current.setFilterOrigin('csv'));
    expect(result.current.filtered).toHaveLength(1);
    expect(result.current.filtered[0]!.id).toBe('b');
  });

  it('filtra por source ofx', () => {
    const { result } = renderHook(() => useTransactionFilters(base, []));
    act(() => result.current.setFilterOrigin('ofx'));
    expect(result.current.filtered).toHaveLength(1);
    expect(result.current.filtered[0]!.id).toBe('d');
  });
});

describe('useTransactionFilters — filtro por conciliação', () => {
  it('reconciled retorna somente conciliadas', () => {
    const { result } = renderHook(() => useTransactionFilters(base, []));
    act(() => result.current.setFilterReconciliationStatus('reconciled'));
    expect(result.current.filtered).toHaveLength(1);
    expect(result.current.filtered[0]!.id).toBe('d');
  });

  it('unreconciled (importadas não conciliadas) exclui manuais e conciliadas', () => {
    const txs = [
      tx({ id: 'manual',     source: 'manual' }),
      tx({ id: 'csv-pend',   source: 'csv' }),
      tx({ id: 'csv-rec',    source: 'csv',    reconciliationStatus: 'reconciled' }),
    ];
    const { result } = renderHook(() => useTransactionFilters(txs, []));
    act(() => result.current.setFilterReconciliationStatus('unreconciled'));
    expect(result.current.filtered).toHaveLength(1);
    expect(result.current.filtered[0]!.id).toBe('csv-pend');
  });
});

describe('useTransactionFilters — filtro por valor', () => {
  it('valueMin filtra por valor mínimo em centavos', () => {
    const { result } = renderHook(() => useTransactionFilters(base, []));
    // "100000" BRL = R$ 1000,00 → 100000 centavos
    act(() => result.current.setValueMin('1000'));
    const ids = result.current.filtered.map(t => t.id);
    expect(ids).toContain('a'); // 500000 cents
    expect(ids).toContain('d'); // 200000 cents
    expect(ids).not.toContain('b'); // 15000 cents
    expect(ids).not.toContain('c'); // 4990 cents
  });

  it('valueMax filtra por valor máximo em centavos', () => {
    const { result } = renderHook(() => useTransactionFilters(base, []));
    act(() => result.current.setValueMax('50'));
    const ids = result.current.filtered.map(t => t.id);
    expect(ids).toContain('c'); // R$49,90 = 4990 cents
    expect(ids).not.toContain('a');
    expect(ids).not.toContain('d');
  });

  it('valor mínimo inválido é ignorado (sem filtro)', () => {
    const { result } = renderHook(() => useTransactionFilters(base, []));
    act(() => result.current.setValueMin('abc'));
    expect(result.current.filtered).toHaveLength(4);
  });
});

describe('useTransactionFilters — filtro por data', () => {
  it('dateFrom filtra a partir da data', () => {
    const { result } = renderHook(() => useTransactionFilters(base, []));
    act(() => result.current.setDateFrom('2026-06-01'));
    const ids = result.current.filtered.map(t => t.id);
    expect(ids).toContain('a');
    expect(ids).toContain('b');
    expect(ids).toContain('c');
    expect(ids).not.toContain('d'); // 2026-05-15
  });

  it('dateTo filtra até a data', () => {
    const { result } = renderHook(() => useTransactionFilters(base, []));
    act(() => result.current.setDateTo('2026-06-01'));
    const ids = result.current.filtered.map(t => t.id);
    expect(ids).toContain('a'); // 2026-06-01
    expect(ids).toContain('d'); // 2026-05-15
    expect(ids).not.toContain('b'); // 2026-06-02
    expect(ids).not.toContain('c'); // 2026-06-03
  });
});

describe('useTransactionFilters — ordenação', () => {
  it('date_desc ordena data mais recente primeiro', () => {
    const { result } = renderHook(() => useTransactionFilters(base, []));
    act(() => result.current.setSortBy('date_desc'));
    const dates = result.current.filtered.map(t => t.date);
    expect(dates[0]).toBe('2026-06-03');
    expect(dates[dates.length - 1]).toBe('2026-05-15');
  });

  it('date_asc ordena data mais antiga primeiro', () => {
    const { result } = renderHook(() => useTransactionFilters(base, []));
    act(() => result.current.setSortBy('date_asc'));
    const dates = result.current.filtered.map(t => t.date);
    expect(dates[0]).toBe('2026-05-15');
  });

  it('value_desc ordena maior valor primeiro', () => {
    const { result } = renderHook(() => useTransactionFilters(base, []));
    act(() => result.current.setSortBy('value_desc'));
    expect(result.current.filtered[0]!.id).toBe('a'); // 500000 cents
  });

  it('value_asc ordena menor valor primeiro', () => {
    const { result } = renderHook(() => useTransactionFilters(base, []));
    act(() => result.current.setSortBy('value_asc'));
    expect(result.current.filtered[0]!.id).toBe('c'); // 4990 cents
  });
});

describe('useTransactionFilters — estatísticas', () => {
  it('stats.count retorna total de itens filtrados', () => {
    const { result } = renderHook(() => useTransactionFilters(base, []));
    expect(result.current.stats.count).toBe(4);
  });

  it('stats.totalInCents usa centavos inteiros (sem float)', () => {
    const { result } = renderHook(() => useTransactionFilters(base, []));
    // entradas: 500000 + 200000 = 700000
    expect(result.current.stats.totalInCents).toBe(700000);
    expect(Number.isInteger(result.current.stats.totalInCents)).toBe(true);
  });

  it('stats.totalOutCents usa centavos inteiros', () => {
    const { result } = renderHook(() => useTransactionFilters(base, []));
    // saídas: 15000 + 4990 = 19990
    expect(result.current.stats.totalOutCents).toBe(19990);
    expect(Number.isInteger(result.current.stats.totalOutCents)).toBe(true);
  });

  it('stats.netCents = entradas - saídas', () => {
    const { result } = renderHook(() => useTransactionFilters(base, []));
    expect(result.current.stats.netCents).toBe(700000 - 19990);
  });
});

describe('useTransactionFilters — clearAllFilters', () => {
  it('limpa todos os filtros e retorna estado base', () => {
    const { result } = renderHook(() => useTransactionFilters(base, []));
    act(() => {
      result.current.setSearch('netflix');
      result.current.setFilterType('saida');
      result.current.setFilterCat('Assinaturas');
      result.current.setDateFrom('2026-06-03');
      result.current.setFilterOrigin('manual');
    });
    expect(result.current.filtered).toHaveLength(1);

    act(() => result.current.clearAllFilters());

    expect(result.current.search).toBe('');
    expect(result.current.filterType).toBe('all');
    expect(result.current.filterCat).toBe('');
    expect(result.current.dateFrom).toBe('');
    expect(result.current.filterOrigin).toBe('');
    expect(result.current.filtered).toHaveLength(4);
  });
});

describe('useTransactionFilters — activeFilters', () => {
  it('activeFilters vazio quando nenhum filtro ativo', () => {
    const { result } = renderHook(() => useTransactionFilters(base, []));
    expect(result.current.activeFilters).toHaveLength(0);
  });

  it('activeFilters lista chip para search ativo', () => {
    const { result } = renderHook(() => useTransactionFilters(base, []));
    act(() => result.current.setSearch('netflix'));
    expect(result.current.activeFilters.some(f => f.id === 'search')).toBe(true);
  });

  it('chip de search tem função clear que limpa o filtro', () => {
    const { result } = renderHook(() => useTransactionFilters(base, []));
    act(() => result.current.setSearch('netflix'));
    const chip = result.current.activeFilters.find(f => f.id === 'search');
    act(() => chip?.clear());
    expect(result.current.search).toBe('');
  });
});

describe('useTransactionFilters — catCounts', () => {
  it('catCounts retorna contagem por categoria (sem filtro de cat)', () => {
    const { result } = renderHook(() => useTransactionFilters(base, []));
    expect(result.current.catCounts['Alimentação']).toBe(1);
    expect(result.current.catCounts['Salário']).toBe(1);
  });

  it('catCounts não é afetado pelo filtro de categoria (exibe total real)', () => {
    const { result } = renderHook(() => useTransactionFilters(base, []));
    act(() => result.current.setFilterCat('Alimentação'));
    // mesmo filtrado, catCounts não usa filterCat
    expect(result.current.catCounts['Salário']).toBe(1);
  });
});

describe('useTransactionFilters — loadedDateRange', () => {
  it('retorna min e max das datas carregadas', () => {
    const { result } = renderHook(() => useTransactionFilters(base, []));
    expect(result.current.loadedDateRange?.min).toBe('2026-05-15');
    expect(result.current.loadedDateRange?.max).toBe('2026-06-03');
  });

  it('retorna null para lista vazia', () => {
    const { result } = renderHook(() => useTransactionFilters([], []));
    expect(result.current.loadedDateRange).toBeNull();
  });
});
