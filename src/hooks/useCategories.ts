import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../shared/api/firebase/index';
import { DATA_BACKEND } from '../shared/config/backend';
import { useCategoryStoreSupabase } from './supabase/useCategoriesSupabase';
import { ALLOWED_CATEGORIES } from '../shared/schemas/financialSchemas';
import {
  normalizeCategoryName,
  userCategorySchema,
  type CategoryType,
  type UserCategory,
} from '../shared/schemas/categorySchemas';

interface UseCategoriesReturn {
  categories: UserCategory[];
  loading: boolean;
  error: Error | null;
  addCategory: (name: string, type?: CategoryType) => Promise<UserCategory>;
  updateCategory: (categoryId: string, data: Partial<Pick<UserCategory, 'name' | 'type' | 'color' | 'icon' | 'isActive'>>) => Promise<void>;
  deactivateCategory: (categoryId: string) => Promise<void>;
}

/** Campos gravados de uma categoria do usuário (sem id/uid/timestamps). */
export type CategoryWritePayload = Omit<UserCategory, 'id' | 'uid' | 'createdAt' | 'updatedAt'>;
export type CategoryPatch = Partial<Pick<UserCategory, 'name' | 'normalizedName' | 'type' | 'color' | 'icon' | 'isActive'>>;

/** Camada de armazenamento das categorias do usuário (Firebase ou Supabase, escolhida no build). */
export interface CategoryStore {
  userCategories: UserCategory[];
  loading: boolean;
  error: Error | null;
  /**
   * Grava e devolve o id. Se a categoria já existia (criada em outra aba), devolve
   * a categoria como está gravada, para o chamador usar o nome canônico.
   */
  insertCategory: (payload: CategoryWritePayload) => Promise<string | UserCategory>;
  patchCategory: (categoryId: string, patch: CategoryPatch) => Promise<void>;
}

const DEFAULT_META: Record<string, { type: CategoryType; color: string; icon: string }> = {
  'Alimentação':    { type: 'saida',   color: '#f59e0b', icon: '🍽️' },
  'Transporte':     { type: 'saida',   color: '#3b82f6', icon: '🚗' },
  'Assinaturas':    { type: 'saida',   color: '#8b5cf6', icon: '📱' },
  'Educação':       { type: 'saida',   color: '#06b6d4', icon: '📚' },
  'Saúde':          { type: 'saida',   color: '#f43f5e', icon: '❤️' },
  'Moradia':        { type: 'saida',   color: '#eab308', icon: '🏠' },
  'Impostos/Taxas': { type: 'saida',   color: '#ef4444', icon: '📋' },
  'Lazer':          { type: 'saida',   color: '#ec4899', icon: '🎮' },
  'Vestuário':      { type: 'saida',   color: '#a855f7', icon: '👗' },
  'Salário':        { type: 'entrada', color: '#10b981', icon: '💰' },
  'Freelance':      { type: 'entrada', color: '#14b8a6', icon: '💼' },
  'Investimento':   { type: 'entrada', color: '#84cc16', icon: '📈' },
  'Diversos':       { type: 'ambos',   color: '#64748b', icon: '📦' },
  'Outros':         { type: 'ambos',   color: '#64748b', icon: '•' },
  'Importado':      { type: 'ambos',   color: '#64748b', icon: '•' },
};

function defaultCategories(uid: string): UserCategory[] {
  return ALLOWED_CATEGORIES.map((name) => {
    const meta = DEFAULT_META[name] ?? { type: 'ambos' as const, color: '#64748b', icon: '•' };
    return {
      id: `default-${normalizeCategoryName(name).replace(/\s+/g, '-')}`,
      uid,
      name,
      normalizedName: normalizeCategoryName(name),
      type: meta.type,
      color: meta.color,
      icon: meta.icon,
      isDefault: true,
      isActive: true,
    };
  });
}

function sortCategories(categories: UserCategory[]): UserCategory[] {
  return [...categories].sort((a, b) =>
    a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }),
  );
}

function mergeCategories(systemCategories: UserCategory[], userCategories: UserCategory[]): UserCategory[] {
  const byName = new Map<string, UserCategory>();
  systemCategories.forEach(category => byName.set(category.normalizedName, category));
  userCategories.forEach(category => {
    if (category.isActive) byName.set(category.normalizedName, category);
  });
  return sortCategories([...byName.values()].filter(category => category.isActive));
}

function categoriesRef(uid: string) {
  return collection(db, 'users', uid, 'categories');
}

