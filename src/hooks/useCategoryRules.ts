import { useState, useEffect } from 'react';
import { collection, query, onSnapshot } from 'firebase/firestore';
import { db } from '../shared/api/firebase/index';

export interface CategoryRule {
  id: string;
  keyword: string;
  category: string;
}

export interface UserCategoryRule {
  keywords: string[];
  category: string;
}

interface UseCategoryRulesReturn {
  rules: CategoryRule[];
  /** Formato compatível com autoCategorize/categorizeTransaction */
  asUserRules: UserCategoryRule[];
  loading: boolean;
}

/**
 * Lê regras de categorização do usuário a partir de users/{uid}/categoryRules.
 * Subscrição única — deve ser instanciado APENAS em App.tsx (single source of truth).
 */
export function useCategoryRules(uid: string): UseCategoryRulesReturn {
  const [rules, setRules]     = useState<CategoryRule[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) { setRules([]); setLoading(false); return; }

    const q = query(collection(db, 'users', uid, 'categoryRules'));
    const unsub = onSnapshot(
      q,
      snap => {
        const data = snap.docs.map(d => ({
          id:       d.id,
          keyword:  String((d.data() as Record<string, unknown>)['keyword'] ?? '').toLowerCase(),
          category: String((d.data() as Record<string, unknown>)['category'] ?? ''),
        })).filter(r => r.keyword && r.category);
        setRules(data);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return unsub;
  }, [uid]);

  // Converte para formato consumido por autoCategorize / categorizeTransaction
  const asUserRules: UserCategoryRule[] = rules.map(r => ({
    keywords: [r.keyword],
    category: r.category,
  }));

  return { rules, asUserRules, loading };
}
