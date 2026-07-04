import { describe, expect, it } from 'vitest';
import {
  isMfaNotConfiguredError,
  isMfaRequiredError,
  isRecentLoginRequiredError,
  normalizeTotpCode,
} from '../mfa';

describe('normalizeTotpCode', () => {
  it('aceita 6 dígitos exatos', () => {
    expect(normalizeTotpCode('123456')).toBe('123456');
  });

  it('tolera espaços de colagem (apps mostram "123 456")', () => {
    expect(normalizeTotpCode('123 456')).toBe('123456');
    expect(normalizeTotpCode(' 123456 ')).toBe('123456');
  });

  it('rejeita tamanhos errados, letras e vazio', () => {
    expect(normalizeTotpCode('12345')).toBeNull();
    expect(normalizeTotpCode('1234567')).toBeNull();
    expect(normalizeTotpCode('12345a')).toBeNull();
    expect(normalizeTotpCode('')).toBeNull();
    expect(normalizeTotpCode('abc def')).toBeNull();
  });
});

describe('classificadores de erro MFA', () => {
  it('isMfaRequiredError detecta apenas auth/multi-factor-auth-required', () => {
    expect(isMfaRequiredError({ code: 'auth/multi-factor-auth-required' })).toBe(true);
    expect(isMfaRequiredError({ code: 'auth/wrong-password' })).toBe(false);
    expect(isMfaRequiredError(new Error('x'))).toBe(false);
    expect(isMfaRequiredError(null)).toBe(false);
    expect(isMfaRequiredError(undefined)).toBe(false);
    expect(isMfaRequiredError('auth/multi-factor-auth-required')).toBe(false);
  });

  it('isMfaNotConfiguredError detecta auth/operation-not-allowed', () => {
    expect(isMfaNotConfiguredError({ code: 'auth/operation-not-allowed' })).toBe(true);
    expect(isMfaNotConfiguredError({ code: 'auth/other' })).toBe(false);
    expect(isMfaNotConfiguredError(null)).toBe(false);
  });

  it('isRecentLoginRequiredError detecta auth/requires-recent-login', () => {
    expect(isRecentLoginRequiredError({ code: 'auth/requires-recent-login' })).toBe(true);
    expect(isRecentLoginRequiredError({ code: 'auth/other' })).toBe(false);
    expect(isRecentLoginRequiredError(null)).toBe(false);
  });
});
