import type { Session, SupabaseClient, User } from '@supabase/supabase-js';
import { getSupabase } from './client';
import { checkPwnedPassword, type PwnedCheckResult } from '../../lib/pwnedPassword';
import { logSanitizedFirebaseError } from '../../lib/firebaseErrorHandling';

/**
 * Login no Supabase (migração Firebase → Supabase, etapa 3).
 *
 * Google ou e-mail e senha + TOTP opcional.
 * - Google via OAuth com redirect (PKCE). Popup não existe no Supabase.
 * - E-mail e senha: funciona sem configurar o Google (confirmação por e-mail).
 * - MFA: quem tem fator TOTP verificado entra em aal1 e precisa subir para
 *   aal2 com o código do autenticador antes de ver dados.
 * - Nenhum segredo TOTP, token ou e-mail é logado (política de logs).
 *
 * Toda função recebe o cliente por parâmetro (default: getSupabase()) para ser
 * testável sem rede.
 */

export const TOTP_FRIENDLY_NAME = 'App autenticador (TOTP)';
const TOTP_ISSUER = 'Quantum Finance';

export interface TotpFactor {
  id: string;
  friendlyName: string | null;
}

export interface TotpEnrollmentStart {
  factorId: string;
  /** SVG do QR code (exibir via data:image/svg+xml;utf-8,). */
  qrCodeSvg: string;
  /** Chave Base32 para digitação manual. */
  secretKey: string;
  otpauthUrl: string;
}

export type AuthStage =
  | { kind: 'signed_out' }
  | { kind: 'needs_mfa'; user: User }
  | { kind: 'signed_in'; user: User };

/** Erro com código estável; a mensagem nunca carrega dado do usuário. */
export class SupabaseAuthError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'SupabaseAuthError';
  }
}

function fail(code: string): never {
  throw new SupabaseAuthError(code);
}

/** Código de 6 dígitos, tolerante a espaços de colagem. */
export function normalizeTotpCode(raw: string): string | null {
  const digits = raw.replace(/\s+/g, '');
  return /^\d{6}$/.test(digits) ? digits : null;
}

/** Redireciona para o Google. Volta para `redirectTo` com a sessão (PKCE). */
export async function signInWithGoogle(
  redirectTo: string = window.location.origin,
  client: SupabaseClient = getSupabase(),
): Promise<void> {
  const { error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo },
  });
  if (error) fail('oauth_start_failed');
}

/** Códigos estáveis do login por e-mail (a UI traduz; nada do usuário no erro). */
const EMAIL_AUTH_CODES = new Set([
  'invalid_credentials', 'email_not_confirmed', 'user_already_exists',
  'weak_password', 'over_email_send_rate_limit', 'email_address_invalid',
]);

function emailAuthCode(error: { code?: string | undefined } | null): string {
  const code = error?.code ?? '';
  return EMAIL_AUTH_CODES.has(code) ? code : 'email_auth_failed';
}

/** Login com e-mail e senha (sem depender do Google). */
export async function signInWithEmail(
  email: string,
  password: string,
  client: SupabaseClient = getSupabase(),
): Promise<void> {
  const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });
  if (error) fail(emailAuthCode(error));
}

/**
 * Recusa senha que já apareceu em vazamentos (HIBP, k-anonymity). O Supabase
 * só faz isso no plano Pro. Fail-open: se a checagem falhar, registra o motivo
 * (código fixo, sem senha nem e-mail) e deixa seguir.
 */
export async function assertPasswordNotPwned(
  password: string,
  check: (password: string) => Promise<PwnedCheckResult> = checkPwnedPassword,
): Promise<void> {
  const result = await check(password);
  if (result.status === 'pwned') fail('pwned_password');
  if (result.status === 'unknown') {
    logSanitizedFirebaseError('auth_login', new SupabaseAuthError(`pwned_check_${result.reason}`));
  }
}

/**
 * Cria conta com e-mail e senha. Com confirmação de e-mail ligada (padrão do
 * Supabase) não há sessão até o usuário clicar no link: devolve needsConfirmation.
 * Antes, recusa senha vazada (assertPasswordNotPwned).
 */
export async function signUpWithEmail(
  email: string,
  password: string,
  redirectTo: string = window.location.origin,
  client: SupabaseClient = getSupabase(),
  check: (password: string) => Promise<PwnedCheckResult> = checkPwnedPassword,
): Promise<{ needsConfirmation: boolean }> {
  await assertPasswordNotPwned(password, check);
  const { data, error } = await client.auth.signUp({
    email: email.trim(),
    password,
    options: { emailRedirectTo: redirectTo },
  });
  if (error) fail(emailAuthCode(error));
  return { needsConfirmation: !data.session };
}

