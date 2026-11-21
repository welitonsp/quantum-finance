// Regras puras do histórico de preços, iguais no Firebase e no Supabase.
import type { PriceObservation } from '../../../shared/types/shopping';
import type { PriceObservationCreateInput } from '../../../shared/schemas/shoppingSchemas';

export interface UsePriceObservationsReturn {
  observations: PriceObservation[];
  loading: boolean;
  addObservation: (payload: PriceObservationCreateInput) => Promise<string>;
  forProduct: (productName: string) => PriceObservation[];
}

/** Teto de observações carregadas (as mais recentes). */
export const PRICE_OBSERVATIONS_LIMIT = 500;

export function normalizeProductName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Até 20 observações do mesmo produto, na ordem recebida (mais recentes primeiro). */
export function observationsForProduct(observations: PriceObservation[], productName: string): PriceObservation[] {
  const normalized = normalizeProductName(productName);
  return observations
    .filter((o) => normalizeProductName(o.productName) === normalized)
    .slice(0, 20);
}
