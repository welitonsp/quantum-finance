import { z } from 'zod';
import Decimal from 'decimal.js';
import {
  toCentavos as toCentavosMoney,
  fromCentavos as fromCentavosMoney,
  type Centavos,
  type MoneyInput,
} from '../types/money';

export const ALLOWED_CATEGORIES = [
  'Alimentação', 'Transporte', 'Assinaturas', 'Educação', 'Saúde',
  'Moradia', 'Impostos/Taxas', 'Lazer', 'Vestuário', 'Salário',
  'Freelance', 'Investimento', 'Diversos', 'Outros', 'Importado',
] as const;

export type AllowedCategory = typeof ALLOWED_CATEGORIES[number];

export const SOURCE_VALUES = ['csv', 'ofx', 'pdf', 'manual'] as const;
export type FinancialSource = typeof SOURCE_VALUES[number];

const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;

const forbiddenClientFields = {
  id: z.never().optional(),
  uid: z.never().optional(),
  createdAt: z.never().optional(),
  updatedAt: z.never().optional(),
};

const safeIntSchema = (label: string) =>
  z.number()
    .int(`${label} deve ser inteiro.`)
    .refine(Number.isSafeInteger, `${label} fora de Number.MAX_SAFE_INTEGER.`);

export const centavosSchema = safeIntSchema('value_cents')
  .positive('value_cents deve ser positivo.');

export const positiveCentavosSchema = safeIntSchema('centavos')
  .positive('Valor em centavos deve ser positivo.');

export const dateSchema = z.string()
  .regex(isoDateRegex, 'Formato inválido. Use YYYY-MM-DD.')
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, 'Data inválida.');

export const categorySchema = z.enum(ALLOWED_CATEGORIES, { message: 'Categoria inválida.' });
export const transactionTypeSchema = z.enum(['entrada', 'saida'], {
  message: "O tipo deve ser 'entrada' ou 'saida'.",
});
export const sourceSchema = z.enum(SOURCE_VALUES, { message: 'Fonte inválida.' });

const tagsSchema = z.array(z.string().trim().min(1).max(32)).max(20).optional();

const transactionBaseSchema = z.object({
  ...forbiddenClientFields,
  description: z.string().trim().min(2, 'A descrição deve ter pelo menos 2 caracteres.').max(160),
  value_cents: centavosSchema,
  type: transactionTypeSchema,
  category: categorySchema,
  date: dateSchema,
  source: sourceSchema,
  schemaVersion: z.literal(2),
  account: z.string().trim().min(1).max(120).optional(),
  accountId: z.string().trim().min(1).max(120).optional(),
  cardId: z.string().trim().min(1).max(120).optional(),
  fitId: z.string().trim().min(1).max(160).nullable().optional(),
  tags: tagsSchema,
  isRecurring: z.boolean().optional(),
}).strict();

export const transactionCreateSchema = transactionBaseSchema;

export const transactionUpdateSchema = z.object({
  ...forbiddenClientFields,
  description: z.string().trim().min(2).max(160).optional(),
  value_cents: centavosSchema.optional(),
  type: transactionTypeSchema.optional(),
  category: categorySchema.optional(),
  date: dateSchema.optional(),
  source: sourceSchema.optional(),
  schemaVersion: z.literal(2).optional(),
  account: z.string().trim().min(1).max(120).optional(),
  accountId: z.string().trim().min(1).max(120).optional(),
  cardId: z.string().trim().min(1).max(120).optional(),
  fitId: z.string().trim().min(1).max(160).nullable().optional(),
  tags: tagsSchema,
  isRecurring: z.boolean().optional(),
  isDeleted: z.boolean().optional(),
  deletedAt: z.unknown().optional(),
}).strict().refine(value => Object.keys(value).length > 0, 'Atualização vazia.');

export const accountTypeSchema = z.enum(['corrente', 'poupanca', 'investimento', 'cartao', 'divida']);

export const accountCreateSchema = z.object({
  ...forbiddenClientFields,
  name: z.string().trim().min(2).max(100),
  type: accountTypeSchema,
  balance: safeIntSchema('balance'),
  schemaVersion: z.literal(2),
}).strict();

export const accountUpdateSchema = z.object({
  ...forbiddenClientFields,
  name: z.string().trim().min(2).max(100).optional(),
  type: accountTypeSchema.optional(),
  balance: safeIntSchema('balance').optional(),
  schemaVersion: z.literal(2).optional(),
}).strict().refine(value => Object.keys(value).length > 0, 'Atualização vazia.');

export const recurringSchema = z.object({
  ...forbiddenClientFields,
  description: z.string().trim().min(2).max(160),
  value_cents: positiveCentavosSchema,
  type: transactionTypeSchema.default('saida'),
  category: categorySchema,
  dueDay: z.number().int().min(1).max(31),
  active: z.boolean().default(true),
  frequency: z.enum(['mensal', 'anual']).default('mensal'),
  schemaVersion: z.literal(2).default(2),
}).strict();

export const creditCardSchema = z.object({
  ...forbiddenClientFields,
  name: z.string().trim().min(2, 'Nome deve ter pelo menos 2 caracteres.').max(100),
  limit: positiveCentavosSchema,
  closingDay: z.number().int().min(1).max(31, 'Dia de fecho entre 1 e 31.'),
  dueDay: z.number().int().min(1).max(31, 'Dia de vencimento entre 1 e 31.'),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#00E68A'),
  active: z.boolean().default(true),
  schemaVersion: z.literal(2).default(2),
}).strict();

export type TransactionCreateInput = z.infer<typeof transactionCreateSchema>;
export type TransactionUpdateInput = z.infer<typeof transactionUpdateSchema>;
export type AccountCreateInput = z.infer<typeof accountCreateSchema>;
export type AccountUpdateInput = z.infer<typeof accountUpdateSchema>;
export type RecurringInput = z.infer<typeof recurringSchema>;
export type CreditCardInput = z.infer<typeof creditCardSchema>;

export const transactionSchema = transactionCreateSchema;
export type TransactionInput = TransactionCreateInput;

export function validateTransaction(data: unknown) {
  return transactionCreateSchema.safeParse(data);
}

export function validateCreditCard(data: unknown) {
  return creditCardSchema.safeParse(data);
}

export const toCentavos = (val: MoneyInput | null | undefined): Centavos => {
  if (val === null || val === undefined || val === '') return 0 as Centavos;
  return toCentavosMoney(val);
};

export const fromCentavos = (val: Centavos | number | null | undefined): number => {
  if (val === null || val === undefined) return 0;
  return fromCentavosMoney(val);
};

export const toDecimal = (val: MoneyInput | null | undefined): Decimal => {
  if (val === null || val === undefined || val === '') return new Decimal(0);
  return new Decimal(toCentavos(val)).dividedBy(100);
};
