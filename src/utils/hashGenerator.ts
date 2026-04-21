import Decimal from 'decimal.js';
import type { Transaction } from '../shared/types/transaction';

export function generateTransactionHash(tx: Pick<Transaction, 'date' | 'value' | 'description'>): string {
  const dateStr = tx.date ? String(tx.date).substring(0, 10) : '';

  const valorNum = new Decimal(String(tx.value || 0))
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
    .toFixed(2);

  const descStr = (tx.description || '').trim().toLowerCase();
  const rawString = `${dateStr}|${valorNum}|${descStr}`;
  return btoa(encodeURIComponent(rawString));
}
