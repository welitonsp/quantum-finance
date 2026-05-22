import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { IntelStrip } from './IntelStrip';

describe('IntelStrip', () => {
  it('preserva piso critico quando a meta configurada fica abaixo de 10%', () => {
    render(
      <IntelStrip
        savingsRate={7}
        debtRatio={30}
        goalProgress={100}
        savingsGoalPercent={5}
      />,
    );

    expect(screen.getByText('Poupança Crítica')).toBeDefined();
    expect(screen.queryByText('Poupança Sólida')).toBeNull();
  });

  it('mantem retencao baixa como critica com meta padrao', () => {
    render(
      <IntelStrip
        savingsRate={7}
        debtRatio={30}
        goalProgress={35}
        savingsGoalPercent={20}
      />,
    );

    expect(screen.getByText('Poupança Crítica')).toBeDefined();
    expect(screen.getByText(/meta mínima: 20%/i)).toBeDefined();
  });

  it('mostra poupanca solida quando passa do piso critico e bate a meta', () => {
    render(
      <IntelStrip
        savingsRate={12}
        debtRatio={30}
        goalProgress={100}
        savingsGoalPercent={10}
      />,
    );

    expect(screen.getByText('Poupança Sólida')).toBeDefined();
  });

  it('mostra estado intermediario quando passa do piso critico mas fica abaixo da meta', () => {
    render(
      <IntelStrip
        savingsRate={12}
        debtRatio={30}
        goalProgress={60}
        savingsGoalPercent={20}
      />,
    );

    expect(screen.getByText('Poupança Moderada')).toBeDefined();
    expect(screen.getByText(/amplie para 20%/i)).toBeDefined();
  });

  it('mostra a meta percentual real no alerta critico', () => {
    render(
      <IntelStrip
        savingsRate={5}
        debtRatio={30}
        goalProgress={14}
        savingsGoalPercent={35}
      />,
    );

    expect(screen.getByText(/meta mínima: 35%/i)).toBeDefined();
  });

  it('nao mantem texto hardcoded de 20% quando a meta real e diferente', () => {
    render(
      <IntelStrip
        savingsRate={12}
        debtRatio={30}
        goalProgress={34}
        savingsGoalPercent={35}
      />,
    );

    expect(screen.getByText(/amplie para 35%/i)).toBeDefined();
    expect(screen.queryByText(/amplie para 20%/i)).toBeNull();
  });
});