export async function signOut(client: SupabaseClient = getSupabase()): Promise<void> {
  const { error } = await client.auth.signOut();
  if (error) fail('sign_out_failed');
}

/** Decide a etapa do login a partir da sessão e do nível de garantia (AAL). */
export async function resolveAuthStage(
  session: Session | null,
  client: SupabaseClient = getSupabase(),
): Promise<AuthStage> {
  if (!session) return { kind: 'signed_out' };
  // O AAL é lido do token DESTA sessão, não da sessão "atual" do cliente,
  // que pode já ter mudado (logout/troca de conta) enquanto isto roda.
  const { data, error } = await client.auth.mfa.getAuthenticatorAssuranceLevel(session.access_token);
  // Fail-closed: sem conseguir ler o AAL, não libera os dados.
  if (error || !data || !data.currentLevel) return { kind: 'needs_mfa', user: session.user };
  if (data.nextLevel === 'aal2' && data.currentLevel !== 'aal2') {
    return { kind: 'needs_mfa', user: session.user };
  }
  return { kind: 'signed_in', user: session.user };
}

/** Assina mudanças de sessão; devolve a função de cancelamento. */
export function onAuthStageChange(
  listener: (stage: AuthStage) => void,
  client: SupabaseClient = getSupabase(),
): () => void {
  // Cada evento ganha um número; só o resultado do evento MAIS RECENTE é
  // entregue. Assim uma resolução lenta de antes do logout não "relogar" a tela.
  let generation = 0;
  let active = true;
  const { data } = client.auth.onAuthStateChange((_event, session) => {
    const mine = ++generation;
    // Não chamar a API de auth dentro do callback (deadlock documentado no
    // supabase-js): adia para o próximo tick.
    setTimeout(() => {
      void resolveAuthStage(session, client).then((stage) => {
        if (active && mine === generation) listener(stage);
      });
    }, 0);
  });
  return () => {
    active = false;
    data.subscription.unsubscribe();
  };
}

/** Fatores TOTP já verificados do usuário. */
export async function listTotpFactors(client: SupabaseClient = getSupabase()): Promise<TotpFactor[]> {
  const { data, error } = await client.auth.mfa.listFactors();
  if (error || !data) fail('list_factors_failed');
  return data.totp
    .filter((f) => f.status === 'verified')
    .map((f) => ({ id: f.id, friendlyName: f.friendly_name ?? null }));
}

/** Passo 1 da inscrição: cria o fator e devolve QR code e chave. */
export async function startTotpEnrollment(client: SupabaseClient = getSupabase()): Promise<TotpEnrollmentStart> {
  const { data, error } = await client.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: TOTP_FRIENDLY_NAME,
    issuer: TOTP_ISSUER,
  });
  if (error || !data) fail('enroll_failed');
  return {
    factorId: data.id,
    qrCodeSvg: data.totp.qr_code,
    secretKey: data.totp.secret,
    otpauthUrl: data.totp.uri,
  };
}

async function challengeAndVerify(client: SupabaseClient, factorId: string, rawCode: string): Promise<void> {
  const code = normalizeTotpCode(rawCode);
  if (!code) fail('invalid_totp_code_format');
  const { error } = await client.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) fail('totp_verify_failed');
}

/** Passo 2 da inscrição: confirma o código e ativa o fator (sessão vira aal2). */
export async function finalizeTotpEnrollment(
  factorId: string,
  code: string,
  client: SupabaseClient = getSupabase(),
): Promise<void> {
  await challengeAndVerify(client, factorId, code);
}

/** Login em duas etapas: sobe a sessão de aal1 para aal2 com o código TOTP. */
export async function verifyTotpSignIn(code: string, client: SupabaseClient = getSupabase()): Promise<void> {
  const factors = await listTotpFactors(client);
  const factor = factors[0];
  if (!factor) fail('no_totp_factor_enrolled');
  await challengeAndVerify(client, factor.id, code);
}

/** Remove um fator TOTP (o Supabase exige sessão aal2 para isso). */
export async function unenrollTotpFactor(factorId: string, client: SupabaseClient = getSupabase()): Promise<void> {
  const { error } = await client.auth.mfa.unenroll({ factorId });
  if (error) fail('unenroll_failed');
}
