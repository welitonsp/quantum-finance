// src/shared/types/transaction.ts
// Fonte única de verdade para as entidades financeiras do domínio.
// Mantém paridade exacta de categorias com financialSchemas.js durante a
// migração — substituirá esse ficheiro no T1.3.
import { z } from 'zod';
import { MoneySchema } from './money';

export const CATEGORY_VALUES = [
  'Alimentação', 'Transporte', 'Assinaturas', 'Educação', 'Saúde',
  'Moradia', 'Impostos/Taxas', 'Lazer', 'Vestuário', 'Salário',
  'Freelance', 'Investimento', 'Diversos', 'Outros',
] as const;

export const TransactionTypeSchema = z.enum(['entrada', 'saida', 'transferencia'] as const);
export type TransactionType = z.infer<typeof TransactionTypeSchema>;

export const CategorySchema = z.enum(CATEGORY_VALUES);
export type Category = z.infer<typeof CategorySchema>;

export const TransactionSchema = z.object({
  id:           z.string().min(1),
  date:         z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description:  z.string().min(1).max(200),
  value:        MoneySchema,
  type:         TransactionTypeSchema,
  category:     CategorySchema,
  accountId:    z.string().optional(),
  source:       z.string().optional(),
  _reconciled:  z.boolean().default(false),
});

export type Transaction = z.infer<typeof TransactionSchema>;
