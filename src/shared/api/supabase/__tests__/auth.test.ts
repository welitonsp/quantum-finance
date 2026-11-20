import { describe, expect, it, vi } from 'vitest';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import {
  SupabaseAuthError,
  finalizeTotpEnrollment,
  listTotpFactors,
  normalizeTotpCode,
  onAuthStageChange,
  resolveAuthStage,
  signInWithGoogle,
  startTotpEnrollment,
  verifyTotpSignIn,
} from '../auth';

type AnyFn = (...args: unknown[]) => unknown;
function fakeClient(over: Record<string, AnyFn> = {}) {
  const auth = {
    signInWithOAuth: vi.fn(async () => ({ data: {}, error: null })),
    signOut: vi.fn(async () => ({ error: null })),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    mfa: {
      getAuthenticatorAssuranceLevel: vi.fn(async () => ({ data: { currentLevel: 'aal1', nextLevel: 'aal1' }, error: null })),
      listFactors: vi.fn(async () => ({ data: { totp: [] }, error: null })),
      enroll: vi.fn(),
      challengeAndVerify: vi.fn(async () => ({ data: {}, error: null })),
      unenroll: vi.fn(),
      ...over,
    },
  };
  return { client: { auth } as unknown as SupabaseClient, auth };
}

const session = { user: { id: 'u1' }, access_token: 'tok-u1' } as unknown as Session;

describe('supabase auth', () => {
  it('normaliza código TOTP', () => {
    expect(normalizeTotpCode(' 123 456 ')).toBe('123456');
    expect(normalizeTotpCode('12345')).toBeNull();
    expect(normalizeTotpCode('abcdef')).toBeNull();
  });

  it('Google via OAuth com redirect', async () => {
    const { client, auth } = fakeClient();
    await signInWithGoogle('https://app.example', client);
    expect(auth.signInWithOAuth).toHaveBeenCalledWith({ provider: 'google', options: { redirectTo: 'https://app.example' } });
  });

  it('sem sessão: deslogado', async () => {
    const { client } = fakeClient();
    expect(await resolveAuthStage(null, client)).toEqual({ kind: 'signed_out' });
  });

  it('sem MFA inscrito: entra direto', async () => {
    const { client } = fakeClient();
    expect((await resolveAuthStage(session, client)).kind).toBe('signed_in');
  });

  it('com MFA inscrito em aal1: exige código', async () => {
    const { client } = fakeClient({
      getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: 'aal1', nextLevel: 'aal2' }, error: null }),
    });
    expect((await resolveAuthStage(session, client)).kind).toBe('needs_mfa');
  });

  it('falha ao ler AAL: fail-closed', async () => {
    const { client } = fakeClient({
      getAuthenticatorAssuranceLevel: async () => ({ data: null, error: { message: 'x' } }),
    });
    expect((await resolveAuthStage(session, client)).kind).toBe('needs_mfa');
  });

  it('lê o AAL do token da própria sessão; AAL nulo não libera', async () => {
    const aal = vi.fn(async () => ({ data: { currentLevel: null, nextLevel: null }, error: null }));
    const { client } = fakeClient({ getAuthenticatorAssuranceLevel: aal as AnyFn });
    expect((await resolveAuthStage(session, client)).kind).toBe('needs_mfa');
    expect(aal).toHaveBeenCalledWith('tok-u1');
  });

  it('descarta resolução antiga quando chega um evento mais novo (logout)', async () => {
    vi.useFakeTimers();
    let cb: ((e: string, s: Session | null) => void) | undefined;
    let releaseSlow: (() => void) | undefined;
    const { client, auth } = fakeClient({
      getAuthenticatorAssuranceLevel: (() => new Promise((resolve) => {
        releaseSlow = () => resolve({ data: { currentLevel: 'aal1', nextLevel: 'aal1' }, error: null });
      })) as AnyFn,
    });
    auth.onAuthStateChange.mockImplementation(((fn: typeof cb) => {
      cb = fn;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    }) as never);
    const listener = vi.fn();
    onAuthStageChange(listener, client);
    cb?.('SIGNED_IN', session);   // lento: fica pendurado no AAL
    await vi.advanceTimersByTimeAsync(0);
    cb?.('SIGNED_OUT', null);     // rápido: sem sessão
    await vi.advanceTimersByTimeAsync(0);
    releaseSlow?.();
    await vi.runAllTimersAsync();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ kind: 'signed_out' });
    vi.useRealTimers();
  });

  it('lista só fatores verificados', async () => {
    const { client } = fakeClient({
      listFactors: async () => ({
        data: { totp: [
          { id: 'f1', status: 'verified', friendly_name: 'App' },
          { id: 'f2', status: 'unverified', friendly_name: null },
        ] },
        error: null,
      }),
    });
    expect(await listTotpFactors(client)).toEqual([{ id: 'f1', friendlyName: 'App' }]);
  });

  it('inscrição devolve QR e chave', async () => {
    const { client } = fakeClient({
      enroll: async () => ({ data: { id: 'f9', totp: { qr_code: '<svg/>', secret: 'ABC', uri: 'otpauth://x' } }, error: null }),
    });
    expect(await startTotpEnrollment(client)).toEqual({ factorId: 'f9', qrCodeSvg: '<svg/>', secretKey: 'ABC', otpauthUrl: 'otpauth://x' });
  });

  it('confirma inscrição com código normalizado e recusa formato inválido', async () => {
    const { client, auth } = fakeClient();
    await finalizeTotpEnrollment('f9', '123 456', client);
    expect(auth.mfa.challengeAndVerify).toHaveBeenCalledWith({ factorId: 'f9', code: '123456' });
    await expect(finalizeTotpEnrollment('f9', '12', client)).rejects.toThrow('invalid_totp_code_format');
  });

  it('login em 2 etapas usa o fator verificado; erro tem código estável', async () => {
    const { client, auth } = fakeClient({
      listFactors: async () => ({ data: { totp: [{ id: 'f1', status: 'verified' }] }, error: null }),
      challengeAndVerify: async () => ({ data: null, error: { message: 'Invalid TOTP code entered' } }),
    });
    const err = await verifyTotpSignIn('123456', client).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SupabaseAuthError);
    expect((err as SupabaseAuthError).code).toBe('totp_verify_failed');
    expect(auth.mfa.listFactors).toBeDefined();
  });

  it('sem fator inscrito: erro claro', async () => {
    const { client } = fakeClient();
    await expect(verifyTotpSignIn('123456', client)).rejects.toThrow('no_totp_factor_enrolled');
  });

  it('onAuthStageChange resolve fora do callback e cancela', async () => {
    vi.useFakeTimers();
    let cb: ((e: string, s: Session | null) => void) | undefined;
    const unsubscribe = vi.fn();
    const { client, auth } = fakeClient();
    auth.onAuthStateChange.mockImplementation(((fn: typeof cb) => {
      cb = fn;
      return { data: { subscription: { unsubscribe } } };
    }) as never);
    const listener = vi.fn();
    const stop = onAuthStageChange(listener, client);
    cb?.('SIGNED_IN', session);
    expect(listener).not.toHaveBeenCalled();
    await vi.runAllTimersAsync();
    expect(listener).toHaveBeenCalledWith({ kind: 'signed_in', user: session.user });
    stop();
    expect(unsubscribe).toHaveBeenCalled();
    vi.useRealTimers();
  });
});
