/**
 * monteCarloWorker.js — Motor Probabilístico Monte Carlo
 * ──────────────────────────────────────────────────────────────────────────────
 * Roda em thread separada. A Main Thread permanece fluída enquanto este worker
 * processa milhares de iterações de simulação de fluxo de caixa.
 *
 * PROTOCOLO DE MENSAGENS:
 *
 * REQUEST (Main → Worker):
 *   {
 *     saldoCents:           number,  // saldo atual em centavos
 *     receitaMensalCents:   number,  // receita fixa mensal em centavos
 *     despesaFixaCents:     number,  // despesas fixas mensais em centavos
 *     mediaVariavelCents:   number,  // média das despesas variáveis em centavos
 *     desvioVariavelCents:  number,  // desvio-padrão das despesas variáveis em centavos
 *     inflacaoBps:          number,  // inflação anual em basis points (500 = 5%)
 *     corteDespesasBps:     number,  // corte de despesas em basis points
 *     aumentoSalarialBps:   number,  // aumento salarial em basis points
 *     meses:                number,  // horizonte de simulação em meses
 *     iteracoes:            number,  // número de iterações (default 1000)
 *   }
 *
 * RESPONSE (Worker → Main):
 *   { success: true,  chartData, probabilidadeSobrevivencia, p10Final, p50Final, p90Final }
 *   { success: false, error: string }
 *
 * NOTA MATEMÁTICA: Todo o cálculo interno usa inteiros (centavos).
 * A conversão para Reais ocorre apenas na UI.
 */

// ─── Gerador Gaussiano — Transformação Box-Muller ────────────────────────────
// Retorna um número da distribuição normal padrão (média 0, desvio 1)
function gaussianRandom() {
  let u = 0, v = 0;
  // Evita log(0) — rejeita zeros
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

// ─── Motor de Simulação ───────────────────────────────────────────────────────
function runMonteCarloSimulation(config) {
  const {
    saldoCents,
    receitaMensalCents,
    despesaFixaCents,
    mediaVariavelCents,
    desvioVariavelCents,
    inflacaoBps       = 500,   // 5%
    corteDespesasBps  = 0,
    aumentoSalarialBps = 0,
    meses             = 24,
    iteracoes         = 1000,
  } = config;

  // ── Ajustar parâmetros pelos sliders macroeconómicos ──
  const corteMultiplier   = 1 - corteDespesasBps   / 10000;
  const salarioMultiplier = 1 + aumentoSalarialBps  / 10000;
  const inflacaoMensal    = (inflacaoBps / 10000) / 12;  // taxa mensal composta

  const receitaAjustada = Math.round(receitaMensalCents  * salarioMultiplier);
  const despFixaAjust   = Math.round(despesaFixaCents    * corteMultiplier);
  const mediaVarAjust   = Math.round(mediaVariavelCents  * corteMultiplier);

  // ── Executar iterações ─────────────────────────────────────────────────────
  // paths[i][m] = saldo em centavos na iteração i, mês m
  const paths = [];

  for (let i = 0; i < iteracoes; i++) {
    const path = new Int32Array(meses + 1);
    // Usar BigInt para evitar overflow em saldos muito grandes antes de truncar
    let saldo = saldoCents;
    path[0] = Math.max(Math.min(saldo, 2147483647), -2147483647); // clamp Int32

    for (let m = 1; m <= meses; m++) {
      // Fator de inflação composto mês a mês
      const infFator = Math.pow(1 + inflacaoMensal, m);

      const despFixaInfl = Math.round(despFixaAjust  * infFator);
      const mediaVarInfl = Math.round(mediaVarAjust  * infFator);

      // Ruído gaussiano aplicado às despesas variáveis (não pode ser negativo)
      const ruido     = gaussianRandom();
      const variaveis = Math.max(0, Math.round(mediaVarInfl + ruido * desvioVariavelCents));

      saldo = saldo + receitaAjustada - despFixaInfl - variaveis;
      path[m] = Math.max(Math.min(saldo, 2147483647), -2147483647);
    }

    paths.push(path);
  }

  // ── Calcular Percentis por Mês ─────────────────────────────────────────────
  const chartData = [];
  const sortBuffer = new Int32Array(iteracoes);

  for (let m = 0; m <= meses; m++) {
    for (let i = 0; i < iteracoes; i++) sortBuffer[i] = paths[i][m];
    sortBuffer.sort(); // Int32Array.sort() é numérico por padrão ✓

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
      // Para o "cone" no Recharts: base = p10, altura = p90 - p10 (stacking trick)
      coneBase:   p10,
      coneHeight: Math.max(0, p90 - p10),
    });
  }

  // ── Probabilidade de Sobrevivência (saldo final > 0) ──────────────────────
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
self.onmessage = (event) => {
  try {
    const result = runMonteCarloSimulation(event.data);
    self.postMessage({ success: true, ...result });
  } catch (err) {
    self.postMessage({ success: false, error: err.message || 'Erro no engine Monte Carlo.' });
  }
};
