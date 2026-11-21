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
  const { items, loading, error, refresh } = useSupabaseTable<CategoryRow, UserCategory | null>(uid, options);
  const userCategories = useMemo(
    () => items.filter((c): c is UserCategory => c !== null),
    [items],
  );

  const insertCategory = useCallback(async (payload: CategoryWritePayload): Promise<string | UserCategory> => {
    if (!uid) throw new Error('Usuário não autenticado.');
    const db = getSupabase();
    const { data, error } = await db.from('categories').insert(toCategoryColumns(payload)).select('id').single();
    if (!error && data) {
      await refresh();
      return (data as { id: string }).id;
    }
    if ((error as { code?: string } | null)?.code !== DUPLICATE) {
      logSanitizedFirebaseError('category_create', error);
      throw new Error('Não foi possível criar a categoria.');
    }

    // Nome já existe para o usuário (nome único no banco).
    // Desativada: reativa a mesma linha com os dados novos.
    const { data: revived, error: reviveError } = await db
      .from('categories')
      .update(toCategoryColumns(payload))
      .eq('normalized_name', payload.normalizedName)
      .eq('is_active', false)
      .select('id');
    if (reviveError) {
      logSanitizedFirebaseError('category_create', reviveError);
      throw new Error('Não foi possível criar a categoria.');
    }
    const revivedId = (revived as Array<{ id: string }> | null)?.[0]?.id;
    if (revivedId) {
      await refresh();
      return revivedId;
    }

    // Ativa (criada em outra aba): reaproveita sem alterar o que já foi salvo e
    // devolve a categoria como está no banco (o nome gravado pode diferir em caixa).
    const { data: existing } = await db
      .from('categories')
      .select('id, name, normalized_name, type, color, icon, is_default, is_active')
      .eq('normalized_name', payload.normalizedName)
      .maybeSingle();
    await refresh();
    const stored = existing ? mapCategoryRow(existing as CategoryRow, uid) : null;
    if (stored) return stored;
    throw new Error('Não foi possível criar a categoria.');
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

  return { userCategories, loading, error, insertCategory, patchCategory };
}
