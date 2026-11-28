import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const toastFn = vi.hoisted(() => Object.assign(vi.fn(), { error: vi.fn() }));
vi.mock('react-hot-toast', () => ({ default: toastFn }));

import BudgetProgress from './BudgetProgress';

const noop = () => {};

beforeEach(() => {
  toastFn.mockClear();
  toastFn.error.mockClear();
});

describe('BudgetProgress — bordas de arredondamento', () => {
  it('99,96% aparece como 100,0% e já conta como teto atingido', () => {
    render(<BudgetProgress totalExpenses={999.6} monthlyGoal={1000} onSetGoal={noop} />);
    expect(screen.getByText('100,0%')).toBeInTheDocument();
    expect(screen.getByText(/Limite mensal excedido/)).toBeInTheDocument();
    expect(toastFn.error).toHaveBeenCalledTimes(1);
  });

  it('79,96% aparece como 80,0% e dispara o aviso de 80%', () => {
    render(<BudgetProgress totalExpenses={799.6} monthlyGoal={1000} onSetGoal={noop} />);
    expect(screen.getByText('80,0%')).toBeInTheDocument();
    expect(screen.queryByText(/Limite mensal excedido/)).not.toBeInTheDocument();
    expect(toastFn).toHaveBeenCalledTimes(1);
    expect(toastFn.error).not.toHaveBeenCalled();
  });

  it('abaixo de 80% não avisa nada', () => {
    render(<BudgetProgress totalExpenses={500} monthlyGoal={1000} onSetGoal={noop} />);
    expect(screen.getByText('50,0%')).toBeInTheDocument();
    expect(toastFn).not.toHaveBeenCalled();
    expect(toastFn.error).not.toHaveBeenCalled();
  });

  it('sem meta mostra o convite para definir limite, sem percentual', () => {
    render(<BudgetProgress totalExpenses={500} monthlyGoal={0} onSetGoal={noop} />);
    expect(screen.getByText('Definir Limite')).toBeInTheDocument();
    expect(screen.queryByText(/%$/)).not.toBeInTheDocument();
  });
});
