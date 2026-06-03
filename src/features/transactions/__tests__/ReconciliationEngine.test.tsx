import React from 'react';
import { fireEvent, render, screen, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Transaction } from '../../../shared/types/transaction';
import type { Centavos } from '../../../shared/types/money';

// ─── Mock framer-motion — sem animações em jsdom ──────────────────────────────

vi.mock('framer-motion', async () => {
  const { createElement, forwardRef } = await import('react');
  const makeEl = (tag: string) =>
    forwardRef(function MockMotion(
      { children, animate, initial, exit, transition, whileHover, whileTap, variants, custom, ...props }:
        Record<string, unknown> & { children?: React.ReactNode },
      ref: React.Ref<unknown>,
    ) {
      void animate; void initial; void exit; void transition;
      void whileHover; void whileTap; void variants; void custom;
      return createElement(tag, { ...props, ref: ref as React.Ref<never> }, children);
    });
  return {
    motion:          { div: makeEl('div'), button: makeEl('button'), span: makeEl('span') },
    AnimatePresence: ({ children }: { children?: React.ReactNode }) =>
      createElement(React.Fragment, null, children),
  };
});

vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

// ─── Import após mocks ────────────────────────────────────────────────────────

import ReconciliationEngine, { findMergeCandidate } from '../ReconciliationEngine';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const cents = (n: number): Centavos => n as Centavos;

function tx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id:            'tx-1',
    description:   'Salário Janeiro',
    value_cents:   cents(500000),
    type:          'entrada',
    category:      'Salário',
    date:          '2026-06-01',
    schemaVersion: 2,
    ...overrides,
  } as Transaction;
}

function renderEngine(
  queue:                Transaction[],
  existingTransactions: Transaction[] = [],
  onComplete:           (...args: unknown[]) => unknown = vi.fn(),
  onCancel:             (...args: unknown[]) => unknown = vi.fn(),
) {
  return render(
    <ReconciliationEngine
      queue={queue}
      existingTransactions={existingTransactions}
      onComplete={onComplete as (resolved: Transaction[]) => void}
      onCancel={onCancel as () => void}
    />,
  );
}

// ─── Testes ───────────────────────────────────────────────────────────────────

describe('ReconciliationEngine — estrutura e ARIA', () => {
  it('renderiza com role="dialog" e aria-modal="true"', () => {
    renderEngine([tx()]);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('aria-labelledby aponta para o título "Reconciliação"', () => {
    renderEngine([tx()]);
    const dialog  = screen.getByRole('dialog');
    const labelId = dialog.getAttribute('aria-labelledby');
    expect(document.getElementById(labelId!)).toHaveTextContent('Reconciliação');
  });

  it('exibe barra de progresso com aria-valuemin e aria-valuemax', () => {
    renderEngine([tx()]);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '1');
    expect(bar).toHaveAttribute('aria-valuenow', '0');
  });

  it('progressbar reflete o número total de itens na fila', () => {
    renderEngine([tx({ id: 'a' }), tx({ id: 'b' }), tx({ id: 'c' })]);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '3');
  });
});

describe('ReconciliationEngine — card de transação', () => {
  it('exibe a descrição da transação atual', () => {
    renderEngine([tx({ description: 'Aluguel Apartamento' })]);
    expect(screen.getByText('Aluguel Apartamento')).toBeInTheDocument();
  });

  it('exibe sinal positivo (+) para transação de entrada', () => {
    renderEngine([tx({ type: 'entrada', value_cents: cents(100000) })]);
    // A região aria-live sr-only anuncia com sinal
    expect(document.body.textContent).toMatch(/\+/);
  });

  it('exibe sinal negativo (-) para transação de saída', () => {
    renderEngine([tx({ type: 'saida', value_cents: cents(25050) })]);
    expect(document.body.textContent).toMatch(/-/);
  });

  it('exibe os três botões de ação: Aprovar, Ignorar e Conciliar', () => {
    renderEngine([tx()]);
    expect(screen.getByTitle(/Aprovar/)).toBeInTheDocument();
    expect(screen.getByTitle(/Ignorar/)).toBeInTheDocument();
    expect(screen.getByTitle(/Conciliar/)).toBeInTheDocument();
  });

  it('exibe o botão de cancelar importação', () => {
    renderEngine([tx()]);
    expect(screen.getByRole('button', { name: 'Cancelar importação' })).toBeInTheDocument();
  });

  it('exibe indicação de "sem correspondência" quando não há candidato de merge', () => {
    renderEngine([tx()], []);
    expect(screen.getByText(/Sem correspondência provável/)).toBeInTheDocument();
  });

  it('exibe candidato de merge quando há correspondência na lista existente', () => {
    const existing = tx({ id: 'ex-1', description: 'Salário Existente', date: '2026-06-01', value_cents: cents(500000) });
    const imported = tx({ id: 'imp-1', description: 'Salário Importado', date: '2026-06-01', value_cents: cents(500000) });
    renderEngine([imported], [existing]);
    expect(screen.getByText('Correspondência')).toBeInTheDocument();
    expect(screen.getByText('Exato')).toBeInTheDocument();
  });
});

