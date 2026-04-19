// src/utils/hashGenerator.ts
import Decimal from 'decimal.js';

interface HashableTx {
  date?: string | number;
  value?: number | string;
  description?: string;
}

export function generateTransactionHash(tx: HashableTx): string {
  const dateStr  = tx.date ? String(tx.date).substring(0, 10) : '';
  const valorNum = new Decimal(String(tx.value || 0))
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
    .toFixed(2);
  const descStr  = (tx.description || '').trim().toLowerCase();
  return btoa(encodeURIComponent(`${dateStr}|${valorNum}|${descStr}`));
}
