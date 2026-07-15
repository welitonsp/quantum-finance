import { describe, it, expect } from 'vitest';
import { runMonteCarloSimulation } from '../forecastMonteCarlo';
import type { ForecastMCInput } from '../forecastMonteCarlo';

describe('runMonteCarloSimulation', () => {
  const baseline: ForecastMCInput = {
    currentBalance: 1000,
    burnRate: 100,
    expectedIncome: 90,
    volatility: 30,
  };

  it('is deterministic — same input yields identical output on every call', () => {
    const a = runMonteCarloSimulation(baseline);
    const b = runMonteCarloSimulation(baseline);
    expect(a).toEqual(b);
    expect(a.p50).toBe(b.p50);
    expect(a.survivalRate).toBe(b.survivalRate);
  });

  it('always returns success: true for finite inputs', () => {
    expect(runMonteCarloSimulation(baseline).success).toBe(true);
  });

  it('returns monotone percentiles p5 <= p10 <= p50 <= p90 <= p95', () => {
    const r = runMonteCarloSimulation(baseline);
    expect(r.p5).toBeLessThanOrEqual(r.p10);
    expect(r.p10).toBeLessThanOrEqual(r.p50);
    expect(r.p50).toBeLessThanOrEqual(r.p90);
    expect(r.p90).toBeLessThanOrEqual(r.p95);
  });

  it('has survivalRate + ruinProbability === 100', () => {
    const r = runMonteCarloSimulation(baseline);
    expect(r.survivalRate + r.ruinProbability).toBe(100);
  });

  it('keeps survivalRate within [0, 100]', () => {
    const r = runMonteCarloSimulation(baseline);
    expect(r.survivalRate).toBeGreaterThanOrEqual(0);
    expect(r.survivalRate).toBeLessThanOrEqual(100);
  });

  it('handles zero volatility internally without crashing', () => {
    const r = runMonteCarloSimulation({ ...baseline, volatility: 0 });
    expect(r.success).toBe(true);
    expect(r.survivalRate + r.ruinProbability).toBe(100);
    expect(r.p5).toBeLessThanOrEqual(r.p95);
  });

  it('reports survivalRate near 100 for a healthy scenario (high income, low burn)', () => {
    const r = runMonteCarloSimulation({
      currentBalance: 10000,
      burnRate: 10,
      expectedIncome: 100,
      volatility: 5,
    });
    expect(r.survivalRate).toBeGreaterThanOrEqual(95);
  });

  it('reports survivalRate near 0 for a ruin scenario (negative start, high burn)', () => {
    const r = runMonteCarloSimulation({
      currentBalance: -5000,
      burnRate: 500,
      expectedIncome: 50,
      volatility: 20,
    });
    expect(r.survivalRate).toBeLessThanOrEqual(5);
  });
});
