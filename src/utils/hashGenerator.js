import Decimal from 'decimal.js';

export function generateTransactionHash(tx) {
  const dateStr = tx.date ? String(tx.date).substring(0, 10) : '';
  
  const valorNum = new Decimal(String(tx.value || 0))
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
    .toFixed(2);
    
  const descStr = (tx.description || '').trim().toLowerCase();
  
  const rawString = `${dateStr}|${valorNum}|${descStr}`;
  return btoa(encodeURIComponent(rawString));
}