import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Activity } from 'lucide-react';

vi.mock('react-countup', () => ({ default: ({ end }: { end: number }) => <span>{String(end)}</span> }));
vi.mock('../SparkLine', () => ({ SparkLine: () => null }));
vi.mock('../HealthGauge', () => ({ HealthGauge: () => <div data-testid="gauge" /> }));

import { DashboardHero } from './DashboardHero';

function renderHero(incomeDelta: number, score: number | null = 70) {
  return render(
    <DashboardHero
      saldo={0}
      receitas={0}
      despesas={0}
      incomeDelta={incomeDelta}
      score={score}
      color="emerald"
      status="Saudável"
      rec="ok"
      glowColor=""
      badgeColor=""
      StatusIcon={Activity}
      txSet={[]}
      onNewTransaction={() => {}}
    />,
  );
}

const badge = () => screen.getByText(/retidos/);

describe('DashboardHero — retenção arredondada', () => {
  it('−0,04% aparece como 0,0% e não fica vermelho', () => {
    renderHero(-0.04);
    expect(badge().textContent).toContain('0,0%');
    expect(badge().className).toContain('text-emerald-400');
    expect(badge().className).not.toContain('text-red-400');
  });

  it('retenção negativa real fica vermelha, sem sinal duplicado', () => {
    renderHero(-12.34);
    expect(badge().textContent).toContain('12,3%');
    expect(badge().textContent).not.toContain('-');
    expect(badge().className).toContain('text-red-400');
  });

  it('99,96% aparece como 100,0%', () => {
    renderHero(99.96);
    expect(badge().textContent).toContain('100,0%');
    expect(badge().className).toContain('text-emerald-400');
  });

  it('sem score não mostra a retenção', () => {
    renderHero(10, null);
    expect(screen.queryByText(/retidos/)).not.toBeInTheDocument();
    expect(screen.getByText('Sem dados ainda:')).toBeInTheDocument();
  });
});
