import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Centavos } from '../../../shared/types/money';
import type { AntiTarifaRelatorio, TarifaDetectada } from '../../../lib/antiTarifaEngine';
import AntiTarifaPage from '../AntiTarifaPage';

const cents = (value: number): Centavos => value as Centavos;

function tarifa(overrides: Partial<TarifaDetectada>): TarifaDetectada {
  return {
    descricaoNormalizada: 'tarifa pacote',
    descricaoExemplo: 'TARIFA PACOTE SERVICOS',
    meses: ['2026-09', '2026-10', '2026-11'],
    frequencia: 3,
    ultimoValorCents: cents(3990),
    totalCobradoCents: cents(11970),
    projecaoAnualCents: cents(47880),
    risco: 'alto',
    razoes: ['Contém palavra-chave de tarifa bancária'],
    ...overrides,
  };
}

const relatorio: AntiTarifaRelatorio = {
  tarifas: [
    tarifa({}),
    tarifa({ descricaoNormalizada: 'seguro', descricaoExemplo: 'SEGURO CONTA', risco: 'medio' }),
    tarifa({ descricaoNormalizada: 'servico', descricaoExemplo: 'SERVICO X', risco: 'baixo' }),
  ],
  totalEstimadoAnualCents: cents(143640),
  periodoAnalisadoMeses: 12,
  transacoesAnalisadas: 42,
};

vi.mock('../../../hooks/useTransactions', () => ({
  useTransactions: () => ({ transactions: [] }),
}));

vi.mock('../../../lib/antiTarifaEngine', () => ({
  detectarTarifas: () => relatorio,
}));

// Classes de paleta "só claro" que viram blocos brancos/pastel no tema escuro.
const LIGHT_ONLY = /(^|\s|:)(bg-white|bg-gray-50|bg-(red|amber|orange|blue)-(50|100)|text-gray-\d{3})(\s|$)/;

function lightOnlyElements(root: HTMLElement): Element[] {
  return Array.from(root.querySelectorAll('[class]')).filter((el) =>
    LIGHT_ONLY.test(el.getAttribute('class') ?? ''),
  );
}

describe('AntiTarifaPage — tema claro/escuro', () => {
  it('renderiza os 3 cards de resumo com contagens e custo anual', () => {
    render(<AntiTarifaPage uid="u1" />);

    expect(screen.getByRole('heading', { name: 'Agente Anti-Tarifa' })).toHaveClass('text-quantum-fg');
    expect(screen.getByTestId('anti-tarifa-card-alto')).toHaveTextContent('Alto Risco');
    expect(screen.getByTestId('anti-tarifa-card-alto')).toHaveTextContent(/Alto Risco\s*1(?!\d)/);
    expect(screen.getByTestId('anti-tarifa-card-medio')).toHaveTextContent('Médio Risco');
    expect(screen.getByTestId('anti-tarifa-card-custo')).toHaveTextContent('Custo Est. Anual');
  });

  it('mantém a semântica de cor (vermelho = alto, âmbar = médio) com variante dark', () => {
    render(<AntiTarifaPage uid="u1" />);

    expect(screen.getByTestId('anti-tarifa-card-alto').className).toMatch(/bg-red-500\/10/);
    expect(screen.getByTestId('anti-tarifa-card-medio').className).toMatch(/bg-amber-500\/10/);
    expect(screen.getByText('Alto Risco').className).toMatch(/dark:text-red-400/);
    expect(screen.getByText('Médio Risco').className).toMatch(/dark:text-amber-400/);
  });

  it('não usa classes de paleta só-claro, nem com um item expandido', () => {
    const { container } = render(<AntiTarifaPage uid="u1" />);
    expect(lightOnlyElements(container)).toEqual([]);

    fireEvent.click(screen.getByRole('button', { name: /TARIFA PACOTE SERVICOS/ }));
    expect(screen.getByText(/O que fazer:/)).toBeInTheDocument();
    expect(lightOnlyElements(container)).toEqual([]);
  });
});
