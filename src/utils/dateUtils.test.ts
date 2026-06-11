import { describe, it, expect } from 'vitest';
import { computeCompetencia } from './dateUtils';

describe('computeCompetencia', () => {
  it('compra no dia 10, closing dia 15: competência = mês da compra', () => {
    expect(computeCompetencia('2024-03-10', 15, 0)).toBe('2024-03');
  });

  it('compra no dia 20, closing dia 15: competência = mês seguinte', () => {
    expect(computeCompetencia('2024-03-20', 15, 0)).toBe('2024-04');
  });

  it('compra em 2024-12-20, closing dia 15: competência = 2025-01', () => {
    expect(computeCompetencia('2024-12-20', 15, 0)).toBe('2025-01');
  });

  it('parcela 2 (index=1) com compra antes do closing: competência = mês da compra + 1', () => {
    expect(computeCompetencia('2024-03-10', 15, 1)).toBe('2024-04');
  });

  it('parcela 2 (index=1) com compra depois do closing: competência = mês seguinte + 1', () => {
    expect(computeCompetencia('2024-03-20', 15, 1)).toBe('2024-05');
  });

  it('compra no dia 15 exato com closing dia 15: competência = mês seguinte (>= caso)', () => {
    expect(computeCompetencia('2024-03-15', 15, 0)).toBe('2024-04');
  });

  it('compra em dezembro no closing: virada de ano correta', () => {
    expect(computeCompetencia('2024-12-15', 15, 0)).toBe('2025-01');
  });

  it('parcela 3 (index=2) com compra em novembro depois do closing: competência = 2025-02', () => {
    expect(computeCompetencia('2024-11-20', 15, 2)).toBe('2025-02');
  });

  it('compra no dia 1 com closing dia 1: competência = mês seguinte (>= caso)', () => {
    expect(computeCompetencia('2024-03-01', 1, 0)).toBe('2024-04');
  });

  it('compra no dia 1 com closing dia 2: competência = mês da compra', () => {
    expect(computeCompetencia('2024-03-01', 2, 0)).toBe('2024-03');
  });
});
