// Desafios de economia no Supabase (tabela public.challenges).
import { useCallback } from 'react';
import { getSupabase } from '../../shared/api/supabase/client';
import { logSanitizedFirebaseError } from '../../shared/lib/firebaseErrorHandling';
import { challengeDates, type Challenge, type CreateChallengeInput, type ChallengeStore } from '../useChallenges';
import { centsFromBigint } from './useAccountsSupabase';
import { useSupabaseTable } from './useSupabaseTable';

export interface ChallengeRow {
  id: string;
  category: string | null;
  target_pct: number | null;
  baseline_cents: number | string | null;
  deadline_days: number | null;
  start_date: string | null;
  end_date: string | null;
  xp: number | null;
  status: string | null;
  created_at: string | null;
}

const STATUSES: ReadonlySet<string> = new Set(['active', 'won', 'lost']);

export function mapChallengeRow(row: ChallengeRow): Challenge {
  return {
    id: row.id,
    category: row.category ?? '',
    targetPct: row.target_pct ?? 0,
    baselineCents: centsFromBigint(row.baseline_cents),
    deadlineDays: row.deadline_days ?? 0,
    startDate: row.start_date ?? '',
    endDate: row.end_date ?? '',
    xp: row.xp ?? 0,
    status: row.status && STATUSES.has(row.status) ? (row.status as Challenge['status']) : 'active',
    schemaVersion: 1,
    createdAt: row.created_at,
  };
}

const CHALLENGE_OPTIONS = {
  table: 'challenges',
  columns: 'id, category, target_pct, baseline_cents, deadline_days, start_date, end_date, xp, status, created_at',
  orderBy: 'created_at',
  ascending: false,
  map: mapChallengeRow,
  loadOp: 'challenges_load',
} as const;

function fail(error: unknown, message: string): never {
  logSanitizedFirebaseError('challenge_write', error);
  throw new Error(message);
}

export function useChallengeStoreSupabase(uid: string): ChallengeStore {
  const { items: challenges, loading, refresh } = useSupabaseTable<ChallengeRow, Challenge>(uid, CHALLENGE_OPTIONS);

  const createChallenge = useCallback(async (input: CreateChallengeInput): Promise<void> => {
    if (!uid) return;
    const { startDate, endDate } = challengeDates(input.deadlineDays);
    const { error } = await getSupabase().from('challenges').insert({
      category: input.category,
      target_pct: input.targetPct,
      baseline_cents: input.baselineCents,
      deadline_days: input.deadlineDays,
      start_date: startDate,
      end_date: endDate,
      xp: 0,
      status: 'active',
    });
    if (error) fail(error, 'Não foi possível criar o desafio.');
    await refresh();
  }, [uid, refresh]);

  const updateXP = useCallback(async (challengeId: string, newXP: number, status: Challenge['status']): Promise<void> => {
    if (!uid) return;
    const { error } = await getSupabase().from('challenges').update({ xp: newXP, status }).eq('id', challengeId);
    if (error) fail(error, 'Não foi possível atualizar o desafio.');
    await refresh();
  }, [uid, refresh]);

  const deleteChallenge = useCallback(async (challengeId: string): Promise<void> => {
    if (!uid) return;
    const { error } = await getSupabase().from('challenges').delete().eq('id', challengeId);
    if (error) fail(error, 'Não foi possível excluir o desafio.');
    await refresh();
  }, [uid, refresh]);

  return { challenges, loading, createChallenge, updateXP, deleteChallenge };
}
