// ─── Pure Monte Carlo engine — no Worker / DOM / Firebase dependencies ────────
// Importável em testes Node puros e no Web Worker sem alteração.

export interface ForecastMCInput {
  currentBalance: number;
  burnRate:       number;   // média diária de despesas
  expectedIncome: number;   // média diária de receitas
  volatility:     number;   // desvio-padrão diário das despesas
}

export interface ForecastMCResult {
  success:         boolean;
  p5:              number;
  p10:             number;
  p50:             number;
  p90:             number;
  p95:             number;
  survivalRate:    number;   // % de simulações com saldo final > 0
  ruinProbability: number;   // 100 - survivalRate
}

// ─── Seeded PRNG — Lehmer MINSTD, período ≈ 2.1 B ────────────────────────────

function makePrng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

// Box-Muller com clamp [-3, 3] (elimina outliers extremos)
function makeNormalClamped(rnd: () => number): () => number {
  return () => {
    const u1 = rnd() || Number.EPSILON;
    const u2 = rnd();
    const z  = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return Math.max(-3, Math.min(3, z));
  };
}

// ─── Motor principal ──────────────────────────────────────────────────────────

/**
 * Simula 1 000 trajetórias de 30 dias com PRNG determinístico (seed = 42).
 * Retorna percentis P5/P10/P50/P90/P95, survivalRate e ruinProbability.
 */
export function runMonteCarloSimulation(input: ForecastMCInput): ForecastMCResult {
  const { currentBalance, burnRate, expectedIncome, volatility } = input;

  // Volatilidade nunca pode ser 0 — colapsaria a distribuição
  const finalVol = volatility === 0 ? 10 : volatility;

  // Seed 42 reiniciada a cada chamada → determinismo total
  const rnd           = makePrng(42);
  const normalClamped = makeNormalClamped(rnd);

  const finals: number[] = [];

  for (let sim = 0; sim < 1_000; sim++) {
    let balance = currentBalance;
    for (let day = 0; day < 30; day++) {
      const expense = burnRate + normalClamped() * finalVol;
      balance += expectedIncome - expense;
    }
    if (Number.isFinite(balance) && !Number.isNaN(balance)) {
      finals.push(balance);
    }
  }

  // Caso degenerado — retorna estimativa neutra
  if (!finals.length) {
    return {
      success:         true,
      p5:  currentBalance, p10: currentBalance, p50: currentBalance,
      p90: currentBalance, p95: currentBalance,
      survivalRate: 50, ruinProbability: 50,
    };
  }

  finals.sort((a, b) => a - b);
  const n   = finals.length;
  const pct = (p: number): number => finals[Math.min(Math.floor(n * p), n - 1)] ?? 0;

  const survivors    = finals.filter(v => v > 0).length;
  const survivalRate = Math.round((survivors / n) * 100);

  return {
    success:         true,
    p5:  pct(0.05),
    p10: pct(0.10),
    p50: pct(0.50),
    p90: pct(0.90),
    p95: pct(0.95),
    survivalRate,
    ruinProbability: 100 - survivalRate,
  };
}
