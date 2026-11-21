// Histórico de preços no Supabase (tabela public.price_observations).
// O cliente não insere direto: a gravação passa pela RPC record_price_observation
// (security definer), que valida, normaliza a quantidade e registra o processamento.
import { useCallback } from 'react';
import { getSupabase } from '../../../shared/api/supabase/client';
import { logSanitizedFirebaseError } from '../../../shared/lib/firebaseErrorHandling';
import type { PriceObservation, ShoppingUnit } from '../../../shared/types/shopping';
import { priceObservationCreateSchema, type PriceObservationCreateInput } from '../../../shared/schemas/shoppingSchemas';
import { centsFromBigint } from '../../../hooks/supabase/useAccountsSupabase';
import { useSupabaseTable } from '../../../hooks/supabase/useSupabaseTable';
import {
  normalizeProductName, observationsForProduct, PRICE_OBSERVATIONS_LIMIT,
  type UsePriceObservationsReturn,
} from './priceObservationRules';

export interface PriceObservationRow {
  id: string;
  user_id: string;
  product_name: string | null;
  store: string | null;
  unit_price_cents: number | string | null;
  quantity: string | null;
  unit: string | null;
  observed_at: string | null;
  source_list_id: string | null;
  created_at: string | null;
}

export function mapPriceObservationRow(row: PriceObservationRow): PriceObservation {
  const obs: PriceObservation = {
    id: row.id,
    uid: row.user_id,
    productName: row.product_name ?? '',
    store: row.store ?? '',
    unitPriceCents: centsFromBigint(row.unit_price_cents),
    quantity: row.quantity ?? '',
    unit: (row.unit ?? 'un') as ShoppingUnit,
    observedAt: row.observed_at ?? '',
    createdAt: row.created_at ?? '',
    schemaVersion: 1,
  };
  if (row.source_list_id) obs.sourceListId = row.source_list_id;
  return obs;
}

const PRICE_OPTIONS = {
  table: 'price_observations',
  columns: 'id, user_id, product_name, store, unit_price_cents, quantity, unit, observed_at, source_list_id, created_at',
  orderBy: 'observed_at',
  ascending: false,
  limit: PRICE_OBSERVATIONS_LIMIT,
  map: mapPriceObservationRow,
  loadOp: 'price_observations_load',
} as const;

export function usePriceObservationsSupabase(uid: string): UsePriceObservationsReturn {
  const { items: observations, loading, refresh } =
    useSupabaseTable<PriceObservationRow, PriceObservation>(uid, PRICE_OPTIONS);

  const addObservation = useCallback(async (payload: PriceObservationCreateInput): Promise<string> => {
    if (!uid) throw new Error('Utilizador não autenticado.');
    const parsed = priceObservationCreateSchema.parse({
      ...payload,
      productName: normalizeProductName(payload.productName),
      store: payload.store.trim(),
    });
    const { data, error } = await getSupabase().rpc('record_price_observation', {
      p_product_name: parsed.productName,
      p_store: parsed.store,
      p_unit_price_cents: parsed.unitPriceCents,
      p_quantity: parsed.quantity,
      p_unit: parsed.unit,
      p_observed_at: parsed.observedAt,
      p_source_list_id: parsed.sourceListId ?? null,
    });
    if (error || typeof data !== 'string') {
      logSanitizedFirebaseError('price_observation_add', error);
      throw new Error('Não foi possível registrar o preço.');
    }
    await refresh();
    return data;
  }, [uid, refresh]);

  const forProduct = useCallback(
    (productName: string) => observationsForProduct(observations, productName),
    [observations],
  );

  return { observations, loading, addObservation, forProduct };
}
