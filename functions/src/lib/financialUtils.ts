const ALLOWED_CATEGORIES = new Set([
  'Alimentação', 'Transporte', 'Assinaturas', 'Educação', 'Saúde',
  'Moradia', 'Impostos/Taxas', 'Lazer', 'Vestuário', 'Salário',
  'Freelance', 'Investimento', 'Diversos', 'Outros', 'Importado',
]);

interface TransactionLike {
  value?: unknown;
  value_cents?: unknown;
}

export function toSafeCents(value: unknown): number {
  if (Number.isSafeInteger(value)) return Math.abs(value as number);
  if (typeof value === 'number' && Number.isFinite(value)) return Math.abs(Math.round(value * 100));
  return 0;
}

export function txCents(tx: TransactionLike = {}): number {
  if (Number.isSafeInteger(tx.value_cents)) return Math.abs(tx.value_cents as number);
  return toSafeCents(tx.value);
}

export function centsToReais(cents: unknown): number {
  return (Number.isSafeInteger(cents) ? cents as number : 0) / 100;
}

export function safeCategory(category: unknown): string {
  return typeof category === 'string' && ALLOWED_CATEGORIES.has(category) ? category : 'Outros';
}

export const OPAQUE_CATEGORIZATION_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function toSafeCategorizationPromptId(id: unknown, index: number): string {
  const rawId = typeof id === 'string' ? id : '';
  return OPAQUE_CATEGORIZATION_ID_RE.test(rawId) ? rawId : `tx_${index}`;
}
