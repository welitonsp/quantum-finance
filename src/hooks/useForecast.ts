import { useState, useEffect, useRef, useMemo } from 'react';
import type { Transaction } from '../shared/types/transaction';
import { calculateForecast } from '../utils/forecastEngine';
import { isIncome as checkIncomeStr } from '../utils/transactionUtils';
import { getTransactionAbsCentavos } from '../utils/transactionUtils';
import { generateHash } from '../utils/hashGenerator';
import { fromCentavos } from '../shared/types/money';
import type { ForecastResult, ForecastHealth, ForecastPoint } from '../utils/forecastEngine';

// Re-export deterministic types for backward compatibility
export type { ForecastResult, ForecastHealth, ForecastPoint };

// ─── Risk level ───────────────────────────────────────────────────────────────

export type RiskLevel = 'safe' | 'attention' | 'critical';

function getRiskLevel(survivalRate: number): RiskLevel {
  if (survivalRate > 90) return 'safe';
  if (survivalRate >= 70) return 'attention';
  return 'critical';
}

// ─── Insight generator (THETA — deterministic, no external AI) ───────────────

export interface InsightInput {
  survivalRate:     number;
  ruinProbability:  number;
  burnRate:         number;   // daily avg expense
  expectedIncome:   number;   // daily avg income
  balance:          number;   // current balance
  projectedBalance: number;   // Monte Carlo p50
  volatility:       number;   // daily std dev of expenses
}

export function generateInsight(d: InsightInput): string {
  const parts: string[] = [];

  if (d.survivalRate > 90) {
    parts.push('Trajetória segura. Seus gastos estão sob controle.');
  } else if (d.survivalRate >= 70) {
    parts.push('Atenção: seu ritmo atual pode comprometer o saldo.');
  } else {
    parts.push('Risco elevado de saldo negativo.');
  }

  if (d.expectedIncome > 0 && d.burnRate > d.expectedIncome) {
    parts.push('Você está gastando mais do que ganha.');
  }

  if (d.burnRate > 0 && d.volatility / d.burnRate > 0.4) {
    parts.push('Seus gastos são inconsistentes.');
  }

  if (d.balance < 0) {
    parts.push('Seu saldo atual já está negativo.');
  }

  if (d.ruinProbability > 30) {
    parts.push('Alta probabilidade de entrar no negativo antes do fim do mês.');
  }

  return parts.join(' ');
}

// ─── Monte Carlo input derivation ─────────────────────────────────────────────

interface MCInputs {
  burnRate:       number;
  expectedIncome: number;
  volatility:     number;
}

function isIncomeTx(tx: Transaction): boolean {
  return checkIncomeStr(tx.type);
}

