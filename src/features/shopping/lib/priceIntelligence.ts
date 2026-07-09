// Motor puro de inteligência de preços — FASE Cesta Pessoal.
// Padrão dos motores do projeto (cardProjection/debtStrategy): ZERO I/O,
// ZERO float em valor monetário. Dinheiro em centavos inteiros; variações
// percentuais em BASIS POINTS inteiros (1% = 100 bps) calculados com
// aritmética inteira — nunca parseFloat/Math.round sobre reais.

import type { Centavos } from '../../../shared/types/money';
import type { PriceObservation } from '../../../shared/types/shopping';

/** Chave canônica de produto: lowercase, espaços colapsados, sem acentos. */
export function canonicalProductKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

export interface StorePriceSnapshot {
  store: string;
  /** Última observação (mais recente por observedAt, desempate por createdAt). */
  lastUnitPriceCents: Centavos;
  lastObservedAt: string;
  observationCount: number;
  minUnitPriceCents: Centavos;
  maxUnitPriceCents: Centavos;
}

export interface ProductPriceProfile {
  productKey: string;
  /** Nome de exibição: o da observação mais recente. */
  displayName: string;
  stores: StorePriceSnapshot[];
  /** Loja com o menor último preço. */
  bestStore: StorePriceSnapshot;
  /** Loja da observação mais recente (onde a tendência é medida). */
  latestStore: string;
  /** Variação do último preço vs o anterior NA MESMA LOJA da última compra;
   *  null quando só há 1 observação nessa loja. Em basis points (1% = 100). */
  trendBps: number | null;
  /** Delta absoluto correspondente ao trend, em centavos (com sinal). */
  trendDeltaCents: number | null;
}

