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

  it('retorna fallback amigável para unknown', () => {
    expect(getUserFriendlyErrorMessage({ code: 'unknown' })).toBe(UNKNOWN_MESSAGE);
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
});
