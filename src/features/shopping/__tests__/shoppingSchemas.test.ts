import { describe, it, expect } from 'vitest';
import {
  shoppingListItemCreateSchema,
  shoppingListCreateSchema,
  shoppingListItemCheckSchema,
  priceObservationCreateSchema,
} from '../../../shared/schemas/shoppingSchemas';

describe('shoppingListItemCreateSchema', () => {
  const validItem = {
    productName: 'Arroz integral',
    quantity: '2',
    unit: 'kg' as const,
    estimatedUnitPriceCents: 1290,
    estimatedTotalCents: 2580,
    checked: false,
  };

  it('accepts valid item', () => {
    expect(() => shoppingListItemCreateSchema.parse(validItem)).not.toThrow();
  });

  it('rejects empty productName', () => {
    expect(() => shoppingListItemCreateSchema.parse({ ...validItem, productName: '' })).toThrow();
  });

  it('rejects negative estimatedUnitPriceCents', () => {
    expect(() => shoppingListItemCreateSchema.parse({ ...validItem, estimatedUnitPriceCents: -1 })).toThrow();
  });

  it('rejects float estimatedTotalCents', () => {
    expect(() => shoppingListItemCreateSchema.parse({ ...validItem, estimatedTotalCents: 25.5 })).toThrow();
  });

  it('rejects zero quantity', () => {
    expect(() => shoppingListItemCreateSchema.parse({ ...validItem, quantity: '0' })).toThrow();
  });

  it('rejects invalid unit', () => {
    expect(() => shoppingListItemCreateSchema.parse({ ...validItem, unit: 'galao' })).toThrow();
  });

  it('accepts quantity with comma decimal', () => {
    const result = shoppingListItemCreateSchema.parse({ ...validItem, quantity: '1,5' });
    expect(result.quantity).toBe('1,5');
  });

  it('rejects extra fields (strict)', () => {
    expect(() => shoppingListItemCreateSchema.parse({ ...validItem, hackerField: 'x' })).toThrow();
  });
});

describe('shoppingListCreateSchema', () => {
  const validList = {
    name: 'Mercado semanal',
    estimatedTotalCents: 0,
    status: 'open' as const,
    items: [],
  };

  it('accepts valid list', () => {
    expect(() => shoppingListCreateSchema.parse(validList)).not.toThrow();
  });

  it('rejects empty name', () => {
    expect(() => shoppingListCreateSchema.parse({ ...validList, name: '' })).toThrow();
  });

  it('rejects invalid status', () => {
    expect(() => shoppingListCreateSchema.parse({ ...validList, status: 'cancelled' })).toThrow();
  });

  it('rejects more than 200 items', () => {
    const items = Array.from({ length: 201 }, (_, i) => ({
      productName: `Produto ${i}`,
      quantity: '1',
      unit: 'un' as const,
      estimatedUnitPriceCents: 100,
      estimatedTotalCents: 100,
      checked: false,
    }));
    expect(() => shoppingListCreateSchema.parse({ ...validList, items })).toThrow();
  });

  it('accepts optional scheduledDate in YYYY-MM-DD', () => {
    expect(() => shoppingListCreateSchema.parse({ ...validList, scheduledDate: '2026-07-01' })).not.toThrow();
  });

  it('rejects invalid date format for scheduledDate', () => {
    expect(() => shoppingListCreateSchema.parse({ ...validList, scheduledDate: '01/07/2026' })).toThrow();
  });
});

describe('shoppingListItemCheckSchema', () => {
  it('accepts mark as checked without price', () => {
    expect(() => shoppingListItemCheckSchema.parse({ checked: true })).not.toThrow();
  });

  it('accepts mark as checked with actual price', () => {
    expect(() => shoppingListItemCheckSchema.parse({ checked: true, actualUnitPriceCents: 1290, actualTotalCents: 2580 })).not.toThrow();
  });

  it('rejects negative actual price', () => {
    expect(() => shoppingListItemCheckSchema.parse({ checked: true, actualUnitPriceCents: -1 })).toThrow();
  });
});

describe('priceObservationCreateSchema', () => {
  const validObs = {
    productName: 'Leite integral',
    store: 'Pão de Açúcar',
    unitPriceCents: 599,
    quantity: '1',
    unit: 'L' as const,
    observedAt: '2026-06-13',
  };

  it('accepts valid observation', () => {
    expect(() => priceObservationCreateSchema.parse(validObs)).not.toThrow();
  });

  it('rejects zero unitPriceCents', () => {
    expect(() => priceObservationCreateSchema.parse({ ...validObs, unitPriceCents: 0 })).toThrow();
  });

  it('rejects invalid observedAt format', () => {
    expect(() => priceObservationCreateSchema.parse({ ...validObs, observedAt: '13/06/2026' })).toThrow();
  });

  it('rejects empty store', () => {
    expect(() => priceObservationCreateSchema.parse({ ...validObs, store: '' })).toThrow();
  });

  it('normalizes productName via schema (no mutation — normalization is done in hook)', () => {
    const result = priceObservationCreateSchema.parse(validObs);
    expect(result.productName).toBe('Leite integral');
  });
});
