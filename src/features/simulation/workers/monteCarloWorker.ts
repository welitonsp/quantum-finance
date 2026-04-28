/**
 * monteCarloWorker.ts — Motor Probabilístico Monte Carlo
 * ──────────────────────────────────────────────────────────────────────────────
 * Roda em thread separada. A Main Thread permanece fluída enquanto este worker
 * processa milhares de iterações de simulação de fluxo de caixa.
 *
 * O motor puro (30d / 1 000 sims / seed determinístico) vive em
 * forecastMonteCarlo.ts para ser testável sem contexto Worker.
 */

/// <reference lib="webworker" />

import { runMonteCarloSimulation as runForecast30d } from '../forecastMonteCarlo';

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

// ─── Gerador determinístico — evita Math.random em simulações financeiras ────
function makePrng(seed: number): () => number {
  let state = seed % 2147483647;
  if (state <= 0) state += 2147483646;
  return () => {
    state = (state * 16807) % 2147483647;
    return state / 2147483647;
  };
}

// ─── Gerador Gaussiano — Transformação Box-Muller ────────────────────────────
function gaussianRandom(rnd: () => number): number {
  let u = 0, v = 0;
  while (u === 0) u = rnd();
  while (v === 0) v = rnd();
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
  const rnd             = makePrng(20260428);

  const paths: Int32Array[] = [];

  for (let i = 0; i < iteracoes; i++) {
    const path = new Int32Array(meses + 1);
    let saldo = saldoCents;
    path[0] = Math.max(Math.min(saldo, 2147483647), -2147483647);

    for (let m = 1; m <= meses; m++) {
      const infFator = Math.pow(1 + inflacaoMensal, m);
      const despFixaInfl = Math.round(despFixaAjust  * infFator);
      const mediaVarInfl = Math.round(mediaVarAjust  * infFator);

      const ruido     = gaussianRandom(rnd);
      const variaveis = Math.max(0, Math.round(mediaVarInfl + ruido * desvioVariavelCents));

      saldo = saldo + receitaAjustada - despFixaInfl - variaveis;
      path[m] = Math.max(Math.min(saldo, 2147483647), -2147483647);
    }

    paths.push(path);
  }

  const chartData: MonteCarloChartPoint[] = [];
  const sortBuffer = new Int32Array(iteracoes);

  for (let m = 0; m <= meses; m++) {
    for (let i = 0; i < iteracoes; i++) sortBuffer[i] = paths[i]?.[m] ?? 0;
    sortBuffer.sort();

    const idxP10 = Math.floor(iteracoes * 0.10);
    const idxP50 = Math.floor(iteracoes * 0.50);
    const idxP90 = Math.floor(iteracoes * 0.90);

    const p10 = sortBuffer[idxP10] ?? 0;
    const p50 = sortBuffer[idxP50] ?? 0;
    const p90 = sortBuffer[idxP90] ?? 0;

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
    if ((paths[i]?.[meses] ?? 0) > 0) sobreviveram++;
  }
  const probabilidadeSobrevivencia = Math.round((sobreviveram / iteracoes) * 100);
  const finalPoint = chartData[meses] ?? { p10: 0, p50: 0, p90: 0 };

  return {
    chartData,
    probabilidadeSobrevivencia,
    p10Final: finalPoint.p10,
    p50Final: finalPoint.p50,
    p90Final: finalPoint.p90,
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

// Delegate to the pure engine — no PRNG / math logic lives here
function runForecastMonteCarlo(
  req: ForecastMonteCarloRequest,
): Omit<ForecastMonteCarloResult, 'type' | 'jobId'> {
  return runForecast30d({
    currentBalance: req.currentBalance,
    burnRate:       req.burnRate,
    expectedIncome: req.expectedIncome,
    volatility:     req.volatility,
  });
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
