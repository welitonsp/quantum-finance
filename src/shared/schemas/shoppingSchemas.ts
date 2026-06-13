import { z } from 'zod';
import Decimal from 'decimal.js';
import { type Centavos } from '../types/money';

const SHOPPING_UNITS = ['un', 'kg', 'g', 'L', 'mL', 'cx', 'pct', 'dz'] as const;

const quantityStrSchema = z
  .string()
  .min(1)
  .regex(/^\d+([.,]\d+)?$/, 'Quantidade inválida')
  .refine((v) => {
    const n = parseFloat(v.replace(',', '.'));
    return Number.isFinite(n) && n > 0;
  }, 'Quantidade deve ser positiva');

const safeCentsSchema = (label: string) =>
  z
    .number()
    .int(`${label} deve ser inteiro`)
    .min(0, `${label} deve ser não-negativo`)
    .max(Number.MAX_SAFE_INTEGER, `${label} fora de limites seguros`)
    .refine((v) => new Decimal(v).isInteger(), `${label} deve ser centavos inteiros`)
    .transform((v) => v as Centavos);

export const shoppingListItemCreateSchema = z
  .object({
    productName: z.string().min(1, 'Nome do produto obrigatório').max(120),
    quantity: quantityStrSchema,
    unit: z.enum(SHOPPING_UNITS),
    estimatedUnitPriceCents: safeCentsSchema('Preço unitário estimado'),
    estimatedTotalCents: safeCentsSchema('Total estimado'),
    store: z.string().max(80).optional(),
    checked: z.boolean().default(false),
    notes: z.string().max(200).optional(),
  })
  .strict();

export const shoppingListCreateSchema = z
  .object({
    name: z.string().min(1, 'Nome da lista obrigatório').max(80),
    scheduledDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida')
      .optional(),
    estimatedTotalCents: safeCentsSchema('Total estimado'),
    status: z.enum(['open', 'in_progress', 'done']).default('open'),
    items: z.array(shoppingListItemCreateSchema).max(200),
  })
  .strict();

export const shoppingListItemCheckSchema = z
  .object({
    checked: z.boolean(),
    actualUnitPriceCents: safeCentsSchema('Preço unitário real').optional(),
    actualTotalCents: safeCentsSchema('Total real').optional(),
    store: z.string().max(80).optional(),
  })
  .strict();

export const priceObservationCreateSchema = z
  .object({
    productName: z.string().min(1).max(120),
    store: z.string().min(1).max(80),
    unitPriceCents: safeCentsSchema('Preço unitário').refine((v) => v > 0, 'Preço unitário deve ser positivo'),
    quantity: quantityStrSchema,
    unit: z.enum(SHOPPING_UNITS),
    observedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida'),
    sourceListId: z.string().optional(),
  })
  .strict();

export type ShoppingListCreateInput = z.infer<typeof shoppingListCreateSchema>;
export type ShoppingListItemCreateInput = z.infer<typeof shoppingListItemCreateSchema>;
export type ShoppingListItemCheckInput = z.infer<typeof shoppingListItemCheckSchema>;
export type PriceObservationCreateInput = z.infer<typeof priceObservationCreateSchema>;
