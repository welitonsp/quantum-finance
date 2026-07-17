import { describe, it, expect } from 'vitest';
import { computePillars, computeHealthScore, nextLevelHint } from './healthScore';
import type { FinancialMetrics } from '../hooks/useFinancialMetrics';

// Helper: monta FinancialMetrics de teste. Só os 4 campos dos pilares importam;
// os demais recebem defaults neutros (receita/despesa > 0 para exibir valores).
function metrics(over: Partial<FinancialMetrics> = {}): FinancialMetrics {
  return {
    receita:           10000,
    despesa:           5000,
    ativos:            0,
    ativosCents:       0,
    passivos:          0,
    patrimonioLiquido: 0,
    custoFixoMensal:   0,
    taxaPoupanca:      0,
    endividamento:     0,
    comprometimento:   0,
    reservaMeses:      0,
    ...over,
  };
}

describe('healthScore — computeHealthScore', () => {
  it('score 100 quando todos os pilares estão no máximo', () => {
    const m = metrics({ taxaPoupanca: 30, endividamento: 10, reservaMeses: 6, comprometimento: 20 });
    expect(computeHealthScore(m)).toBe(100);
  });

  it('score 0 quando todos os pilares estão no piso', () => {
    const m = metrics({ taxaPoupanca: 0, endividamento: 100, reservaMeses: 0, comprometimento: 100 });
    expect(computeHealthScore(m)).toBe(0);
  });

  it('é sempre igual à soma dos scores dos pilares', () => {
    const samples: Partial<FinancialMetrics>[] = [
      { taxaPoupanca: 22, endividamento: 25, reservaMeses: 4, comprometimento: 30 },
      { taxaPoupanca: 8,  endividamento: 55, reservaMeses: 2, comprometimento: 45 },
      { taxaPoupanca: 30, endividamento: 5,  reservaMeses: 6, comprometimento: 10 },
      { taxaPoupanca: 3,  endividamento: 90, reservaMeses: 0, comprometimento: 80 },
    ];
    for (const s of samples) {
      const m = metrics(s);
      const sum = computePillars(m).reduce((acc, p) => acc + p.score, 0);
      expect(computeHealthScore(m)).toBe(sum);
    }
  });
});

// Acesso a pilar por índice com asserção — satisfaz noUncheckedIndexedAccess.
function pillarAt(m: FinancialMetrics, i: number) {
  const p = computePillars(m)[i];
  if (!p) throw new Error(`pilar ${i} inexistente`);
  return p;
}

describe('healthScore — pilar Taxa de Poupança (fronteiras)', () => {
  const scoreOf = (taxaPoupanca: number) => pillarAt(metrics({ taxaPoupanca }), 0).score;
  it('30% → 25', () => expect(scoreOf(30)).toBe(25));
  it('20% → 20', () => expect(scoreOf(20)).toBe(20));
  it('10% → 12', () => expect(scoreOf(10)).toBe(12));
  it('5% → 6',   () => expect(scoreOf(5)).toBe(6));
  it('4% → 0',   () => expect(scoreOf(4)).toBe(0));
});

describe('healthScore — pilar Endividamento (fronteiras)', () => {
  const scoreOf = (endividamento: number) => pillarAt(metrics({ endividamento }), 1).score;
  it('10% → 25', () => expect(scoreOf(10)).toBe(25));
  it('30% → 20', () => expect(scoreOf(30)).toBe(20));
  it('50% → 12', () => expect(scoreOf(50)).toBe(12));
  it('70% → 6',  () => expect(scoreOf(70)).toBe(6));
  it('71% → 0',  () => expect(scoreOf(71)).toBe(0));
});

describe('healthScore — pilar Reserva de Emergência (fronteiras)', () => {
  const scoreOf = (reservaMeses: number) => pillarAt(metrics({ reservaMeses }), 2).score;
  it('6 meses → 25', () => expect(scoreOf(6)).toBe(25));
  it('3 meses → 18', () => expect(scoreOf(3)).toBe(18));
  it('1 mês → 8',    () => expect(scoreOf(1)).toBe(8));
  it('0.5 mês → 0',  () => expect(scoreOf(0.5)).toBe(0));
});

describe('healthScore — pilar Comprometimento (fronteiras)', () => {
  const scoreOf = (comprometimento: number) => pillarAt(metrics({ comprometimento }), 3).score;
  it('20% → 25', () => expect(scoreOf(20)).toBe(25));
  it('35% → 18', () => expect(scoreOf(35)).toBe(18));
  it('50% → 8',  () => expect(scoreOf(50)).toBe(8));
  it('51% → 0',  () => expect(scoreOf(51)).toBe(0));
});

describe('healthScore — status por pilar', () => {
  it('classifica great/ok/warn/critical na taxa de poupança', () => {
    expect(pillarAt(metrics({ taxaPoupanca: 25 }), 0).status).toBe('great');
    expect(pillarAt(metrics({ taxaPoupanca: 15 }), 0).status).toBe('ok');
    expect(pillarAt(metrics({ taxaPoupanca: 7 }), 0).status).toBe('warn');
    expect(pillarAt(metrics({ taxaPoupanca: 2 }), 0).status).toBe('critical');
  });
});

describe('healthScore — nextLevelHint', () => {
  it('retorna a dica do pilar de menor score', () => {
    // Reserva no piso (0) é o menor → hint de reserva.
    const m = metrics({ taxaPoupanca: 30, endividamento: 10, reservaMeses: 0, comprometimento: 20 });
    expect(nextLevelHint(m)).toBe('Construa 3 meses de reserva de emergência');
  });

  it('em empate no menor score, prioriza o primeiro pilar (poupança)', () => {
    // Todos no piso: poupança=0, endividamento=0, reserva=0, comprometimento=0.
    const m = metrics({ taxaPoupanca: 0, endividamento: 100, reservaMeses: 0, comprometimento: 100 });
    expect(nextLevelHint(m)).toBe('Aumente a poupança para 20% da renda');
  });

  it('aponta o endividamento quando é o único fraco', () => {
    const m = metrics({ taxaPoupanca: 30, endividamento: 100, reservaMeses: 6, comprometimento: 20 });
    expect(nextLevelHint(m)).toBe('Reduza dívidas abaixo de 30% do patrimônio');
  });

  it('aponta o comprometimento quando é o único fraco', () => {
    const m = metrics({ taxaPoupanca: 30, endividamento: 10, reservaMeses: 6, comprometimento: 100 });
    expect(nextLevelHint(m)).toBe('Reduza custos fixos abaixo de 35% da renda');
  });
});
