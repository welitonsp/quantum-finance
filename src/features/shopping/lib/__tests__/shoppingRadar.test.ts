import { describe, expect, it } from 'vitest';
import type { PriceObservation } from '../../../../shared/types/shopping';
import { buildShoppingRadar } from '../shoppingRadar';

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

describe('buildShoppingRadar — alertas de alta', () => {
  it('detecta produto que subiu na loja da observação mais recente', () => {
    const radar = buildShoppingRadar([
      obs({ productName: 'Café', store: 'Mercado A', observedAt: '2026-06-01', unitPriceCents: 1000 }),
      obs({ productName: 'Café', store: 'Mercado A', observedAt: '2026-07-01', unitPriceCents: 1200 }),
    ]);
    expect(radar.alerts).toHaveLength(1);
    const a = radar.alerts[0]!;
    expect(a.store).toBe('Mercado A');
    expect(a.fromCents).toBe(1000);
    expect(a.toCents).toBe(1200);
    expect(a.deltaCents).toBe(200);
    expect(a.bps).toBe(2000); // +20%
  });

  it('ignora alta abaixo do piso minRiseBps', () => {
    const radar = buildShoppingRadar(
      [
        obs({ productName: 'Leite', store: 'A', observedAt: '2026-06-01', unitPriceCents: 1000 }),
        obs({ productName: 'Leite', store: 'A', observedAt: '2026-07-01', unitPriceCents: 1010 }), // +1%
      ],
      { minRiseBps: 300 },
    );
    expect(radar.alerts).toHaveLength(0);
  });

  it('não alerta quando o preço caiu', () => {
    const radar = buildShoppingRadar([
      obs({ productName: 'Arroz', store: 'A', observedAt: '2026-06-01', unitPriceCents: 1200 }),
      obs({ productName: 'Arroz', store: 'A', observedAt: '2026-07-01', unitPriceCents: 1000 }),
    ]);
    expect(radar.alerts).toHaveLength(0);
  });
});

describe('buildShoppingRadar — oportunidades de economia', () => {
  it('aponta a loja mais barata e a economia em centavos', () => {
    const radar = buildShoppingRadar([
      obs({ productName: 'Feijão', store: 'Caro', observedAt: '2026-07-01', unitPriceCents: 900 }),
      obs({ productName: 'Feijão', store: 'Barato', observedAt: '2026-07-01', unitPriceCents: 700 }),
    ]);
    expect(radar.opportunities).toHaveLength(1);
    const o = radar.opportunities[0]!;
    expect(o.cheapestStore).toBe('Barato');
    expect(o.cheapestCents).toBe(700);
    expect(o.priciestStore).toBe('Caro');
    expect(o.priciestCents).toBe(900);
    expect(o.savingsCents).toBe(200);
    expect(radar.totalPotentialSavingsCents).toBe(200);
  });

  it('ignora diferença abaixo do piso minSavingsCents', () => {
    const radar = buildShoppingRadar(
      [
        obs({ productName: 'Pão', store: 'A', observedAt: '2026-07-01', unitPriceCents: 500 }),
        obs({ productName: 'Pão', store: 'B', observedAt: '2026-07-01', unitPriceCents: 520 }),
      ],
      { minSavingsCents: 50 },
    );
    expect(radar.opportunities).toHaveLength(0);
  });

  it('não gera oportunidade quando o produto só existe numa loja', () => {
    const radar = buildShoppingRadar([
      obs({ productName: 'Sal', store: 'A', observedAt: '2026-07-01', unitPriceCents: 300 }),
    ]);
    expect(radar.opportunities).toHaveLength(0);
  });
});

describe('buildShoppingRadar — ordenação, limite e gating', () => {
  it('ordena oportunidades por maior economia e respeita o limite', () => {
    const radar = buildShoppingRadar(
      [
        obs({ productName: 'P1', store: 'A', observedAt: '2026-07-01', unitPriceCents: 1000 }),
        obs({ productName: 'P1', store: 'B', observedAt: '2026-07-01', unitPriceCents: 1100 }),
        obs({ productName: 'P2', store: 'A', observedAt: '2026-07-01', unitPriceCents: 1000 }),
        obs({ productName: 'P2', store: 'B', observedAt: '2026-07-01', unitPriceCents: 1500 }),
      ],
      { limit: 1 },
    );
    expect(radar.opportunities).toHaveLength(1);
    expect(radar.opportunities[0]!.displayName).toBe('P2'); // maior economia (500) primeiro
    expect(radar.totalPotentialSavingsCents).toBe(500);
  });

  it('radar vazio para zero observações', () => {
    const radar = buildShoppingRadar([]);
    expect(radar.alerts).toHaveLength(0);
    expect(radar.opportunities).toHaveLength(0);
    expect(radar.totalPotentialSavingsCents).toBe(0);
    expect(radar.observationCount).toBe(0);
  });

  it('é determinístico — mesma entrada, mesmo radar', () => {
    const input = [
      obs({ productName: 'X', store: 'A', observedAt: '2026-07-01', unitPriceCents: 800 }),
      obs({ productName: 'X', store: 'B', observedAt: '2026-07-01', unitPriceCents: 1000 }),
    ];
    expect(buildShoppingRadar(input)).toEqual(buildShoppingRadar(input));
  });

  it('tiebreaker de alertas: mesma bps → ordenado por productKey asc', () => {
    // P-B e P-A têm mesma variação percentual → desempate por productKey asc
    const radar = buildShoppingRadar([
      obs({ productName: 'P-B', store: 'X', observedAt: '2026-06-01', unitPriceCents: 1000 }),
      obs({ productName: 'P-B', store: 'X', observedAt: '2026-07-01', unitPriceCents: 1500 }), // +50%
      obs({ productName: 'P-A', store: 'X', observedAt: '2026-06-01', unitPriceCents: 2000 }),
      obs({ productName: 'P-A', store: 'X', observedAt: '2026-07-01', unitPriceCents: 3000 }), // +50%
    ]);
    expect(radar.alerts).toHaveLength(2);
    // ambos com bps=5000; desempate lexicográfico: P-A < P-B → P-A primeiro
    const k0 = radar.alerts[0]!.productKey;
    const k1 = radar.alerts[1]!.productKey;
    expect(k0 < k1).toBe(true);
  });

  it('tiebreaker de oportunidades: mesma economia → ordenado por productKey asc', () => {
    const radar = buildShoppingRadar([
      obs({ productName: 'ZZ', store: 'A', observedAt: '2026-07-01', unitPriceCents: 1000 }),
      obs({ productName: 'ZZ', store: 'B', observedAt: '2026-07-01', unitPriceCents: 1200 }),
      obs({ productName: 'AA', store: 'A', observedAt: '2026-07-01', unitPriceCents: 1000 }),
      obs({ productName: 'AA', store: 'B', observedAt: '2026-07-01', unitPriceCents: 1200 }),
    ]);
    expect(radar.opportunities).toHaveLength(2);
    // mesma economia de 200; desempate lexicográfico: AA < ZZ
    const k0 = radar.opportunities[0]!.productKey;
    const k1 = radar.opportunities[1]!.productKey;
    expect(k0 < k1).toBe(true);
  });

  it('observationCount reflete o total de observações recebidas', () => {
    const radar = buildShoppingRadar([
      obs({ productName: 'X', store: 'A', observedAt: '2026-07-01', unitPriceCents: 500 }),
      obs({ productName: 'Y', store: 'B', observedAt: '2026-07-01', unitPriceCents: 300 }),
    ]);
    expect(radar.observationCount).toBe(2);
  });
});
