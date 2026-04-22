// Batch AI categorization via GeminiService (Cloud Functions — API key never exposed)
import { GeminiService } from '../features/ai-chat/GeminiService';

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
