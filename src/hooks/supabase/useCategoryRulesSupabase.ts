// Regras de categorização no Supabase (tabela public.category_rules).
import { useCallback, useMemo } from 'react';
import { getSupabase } from '../../shared/api/supabase/client';
import { logSanitizedFirebaseError } from '../../shared/lib/firebaseErrorHandling';
import type { CategoryRule, CategoryRuleStore } from '../useCategoryRules';
import { useSupabaseTable } from './useSupabaseTable';

export interface CategoryRuleRow {
  id: string;
  keyword: string | null;
  category: string | null;
}

export function mapCategoryRuleRow(row: CategoryRuleRow): CategoryRule {
  return { id: row.id, keyword: row.keyword ?? '', category: row.category ?? '' };
}

/** Normaliza (minúsculas) e descarta regras incompletas (vale para os dois backends). */
export function normalizeRules(raw: CategoryRule[]): CategoryRule[] {
  return raw
    .map(r => ({ ...r, keyword: r.keyword.toLowerCase() }))
    .filter(r => r.keyword && r.category);
}

const RULE_OPTIONS = {
  table: 'category_rules',
  columns: 'id, keyword, category',
  // Ordem de prioridade (não de exibição): a categorização para na 1ª regra que casa.
  orderBy: 'created_at',
  ascending: true,
  map: mapCategoryRuleRow,
  loadOp: 'category_rules_load',
} as const;

export function useCategoryRuleStoreSupabase(uid: string): CategoryRuleStore {
  const { items, loading, refresh } = useSupabaseTable<CategoryRuleRow, CategoryRule>(uid, RULE_OPTIONS);
  // Palavra-chave mais longa primeiro ("uber eats" antes de "uber"): a regra mais
  // específica vence; empate mantém a ordem de criação (sort é estável).
  const rules = useMemo(
    () => normalizeRules(items).sort((a, b) => b.keyword.length - a.keyword.length),
    [items],
  );

  const addRule = useCallback(async (keyword: string, category: string): Promise<void> => {
    if (!uid) throw new Error('Utilizador não autenticado.');
    const { error } = await getSupabase().from('category_rules').insert({ keyword, category });
    if (error) {
      logSanitizedFirebaseError('category_settings_save', error);
      throw new Error('Não foi possível salvar a regra.');
    }
    await refresh();
  }, [uid, refresh]);

  const removeRule = useCallback(async (ruleId: string): Promise<void> => {
    if (!uid || !ruleId) return;
    const { error } = await getSupabase().from('category_rules').delete().eq('id', ruleId);
    if (error) {
      logSanitizedFirebaseError('category_settings_delete', error);
      throw new Error('Não foi possível apagar a regra.');
    }
    await refresh();
  }, [uid, refresh]);

  return { rules, loading, addRule, removeRule };
}
