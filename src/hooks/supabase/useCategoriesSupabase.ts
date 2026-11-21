// Categorias do usuário no Supabase (tabela public.categories).
// As categorias padrão do sistema continuam só no app (useCategories);
// aqui ficam apenas as criadas pelo usuário.
import { useCallback, useMemo } from 'react';
import { getSupabase } from '../../shared/api/supabase/client';
import { logSanitizedFirebaseError } from '../../shared/lib/firebaseErrorHandling';
import { userCategorySchema, type UserCategory } from '../../shared/schemas/categorySchemas';
import type { CategoryPatch, CategoryStore, CategoryWritePayload } from '../useCategories';
import { useSupabaseTable } from './useSupabaseTable';

export interface CategoryRow {
  id: string;
  name: string | null;
  normalized_name: string | null;
  type: string | null;
  color: string | null;
  icon: string | null;
  is_default: boolean | null;
  is_active: boolean | null;
}

/** Linha do banco → categoria validada pelo mesmo schema do app (inválida vira null). */
export function mapCategoryRow(row: CategoryRow, uid: string): UserCategory | null {
  const candidate: Record<string, unknown> = {
    id: row.id,
    uid,
    name: row.name ?? '',
    normalizedName: row.normalized_name ?? '',
    type: row.type,
    color: row.color ?? '',
    isDefault: row.is_default === true,
    isActive: row.is_active !== false,
  };
  if (row.icon) candidate['icon'] = row.icon;
  const parsed = userCategorySchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

const FIELD_TO_COLUMN: Record<keyof CategoryWritePayload, string> = {
  name: 'name',
  normalizedName: 'normalized_name',
  type: 'type',
  color: 'color',
  icon: 'icon',
  isDefault: 'is_default',
  isActive: 'is_active',
};

/** Campos do app → colunas do banco (só os informados). */
export function toCategoryColumns(data: CategoryPatch | CategoryWritePayload): Record<string, unknown> {
  const cols: Record<string, unknown> = {};
  for (const [field, column] of Object.entries(FIELD_TO_COLUMN)) {
    const value = (data as Record<string, unknown>)[field];
    if (value !== undefined) cols[column] = value;
  }
  return cols;
}

const DUPLICATE = '23505';

export function useCategoryStoreSupabase(uid: string): CategoryStore {
  const options = useMemo(() => ({
    table: 'categories',
    columns: 'id, name, normalized_name, type, color, icon, is_default, is_active',
    orderBy: 'name',
    map: (row: CategoryRow) => mapCategoryRow(row, uid),
    loadOp: 'categories_load' as const,
  }), [uid]);
  const { items, loading, refresh } = useSupabaseTable<CategoryRow, UserCategory | null>(uid, options);
  const userCategories = useMemo(
    () => items.filter((c): c is UserCategory => c !== null),
    [items],
  );

  const insertCategory = useCallback(async (payload: CategoryWritePayload): Promise<string> => {
    if (!uid) throw new Error('Usuário não autenticado.');
    // Nome único por usuário no banco: recriar uma categoria desativada a reativa
    // (mesmo id), em vez de falhar como duplicata.
    const { data, error } = await getSupabase()
      .from('categories')
      .upsert(toCategoryColumns(payload), { onConflict: 'user_id,normalized_name' })
      .select('id')
      .single();
    if (error || !data) {
      logSanitizedFirebaseError('category_create', error);
      throw new Error('Não foi possível criar a categoria.');
    }
    await refresh();
    return (data as { id: string }).id;
  }, [uid, refresh]);

  const patchCategory = useCallback(async (categoryId: string, patch: CategoryPatch): Promise<void> => {
    if (!uid) throw new Error('Usuário não autenticado.');
    const { error } = await getSupabase()
      .from('categories')
      .update(toCategoryColumns(patch))
      .eq('id', categoryId);
    if (error) {
      logSanitizedFirebaseError('category_update', error);
      throw new Error((error as { code?: string }).code === DUPLICATE
        ? 'Essa categoria já existe.'
        : 'Não foi possível atualizar a categoria.');
    }
    await refresh();
  }, [uid, refresh]);

  return { userCategories, loading, error: null, insertCategory, patchCategory };
}
