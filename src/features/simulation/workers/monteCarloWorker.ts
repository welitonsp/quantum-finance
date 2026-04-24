/**
 * monteCarloWorker.ts — Motor Probabilístico Monte Carlo
 * ──────────────────────────────────────────────────────────────────────────────
 * Roda em thread separada. A Main Thread permanece fluída enquanto este worker
 * processa milhares de iterações de simulação de fluxo de caixa.
 */

/// <reference lib="webworker" />

// Dedicated Worker global scope
const ctx = self as unknown as DedicatedWorkerGlobalScope;

// ─── Message Contract ────────────────────────────────────────────────────────
export interface MonteCarloRequest {
  saldoCents:           number;
  receitaMensalCents:   number;
  despesaFixaCents:     number;
  mediaVariavelCents:   number;
  desvioVariavelCents:  number;
  inflacaoBps?:         number;
  corteDespesasBps?:    number;
  aumentoSalarialBps?:  number;
  meses?:               number;
  iteracoes?:           number;
}

export interface MonteCarloChartPoint {
  month:      number;
  p10:        number;
  p50:        number;
  p90:        number;
  coneBase:   number;
  coneHeight: number;
}

export interface MonteCarloSuccess {
  success:                    true;
  chartData:                  MonteCarloChartPoint[];
  probabilidadeSobrevivencia: number;
  p10Final:                   number;
  p50Final:                   number;
  p90Final:                   number;
  meses:                      number;
}

export interface MonteCarloFailure {
  success: false;
  error:   string;
}

export type MonteCarloResponse = MonteCarloSuccess | MonteCarloFailure;