/** Ordena observações da mais antiga para a mais recente (determinístico). */
function chronological(a: PriceObservation, b: PriceObservation): number {
  if (a.observedAt !== b.observedAt) return a.observedAt < b.observedAt ? -1 : 1;
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Variação em basis points via aritmética inteira (round-half-up simétrico). */
export function deltaBps(fromCents: number, toCents: number): number | null {
  if (!Number.isSafeInteger(fromCents) || !Number.isSafeInteger(toCents) || fromCents <= 0) {
    return null;
  }
  const numerator = (toCents - fromCents) * 10_000;
  const sign = numerator < 0 ? -1 : 1;
  const abs = Math.abs(numerator);
  return sign * Math.trunc((abs + Math.trunc(fromCents / 2)) / fromCents);
}

/**
 * Constrói o catálogo de perfis de preço por produto canônico a partir das
 * observações. Observações com centavos inválidos são ignoradas (fail-closed).
 */
export function buildPriceCatalog(observations: readonly PriceObservation[]): ProductPriceProfile[] {
  const byProduct = new Map<string, PriceObservation[]>();
  for (const obs of observations) {
    if (!Number.isSafeInteger(obs.unitPriceCents) || obs.unitPriceCents <= 0) continue;
    const key = canonicalProductKey(obs.productName);
    if (key === '') continue;
    const list = byProduct.get(key);
    if (list) list.push(obs);
    else byProduct.set(key, [obs]);
  }

  const profiles: ProductPriceProfile[] = [];
  for (const [productKey, obsList] of byProduct) {
    obsList.sort(chronological);
    const latest = obsList[obsList.length - 1]!;

    const byStore = new Map<string, PriceObservation[]>();
    for (const obs of obsList) {
      const store = obs.store.trim();
      const list = byStore.get(store);
      if (list) list.push(obs);
      else byStore.set(store, [obs]);
    }

    const stores: StorePriceSnapshot[] = [];
    for (const [store, storeObs] of byStore) {
      const last = storeObs[storeObs.length - 1]!;
      let min = storeObs[0]!.unitPriceCents;
      let max = storeObs[0]!.unitPriceCents;
      for (const o of storeObs) {
        if (o.unitPriceCents < min) min = o.unitPriceCents;
        if (o.unitPriceCents > max) max = o.unitPriceCents;
      }
      stores.push({
        store,
        lastUnitPriceCents: last.unitPriceCents,
        lastObservedAt: last.observedAt,
        observationCount: storeObs.length,
        minUnitPriceCents: min,
        maxUnitPriceCents: max,
      });
    }
    stores.sort((a, b) => a.lastUnitPriceCents - b.lastUnitPriceCents);

    // Tendência: última vs penúltima observação NA loja da observação mais recente.
    const latestStoreObs = byStore.get(latest.store.trim())!;
    let trendBps: number | null = null;
    let trendDeltaCents: number | null = null;
    if (latestStoreObs.length >= 2) {
      const prev = latestStoreObs[latestStoreObs.length - 2]!;
      trendDeltaCents = latest.unitPriceCents - prev.unitPriceCents;
      trendBps = deltaBps(prev.unitPriceCents, latest.unitPriceCents);
    }

    profiles.push({
      productKey,
      displayName: latest.productName,
      stores,
      bestStore: stores[0]!,
      latestStore: latest.store.trim(),
      trendBps,
      trendDeltaCents,
    });
  }

  profiles.sort((a, b) => (a.productKey < b.productKey ? -1 : a.productKey > b.productKey ? 1 : 0));
  return profiles;
}

// ── Comparação de cesta por loja ─────────────────────────────────────────────

export interface BasketItemInput {
  productName: string;
  /** Quantidade multiplicadora — inteiro de "unidades de compra"; para itens
   *  fracionários (kg), o chamador passa 1 e o preço já é por unidade típica. */
  quantityTimes100: number;
}

export interface StoreBasketQuote {
  store: string;
  /** Itens da cesta com preço conhecido nesta loja. */
  coveredItems: number;
  totalItems: number;
  /** Custo total dos itens cobertos (preço × qty/100), em centavos. */
  totalCents: Centavos;
  /** Produtos sem preço conhecido nesta loja (chaves canônicas). */
  missingProducts: string[];
}

export interface BasketComparison {
  quotes: StoreBasketQuote[];
  /** Melhor cotação entre lojas com cobertura TOTAL; null se nenhuma cobre tudo. */
  bestFullCoverage: StoreBasketQuote | null;
  /** Economia em centavos entre a melhor e a pior cotação de cobertura total. */
  savingsCents: Centavos;
}

/**
 * Compara o custo da cesta em cada loja conhecida, usando o ÚLTIMO preço
 * observado por loja. Multiplicação inteira: total = Σ preço × qty100 / 100,
 * com resto validado (qty100 é inteiro; produto sempre inteiro em centavos
 * quando preço×qty100 é múltiplo de 100 — caso contrário arredonda para o
 * centavo via divisão inteira com resto descartado documentadamente, pois é
 * uma ESTIMATIVA de comparação, não um lançamento financeiro).
 */
export function compareBasketAcrossStores(
  basket: readonly BasketItemInput[],
  observations: readonly PriceObservation[],
): BasketComparison {
  const catalog = buildPriceCatalog(observations);
  const profileByKey = new Map(catalog.map((p) => [p.productKey, p]));

  const validBasket = basket
    .map((item) => ({
      key: canonicalProductKey(item.productName),
      qty100: Number.isSafeInteger(item.quantityTimes100) && item.quantityTimes100 > 0
        ? item.quantityTimes100
        : 100,
    }))
    .filter((item) => item.key !== '');

  const allStores = new Set<string>();
  for (const profile of catalog) {
    for (const s of profile.stores) allStores.add(s.store);
  }

  const quotes: StoreBasketQuote[] = [];
  for (const store of allStores) {
    let totalCents = 0;
    let covered = 0;
    const missing: string[] = [];
    for (const item of validBasket) {
      const snapshot = profileByKey.get(item.key)?.stores.find((s) => s.store === store);
      if (!snapshot) {
        missing.push(item.key);
        continue;
      }
      covered += 1;
      const raw = snapshot.lastUnitPriceCents * item.qty100;
      totalCents += (raw - (raw % 100)) / 100;
    }
    quotes.push({
      store,
      coveredItems: covered,
      totalItems: validBasket.length,
      totalCents: totalCents as Centavos,
      missingProducts: missing,
    });
  }

  // Ordena: maior cobertura primeiro; empate → mais barata primeiro.
  quotes.sort((a, b) =>
    b.coveredItems - a.coveredItems || a.totalCents - b.totalCents || (a.store < b.store ? -1 : 1));

  const fullCoverage = quotes.filter(
    (q) => q.totalItems > 0 && q.coveredItems === q.totalItems,
  );
  const bestFullCoverage = fullCoverage[0] ?? null;
  const worstFull = fullCoverage[fullCoverage.length - 1];
  const savingsCents = (bestFullCoverage && worstFull
    ? worstFull.totalCents - bestFullCoverage.totalCents
    : 0) as Centavos;

  return { quotes, bestFullCoverage, savingsCents };
}
