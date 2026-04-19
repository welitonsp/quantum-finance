// src/hooks/useCategories.ts
import { useEffect, useState, useCallback } from 'react';
import { onSnapshot, query, orderBy } from 'firebase/firestore';
import { CategoryService } from '../features/ai-chat/CategoryService';

type AnyRecord = Record<string, unknown>;

interface Category extends AnyRecord {
  id: string;
  name?: string;
  type?: string;
}

export function useCategories(uid: string | null | undefined) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<unknown>(null);

  const add = useCallback(async (data: AnyRecord): Promise<void> => {
    if (!uid) return;
    setError(null);
    try {
      await CategoryService.addCategory(uid, data);
    } catch (err) {
      console.error(err);
      setError(err);
    }
  }, [uid]);

  const remove = useCallback(async (id: string): Promise<void> => {
    if (!uid) return;
    setError(null);
    try {
      await CategoryService.deleteCategory(uid, id);
    } catch (err) {
      console.error(err);
      setError(err);
    }
  }, [uid]);

  useEffect(() => {
    if (!uid) {
      setCategories([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const q = query(
      CategoryService.getCollection(uid),
      orderBy('createdAt', 'asc')
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data: Category[] = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));
        setCategories(data);
        setLoading(false);
      },
      (err) => {
        console.error(err);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [uid]);

  return { categories, loading, error, add, remove };
}