export function computeMCInputs(transactions: Transaction[], now: Date = new Date()): MCInputs {
  const nowMs   = now.getTime();
  const cutoff  = new Date(nowMs - 30 * 86_400_000).toISOString().slice(0, 10);
  const today   = new Date(nowMs).toISOString().slice(0, 10);

  const recent  = transactions.filter(tx => tx.date && tx.date > cutoff && tx.date <= today);

  const dailyExp = new Map<string, number>();
  const dailyInc = new Map<string, number>();

  for (const tx of recent) {
    if (!tx.date) continue;
    if (tx.value_cents === undefined) continue;
    const v = getTransactionAbsCentavos(tx);
    if (isIncomeTx(tx)) dailyInc.set(tx.date, (dailyInc.get(tx.date) ?? 0) + v);
    else                 dailyExp.set(tx.date, (dailyExp.get(tx.date) ?? 0) + v);
  }

  // Build 30-point daily expense vector (0 for empty days)
  const expVals: number[] = [];
  for (let d = 29; d >= 0; d--) {
    const ds = new Date(nowMs - d * 86_400_000).toISOString().slice(0, 10);
    expVals.push(dailyExp.get(ds) ?? 0);
  }

  const totalExp       = expVals.reduce((a, b) => a + b, 0);
  const totalInc       = Array.from(dailyInc.values()).reduce((a, b) => a + b, 0);
  const burnRateCents       = Math.round(totalExp / 30);
  const expectedIncomeCents = Math.round(totalInc / 30);

  // Population std dev of daily expenses
  const variance   = expVals.reduce((acc, v) => acc + (v - burnRateCents) ** 2, 0) / 30;
  const volatilityCents = Math.round(Math.sqrt(variance));

  return {
    burnRate:       fromCentavos(burnRateCents),
    expectedIncome: fromCentavos(expectedIncomeCents),
    volatility:     fromCentavos(volatilityCents),
  };
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface MCStats {
  p5:              number;
  p10:             number;
  p50:             number;
  p90:             number;
  p95:             number;
  survivalRate:    number;
  ruinProbability: number;
  riskLevel:       RiskLevel;
  insight:         string;
  mcLoading:       boolean;
}

export interface UseForecastResult extends ForecastResult {
  p5:              number;
  p10:             number;
  p50:             number;
  p90:             number;
  p95:             number;
  survivalRate:    number;
  ruinProbability: number;
  riskLevel:       RiskLevel;
  insight:         string;
  mcLoading:       boolean;
  burnRate:        number;
  expectedIncome:  number;
  volatility:      number;
}

const DEFAULT_MC: MCStats = {
  p5: 0, p10: 0, p50: 0, p90: 0, p95: 0,
  survivalRate:    50,
  ruinProbability: 50,
  riskLevel:       'attention',
  insight:         '',
  mcLoading:       true,
};

// ─── Worker message shapes (local — avoids importing from worker context) ─────

interface WorkerRequest {
  type:           'forecast';
  jobId:          string;
  currentBalance: number;
  burnRate:       number;
  expectedIncome: number;
  volatility:     number;
}

interface WorkerResponse {
  type:            'forecast';
  jobId:           string;
  success:         boolean;
  p5:              number;
  p10:             number;
  p50:             number;
  p90:             number;
  p95:             number;
  survivalRate:    number;
  ruinProbability: number;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Combines a synchronous deterministic forecast (for the line chart) with an
 * async Monte Carlo simulation (1 000 paths × 30 days) running in a Web Worker.
 *
 * Execution guarantees:
 * - Worker created once; terminated on unmount
 * - 400 ms debounce prevents bursts on rapid input changes
 * - isRunningRef gate prevents concurrent Worker jobs
 * - jobId comparison discards stale results
 */
export function useForecast(
  transactions: Transaction[],
  currentBalance: number,
  days = 30,
): UseForecastResult {
  // Stable content hash — recalculates only when id/value/date change
  const txHash = useMemo(
    () => generateHash(transactions.map(t => t.id + String(t.value_cents ?? '') + (t.date ?? ''))),
    [transactions],
  );

  // Deterministic forecast — synchronous, O(n), never blocks
   
  const deterministic = useMemo(
    () => calculateForecast(transactions, currentBalance, days),
    [txHash, currentBalance, days],
  );

  // Monte Carlo inputs — recalculate only when transaction content changes
  const mcInputs: MCInputs = useMemo(
    () => computeMCInputs(transactions),
     
    [txHash],
  );

  const [mcStats, setMcStats] = useState<MCStats>(DEFAULT_MC);

  // Worker + execution-control refs
  const workerRef      = useRef<Worker | null>(null);
  const isRunningRef   = useRef(false);
  const currentJobRef  = useRef('');
  const debounceRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const jobSeqRef      = useRef(0);

  // Stable copies so the onmessage closure (set up once) always reads current values
  const mcInputsRef  = useRef<MCInputs>(mcInputs);
  const balanceRef   = useRef(currentBalance);
  useEffect(() => { mcInputsRef.current  = mcInputs;       }, [mcInputs]);
  useEffect(() => { balanceRef.current   = currentBalance; }, [currentBalance]);

  // ── Worker lifecycle — create once, terminate on unmount ─────────────────
  useEffect(() => {
    let worker: Worker;
    try {
      worker = new Worker(
        new URL('../features/simulation/workers/monteCarloWorker.ts', import.meta.url),
        { type: 'module' },
      );
    } catch {
      // Worker not available (SSR, old browser) — leave mcLoading: false
      setMcStats(prev => ({ ...prev, mcLoading: false }));
      return;
    }

    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const data = event.data;
      if (data.type !== 'forecast' || data.jobId !== currentJobRef.current) return;

      isRunningRef.current = false;

      if (!data.success) {
        setMcStats(prev => ({ ...prev, mcLoading: false }));
        return;
      }

      const insight = generateInsight({
        survivalRate:     data.survivalRate,
        ruinProbability:  data.ruinProbability,
        burnRate:         mcInputsRef.current.burnRate,
        expectedIncome:   mcInputsRef.current.expectedIncome,
        balance:          balanceRef.current,
        projectedBalance: data.p50,
        volatility:       mcInputsRef.current.volatility,
      });

      setMcStats({
        p5:              data.p5,
        p10:             data.p10,
        p50:             data.p50,
        p90:             data.p90,
        p95:             data.p95,
        survivalRate:    data.survivalRate,
        ruinProbability: data.ruinProbability,
        riskLevel:       getRiskLevel(data.survivalRate),
        insight,
        mcLoading:       false,
      });
    };

    worker.onerror = () => {
      isRunningRef.current = false;
      setMcStats(prev => ({ ...prev, mcLoading: false }));
    };

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);  

  // ── Debounced trigger — fires 400 ms after inputs settle ─────────────────
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      if (!workerRef.current || isRunningRef.current) return;

      jobSeqRef.current += 1;
      const jobId = `${txHash}_${currentBalance}_${jobSeqRef.current}`;
      currentJobRef.current = jobId;
      isRunningRef.current  = true;
      setMcStats(prev => ({ ...prev, mcLoading: true }));

      const req: WorkerRequest = {
        type:           'forecast',
        jobId,
        currentBalance,
        burnRate:       mcInputs.burnRate,
        expectedIncome: mcInputs.expectedIncome,
        volatility:     mcInputs.volatility,
      };
      workerRef.current.postMessage(req);
    }, 400);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [currentBalance, mcInputs, txHash]);

  return {
    ...deterministic,
    ...mcStats,
    burnRate:       mcInputs.burnRate,
    expectedIncome: mcInputs.expectedIncome,
    volatility:     mcInputs.volatility,
  };
}
