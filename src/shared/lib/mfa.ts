// MFA TOTP — wrapper fino e testável sobre firebase/auth.
//
// Contrato de segurança:
// - O RESOLVER de sign-in (resolveTotpSignIn) deve estar em produção ANTES de
//   qualquer usuário conseguir se inscrever, senão inscrição = lockout.
// - TOTP exige Identity Platform habilitado no projeto (console Firebase →
//   Authentication → Sign-in method → Multi-factor). Sem isso, generateSecret
//   falha com auth/operation-not-allowed — mapeado para mensagem acionável.
// - Nenhum segredo TOTP é logado (política de logs sanitizados).

import {
  getMultiFactorResolver,
  multiFactor,
  TotpMultiFactorGenerator,
  TotpSecret,
} from 'firebase/auth';
import type { Auth, MultiFactorError, MultiFactorInfo, User, UserCredential } from 'firebase/auth';

export const TOTP_DISPLAY_NAME = 'App autenticador (TOTP)';
const TOTP_ISSUER = 'Quantum Finance';

export interface TotpEnrollmentStart {
  secret: TotpSecret;
  /** Chave em Base32 para digitação manual no app autenticador. */
  secretKey: string;
  /** URI otpauth:// completa (QR code / deep link para o autenticador). */
  otpauthUrl: string;
}

/** Código de 6 dígitos, tolerante a espaços de colagem. */
export function normalizeTotpCode(raw: string): string | null {
  const digits = raw.replace(/\s+/g, '');
  return /^\d{6}$/.test(digits) ? digits : null;
}

export function isMfaRequiredError(error: unknown): error is MultiFactorError {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: string }).code === 'auth/multi-factor-auth-required'
  );
}

export function isMfaNotConfiguredError(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === 'auth/operation-not-allowed';
}

export function isRecentLoginRequiredError(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === 'auth/requires-recent-login';
}

/** Fatores TOTP já inscritos do usuário (vazio para usuário anônimo). */
export function listTotpFactors(user: User): MultiFactorInfo[] {
  if (user.isAnonymous) return [];
  return multiFactor(user)
    .enrolledFactors
    .filter((f) => f.factorId === TotpMultiFactorGenerator.FACTOR_ID);
}

/** Passo 1 da inscrição: gera o segredo e a URI otpauth. */
export async function startTotpEnrollment(user: User): Promise<TotpEnrollmentStart> {
  const session = await multiFactor(user).getSession();
  const secret = await TotpMultiFactorGenerator.generateSecret(session);
  const accountName = user.email ?? user.uid;
  return {
    secret,
    secretKey: secret.secretKey,
    otpauthUrl: secret.generateQrCodeUrl(accountName, TOTP_ISSUER),
  };
}

/** Passo 2 da inscrição: confirma o código do autenticador e efetiva o fator. */
export async function finalizeTotpEnrollment(
  user: User,
  secret: TotpSecret,
  code: string,
): Promise<void> {
  const normalized = normalizeTotpCode(code);
  if (!normalized) throw new Error('invalid_totp_code_format');
  const assertion = TotpMultiFactorGenerator.assertionForEnrollment(secret, normalized);
  await multiFactor(user).enroll(assertion, TOTP_DISPLAY_NAME);
}

/** Remove um fator TOTP inscrito (exige login recente). */
export async function unenrollTotpFactor(user: User, factorUid: string): Promise<void> {
  await multiFactor(user).unenroll(factorUid);
}

/**
 * Conclui um sign-in interrompido por auth/multi-factor-auth-required
 * usando o código TOTP do autenticador.
 */
export async function resolveTotpSignIn(
  auth: Auth,
  error: MultiFactorError,
  code: string,
): Promise<UserCredential> {
  const normalized = normalizeTotpCode(code);
  if (!normalized) throw new Error('invalid_totp_code_format');

  const resolver = getMultiFactorResolver(auth, error);
  const totpHint = resolver.hints.find(
    (h) => h.factorId === TotpMultiFactorGenerator.FACTOR_ID,
  );
  if (!totpHint) throw new Error('no_totp_factor_enrolled');

  const assertion = TotpMultiFactorGenerator.assertionForSignIn(totpHint.uid, normalized);
  return resolver.resolveSignIn(assertion);
}
