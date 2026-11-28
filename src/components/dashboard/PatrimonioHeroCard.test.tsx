import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PatrimonioHeroCard, formatReservaMeses } from './PatrimonioHeroCard';
import type { FinancialMetrics } from '../../hooks/useFinancialMetrics';

function metrics(over: Partial<FinancialMetrics> = {}): FinancialMetrics {
  return {
    receita: 0,
    despesa: 0,
    ativos: 1000,
    ativosCents: 100_000,
    passivos: 0,
    patrimonioLiquido: 1000,
    custoFixoMensal: 0,
    taxaPoupanca: 0,
    endividamento: 0,
    comprometimento: 0,
    reservaMeses: 0,
    ...over,
  };
}

const norm = (s: string | null | undefined) => (s ?? '').replace(/\s/g, ' ');

describe('formatReservaMeses', () => {
  it('usa "mês" no singular e "meses" no plural, nunca "m"', () => {
    expect(formatReservaMeses(1)).toBe('1,0 mês');
    expect(formatReservaMeses(2.5)).toBe('2,5 meses');
    expect(formatReservaMeses(0.5)).toBe('0,5 meses');
  });
});

describe('PatrimonioHeroCard', () => {
  it('mostra a reserva em meses por extenso', () => {
    render(<PatrimonioHeroCard metrics={metrics({ reservaMeses: 3.2 })} loading={false} />);
    expect(norm(screen.getByText(/Reserva/).textContent)).toContain('Reserva 3,2 meses');
  });

  it('esconde a reserva quando é zero', () => {
    render(<PatrimonioHeroCard metrics={metrics({ reservaMeses: 0 })} loading={false} />);
    expect(screen.queryByText(/Reserva/)).not.toBeInTheDocument();
  });

  it('mostra passivos só quando existem', () => {
    const { rerender } = render(<PatrimonioHeroCard metrics={metrics()} loading={false} />);
    expect(screen.queryByText(/Passivos/)).not.toBeInTheDocument();
    rerender(<PatrimonioHeroCard metrics={metrics({ passivos: 200, patrimonioLiquido: 800 })} loading={false} />);
    expect(screen.getByText(/Passivos/)).toBeInTheDocument();
  });
});
