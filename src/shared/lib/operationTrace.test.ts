import { describe, it, expect, vi, afterEach } from 'vitest';
import { isSafeOperationId, generateSafeOperationId } from './operationTrace';

// ─── Suite: isSafeOperationId ─────────────────────────────────────────────────

describe('isSafeOperationId', () => {
  it('aceita IDs válidos com prefixo op_', () => {
    expect(isSafeOperationId('op_' + 'A'.repeat(16))).toBe(true);
  });

  it('aceita IDs válidos com prefixo bulk_', () => {
    expect(isSafeOperationId('bulk_' + 'B'.repeat(16))).toBe(true);
  });

  it('aceita IDs válidos com prefixo undo_', () => {
    expect(isSafeOperationId('undo_' + 'C'.repeat(16))).toBe(true);
  });

  it('rejeita string vazia', () => {
    expect(isSafeOperationId('')).toBe(false);
  });

  it('rejeita ID muito curto (< 16 chars)', () => {
    expect(isSafeOperationId('abc')).toBe(false);
  });

  it('rejeita ID com caracteres proibidos como "/"', () => {
    expect(isSafeOperationId('op_uid/user-abc/importHash')).toBe(false);
  });

  it('rejeita ID com espaços', () => {
    expect(isSafeOperationId('op_id com espaço')).toBe(false);
  });

  it('rejeita não-string', () => {
    expect(isSafeOperationId(undefined)).toBe(false);
    expect(isSafeOperationId(null)).toBe(false);
    expect(isSafeOperationId(42)).toBe(false);
    expect(isSafeOperationId({})).toBe(false);
  });

  it('aceita ID no limite máximo de 80 chars', () => {
    const id = 'op_' + 'X'.repeat(77);
    expect(isSafeOperationId(id)).toBe(true);
  });

  it('rejeita ID acima de 80 chars', () => {
    const id = 'op_' + 'X'.repeat(78);
    expect(isSafeOperationId(id)).toBe(false);
  });
});

// ─── Suite: generateSafeOperationId ──────────────────────────────────────────

describe('generateSafeOperationId', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('gera ID com prefixo op_ por padrão', () => {
    const id = generateSafeOperationId();
    expect(id.startsWith('op_')).toBe(true);
    expect(isSafeOperationId(id)).toBe(true);
  });

  it('gera ID com prefixo bulk_ quando solicitado', () => {
    const id = generateSafeOperationId('bulk');
    expect(id.startsWith('bulk_')).toBe(true);
    expect(isSafeOperationId(id)).toBe(true);
  });

  it('gera ID com prefixo undo_ quando solicitado', () => {
    const id = generateSafeOperationId('undo');
    expect(id.startsWith('undo_')).toBe(true);
    expect(isSafeOperationId(id)).toBe(true);
  });

  it('gera IDs únicos em chamadas consecutivas', () => {
    const a = generateSafeOperationId();
    const b = generateSafeOperationId();
    expect(a).not.toBe(b);
  });

  it('usa fallback getRandomValues quando randomUUID não está disponível', () => {
    const originalRandomUUID = globalThis.crypto.randomUUID;
    // @ts-expect-error — simulando ausência de randomUUID
    delete globalThis.crypto.randomUUID;

    try {
      const id = generateSafeOperationId('op');
      expect(id.startsWith('op_')).toBe(true);
      expect(isSafeOperationId(id)).toBe(true);
    } finally {
      globalThis.crypto.randomUUID = originalRandomUUID;
    }
  });

  it('lança erro se crypto.getRandomValues não está disponível', () => {
    const originalCrypto = globalThis.crypto;
    try {
      Object.defineProperty(globalThis, 'crypto', { value: { getRandomValues: undefined }, configurable: true });
      expect(() => generateSafeOperationId()).toThrow('crypto.getRandomValues unavailable');
    } finally {
      Object.defineProperty(globalThis, 'crypto', { value: originalCrypto, configurable: true });
    }
  });
});
