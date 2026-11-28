// src/hooks/supabase/useDashboardTotalsSupabase.ts
// Totais do painel somados no banco (RPC dashboard_totals). O navegador só tem
// as transações já carregadas (500 por página); acima disso a soma local fica
// errada. No build Firebase o hook devolve null e o painel segue com a soma local.
import { useEffect, useState } from 'react';
import { getSupabase } from '../../shared/api/supabase/client';
import { DATA_BACKEND } from '../../shared/config/backend';
import type { Centavos } from '../../shared/types/money';
import { centsFromBigint } from './useAccountsSupabase';

export interface DashboardTotals {
  /** Receitas do mês, em centavos. */
  incomeCents: Centavos;
  /** Despesas do mês sem pagamento de fatura, em centavos. */
  expenseCents: Centavos;
  /** Receitas − despesas de todos os tempos, em centavos (base do saldo). */
  netAllCents: Centavos;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Primeiro e último dia do mês (1–12) em YYYY-MM-DD, sem fuso. */
export function monthRange(month: number, year: number): { from: string; to: string } {
  const lastDay = new Date(year, month, 0).getDate();
  return { from: `${year}-${pad(month)}-01`, to: `${year}-${pad(month)}-${pad(lastDay)}` };
}

export async function fetchDashboardTotals(month: number, year: number): Promise<DashboardTotals> {
  const { from, to } = monthRange(month, year);
  const { data, error } = await getSupabase().rpc('dashboard_totals', { p_from: from, p_to: to });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null | undefined;
  return {
    incomeCents:  centsFromBigint(row?.income_cents),
    expenseCents: centsFromBigint(row?.expense_cents),
    netAllCents:  centsFromBigint(row?.net_all_cents),
  };
}

/**
 * Totais do mês vindos do servidor. `refreshKey` muda quando as transações mudam
 * (a janela em tempo real recarrega), e então a soma é refeita. Em erro devolve
 * null: o painel volta para a soma local em vez de mostrar zero.
 */
export function useDashboardTotals(
  uid: string,
  month: number,
  year: number,
  refreshKey: unknown,
): DashboardTotals | null {
  // Guarda de qual usuário/mês é o total: trocar de mês não mostra o total do anterior.
  const [state, setState] = useState<{ key: string; totals: DashboardTotals | null } | null>(null);
  const enabled = DATA_BACKEND === 'supabase' && !!uid;
  const key = `${uid}|${year}-${month}`;

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    fetchDashboardTotals(month, year).then(
      (totals) => { if (active) setState({ key, totals }); },
      () => { if (active) setState({ key, totals: null }); },
    );
    return () => { active = false; };
  }, [enabled, key, month, year, refreshKey]);

  return enabled && state?.key === key ? state.totals : null;
}
