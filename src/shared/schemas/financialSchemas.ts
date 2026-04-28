import { z } from 'zod';
import Decimal from 'decimal.js';
import {
  toCentavos as toCentavosMoney,
  fromCentavos as fromCentavosMoney,
  type Centavos,
} from '../types/money';

export const ALLOWED_CATEGORIES = [
  'Alimentação', 'Transporte', 'Assinaturas', 'Educação', 'Saúde',
  'Moradia', 'Impostos/Taxas', 'Lazer', 'Vestuário', 'Salário',
  'Freelance', 'Investimento', 'Diversos', 'Outros', 'Importado'
] as const;

export type AllowedCategory = typeof ALLOWED_CATEGORIES[number];

export const transactionSchema = z.object({
  description: z.string().min(2, "A descrição deve ter pelo menos 2 caracteres"),
  value: z.number().int("O valor deve ser em centavos").positive("O valor deve ser positivo"),
  type: z.enum(['entrada', 'saida'], { message: "O tipo tem de ser 'entrada' ou 'saida'" }),
  category: z.enum(ALLOWED_CATEGORIES, { message: "Categoria inválida" }),
  date: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Formato inválido. Use YYYY-MM-DD")
    .refine(val => {
      const d = new Date(val);
      const hoje = new Date();
      const doisAnosAtras = new Date();
      doisAnosAtras.setFullYear(hoje.getFullYear() - 2);
      const trintaDiasFrente = new Date();
      trintaDiasFrente.setDate(hoje.getDate() + 30);
      return d >= doisAnosAtras && d <= trintaDiasFrente;
    }, { message: "Data fora do intervalo (até 2 anos atrás, até 30 dias à frente)" }),
  accountId: z.string().optional(),
  isRecurring: z.boolean().default(false)
});

export type TransactionInput = z.infer<typeof transactionSchema>;

export const recurringSchema = z.object({
  description: z.string().min(2),
  value: z.number().int("Valor em centavos exigido").positive(),
  category: z.enum(ALLOWED_CATEGORIES),
  dueDay: z.number().min(1).max(31, "O dia de vencimento tem de ser entre 1 e 31"),
  active: z.boolean().default(true)
});

export type RecurringInput = z.infer<typeof recurringSchema>;

export function validateTransaction(data: unknown) {
  return transactionSchema.safeParse(data);
}

export const toCentavos = (val: number | string | Decimal | null | undefined): Centavos => {
  if (val === null || val === undefined || val === '') return 0 as Centavos;
  return toCentavosMoney(val);
};

export const fromCentavos = (val: Centavos | number | null | undefined): number => {
  if (val === null || val === undefined) return 0;
  return fromCentavosMoney(val);
};

export const creditCardSchema = z.object({
  name:       z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  limit:      z.number().int("Limite em centavos").positive("Limite deve ser positivo"),
  closingDay: z.number().min(1).max(31, "Dia de fecho entre 1 e 31"),
  dueDay:     z.number().min(1).max(31, "Dia de vencimento entre 1 e 31"),
  color:      z.string().default('#00E68A'),
  active:     z.boolean().default(true),
});

export type CreditCardInput = z.infer<typeof creditCardSchema>;

export function validateCreditCard(data: unknown) {
  return creditCardSchema.safeParse(data);
}
