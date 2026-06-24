import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getFirebaseErrorCode,
  getUserFriendlyErrorMessage,
  logSanitizedFirebaseError,
  sanitizeErrorForLog,
  sanitizeFirebaseErrorContext,
  type FirebaseErrorLogContext,
} from './firebaseErrorHandling';

const PERMISSION_MESSAGE =
  'Não foi possível concluir a operação porque as regras de segurança bloquearam a alteração. Atualize a página e tente novamente.';
const PRECONDITION_MESSAGE =
  'Não foi possível concluir a operação porque os dados precisam ser atualizados antes de salvar. Recarregue as movimentações e tente novamente.';
const UNAVAILABLE_MESSAGE =
  'Serviço temporariamente indisponível. Verifique sua conexão e tente novamente em instantes.';
const UNAUTHENTICATED_MESSAGE =
  'Não foi possível autenticar a solicitação. Recarregue a página e entre novamente.';
const RESOURCE_EXHAUSTED_MESSAGE =
  'Você atingiu o limite de uso temporário do assistente. Aguarde um pouco e tente novamente.';
const UNKNOWN_MESSAGE =
  'Não foi possível concluir a operação. Tente novamente e, se o problema persistir, verifique sua conexão.';

describe('firebaseErrorHandling', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('extrai o código Firebase mesmo com prefixo de callable', () => {
    expect(getFirebaseErrorCode({ code: 'functions/permission-denied' })).toBe('permission-denied');
  });

  it('retorna mensagem amigável para permission-denied', () => {
    expect(getUserFriendlyErrorMessage({ code: 'permission-denied' })).toBe(PERMISSION_MESSAGE);
  });

  it('retorna mensagem amigável para failed-precondition', () => {
    expect(getUserFriendlyErrorMessage({ code: 'failed-precondition' })).toBe(PRECONDITION_MESSAGE);
  });

  it('retorna mensagem amigável para unavailable', () => {
    expect(getUserFriendlyErrorMessage({ code: 'unavailable' })).toBe(UNAVAILABLE_MESSAGE);
  });

  it('retorna mensagem amigável para unauthenticated (auth/App Check) com prefixo de callable', () => {
    expect(getUserFriendlyErrorMessage({ code: 'functions/unauthenticated' })).toBe(UNAUTHENTICATED_MESSAGE);
  });

  it('retorna mensagem amigável para resource-exhausted (limite de IA)', () => {
    expect(getUserFriendlyErrorMessage({ code: 'functions/resource-exhausted' })).toBe(RESOURCE_EXHAUSTED_MESSAGE);
  });

  it('não colapsa unauthenticated/resource-exhausted na mensagem genérica unknown', () => {
    expect(getUserFriendlyErrorMessage({ code: 'unauthenticated' })).not.toBe(UNKNOWN_MESSAGE);
    expect(getUserFriendlyErrorMessage({ code: 'resource-exhausted' })).not.toBe(UNKNOWN_MESSAGE);
  });

  it('retorna fallback amigável para unknown', () => {
    expect(getUserFriendlyErrorMessage({ code: 'unknown' })).toBe(UNKNOWN_MESSAGE);
  });

  it('mantém internal no fallback genérico (sem vazar detalhe)', () => {
    expect(getUserFriendlyErrorMessage({ code: 'functions/internal' })).toBe(UNKNOWN_MESSAGE);
  });

  it('não quebra com erro desconhecido sem code', () => {
    expect(() => sanitizeErrorForLog(new Error('falha sem code'))).not.toThrow();
    expect(getUserFriendlyErrorMessage(new Error('falha sem code'))).toBe(UNKNOWN_MESSAGE);
  });

  it('redige uid de mensagens técnicas', () => {
    const safe = sanitizeErrorForLog(new Error('permission uid=uid-secreto users/uid-secreto/transactions/tx-1'));
    const serialized = JSON.stringify(safe);

    expect(serialized).not.toContain('uid-secreto');
  });

  it('redige importHash de mensagens técnicas', () => {
    const safe = sanitizeErrorForLog(new Error('importHash=abcd1234efgh5678 payload ok'));
    const serialized = JSON.stringify(safe);

    expect(serialized).not.toContain('abcd1234efgh5678');
    expect(serialized).not.toContain('importHash');
  });

  it('não inclui before ou after do erro original', () => {
    const error = Object.assign(new Error('before={"category":"A"} after={"category":"B"}'), {
      before: { category: 'A' },
      after:  { category: 'B' },
    });
    const serialized = JSON.stringify(sanitizeErrorForLog(error));

    expect(serialized).not.toContain('"before"');
    expect(serialized).not.toContain('"after"');
    expect(serialized).not.toContain('category');
  });

  it('não inclui payload financeiro completo', () => {
    const error = Object.assign(
      new Error('payload={"description":"Mercado Central","value_cents":12345} description="Mercado Central" value_cents=12345'),
      {
        payload: {
          description: 'Mercado Central',
          value_cents: 12345,
          category: 'Alimentação',
        },
      },
    );
    const serialized = JSON.stringify(sanitizeErrorForLog(error));

    expect(serialized).not.toContain('Mercado Central');
    expect(serialized).not.toContain('12345');
    expect(serialized).not.toContain('Alimentação');
  });

  it('aceita apenas contexto operacional genérico nos logs', () => {
    const unsafeContext = {
      operation: 'users/uid-secreto/transactions/tx-1',
      uid:       'uid-secreto',
    } as unknown as FirebaseErrorLogContext;
    expect(sanitizeFirebaseErrorContext(unsafeContext)).toEqual({ operation: 'unknown_operation' });

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    logSanitizedFirebaseError(unsafeContext, new Error('uid=uid-secreto'));

    expect(warn).toHaveBeenCalledWith('[FirebaseError]', expect.objectContaining({
      operation: 'unknown_operation',
    }));
    expect(JSON.stringify(warn.mock.calls[0]?.[1])).not.toContain('uid-secreto');
  });

  // ─── Branches adicionais para cobertura completa ───────────────────────────

  it('stringProp retorna string vazia para não-objeto (linha 74)', () => {
    // sanitizeErrorForLog com erro que não é Error nem objeto com name/message
    const safe = sanitizeErrorForLog(null);
    expect(safe.code).toBe('unknown');
    expect(safe).not.toHaveProperty('name');
    expect(safe).not.toHaveProperty('message');
  });

  it('sanitizeErrorForLog processa erro com name e message como propriedades de objeto puro (linhas 143-150)', () => {
    const objError = { code: 'permission-denied', name: 'FirebaseError', message: 'Access denied' };
    const safe = sanitizeErrorForLog(objError);
    expect(safe.code).toBe('permission-denied');
    expect(safe.name).toBeDefined();
    expect(safe.message).toBeDefined();
  });

  it('sanitizeErrorForLog processa erro do tipo string (linha 148)', () => {
    const safe = sanitizeErrorForLog('Erro genérico de string');
    expect(safe.code).toBe('unknown');
    expect(safe.message).toBeDefined();
  });

  it('sanitizeErrorForLog trunka mensagem acima de 240 chars (linha 80)', () => {
    const longMsg = 'X'.repeat(300);
    const safe = sanitizeErrorForLog(new Error(longMsg));
    expect(safe.message!.length).toBeLessThanOrEqual(245); // 240 + "…" + margem
  });

  it('sanitizeFirebaseErrorContext aceita objeto com campo operation válido (linha 108)', () => {
    const ctx = { operation: 'transaction_update' } as FirebaseErrorLogContext;
    expect(sanitizeFirebaseErrorContext(ctx)).toEqual({ operation: 'transaction_update' });
  });

  it('sanitizeFirebaseErrorContext aceita string como context direto', () => {
    expect(sanitizeFirebaseErrorContext('transaction_add')).toEqual({ operation: 'transaction_add' });
  });

  it('getFirebaseErrorCode retorna unknown quando code está ausente', () => {
    expect(getFirebaseErrorCode({})).toBe('unknown');
    expect(getFirebaseErrorCode(null)).toBe('unknown');
    expect(getFirebaseErrorCode('sem code')).toBe('unknown');
  });

  it('getFirebaseErrorCode extrai parte final do código com namespace (ex: firestore/permission-denied)', () => {
    expect(getFirebaseErrorCode({ code: 'firestore/permission-denied' })).toBe('permission-denied');
  });
});
