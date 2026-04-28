import type { Transaction } from '../shared/types/transaction';
import { getTransactionCentavos } from './transactionUtils';

/**
 * Stable djb2-variant hash for an array of strings.
 * Used as a memo dependency key instead of unstable array references.
 */
export function generateHash(parts: string[]): string {
  const raw = parts.join('\x00');
  let h = 5381;
  for (let i = 0; i < raw.length; i++) {
    h = ((h << 5) + h) ^ raw.charCodeAt(i);
    h = h >>> 0; // coerce to uint32
  }
  return h.toString(36);
}

export function generateTransactionHash(tx: Pick<Transaction, 'date' | 'value' | 'value_cents' | 'description' | 'schemaVersion'>): string {
  const dateStr = tx.date ? String(tx.date).substring(0, 10) : '';
  const valorCentavos = getTransactionCentavos(tx) ?? 0;

  const descStr = (tx.description || '').trim().toLowerCase();
  const rawString = `${dateStr}|${valorCentavos}|${descStr}`;
  return btoa(encodeURIComponent(rawString));
}
