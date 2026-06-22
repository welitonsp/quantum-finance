import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  PageHeader,
  DashboardSection,
  MetricCard,
  FinancialCard,
  ChartCard,
  ChartSelector,
  TopTabs,
  BottomSheet,
  ContextualAIButton,
} from '../index';
import type { Centavos } from '../../../types/money';

describe('PR 2 — primitivos de layout', () => {
  it('PageHeader renderiza título e subtítulo', () => {
    render(<PageHeader title="Análises" subtitle="Visão geral" />);
    expect(screen.getByRole('heading', { name: 'Análises' })).toBeTruthy();
    expect(screen.getByText('Visão geral')).toBeTruthy();
  });

  it('DashboardSection recolhe e expande o conteúdo', () => {
    render(
      <DashboardSection title="Orçamentos" collapsible>
        <p>conteúdo interno</p>
      </DashboardSection>,
    );
    expect(screen.getByText('conteúdo interno')).toBeTruthy();
    const toggle = screen.getByRole('button', { name: /Recolher Orçamentos/i });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(toggle);
    expect(screen.queryByText('conteúdo interno')).toBeNull();
  });

  it('MetricCard exibe valor e variação', () => {
    render(<MetricCard label="Taxa" value="42" deltaPct={-3.2} />);
    expect(screen.getByText('42')).toBeTruthy();
    expect(screen.getByText('3.2%')).toBeTruthy();
  });

  it('FinancialCard formata centavos como BRL', () => {
    render(<FinancialCard label="Saldo" cents={123456 as Centavos} />);
    expect(screen.getByText(/1\.234,56/)).toBeTruthy();
  });

  it('FinancialCard respeita o modo privacidade', () => {
    render(<FinancialCard label="Saldo" cents={123456 as Centavos} hidden />);
    expect(screen.getByText('••••')).toBeTruthy();
  });

  it('ChartCard expõe alternativa textual (role=img + aria-label)', () => {
    render(
      <ChartCard title="Gastos" summary="Maior gasto em Alimentação">
        <div data-testid="chart">[chart]</div>
      </ChartCard>,
    );
    const img = screen.getByRole('img', { name: /Gastos\. Maior gasto em Alimentação/ });
    expect(img).toBeTruthy();
    expect(screen.getByTestId('chart')).toBeTruthy();
  });

  it('ChartSelector aciona onChange com a opção escolhida', () => {
    const onChange = vi.fn();
    render(
      <ChartSelector
        value="a"
        onChange={onChange}
        options={[{ value: 'a', label: 'Alfa' }, { value: 'b', label: 'Beta' }]}
      />,
    );
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'b' } });
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('TopTabs tem semântica tablist/tab e navega por teclado', () => {
    const onChange = vi.fn();
    render(
      <TopTabs
        activeId="x"
        onChange={onChange}
        tabs={[{ id: 'x', label: 'X' }, { id: 'y', label: 'Y' }]}
      />,
    );
    expect(screen.getByRole('tablist')).toBeTruthy();
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(2);
    expect(tabs[0]!.getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(tabs[0]!, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledWith('y');
  });

  it('ContextualAIButton abre um BottomSheet com o conteúdo de IA ao clicar', () => {
    render(
      <ContextualAIButton label="Explicar com IA" title="Insights">
        <p>conteúdo gerado pela IA</p>
      </ContextualAIButton>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Explicar com IA/i }));
    const dialog = screen.getByRole('dialog', { name: 'Insights' });
    expect(dialog).toBeTruthy();
    expect(screen.getByText('conteúdo gerado pela IA')).toBeTruthy();
  });

  it('BottomSheet não renderiza fechado e renderiza como dialog aberto', () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <BottomSheet open={false} onClose={onClose} title="Filtros"><p>corpo</p></BottomSheet>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    rerender(<BottomSheet open onClose={onClose} title="Filtros"><p>corpo</p></BottomSheet>);
    expect(screen.getByRole('dialog', { name: 'Filtros' })).toBeTruthy();
  });
});