function useCategoryStoreFirebase(uid: string): CategoryStore {
  const [userCategories, setUserCategories] = useState<UserCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!uid) {
      setUserCategories([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    const unsubscribe = onSnapshot(
      query(categoriesRef(uid)),
      (snapshot) => {
        const parsed: UserCategory[] = [];
        snapshot.docs.forEach((categoryDoc) => {
          const result = userCategorySchema.safeParse({
            id: categoryDoc.id,
            uid,
            ...categoryDoc.data(),
          });
          if (result.success) parsed.push(result.data);
        });
        setUserCategories(parsed);
        setError(null);
        setLoading(false);
      },
      (snapshotError) => {
        setError(snapshotError instanceof Error ? snapshotError : new Error('Falha ao carregar categorias.'));
        setLoading(false);
      },
    );

    return unsubscribe;
  }, [uid]);

  const insertCategory = useCallback(async (payload: CategoryWritePayload): Promise<string> => {
    const createdRef = await addDoc(categoriesRef(uid), {
      ...payload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return createdRef.id;
  }, [uid]);

  const patchCategory = useCallback(async (categoryId: string, patch: CategoryPatch): Promise<void> => {
    await updateDoc(doc(categoriesRef(uid), categoryId), { ...patch, updatedAt: serverTimestamp() });
  }, [uid]);

  return { userCategories, loading, error, insertCategory, patchCategory };
}

const useCategoryStore: (uid: string) => CategoryStore =
  DATA_BACKEND === 'supabase' ? useCategoryStoreSupabase : useCategoryStoreFirebase;

export function useCategories(uid: string): UseCategoriesReturn {
  const systemCategories = useMemo(() => defaultCategories(uid), [uid]);
  const { userCategories, loading, error, insertCategory, patchCategory } = useCategoryStore(uid);

  const categories = useMemo(
    () => mergeCategories(systemCategories, userCategories),
    [systemCategories, userCategories],
  );

  const addCategory = useCallback(async (name: string, type: CategoryType = 'ambos'): Promise<UserCategory> => {
    if (!uid) throw new Error('Usuário não autenticado.');

    const trimmedName = name.trim().replace(/\s+/g, ' ');
    if (!trimmedName) throw new Error('Informe um nome para a categoria.');

    const normalizedName = normalizeCategoryName(trimmedName);
    const existing = categories.find(category => category.normalizedName === normalizedName);
    if (existing) return existing;

    const payload: CategoryWritePayload = {
      name: trimmedName,
      normalizedName,
      type,
      color: '#64748b',
      icon: '•',
      isDefault: false,
      isActive: true,
    };

    const parsed = userCategorySchema.safeParse({ id: '', uid, ...payload });
    if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Categoria inválida.');

    const created = await insertCategory(payload);
    if (typeof created !== 'string') return created;
    return {
      ...parsed.data,
      id: created,
    };
  }, [categories, insertCategory, uid]);

  const updateCategory = useCallback(async (
    categoryId: string,
    data: Partial<Pick<UserCategory, 'name' | 'type' | 'color' | 'icon' | 'isActive'>>,
  ): Promise<void> => {
    if (!uid) throw new Error('Usuário não autenticado.');
    const existing = categories.find(category => category.id === categoryId);
    if (!existing) throw new Error('Categoria não encontrada.');
    if (existing.isDefault) throw new Error('Categorias padrão não podem ser editadas nesta tela.');

    const payload: CategoryPatch = {};
    if (data.name !== undefined) {
      const trimmedName = data.name.trim().replace(/\s+/g, ' ');
      if (!trimmedName) throw new Error('Informe um nome para a categoria.');
      const normalizedName = normalizeCategoryName(trimmedName);
      const duplicate = categories.find(category =>
        category.id !== categoryId && category.normalizedName === normalizedName,
      );
      if (duplicate) throw new Error('Essa categoria já existe.');
      payload.name = trimmedName;
      payload.normalizedName = normalizedName;
    }
    if (data.type !== undefined) payload.type = data.type;
    if (data.color !== undefined) payload.color = data.color;
    if (data.icon !== undefined) payload.icon = data.icon;
    if (data.isActive !== undefined) payload.isActive = data.isActive;

    await patchCategory(categoryId, payload);
  }, [categories, patchCategory, uid]);

  const deactivateCategory = useCallback(async (categoryId: string): Promise<void> => {
    if (!uid) throw new Error('Usuário não autenticado.');
    const existing = categories.find(category => category.id === categoryId);
    if (!existing) throw new Error('Categoria não encontrada.');
    if (existing.isDefault) throw new Error('Categorias padrão não podem ser desativadas.');

    await patchCategory(categoryId, { isActive: false });
  }, [categories, patchCategory, uid]);

  return {
    categories,
    loading,
    error,
    addCategory,
    updateCategory,
    deactivateCategory,
  };
}