// ─── Gerador Gaussiano — Transformação Box-Muller ────────────────────────────
function gaussianRandom(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

// ─── Motor de Simulação ───────────────────────────────────────────────────────
function runMonteCarloSimulation(config: MonteCarloRequest): Omit<MonteCarloSuccess, 'success'> {
  const {
    saldoCents,
    receitaMensalCents,
    despesaFixaCents,
    mediaVariavelCents,
    desvioVariavelCents,
    inflacaoBps        = 500,
    corteDespesasBps   = 0,
    aumentoSalarialBps = 0,
    meses              = 24,
    iteracoes          = 1000,
  } = config;

  const corteMultiplier   = 1 - corteDespesasBps   / 10000;
  const salarioMultiplier = 1 + aumentoSalarialBps / 10000;
  const inflacaoMensal    = (inflacaoBps / 10000) / 12;

  const receitaAjustada = Math.round(receitaMensalCents  * salarioMultiplier);
  const despFixaAjust   = Math.round(despesaFixaCents    * corteMultiplier);
  const mediaVarAjust   = Math.round(mediaVariavelCents  * corteMultiplier);

  const paths: Int32Array[] = [];

  for (let i = 0; i < iteracoes; i++) {
    const path = new Int32Array(meses + 1);
    let saldo = saldoCents;
    path[0] = Math.max(Math.min(saldo, 2147483647), -2147483647);

    for (let m = 1; m <= meses; m++) {
      const infFator = Math.pow(1 + inflacaoMensal, m);
      const despFixaInfl = Math.round(despFixaAjust  * infFator);
      const mediaVarInfl = Math.round(mediaVarAjust  * infFator);

      const ruido     = gaussianRandom();
      const variaveis = Math.max(0, Math.round(mediaVarInfl + ruido * desvioVariavelCents));

      saldo = saldo + receitaAjustada - despFixaInfl - variaveis;
      path[m] = Math.max(Math.min(saldo, 2147483647), -2147483647);
    }

    paths.push(path);
  }

  const chartData: MonteCarloChartPoint[] = [];
  const sortBuffer = new Int32Array(iteracoes);

  for (let m = 0; m <= meses; m++) {
    for (let i = 0; i < iteracoes; i++) sortBuffer[i] = paths[i][m];
    sortBuffer.sort();

    const idxP10 = Math.floor(iteracoes * 0.10);
    const idxP50 = Math.floor(iteracoes * 0.50);
    const idxP90 = Math.floor(iteracoes * 0.90);

    const p10 = sortBuffer[idxP10];
    const p50 = sortBuffer[idxP50];
    const p90 = sortBuffer[idxP90];

    chartData.push({
      month:      m,
      p10,
      p50,
      p90,
      coneBase:   p10,
      coneHeight: Math.max(0, p90 - p10),
    });
  }

  let sobreviveram = 0;
  for (let i = 0; i < iteracoes; i++) {
    if (paths[i][meses] > 0) sobreviveram++;
  }
  const probabilidadeSobrevivencia = Math.round((sobreviveram / iteracoes) * 100);

  return {
    chartData,
    probabilidadeSobrevivencia,
    p10Final: chartData[meses].p10,
    p50Final: chartData[meses].p50,
    p90Final: chartData[meses].p90,
    meses,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// FORECAST MONTE CARLO — contrato 30-day / 1 000 sims / PRNG determinístico
// ═══════════════════════════════════════════════════════════════════════════════

export interface ForecastMonteCarloRequest {
  type:           'forecast';
  jobId:          string;
  currentBalance: number;
  burnRate:       number;       // daily average expense
  expectedIncome: number;       // daily average income
  volatility:     number;       // daily std-dev of expenses
}

export interface ForecastMonteCarloResult {
  type:            'forecast';
  jobId:           string;
  success:         boolean;
  p5:              number;
  p10:             number;
  p50:             number;
  p90:             number;
  p95:             number;
  survivalRate:    number;      // % of sims ending > 0
  ruinProbability: number;      // % of sims ending ≤ 0
  error?:          string;
}

// Lehmer MINSTD — deterministic, period ≈ 2.1 B, seed reset per call
function runForecastMonteCarlo(
  req: ForecastMonteCarloRequest,
): Omit<ForecastMonteCarloResult, 'type' | 'jobId'> {
  const { currentBalance, burnRate, expectedIncome, volatility } = req;

  // Safe volatility — never 0 (would collapse the distribution)
  const finalVol = volatility === 0 ? 10 : volatility;

  // Seeded PRNG — reset to 42 every call for full determinism
  let seed = 42;
  const rnd = (): number => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };

  // Box-Muller with clamp [-3, 3] (eliminates extreme outliers)
  const normalClamped = (): number => {
    const u1   = rnd() || Number.EPSILON; // guard against log(0)
    const u2   = rnd();
    const z    = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return Math.max(-3, Math.min(3, z));
  };

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

  // Degenerate case — return neutral estimate
  if (!finals.length) {
    return {
      success: true,
      p5: currentBalance, p10: currentBalance, p50: currentBalance,
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
    success: true,
    p5:  pct(0.05),
    p10: pct(0.10),
    p50: pct(0.50),
    p90: pct(0.90),
    p95: pct(0.95),
    survivalRate,
    ruinProbability: 100 - survivalRate,
  };
}

// ─── Message Handler ─────────────────────────────────────────────────────────

type IncomingMessage = MonteCarloRequest | ForecastMonteCarloRequest;

ctx.onmessage = (event: MessageEvent<IncomingMessage>) => {
  const data = event.data;

  // ── Forecast branch (new, 30-day daily simulation) ─────────────────────────
  if ('type' in data && data.type === 'forecast') {
    const req = data as ForecastMonteCarloRequest;
    try {
      const result   = runForecastMonteCarlo(req);
      const response: ForecastMonteCarloResult = { type: 'forecast', jobId: req.jobId, ...result };
      ctx.postMessage(response);
    } catch (err) {
      const response: ForecastMonteCarloResult = {
        type: 'forecast', jobId: req.jobId, success: false,
        error: err instanceof Error ? err.message : 'Erro no forecast MC.',
        p5: 0, p10: 0, p50: 0, p90: 0, p95: 0,
        survivalRate: 50, ruinProbability: 50,
      };
      ctx.postMessage(response);
    }
    return;
  }

  // ── Legacy branch (SimulationCenter — monthly, multi-year) ─────────────────
  try {
    const result   = runMonteCarloSimulation(data as MonteCarloRequest);
    const response: MonteCarloSuccess = { success: true, ...result };
    ctx.postMessage(response);
  } catch (err) {
    const message  = err instanceof Error ? err.message : 'Erro no engine Monte Carlo.';
    const response: MonteCarloFailure = { success: false, error: message };
    ctx.postMessage(response);
  }
};

export {};
