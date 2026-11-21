// Score financeiro mensal no Supabase (tabela public.score_history, chave user_id + month).
import { useState, useEffect, useCallback } from 'react';
import { getSupabase } from '../../shared/api/supabase/client';
import { logSanitizedFirebaseError } from '../../shared/lib/firebaseErrorHandling';
import type { FinancialMetrics } from '../useFinancialMetrics';
import { computeHealthScore } from '../../lib/healthScore';
import { currentMonthKey, type ScoreHistoryEntry, type ScoreHistoryState } from '../useScoreHistory';

export interface ScoreHistoryRow {
  month: string;
  score: number | string | null;
  taxa_poupanca: number | string | null;
  endividamento: number | string | null;
  reserva_meses: number | string | null;
  comprometimento: number | string | null;
}

/** Indicador (não monetário) dentro do que numeric(12,4) guarda; NaN/Infinity viram limite ou 0. */
const METRIC_LIMIT = 99_999_999;
export function clampMetric(value: number): number {
  if (Number.isNaN(value)) return 0;
  const bounded = Math.max(-METRIC_LIMIT, Math.min(METRIC_LIMIT, value));
  return Math.round(bounded * 10_000) / 10_000;
}

function metricOrZero(value: number | string | null): number {
  const n = typeof value === 'string' ? Number(value) : value ?? 0;
  return Number.isFinite(n) ? n : 0;
}

export function mapScoreHistoryRow(row: ScoreHistoryRow): ScoreHistoryEntry {
  return {
    month: row.month,
    score: metricOrZero(row.score),
    taxaPoupanca: metricOrZero(row.taxa_poupanca),
    endividamento: metricOrZero(row.endividamento),
    reservaMeses: metricOrZero(row.reserva_meses),
    comprometimento: metricOrZero(row.comprometimento),
  };
}

export function useScoreHistorySupabase(uid: string, metrics: FinancialMetrics | null): ScoreHistoryState {
  const [history, setHistory] = useState<ScoreHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const persistScore = useCallback(async () => {
    if (!uid || !metrics) return;
    const score = Math.max(0, Math.min(100, Math.round(computeHealthScore(metrics))));
    const { error } = await getSupabase().from('score_history').upsert({
      user_id: uid,
      month: currentMonthKey(),
      score,
      taxa_poupanca: clampMetric(metrics.taxaPoupanca),
      endividamento: clampMetric(metrics.endividamento),
      reserva_meses: clampMetric(metrics.reservaMeses),
      comprometimento: clampMetric(metrics.comprometimento),
    }, { onConflict: 'user_id,month' });
    if (error) logSanitizedFirebaseError('score_history_persist', error);
  }, [uid, metrics]);

  const loadHistory = useCallback(async () => {
    if (!uid) { setLoading(false); return; }
    const { data, error } = await getSupabase()
      .from('score_history')
      .select('month, score, taxa_poupanca, endividamento, reserva_meses, comprometimento')
      .order('month', { ascending: false })
      .limit(6);
    if (error) {
      logSanitizedFirebaseError('score_history_load', error);
    } else {
      setHistory(((data ?? []) as ScoreHistoryRow[]).map(mapScoreHistoryRow)
        .sort((a, b) => a.month.localeCompare(b.month))); // mais antigo primeiro, para o gráfico
    }
    setLoading(false);
  }, [uid]);

  useEffect(() => { void loadHistory(); }, [loadHistory]);

  useEffect(() => {
    if (!metrics) return;
    void persistScore();
  }, [persistScore, metrics]);

  return { history, loading };
}
