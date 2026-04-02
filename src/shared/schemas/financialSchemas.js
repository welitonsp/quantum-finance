// src/shared/schemas/financialSchemas.js
import { z } from 'zod';

export const ALLOWED_CATEGORIES = [
  'Alimentação', 'Transporte', 'Assinaturas', 'Educação', 'Saúde', 
  'Moradia', 'Impostos/Taxas', 'Lazer', 'Vestuário', 'Salário', 
  'Freelance', 'Investimento', 'Diversos', 'Outros'
];

export const transactionSchema = z.object({
  description: z.string().min(2, "A descrição deve ter pelo menos 2 caracteres"),
  value: z.number().int("O valor deve ser em centavos").positive("O valor deve ser positivo"),
  type: z.enum(['entrada', 'saida'], { errorMap: () => ({ message: "O tipo tem de ser 'entrada' ou 'saida'" }) }),
  category: z.enum(ALLOWED_CATEGORIES, { errorMap: () => ({ message: "Categoria inválida" }) }),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "A data deve estar no formato YYYY-MM-DD"),
  accountId: z.string().optional(),
  isRecurring: z.boolean().default(false)
});

// Para as Despesas Recorrentes
export const recurringSchema = z.object({
  description: z.string().min(2),
  value: z.number().int("Valor em centavos exigido").positive(),
  category: z.enum(ALLOWED_CATEGORIES),
  dueDay: z.number().min(1).max(31, "O dia de vencimento tem de ser entre 1 e 31"),
  active: z.boolean().default(true)
});

export function validateTransaction(data) {
  return transactionSchema.safeParse(data);
}

// ✅ AQUI ESTÃO AS FUNÇÕES MATEMÁTICAS QUE O SISTEMA PROCURA!
export const toCentavos = (val) => Math.round(Number(val) * 100);
export const fromCentavos = (val) => Number(val) / 100;