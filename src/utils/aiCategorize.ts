// Batch AI categorization via GeminiService (Cloud Functions — API key never exposed)
import { GeminiService } from '../features/ai-chat/GeminiService';
import type { Transaction } from '../shared/types/transaction';
import { CATEGORY_KEYWORDS } from '../shared/data/categoryKeywords';
import type { UserCategoryRule } from '../hooks/useCategoryRules';

// ─── Deterministic categorization (no external AI) ───────────────────────────

const normalize = (text: string): string =>
  text
    .toLowerCase()
    .replace(/\d+/g, '')
    .replace(/[^\w\s]/g, '')
    .trim();


function topCategory(catMap: Map<string, number>): string {
  let top = '';
  let max = 0;
  for (const [cat, count] of catMap) {
    if (count > max) { max = count; top = cat; }
  }
  return top;
}

/**
 * Returns the most likely category for a description based on transaction history
 * and keyword fallback. Returns undefined when no match is found.
 * Never mutates caller data — only call when tx.category is absent.
 */
export function categorizeTransaction(
  description: string,
  history: Transaction[],
  userRules: UserCategoryRule[] = []
): string | undefined {
  if (!description?.trim()) return undefined;
  const normalized = normalize(description);
  if (!normalized) return undefined;

  // FIX P0.1: Regras do usuário > histórico > dicionário
  if (userRules.length > 0) {
    for (const rule of userRules) {
      for (const kw of rule.keywords) {
        if (normalized.includes(kw.toLowerCase())) {
          return rule.category;
        }
      }
    }
  }

  // Build frequency map in one pass — O(n)
  const freq = new Map<string, Map<string, number>>();
  for (const tx of history) {
    if (!tx.description || !tx.category) continue;
    const key = normalize(tx.description);
    if (!key) continue;
    let catMap = freq.get(key);
    if (!catMap) { catMap = new Map(); freq.set(key, catMap); }
    catMap.set(tx.category, (catMap.get(tx.category) ?? 0) + 1);
  }

  // 1. Exact match
  const exact = freq.get(normalized);
  if (exact) return topCategory(exact);

  // 2. Partial match (substring in either direction)
  for (const [key, catMap] of freq) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return topCategory(catMap);
    }
  }

  // 3. Keyword fallback
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const kw of keywords) {
      if (normalized.includes(kw.toLowerCase())) return category;
    }
  }

  return undefined;
}

/**
 * Sends an array of UNIQUE descriptions to the AI in a single batch request.
 * Returns a map { description → category }.
 *
 * RULE: exactly 1 Cloud Function call per file import.
 */
export async function batchCategorizeDescriptions(
  descriptions: string[]
): Promise<Record<string, string>> {
  const unique = [...new Set(descriptions.filter(d => d?.trim()))];
  if (!unique.length) return {};

  // Use the description itself as the pseudo-ID so we can reverse-map after
  const pseudoTxs = unique.map(desc => ({ id: desc, description: desc }));

  try {
    const results = await GeminiService.categorizeTransactionsBatch(pseudoTxs);
    const map: Record<string, string> = {};
    results.forEach(r => {
      if (r.category) map[r.id] = r.category;
    });
    return map;
  } catch (err) {
    console.error('[aiCategorize] Batch categorization failed:', err);
    return {};
  }
}

/**
 * Enriches a transaction array with the categories from a pre-computed map.
 * Only overwrites category if the map has an entry for that description.
 */
export function applyAICategories<T extends { description: string; category?: string }>(
  transactions: T[],
  categoryMap: Record<string, string>
): T[] {
  return transactions.map(tx => {
    const aiCategory = categoryMap[tx.description];
    return aiCategory ? { ...tx, category: aiCategory } : tx;
  });
}
