import { describe, expect, it } from 'vitest';
import type { FinancialMetrics } from '../hooks/useFinancialMetrics';
import { computeHealthScore, computePillars, nextLevelHint } from './healthScore';

function metrics(overrides: Partial<FinancialMetrics> = {}): FinancialMetrics {
  return {
    receita: 10000,
    despesa: 5000,
    ativos: 0,
    ativosCents: 0,
    passivos: 0,
    patrimonioLiquido: 0,
    custoFixoMensal: 0,
    taxaPoupanca: 0,
    endividamento: 0,
    comprometimento: 0,
    reservaMeses: 0,
    ...overrides,
  };
}

function pillarAt(m: FinancialMetrics, index: number) {
  const pillar = computePillars(m)[index];
  if (!pillar) throw new Error(`pilar ${index} inexistente`);
  return pillar;
}

describe('healthScore — computeHealthScore', () => {
  it('retorna 100 quando todos os pilares estão no máximo', () => {
    const m = metrics({ taxaPoupanca: 30, endividamento: 10, reservaMeses: 6, comprometimento: 20 });

    expect(computeHealthScore(m)).toBe(100);
  });

  it('retorna 0 quando todos os pilares estão no piso', () => {
    const m = metrics({ taxaPoupanca: 0, endividamento: 100, reservaMeses: 0, comprometimento: 100 });

    expect(computeHealthScore(m)).toBe(0);
  });

  it('é sempre igual à soma dos scores dos pilares', () => {
    const samples: Partial<FinancialMetrics>[] = [
      { taxaPoupanca: 22, endividamento: 25, reservaMeses: 4, comprometimento: 30 },
      { taxaPoupanca: 8, endividamento: 55, reservaMeses: 2, comprometimento: 45 },
      { taxaPoupanca: 30, endividamento: 5, reservaMeses: 6, comprometimento: 10 },
      { taxaPoupanca: 3, endividamento: 90, reservaMeses: 0, comprometimento: 80 },
    ];

    for (const sample of samples) {
      const m = metrics(sample);
      const sum = computePillars(m).reduce((acc, p) => acc + p.score, 0);

      expect(computeHealthScore(m)).toBe(sum);
    }
  });
});

describe('healthScore — fronteiras dos pilares', () => {
  it('pontua taxa de poupança nas fronteiras', () => {
    expect(pillarAt(metrics({ taxaPoupanca: 30 }), 0).score).toBe(25);
    expect(pillarAt(metrics({ taxaPoupanca: 20 }), 0).score).toBe(20);
    expect(pillarAt(metrics({ taxaPoupanca: 10 }), 0).score).toBe(12);
    expect(pillarAt(metrics({ taxaPoupanca: 5 }), 0).score).toBe(6);
    expect(pillarAt(metrics({ taxaPoupanca: 4 }), 0).score).toBe(0);
  });

  it('pontua endividamento nas fronteiras', () => {
    expect(pillarAt(metrics({ endividamento: 10 }), 1).score).toBe(25);
    expect(pillarAt(metrics({ endividamento: 30 }), 1).score).toBe(20);
    expect(pillarAt(metrics({ endividamento: 50 }), 1).score).toBe(12);
    expect(pillarAt(metrics({ endividamento: 70 }), 1).score).toBe(6);
    expect(pillarAt(metrics({ endividamento: 71 }), 1).score).toBe(0);
  });

  it('pontua reserva de emergência nas fronteiras', () => {
    expect(pillarAt(metrics({ reservaMeses: 6 }), 2).score).toBe(25);
    expect(pillarAt(metrics({ reservaMeses: 3 }), 2).score).toBe(18);
    expect(pillarAt(metrics({ reservaMeses: 1 }), 2).score).toBe(8);
    expect(pillarAt(metrics({ reservaMeses: 0.5 }), 2).score).toBe(0);
  });

  it('pontua comprometimento nas fronteiras', () => {
    expect(pillarAt(metrics({ comprometimento: 20 }), 3).score).toBe(25);
    expect(pillarAt(metrics({ comprometimento: 35 }), 3).score).toBe(18);
    expect(pillarAt(metrics({ comprometimento: 50 }), 3).score).toBe(8);
    expect(pillarAt(metrics({ comprometimento: 51 }), 3).score).toBe(0);
  });
});

describe('healthScore — nextLevelHint', () => {
  it('retorna a dica do pilar de menor score', () => {
    const m = metrics({ taxaPoupanca: 30, endividamento: 10, reservaMeses: 0, comprometimento: 20 });

    expect(nextLevelHint(m)).toBe('Construa 3 meses de reserva de emergência');
  });

  it('em empate, prioriza o primeiro pilar', () => {
    const m = metrics({ taxaPoupanca: 0, endividamento: 100, reservaMeses: 0, comprometimento: 100 });

    expect(nextLevelHint(m)).toBe('Aumente a poupança para 20% da renda');
  });
});
