import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  onAuthStageChange,
  signInWithGoogle,
  signOut,
  verifyTotpSignIn,
  type AuthStage,
} from '../api/supabase/auth';
import { logSanitizedFirebaseError } from '../lib/firebaseErrorHandling';
import { appUserFromSupabase, type AppUser } from './appUser';

/**
 * Sessão do Supabase vista pela UI (migração Firebase → Supabase, etapa do login).
 *
 * - `ready` só vira true depois do primeiro evento (INITIAL_SESSION), para não
 *   piscar a tela de login com uma sessão válida guardada.
 * - `appUser` só existe em `signed_in`: com MFA pendente (aal1) o app NÃO recebe
 *   usuário, então nenhuma tela de dados abre antes do código TOTP.
 */
export interface SupabaseAuthState {
  ready: boolean;
  stage: AuthStage['kind'];
  appUser: AppUser | null;
  login: () => Promise<void>;
  submitMfaCode: (code: string) => Promise<void>;
  /** Cancelar o MFA encerra a sessão aal1 e volta para o login. */
  cancelMfa: () => Promise<void>;
  logout: () => Promise<void>;
}

export function useSupabaseAuth(subscribe: typeof onAuthStageChange = onAuthStageChange): SupabaseAuthState {
  const [stage, setStage] = useState<AuthStage | null>(null);

  useEffect(() => subscribe(setStage), [subscribe]);

  const login = useCallback(async () => {
    try {
      await signInWithGoogle(window.location.origin);
    } catch (error) {
      logSanitizedFirebaseError('auth_login', error);
      throw error;
    }
  }, []);

  const submitMfaCode = useCallback(async (code: string) => {
    try {
      await verifyTotpSignIn(code);
    } catch (error) {
      logSanitizedFirebaseError('auth_mfa_resolve', error);
      throw error;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await signOut();
    } catch (error) {
      logSanitizedFirebaseError('auth_login', error);
      throw error;
    }
  }, []);

  const signedInUser = stage?.kind === 'signed_in' ? stage.user : null;
  const appUser = useMemo(() => (signedInUser ? appUserFromSupabase(signedInUser) : null), [signedInUser]);

  return {
    ready: stage !== null,
    stage: stage?.kind ?? 'signed_out',
    appUser,
    login,
    submitMfaCode,
    cancelMfa: logout,
    logout,
  };
}
