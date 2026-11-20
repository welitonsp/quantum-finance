// Cartões de crédito no Supabase (tabela public.credit_cards, RLS por auth.uid()).
// Só a camada de armazenamento: métricas de fatura e pagamento ficam em useCreditCards.
import { useState, useEffect, useCallback, useRef } from 'react';
import { getSupabase } from '../../shared/api/supabase/client';
import { logSanitizedFirebaseError } from '../../shared/lib/firebaseErrorHandling';
import { toCentavos } from '../../shared/schemas/financialSchemas';
import type { CreditCard } from '../../shared/types/transaction';
import type { CreditCardStore, CreditCardUpdateInput, CreditCardWriteInput } from '../useCreditCards';
import { centsFromBigint } from './useAccountsSupabase';

const CARD_COLUMNS = 'id, name, limit_cents, closing_day, due_day, color, active, created_at, updated_at';

export interface CreditCardRow {
  id: string;
  name: string | null;
  limit_cents: number | string | null;
  closing_day: number | null;
  due_day: number | null;
  color: string | null;
  active: boolean | null;
  created_at: string | null;
  updated_at: string | null;
}

function millisOrNull(iso: string | null): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

export function mapCreditCardRow(row: CreditCardRow): CreditCard {
  return {
    id: row.id,
    name: row.name ?? '',
    limit: centsFromBigint(row.limit_cents),
    closingDay: row.closing_day ?? 1,
    dueDay: row.due_day ?? 1,
    color: row.color ?? '#6366f1',
    active: row.active ?? true,
    createdAt: millisOrNull(row.created_at),
    updatedAt: millisOrNull(row.updated_at),
  };
}

/** Converte a entrada do formulário nas colunas do banco (limite em centavos inteiros). */
export function toCreditCardColumns(data: CreditCardUpdateInput): Record<string, unknown> {
  const cols: Record<string, unknown> = {};
  if (typeof data.name === 'string')       cols['name'] = data.name;
  if (data.limit !== undefined)            cols['limit_cents'] = toCentavos(data.limit);
  if (typeof data.closingDay === 'number') cols['closing_day'] = data.closingDay;
  if (typeof data.dueDay === 'number')     cols['due_day'] = data.dueDay;
  if (typeof data.color === 'string')      cols['color'] = data.color;
  if (typeof data.active === 'boolean')    cols['active'] = data.active;
  return cols;
}

export function useCreditCardStoreSupabase(uid: string): CreditCardStore {
  const [cards, setCards]     = useState<CreditCard[]>([]);
  const [loading, setLoading] = useState(true);

  // Só a resposta da consulta mais recente vale (troca de usuário/ordem de chegada).
  const latestRequest = useRef(0);

  const refresh = useCallback(async (): Promise<void> => {
    const request = ++latestRequest.current;
    const { data, error } = await getSupabase()
      .from('credit_cards')
      .select(CARD_COLUMNS)
      .order('name', { ascending: true });
    if (request !== latestRequest.current) return;
    if (error) {
      logSanitizedFirebaseError('credit_cards_load', error);
      return;
    }
    setCards((data ?? []).map(r => mapCreditCardRow(r as CreditCardRow)));
  }, []);

  useEffect(() => {
    if (!uid) { latestRequest.current += 1; setCards([]); setLoading(false); return; }
    let active = true;
    setCards([]);
    setLoading(true);
    void refresh().finally(() => { if (active) setLoading(false); });

    const channel = getSupabase()
      .channel(`credit_cards:${uid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'credit_cards', filter: `user_id=eq.${uid}` },
        () => { void refresh(); })
      .subscribe();

    return () => {
      active = false;
      void getSupabase().removeChannel(channel);
    };
  }, [uid, refresh]);

  const addCard = useCallback(async (data: CreditCardWriteInput): Promise<string> => {
    if (!uid) throw new Error('Utilizador não autenticado.');
    const { data: row, error } = await getSupabase()
      .from('credit_cards')
      .insert({ ...toCreditCardColumns(data), active: data.active ?? true })
      .select('id')
      .single();
    if (error || !row) {
      logSanitizedFirebaseError('credit_card_create', error);
      throw new Error('Não foi possível criar o cartão.');
    }
    await refresh();
    return (row as { id: string }).id;
  }, [uid, refresh]);

  const updateCard = useCallback(async (id: string, data: CreditCardUpdateInput): Promise<void> => {
    if (!uid || !id) return;
    const cols = toCreditCardColumns(data);
    if (Object.keys(cols).length === 0) return;
    const { error } = await getSupabase().from('credit_cards').update(cols).eq('id', id);
    if (error) {
      logSanitizedFirebaseError('credit_card_update', error);
      throw new Error('Não foi possível atualizar o cartão.');
    }
    await refresh();
  }, [uid, refresh]);

  const removeCard = useCallback(async (id: string): Promise<void> => {
    if (!uid || !id) return;
    const { error } = await getSupabase().from('credit_cards').delete().eq('id', id);
    if (error) {
      logSanitizedFirebaseError('credit_card_delete', error);
      throw new Error('Não foi possível excluir o cartão.');
    }
    await refresh();
  }, [uid, refresh]);

  return { cards, loading, addCard, updateCard, removeCard };
}
