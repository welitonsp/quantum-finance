// src/shared/types/money.ts
// Branded Type para garantir que valores monetários (em centavos) não se misturam
// com números arbitrários. O compilador recusa atribuições sem passar por toMoney().
import { z } from 'zod';

export type Money = number & { readonly __brand: unique symbol };

export const toMoney = (value: number): Money => Math.round(value) as Money;

export const MoneySchema = z.number().transform((v) => Math.round(v) as Money);
