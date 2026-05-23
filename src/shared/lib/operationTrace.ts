const SAFE_OPERATION_ID_PATTERN = /^[A-Za-z0-9_-]{16,80}$/;
const SAFE_OPERATION_ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';

export type OperationTraceKind = 'op' | 'bulk' | 'undo';

export function isSafeOperationId(value: unknown): value is string {
  return typeof value === 'string' && SAFE_OPERATION_ID_PATTERN.test(value);
}

function getCryptoApi(): Crypto {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.getRandomValues) {
    throw new Error('[operationTrace] crypto.getRandomValues unavailable.');
  }
  return cryptoApi;
}

function generateFallbackRandomSuffix(cryptoApi: Crypto): string {
  const bytes = new Uint8Array(24);
  cryptoApi.getRandomValues(bytes);
  return Array.from(bytes, byte => SAFE_OPERATION_ID_ALPHABET[byte & 63] ?? 'A').join('');
}

export function generateSafeOperationId(kind: OperationTraceKind = 'op'): string {
  const cryptoApi = getCryptoApi();
  const suffix = cryptoApi.randomUUID?.() ?? generateFallbackRandomSuffix(cryptoApi);
  const operationId = `${kind}_${suffix}`;

  if (!isSafeOperationId(operationId)) {
    throw new Error('[operationTrace] generated invalid operation id.');
  }

  return operationId;
}