describe('ReconciliationEngine — ações sobre a fila', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('Aprovar avança a fila (progressbar aria-valuenow aumenta)', () => {
    renderEngine([
      tx({ id: 'a', description: 'Salário' }),
      tx({ id: 'b', description: 'Freelance' }),
    ]);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');

    fireEvent.click(screen.getByTitle(/Aprovar/));

    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
    expect(screen.getByText('Freelance')).toBeInTheDocument();
  });

  it('Ignorar avança a fila sem contabilizar como aprovada', () => {
    renderEngine([
      tx({ id: 'a', description: 'Compra X' }),
      tx({ id: 'b', description: 'Compra Y' }),
    ]);

    fireEvent.click(screen.getByTitle(/Ignorar/));

    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
    expect(screen.getByText('Compra Y')).toBeInTheDocument();
  });

  it('Cancelar chama onCancel', () => {
    const onCancel = vi.fn();
    renderEngine([tx()], [], vi.fn(), onCancel);

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar importação' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('Escape chama onCancel', () => {
    const onCancel = vi.fn();
    renderEngine([tx()], [], vi.fn(), onCancel);

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('exibe DoneScreen após esgotar a fila com Aprovar', async () => {
    renderEngine([tx({ id: 'single' })]);

    fireEvent.click(screen.getByTitle(/Aprovar/));
    await act(async () => { vi.advanceTimersByTime(400); });

    expect(screen.getByText('Reconciliação Concluída')).toBeInTheDocument();
  });

  it('exibe DoneScreen após esgotar a fila com Ignorar', async () => {
    renderEngine([tx({ id: 'single' })]);

    fireEvent.click(screen.getByTitle(/Ignorar/));
    await act(async () => { vi.advanceTimersByTime(400); });

    expect(screen.getByText('Reconciliação Concluída')).toBeInTheDocument();
  });

  it('DoneScreen exibe stats de aprovadas e descartadas', async () => {
    renderEngine([
      tx({ id: 'a', description: 'Aprovada' }),
      tx({ id: 'b', description: 'Descartada' }),
    ]);

    fireEvent.click(screen.getByTitle(/Aprovar/));
    fireEvent.click(screen.getByTitle(/Ignorar/));
    await act(async () => { vi.advanceTimersByTime(400); });

    expect(screen.getByText('Reconciliação Concluída')).toBeInTheDocument();
    expect(screen.getByText('Aprovadas').closest('div')).toHaveTextContent('1');
    expect(screen.getByText('Descartadas').closest('div')).toHaveTextContent('1');
    expect(screen.getByText('Conciliadas').closest('div')).toHaveTextContent('0');
  });

  it('DoneScreen botão Guardar chama onComplete com lista de resolved', async () => {
    const onComplete = vi.fn();
    renderEngine([tx({ id: 'single', description: 'Salário' })], [], onComplete);

    fireEvent.click(screen.getByTitle(/Aprovar/));
    await act(async () => { vi.advanceTimersByTime(400); });

    fireEvent.click(screen.getByRole('button', { name: /Guardar/ }));

    expect(onComplete).toHaveBeenCalledTimes(1);
    const [resolved] = onComplete.mock.calls[0] as [Transaction[]];
    expect(resolved).toHaveLength(1);
    expect(resolved[0]!.id).toBe('single');
  });

  it('DoneScreen botão Cancelar e descartar chama onCancel', async () => {
    const onCancel = vi.fn();
    renderEngine([tx({ id: 'single' })], [], vi.fn(), onCancel);

    fireEvent.click(screen.getByTitle(/Aprovar/));
    await act(async () => { vi.advanceTimersByTime(400); });

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar e descartar tudo' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe('ReconciliationEngine — teclado', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('ArrowLeft equivale a Aprovar', () => {
    renderEngine([
      tx({ id: 'a', description: 'Via Teclado' }),
      tx({ id: 'b', description: 'Segunda' }),
    ]);

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowLeft' });
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
    expect(screen.getByText('Segunda')).toBeInTheDocument();
  });

  it('Delete equivale a Ignorar', () => {
    renderEngine([
      tx({ id: 'a', description: 'Ignorada via Del' }),
      tx({ id: 'b', description: 'Próxima' }),
    ]);

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Delete' });
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
    expect(screen.getByText('Próxima')).toBeInTheDocument();
  });

  it('teclas de ação ignoradas quando isDone=true', async () => {
    const onCancel = vi.fn();
    renderEngine([tx({ id: 'single' })], [], vi.fn(), onCancel);

    // Esgota a fila
    fireEvent.click(screen.getByTitle(/Aprovar/));
    await act(async () => { vi.advanceTimersByTime(400); });
    expect(screen.getByText('Reconciliação Concluída')).toBeInTheDocument();

    // ArrowLeft após isDone não deve chamar onCancel nem quebrar
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowLeft' });
    expect(onCancel).not.toHaveBeenCalled();
  });
});

// ─── findMergeCandidate — lógica pura ────────────────────────────────────────

describe('findMergeCandidate — lógica de correspondência', () => {
  const base = tx({ id: 'import', date: '2026-06-01', value_cents: cents(100000) });

  it('retorna null com lista vazia', () => {
    expect(findMergeCandidate(base, [])).toBeNull();
  });

  it('retorna null quando data difere mais de 3 dias', () => {
    const old = tx({ id: 'old', date: '2026-05-26', value_cents: cents(100000) });
    expect(findMergeCandidate(base, [old])).toBeNull();
  });

  it('retorna null quando valor difere mais de 1%', () => {
    const different = tx({ id: 'diff', date: '2026-06-01', value_cents: cents(105000) });
    expect(findMergeCandidate(base, [different])).toBeNull();
  });

  it('retorna candidato "Exato" para data e valor idênticos', () => {
    const match = tx({ id: 'existing', date: '2026-06-01', value_cents: cents(100000) });
    const result = findMergeCandidate(base, [match]);
    expect(result).not.toBeNull();
    expect(result!.confidenceLabel).toBe('Exato');
    expect(result!.reasons).toContain('Valor exato');
    expect(result!.reasons).toContain('Data igual');
  });

  it('retorna candidato "Alto" para 1 dia de diferença', () => {
    const close = tx({ id: 'close', date: '2026-05-31', value_cents: cents(100000) });
    const result = findMergeCandidate(base, [close]);
    expect(result).not.toBeNull();
    expect(result!.confidenceLabel).toBe('Alto');
  });

  it('retorna candidato "Médio" para 2–3 dias de diferença', () => {
    const close = tx({ id: 'close', date: '2026-05-29', value_cents: cents(100000) });
    const result = findMergeCandidate(base, [close]);
    expect(result).not.toBeNull();
    expect(result!.confidenceLabel).toBe('Médio');
  });

  it('seleciona o primeiro candidato válido na ordem do array', () => {
    const first  = tx({ id: 'first',  date: '2026-06-01', value_cents: cents(100000) });
    const second = tx({ id: 'second', date: '2026-06-01', value_cents: cents(100000) });
    const result = findMergeCandidate(base, [first, second]);
    expect(result!.transaction.id).toBe('first');
  });

  it('o pctDiff está dentro de 1% para valores próximos', () => {
    const close = tx({ id: 'near', date: '2026-06-01', value_cents: cents(100500) });
    const result = findMergeCandidate(base, [close]);
    expect(result).not.toBeNull();
    expect(result!.pctDiff).toBeLessThanOrEqual(0.01);
  });
});
