// Radar de Compras — motor puro (FASE Radar de Compras, primeiro movimento da
// Tese Extraordinária 2026-07-09). Deriva sinais acionáveis do catálogo de
// preços (priceIntelligence) SEM I/O, SEM float em dinheiro: centavos inteiros e
// basis points inteiros. É a camada de INSIGHT que conecta as notas fiscais reais
// (priceObservations) ao briefing/UI. NÃO grava, NÃO chama rede, NÃO altera saldo.
//
// Dois sinais, ambos derivados só de dados já observados:
//   1. Alertas de alta  — produtos que SUBIRAM de preço na loja mais recente.
//   2. Oportunidades     — produtos com preço mais barato em outra loja conhecida.

import type { Centavos } from '../../../shared/types/money';
import type { PriceObservation } from '../../../shared/types/shopping';
import { buildPriceCatalog } from './priceIntelligence';

/** Um produto que subiu de preço na loja da observação mais recente. */
export interface PriceRiseAlert {
  productKey: string;
  displayName: string;
  store: string;
  fromCents: Centavos;
  toCents: Centavos;
  deltaCents: Centavos;
  /** Variação em basis points inteiros (1% = 100 bps), sempre > 0 aqui. */
  bps: number;
}

/** Um produto cujo último preço numa loja é maior que noutra loja conhecida. */
export interface SavingsOpportunity {
  productKey: string;
  displayName: string;
  cheapestStore: string;
  cheapestCents: Centavos;
  priciestStore: string;
  priciestCents: Centavos;
  /** priciest − cheapest, em centavos inteiros (> 0). */
  savingsCents: Centavos;
}

export interface ShoppingRadar {
  alerts: PriceRiseAlert[];
  opportunities: SavingsOpportunity[];
  /** Soma das economias potenciais de todas as oportunidades, em centavos. */
  totalPotentialSavingsCents: Centavos;
  /** Nº de observações consideradas (para gating de UI: 0 → esconder). */
  observationCount: number;
}

export interface ShoppingRadarOptions {
  /** Piso de variação para virar alerta, em basis points. Default 300 (3%). */
  minRiseBps?: number;
  /** Piso de economia para virar oportunidade, em centavos. Default 50 (R$0,50). */
  minSavingsCents?: number;
  /** Máx. de itens por lista (evita ruído no briefing). Default 5. */
  limit?: number;
}

/**
 * Deriva o Radar de Compras a partir das observações de preço. Determinístico:
 * mesmas observações → mesmo radar. Fail-closed herdado de buildPriceCatalog
 * (observações com centavos inválidos são ignoradas).
 */
export function buildShoppingRadar(
  observations: readonly PriceObservation[],
  options: ShoppingRadarOptions = {},
): ShoppingRadar {
  const minRiseBps = options.minRiseBps ?? 300;
  const minSavingsCents = options.minSavingsCents ?? 50;
  const limit = options.limit ?? 5;

  const catalog = buildPriceCatalog(observations);

  const alerts: PriceRiseAlert[] = [];
  const opportunities: SavingsOpportunity[] = [];

  for (const profile of catalog) {
    // ── Alerta de alta: subiu na loja da observação mais recente ──
    if (
      profile.trendBps !== null &&
      profile.trendDeltaCents !== null &&
      profile.trendBps >= minRiseBps &&
      profile.trendDeltaCents > 0
    ) {
      const toCents = profile.stores.find((s) => s.store === profile.latestStore)?.lastUnitPriceCents;
      if (toCents !== undefined) {
        alerts.push({
          productKey: profile.productKey,
          displayName: profile.displayName,
          store: profile.latestStore,
          fromCents: (toCents - profile.trendDeltaCents) as Centavos,
          toCents,
          deltaCents: profile.trendDeltaCents as Centavos,
          bps: profile.trendBps,
        });
      }
    }

    // ── Oportunidade: mesma mercadoria mais barata noutra loja ──
    if (profile.stores.length >= 2) {
      const cheapest = profile.stores[0]!; // stores já ordenado asc por último preço
      const priciest = profile.stores[profile.stores.length - 1]!;
      const savings = priciest.lastUnitPriceCents - cheapest.lastUnitPriceCents;
      if (savings >= minSavingsCents) {
        opportunities.push({
          productKey: profile.productKey,
          displayName: profile.displayName,
          cheapestStore: cheapest.store,
          cheapestCents: cheapest.lastUnitPriceCents,
          priciestStore: priciest.store,
          priciestCents: priciest.lastUnitPriceCents,
          savingsCents: savings as Centavos,
        });
      }
    }
  }

  // Maiores primeiro; desempate estável por productKey.
  alerts.sort((a, b) => b.bps - a.bps || (a.productKey < b.productKey ? -1 : 1));
  opportunities.sort(
    (a, b) => b.savingsCents - a.savingsCents || (a.productKey < b.productKey ? -1 : 1),
  );

  const limitedOpps = opportunities.slice(0, limit);
  const totalPotentialSavingsCents = limitedOpps.reduce(
    (sum, o) => sum + o.savingsCents,
    0,
  ) as Centavos;

  return {
    alerts: alerts.slice(0, limit),
    opportunities: limitedOpps,
    totalPotentialSavingsCents,
    observationCount: observations.length,
  };
}
