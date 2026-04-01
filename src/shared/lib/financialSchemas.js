// src/schemas/financialSchemas.js
import { z } from 'zod';

// Lista exata das categorias permitidas (Sincronizada com a IA)
export const ALLOWED_CATEGORIES = [
  'Alimentação', 'Transporte', 'Assinaturas', 'Educação', 'Saúde', 
  'Moradia', 'Impostos/Taxas', 'Lazer', 'Vestuário', 'Salário', 
  'Freelance', 'Investimento', 'Diversos', 'Outros'
];

// O formato de ferro de uma Transação Quântica
export const transactionSchema = z.object({
  description: z.string().min(2, "A descrição deve ter pelo menos 2 caracteres"),
  value: z.number().positive("O valor deve ser sempre positivo na base de dados"),
  type: z.enum(['entrada', 'saida'], {
    errorMap: () => ({ message: "O tipo tem de ser 'entrada' ou 'saida'" })
  }),
  category: z.enum(ALLOWED_CATEGORIES, {
    errorMap: () => ({ message: "Categoria inválida detetada" })
  }),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "A data deve estar no formato YYYY-MM-DD"),
  accountId: z.string().optional(), // Para quando introduzirmos multi-contas
  isRecurring: z.boolean().default(false)
});

// O formato de ferro para as Despesas Recorrentes (Assinaturas)
export const recurringSchema = z.object({
  description: z.string().min(2),
  value: z.number().positive(),
  category: z.enum(ALLOWED_CATEGORIES),
  dueDay: z.number().min(1).max(31, "O dia de vencimento tem de ser entre 1 e 31"),
  active: z.boolean().default(true)
});

/**
 * Função utilitária para validar dados antes de irem para o Firebase
 */
export function validateTransaction(data) {
  return transactionSchema.safeParse(data);
}