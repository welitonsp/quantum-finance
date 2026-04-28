import { z } from 'zod';

export const categoryTypeSchema = z.enum(['entrada', 'saida', 'ambos']);
export type CategoryType = z.infer<typeof categoryTypeSchema>;

export const userCategorySchema = z.object({
  id: z.string().optional(),
  uid: z.string().min(1),
  name: z.string().trim().min(1).max(60),
  normalizedName: z.string().trim().min(1).max(80),
  type: categoryTypeSchema,
  color: z.string().trim().min(1).max(80),
  icon: z.string().trim().min(1).max(24).optional(),
  isDefault: z.boolean(),
  isActive: z.boolean(),
  createdAt: z.unknown().optional(),
  updatedAt: z.unknown().optional(),
}).strict();

export type UserCategory = z.infer<typeof userCategorySchema>;

export function normalizeCategoryName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9\s/_-]/g, '')
    .trim();
}
