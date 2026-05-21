import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { IntelStrip } from './IntelStrip';

describe('IntelStrip', () => {
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
