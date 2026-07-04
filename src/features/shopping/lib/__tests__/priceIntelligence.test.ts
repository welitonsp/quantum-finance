import { describe, expect, it } from 'vitest';
import type { PriceObservation } from '../../../../shared/types/shopping';
import {
  buildPriceCatalog,
  canonicalProductKey,
  compareBasketAcrossStores,
  deltaBps,
} from '../priceIntelligence';

let seq = 0;
function obs(partial: Partial<Omit<PriceObservation, 'unitPriceCents'>> &
  Pick<PriceObservation, 'productName' | 'store' | 'observedAt'> &
  { unitPriceCents: number }): PriceObservation {
  seq += 1;
  return {
    id: `obs-${seq}`,
    uid: 'u1',
    quantity: '1',
    unit: 'un',
    createdAt: `2026-07-04T00:00:${String(seq).padStart(2, '0')}Z`,
    schemaVersion: 1,
    ...partial,
  } as PriceObservation;
}

describe('canonicalProductKey', () => {
  it('normaliza caixa, espaços e acentos', () => {
    expect(canonicalProductKey('  Arroz  Tipo 1 ')).toBe('arroz tipo 1');
    expect(canonicalProductKey('AÇÚCAR Cristal')).toBe('acucar cristal');
    expect(canonicalProductKey('café')).toBe(canonicalProductKey('CAFE'));
  });
});

describe('deltaBps — variação em basis points, aritmética inteira', () => {
  it('calcula alta e queda com round-half-up simétrico', () => {
    expect(deltaBps(1000, 1100)).toBe(1000);   // +10.00%
    expect(deltaBps(1000, 900)).toBe(-1000);   // -10.00%
    expect(deltaBps(300, 400)).toBe(3333);     // +33.33%
    expect(deltaBps(1000, 1000)).toBe(0);
  });

  it('fail-closed em entradas inválidas', () => {
    expect(deltaBps(0, 100)).toBeNull();
    expect(deltaBps(-5, 100)).toBeNull();
    expect(deltaBps(10.5, 100)).toBeNull();
  });
});

describe('buildPriceCatalog', () => {
  it('agrupa por produto canônico e por loja, com melhor loja primeiro', () => {
    const catalog = buildPriceCatalog([
      obs({ productName: 'arroz tipo 1', store: 'Loja A', unitPriceCents: 2145, observedAt: '2026-07-01' }),
      obs({ productName: 'ARROZ TIPO 1', store: 'Loja B', unitPriceCents: 1990, observedAt: '2026-07-02' }),
      obs({ productName: 'feijão preto', store: 'Loja A', unitPriceCents: 899, observedAt: '2026-07-02' }),
    ]);

    expect(catalog).toHaveLength(2);
    const arroz = catalog.find((p) => p.productKey === 'arroz tipo 1')!;
    expect(arroz.stores).toHaveLength(2);
    expect(arroz.bestStore.store).toBe('Loja B');
    expect(arroz.bestStore.lastUnitPriceCents).toBe(1990);
  });

  it('tendência usa última vs penúltima NA MESMA loja da observação mais recente', () => {
    const catalog = buildPriceCatalog([
      obs({ productName: 'leite', store: 'Loja A', unitPriceCents: 500, observedAt: '2026-06-01' }),
      obs({ productName: 'leite', store: 'Loja B', unitPriceCents: 480, observedAt: '2026-06-15' }),
      obs({ productName: 'leite', store: 'Loja A', unitPriceCents: 550, observedAt: '2026-07-01' }),
    ]);
    const leite = catalog[0]!;
    // Última obs: Loja A 550; anterior na Loja A: 500 → +10% = +1000 bps.
    expect(leite.trendDeltaCents).toBe(50);
    expect(leite.trendBps).toBe(1000);
  });

  it('sem segunda observação na loja → tendência null', () => {
    const catalog = buildPriceCatalog([
      obs({ productName: 'leite', store: 'Loja A', unitPriceCents: 500, observedAt: '2026-06-01' }),
      obs({ productName: 'leite', store: 'Loja B', unitPriceCents: 480, observedAt: '2026-07-01' }),
    ]);
    expect(catalog[0]!.trendBps).toBeNull();
    expect(catalog[0]!.trendDeltaCents).toBeNull();
  });

  it('min/máx por loja e contagem corretos', () => {
    const catalog = buildPriceCatalog([
      obs({ productName: 'café', store: 'Loja A', unitPriceCents: 1200, observedAt: '2026-06-01' }),
      obs({ productName: 'café', store: 'Loja A', unitPriceCents: 1400, observedAt: '2026-06-10' }),
      obs({ productName: 'café', store: 'Loja A', unitPriceCents: 1300, observedAt: '2026-07-01' }),
    ]);
    const snap = catalog[0]!.stores[0]!;
    expect(snap.observationCount).toBe(3);
    expect(snap.minUnitPriceCents).toBe(1200);
    expect(snap.maxUnitPriceCents).toBe(1400);
    expect(snap.lastUnitPriceCents).toBe(1300);
  });

  it('ignora observações com centavos inválidos (fail-closed)', () => {
    const catalog = buildPriceCatalog([
      obs({ productName: 'x', store: 'A', unitPriceCents: 0, observedAt: '2026-07-01' }),
      obs({ productName: 'x', store: 'A', unitPriceCents: 10.5, observedAt: '2026-07-01' }),
    ]);
    expect(catalog).toHaveLength(0);
  });
});

