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

// ─── Message Handler ─────────────────────────────────────────────────────────
ctx.onmessage = (event: MessageEvent<MonteCarloRequest>) => {
  try {
    const result = runMonteCarloSimulation(event.data);
    const response: MonteCarloSuccess = { success: true, ...result };
    ctx.postMessage(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro no engine Monte Carlo.';
    const response: MonteCarloFailure = { success: false, error: message };
    ctx.postMessage(response);
  }
};

export {};
