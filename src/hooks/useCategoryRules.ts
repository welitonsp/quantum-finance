import { useState, useEffect, useCallback, useMemo } from 'react';
import { collection, query, onSnapshot, addDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../shared/api/firebase/index';
import { DATA_BACKEND } from '../shared/config/backend';
import { normalizeRules, useCategoryRuleStoreSupabase } from './supabase/useCategoryRulesSupabase';

export interface CategoryRule {
  id: string;
  keyword: string;
  category: string;
}

export interface UserCategoryRule {
  keywords: string[];
  category: string;
}

/** Camada de armazenamento das regras (Firebase ou Supabase, escolhida no build). */
export interface CategoryRuleStore {
  rules: CategoryRule[];
  loading: boolean;
  /** Grava a regra; a palavra-chave já chega normalizada (trim + minúsculas). */
  addRule: (keyword: string, category: string) => Promise<void>;
  removeRule: (ruleId: string) => Promise<void>;
}

interface UseCategoryRulesReturn extends CategoryRuleStore {
  /** Formato compatível com autoCategorize/categorizeTransaction */
  asUserRules: UserCategoryRule[];
}

function useCategoryRuleStoreFirebase(uid: string): CategoryRuleStore {
  const [rules, setRules]     = useState<CategoryRule[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) { setRules([]); setLoading(false); return; }

    const q = query(collection(db, 'users', uid, 'categoryRules'));
    const unsub = onSnapshot(
      q,
      snap => {
        setRules(normalizeRules(snap.docs.map(d => ({
          id:       d.id,
          keyword:  String((d.data() as Record<string, unknown>)['keyword'] ?? ''),
          category: String((d.data() as Record<string, unknown>)['category'] ?? ''),
        }))));
        setLoading(false);
      },
      () => setLoading(false),
    );
    return unsub;
  }, [uid]);

  const addRule = useCallback(async (keyword: string, category: string): Promise<void> => {
    if (!uid) throw new Error('Utilizador não autenticado.');
    await addDoc(collection(db, 'users', uid, 'categoryRules'), { keyword, category });
  }, [uid]);

  const removeRule = useCallback(async (ruleId: string): Promise<void> => {
    if (!uid || !ruleId) return;
    await deleteDoc(doc(db, 'users', uid, 'categoryRules', ruleId));
  }, [uid]);

  return { rules, loading, addRule, removeRule };
}

const useCategoryRuleStore: (uid: string) => CategoryRuleStore =
  DATA_BACKEND === 'supabase' ? useCategoryRuleStoreSupabase : useCategoryRuleStoreFirebase;

/**
 * Regras de categorização automática do usuário.
 * Leitura principal instanciada em App.tsx; a tela de configurações usa o
 * mesmo hook para gravar/apagar.
 */
export function useCategoryRules(uid: string): UseCategoryRulesReturn {
  const store = useCategoryRuleStore(uid);

  // Converte para formato consumido por autoCategorize / categorizeTransaction
  const asUserRules = useMemo<UserCategoryRule[]>(
    () => store.rules.map(r => ({ keywords: [r.keyword], category: r.category })),
    [store.rules],
  );

  return { ...store, asUserRules };
}