describe('compareBasketAcrossStores', () => {
  const observations = [
    obs({ productName: 'arroz', store: 'Loja A', unitPriceCents: 2000, observedAt: '2026-07-01' }),
    obs({ productName: 'arroz', store: 'Loja B', unitPriceCents: 2200, observedAt: '2026-07-01' }),
    obs({ productName: 'feijão', store: 'Loja A', unitPriceCents: 900, observedAt: '2026-07-01' }),
    obs({ productName: 'feijão', store: 'Loja B', unitPriceCents: 800, observedAt: '2026-07-01' }),
    obs({ productName: 'azeite', store: 'Loja B', unitPriceCents: 3500, observedAt: '2026-07-01' }),
  ];

  it('cota a cesta por loja e aponta a melhor cobertura total', () => {
    const result = compareBasketAcrossStores(
      [
        { productName: 'Arroz', quantityTimes100: 200 },   // 2×
        { productName: 'FEIJÃO', quantityTimes100: 100 },  // 1×
      ],
      observations,
    );

    const lojaA = result.quotes.find((q) => q.store === 'Loja A')!;
    const lojaB = result.quotes.find((q) => q.store === 'Loja B')!;
    expect(lojaA.totalCents).toBe(2 * 2000 + 900);  // 4900
    expect(lojaB.totalCents).toBe(2 * 2200 + 800);  // 5200
    expect(lojaA.coveredItems).toBe(2);
    expect(result.bestFullCoverage?.store).toBe('Loja A');
    expect(result.savingsCents).toBe(300);
  });

  it('loja sem cobertura total lista os produtos faltantes', () => {
    const result = compareBasketAcrossStores(
      [
        { productName: 'arroz', quantityTimes100: 100 },
        { productName: 'azeite', quantityTimes100: 100 },
      ],
      observations,
    );
    const lojaA = result.quotes.find((q) => q.store === 'Loja A')!;
    expect(lojaA.coveredItems).toBe(1);
    expect(lojaA.missingProducts).toEqual(['azeite']);
    // Só a Loja B cobre tudo.
    expect(result.bestFullCoverage?.store).toBe('Loja B');
    expect(result.savingsCents).toBe(0); // única cobertura total → sem comparação
  });

  it('quantidade fracionária: 0,5× de item por kg', () => {
    const result = compareBasketAcrossStores(
      [{ productName: 'arroz', quantityTimes100: 50 }],
      observations,
    );
    const lojaA = result.quotes.find((q) => q.store === 'Loja A')!;
    expect(lojaA.totalCents).toBe(1000); // 2000 × 50 / 100
  });

  it('cesta vazia e sem observações não explode', () => {
    expect(compareBasketAcrossStores([], []).quotes).toEqual([]);
    expect(compareBasketAcrossStores([], []).bestFullCoverage).toBeNull();
    const semObs = compareBasketAcrossStores([{ productName: 'x', quantityTimes100: 100 }], []);
    expect(semObs.quotes).toEqual([]);
    expect(semObs.bestFullCoverage).toBeNull();
  });

  it('quantidade inválida cai para 1× (fail-safe de estimativa)', () => {
    const result = compareBasketAcrossStores(
      [{ productName: 'arroz', quantityTimes100: -5 }],
      observations,
    );
    expect(result.quotes.find((q) => q.store === 'Loja A')!.totalCents).toBe(2000);
  });
});
