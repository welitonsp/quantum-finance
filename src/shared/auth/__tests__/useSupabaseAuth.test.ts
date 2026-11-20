import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@supabase/supabase-js';
import type { AuthStage } from '../../api/supabase/auth';

const signInWithGoogle = vi.fn<(redirectTo?: string) => Promise<void>>();
const signOut = vi.fn<() => Promise<void>>();
const verifyTotpSignIn = vi.fn<(code: string) => Promise<void>>();

vi.mock('../../api/supabase/auth', () => ({
  onAuthStageChange: vi.fn(),
  signInWithGoogle: (redirectTo?: string) => signInWithGoogle(redirectTo),
  signOut: () => signOut(),
  verifyTotpSignIn: (code: string) => verifyTotpSignIn(code),
}));
vi.mock('../../lib/firebaseErrorHandling', () => ({ logSanitizedFirebaseError: vi.fn() }));

import { useSupabaseAuth } from '../useSupabaseAuth';

const user = { id: 'u-1', email: 'a@x.dev', user_metadata: { full_name: 'Ana' } } as unknown as User;

function controllableSubscribe() {
  let emit: (stage: AuthStage) => void = () => undefined;
  const unsubscribe = vi.fn();
  const subscribe = vi.fn((listener: (stage: AuthStage) => void) => {
    emit = listener;
    return unsubscribe;
  });
  return { subscribe, unsubscribe, emit: (stage: AuthStage) => act(() => emit(stage)) };
}

beforeEach(() => {
  signInWithGoogle.mockReset().mockResolvedValue();
  signOut.mockReset().mockResolvedValue();
  verifyTotpSignIn.mockReset().mockResolvedValue();
});

describe('useSupabaseAuth', () => {
  it('fica não-pronto até o primeiro evento de sessão', () => {
    const { subscribe } = controllableSubscribe();
    const { result } = renderHook(() => useSupabaseAuth(subscribe));
    expect(result.current.ready).toBe(false);
    expect(result.current.appUser).toBeNull();
  });

  it('signed_out: pronto e sem usuário', () => {
    const c = controllableSubscribe();
    const { result } = renderHook(() => useSupabaseAuth(c.subscribe));
    c.emit({ kind: 'signed_out' });
    expect(result.current.ready).toBe(true);
    expect(result.current.stage).toBe('signed_out');
    expect(result.current.appUser).toBeNull();
  });

  it('needs_mfa: NÃO entrega usuário ao app antes do código', () => {
    const c = controllableSubscribe();
    const { result } = renderHook(() => useSupabaseAuth(c.subscribe));
    c.emit({ kind: 'needs_mfa', user });
    expect(result.current.stage).toBe('needs_mfa');
    expect(result.current.appUser).toBeNull();
  });

  it('signed_in: entrega AppUser e mantém a mesma referência entre renders', () => {
    const c = controllableSubscribe();
    const { result, rerender } = renderHook(() => useSupabaseAuth(c.subscribe));
    c.emit({ kind: 'signed_in', user });
    expect(result.current.appUser).toEqual({ uid: 'u-1', displayName: 'Ana', email: 'a@x.dev', photoURL: null });
    const first = result.current.appUser;
    rerender();
    expect(result.current.appUser).toBe(first);
  });

  it('logout volta para signed_out quando o evento chega', () => {
    const c = controllableSubscribe();
    const { result } = renderHook(() => useSupabaseAuth(c.subscribe));
    c.emit({ kind: 'signed_in', user });
    c.emit({ kind: 'signed_out' });
    expect(result.current.appUser).toBeNull();
  });

  it('cancela a assinatura ao desmontar', () => {
    const c = controllableSubscribe();
    const { unmount } = renderHook(() => useSupabaseAuth(c.subscribe));
    unmount();
    expect(c.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('login redireciona para a origem atual', async () => {
    const c = controllableSubscribe();
    const { result } = renderHook(() => useSupabaseAuth(c.subscribe));
    await act(() => result.current.login());
    expect(signInWithGoogle).toHaveBeenCalledWith(window.location.origin);
  });

  it('código TOTP é repassado e erro propaga para a tela manter o prompt', async () => {
    const c = controllableSubscribe();
    const { result } = renderHook(() => useSupabaseAuth(c.subscribe));
    await act(() => result.current.submitMfaCode('123456'));
    expect(verifyTotpSignIn).toHaveBeenCalledWith('123456');
    verifyTotpSignIn.mockRejectedValueOnce(new Error('totp_verify_failed'));
    await expect(result.current.submitMfaCode('000000')).rejects.toThrow('totp_verify_failed');
  });

  it('cancelar o MFA encerra a sessão', async () => {
    const c = controllableSubscribe();
    const { result } = renderHook(() => useSupabaseAuth(c.subscribe));
    await act(() => result.current.cancelMfa());
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
