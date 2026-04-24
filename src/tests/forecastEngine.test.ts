// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  runMonteCarloSimulation,
  type ForecastMCInput,
} from '../features/simulation/forecastMonteCarlo';

// ─── Fixture base ─────────────────────────────────────────────────────────────
// Balance generoso para que os testes de propriedade não dependam de cenário
// específico (cobertura neutra — nem muito otimista, nem pessimista).

const BASE: ForecastMCInput = {
  currentBalance: 5_000,
  burnRate:       50,
  expectedIncome: 0,
  volatility:     20,
};

const run = (override: Partial<ForecastMCInput> = {}): ReturnType<typeof runMonteCarloSimulation> =>
  runMonteCarloSimulation({ ...BASE, ...override });

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('Motor Monte Carlo — Garantias Matemáticas', () => {

  // ── 1. Ordem dos percentis ─────────────────────────────────────────────────
  it('1 — P5 ≤ P10 ≤ P50 ≤ P90 ≤ P95', () => {
    const r = run();
    expect(r.p5).toBeLessThanOrEqual(r.p10);
    expect(r.p10).toBeLessThanOrEqual(r.p50);
    expect(r.p50).toBeLessThanOrEqual(r.p90);
    expect(r.p90).toBeLessThanOrEqual(r.p95);
  });

  // ── 2. Ausência de valores inválidos ──────────────────────────────────────
  it('2 — Nenhum campo retorna NaN, Infinity ou undefined', () => {
    const r = run();
    const fields = [
      'p5', 'p10', 'p50', 'p90', 'p95',
      'survivalRate', 'ruinProbability',
    ] as const;
    for (const k of fields) {
      expect(r[k], `campo "${k}" inválido`).toBeDefined();
      expect(Number.isFinite(r[k]), `campo "${k}" não é finito`).toBe(true);
    }
  });

  // ── 3. survivalRate no intervalo válido ───────────────────────────────────
  it('3 — survivalRate ∈ [0, 100]', () => {
    const r = run();
    expect(r.survivalRate).toBeGreaterThanOrEqual(0);
    expect(r.survivalRate).toBeLessThanOrEqual(100);
  });

  // ── 4. ruinProbability no intervalo válido ────────────────────────────────
  it('4 — ruinProbability ∈ [0, 100]', () => {
    const r = run();
    expect(r.ruinProbability).toBeGreaterThanOrEqual(0);
    expect(r.ruinProbability).toBeLessThanOrEqual(100);
  });

  // ── 5. Cenário pessimista real ────────────────────────────────────────────
  // Burn R$ 200/dia com saldo inicial de R$ 1 000 e sem receita →
  // worst case com clamp: balance = 1000 - 30*(200-3*20) = 1000 - 4200 = -3200
  // TODOS os caminhos terminam negativos → survivalRate = 0 < 20 %
  it('5 — Cenário pessimista: survivalRate < 20 %', () => {
    const r = run({ currentBalance: 1_000, burnRate: 200, expectedIncome: 0 });
    expect(r.survivalRate).toBeLessThan(20);
  });

  // ── 6. Cenário sustentável ────────────────────────────────────────────────
  // burnRate = 50, volatility = 5 → pior caso: 2000 - 30*(50+3*5) = 50 > 0
  // TODOS os caminhos sobrevivem → survivalRate = 100 % > 90 %
  it('6 — Cenário sustentável: survivalRate > 90 %', () => {
    const r = run({ currentBalance: 2_000, burnRate: 50, expectedIncome: 0, volatility: 5 });
    expect(r.survivalRate).toBeGreaterThan(90);
  });

  // ── 7. Volatilidade zero — fallback ativo ─────────────────────────────────
  it('7 — Volatilidade zero não lança exceção e retorna valores finitos', () => {
    expect(() => run({ volatility: 0 })).not.toThrow();
    const r = run({ volatility: 0 });
    expect(Number.isFinite(r.p50)).toBe(true);
    expect(Number.isFinite(r.survivalRate)).toBe(true);
  });

  // ── 8. Clamp: resultados não ultrapassam 10× o saldo esperado ─────────────
  // expectedFinal = 10 000 - 100*30 = 7 000 → 10× = 70 000
  // Todas as trajetórias ficam em [6 100, 7 900] por garantia do clamp
  it('8 — Clamp: |P5| e |P95| < 10× saldo esperado', () => {
    const balance  = 10_000;
    const burnRate = 100;
    const r        = run({ currentBalance: balance, burnRate, expectedIncome: 0, volatility: 10 });
    const expected = balance - burnRate * 30; // 7 000
    expect(Math.abs(r.p5)).toBeLessThan(Math.abs(expected) * 10);
    expect(Math.abs(r.p95)).toBeLessThan(Math.abs(expected) * 10);
  });

  // ── 9. Despesas limitadas pelo clamp [-3σ, +3σ] ───────────────────────────
  // burnRate=100, finalVol=10 → expense ∈ [70, 130]
  // Garantia matemática: toda trajetória fica em [6 100, 7 900]
  // portanto P5 ≥ 6 100 e P95 ≤ 7 900 são propriedades certas do motor
  it('9 — Despesa por dia limitada: P5 e P95 dentro dos limites do clamp', () => {
    const r = run({ currentBalance: 10_000, burnRate: 100, expectedIncome: 0, volatility: 10 });
    // lower bound  = 10 000 - 30 * (100 + 3*10) = 6 100
    // upper bound  = 10 000 - 30 * (100 - 3*10) = 7 900
    expect(r.p5).toBeGreaterThanOrEqual(6_100);
    expect(r.p95).toBeLessThanOrEqual(7_900);
  });

  // ── 10. Determinismo — mesma seed produz resultado idêntico ───────────────
  it('10 — Duas execuções com mesmo input produzem resultado bit-a-bit idêntico', () => {
    const input: ForecastMCInput = {
      currentBalance: 3_000,
      burnRate:       80,
      expectedIncome: 20,
      volatility:     15,
    };
    const r1 = runMonteCarloSimulation(input);
    const r2 = runMonteCarloSimulation(input);
    expect(r1.p10).toBe(r2.p10);
    expect(r1.p50).toBe(r2.p50);
    expect(r1.p90).toBe(r2.p90);
    expect(r1.survivalRate).toBe(r2.survivalRate);
    expect(r1.ruinProbability).toBe(r2.ruinProbability);
  });

  // ── 11. Receita não contínua — equivalência matemática ────────────────────
  // O parâmetro expectedIncome é a MÉDIA DIÁRIA; o modelo a aplica dia a dia.
  // Se a renda total é R$ 3 000:
  //   Cenário A — pré-carregada no saldo inicial (equivale a "paga no dia 0")
  //   Cenário B — espalhada como média diária R$ 100/dia × 30 dias
  //
  // Com seed=42 reiniciada em cada chamada, os z_i são IDÊNTICOS nas duas runs.
  // Matemática em cada caminho i:
  //   A: final = 3 500 - Σ(100 + z_i*10)  = 500 - 10*Σz_i
  //   B: final =   500 - Σ(100 - 100 + z_i*10) = 500 - 10*Σz_i  ← igual
  //
  // Prova que o modelo não duplica nem omite a renda: a soma total é R$ 3 000
  // independente da forma de fornecimento.
  it('11 — Renda pré-carregada no saldo é equivalente à média diária (mesmo total)', () => {
    const burnRate   = 100;
    const totalIncome = 3_000;

    // Renda aplicada de uma vez (dia 0) → incluída no saldo inicial
    const rA = runMonteCarloSimulation({
      currentBalance: 500 + totalIncome,
      burnRate,
      expectedIncome: 0,
      volatility: 0,   // finalVol = 10 via fallback
    });

    // Mesma renda total distribuída como média diária
    const rB = runMonteCarloSimulation({
      currentBalance: 500,
      burnRate,
      expectedIncome: totalIncome / 30,   // 100 / dia
      volatility: 0,
    });

    // P50 deve ser idêntico (mesma álgebra, mesmo PRNG)
    expect(rA.p50).toBeCloseTo(rB.p50, 0);
    expect(rA.survivalRate).toBe(rB.survivalRate);
  });

  // ── 12. Consistência do modelo — P50 próximo do valor esperado ─────────────
  // E[saldo final] = balance + (expectedIncome - burnRate) * 30
  // Com 1 000 simulações e distribuição simétrica, P50 ≈ E[saldo final]
  it('12 — P50 dentro de 15 % do saldo esperado (sem receita)', () => {
    const balance  = 5_000;
    const burnRate = 50;
    const expected = balance - burnRate * 30;   // 3 500
    const r        = run({ currentBalance: balance, burnRate, expectedIncome: 0, volatility: 10 });
    const tolerance = Math.abs(expected) * 0.15; // ± 525
    expect(Math.abs(r.p50 - expected)).toBeLessThan(tolerance);
  });

});
