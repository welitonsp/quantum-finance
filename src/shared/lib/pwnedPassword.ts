/**
 * Checagem de senha vazada (Have I Been Pwned — Pwned Passwords).
 *
 * O Supabase só oferece essa proteção no plano Pro, então o app faz a checagem
 * por conta própria, com k-anonymity:
 * - a senha vira SHA-1 no próprio navegador;
 * - só os 5 primeiros caracteres do hash saem do aparelho;
 * - a API devolve todos os sufixos com aquele prefixo e a comparação é local.
 * A senha (e o hash completo) nunca é enviada nem logada.
 *
 * `Add-Padding: true` faz a API completar a resposta com sufixos falsos
 * (contagem 0), para que o tamanho da resposta não denuncie o prefixo.
 *
 * Fail-open: se a API falhar, demorar ou o navegador não tiver Web Crypto,
 * o resultado é `unknown` e quem chama decide (o cadastro segue).
 */

export const PWNED_RANGE_URL = 'https://api.pwnedpasswords.com/range/';
export const PWNED_TIMEOUT_MS = 4000;

export type PwnedCheckResult =
  | { status: 'pwned'; count: number }
  | { status: 'clear' }
  /** Não deu para checar. `reason` é um código fixo, sem dado do usuário. */
  | { status: 'unknown'; reason: 'no_crypto' | 'timeout' | 'network' | 'http_error' | 'bad_response' };

type FetchLike = (input: string, init?: RequestInit) => Promise<Pick<Response, 'ok' | 'text'>>;

export interface PwnedCheckOptions {
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}

/** SHA-1 em hexadecimal maiúsculo (formato da API). */
export async function sha1Hex(text: string): Promise<string | null> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null;
  const digest = await subtle.digest('SHA-1', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

/**
 * Procura o sufixo na resposta da API (`SUFIXO:CONTAGEM` por linha).
 * Devolve a contagem (0 = ausente ou linha de padding) ou null se a resposta
 * não tiver o formato esperado.
 */
export function findSuffixCount(body: string, suffix: string): number | null {
  let sawValidLine = false;
  for (const raw of body.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const sep = line.indexOf(':');
    if (sep !== 35) return null; // sufixo SHA-1 tem 35 caracteres hex
    sawValidLine = true;
    if (line.slice(0, sep).toUpperCase() === suffix) {
      const count = Number.parseInt(line.slice(sep + 1), 10);
      return Number.isFinite(count) && count > 0 ? count : 0;
    }
  }
  return sawValidLine ? 0 : null;
}

export async function checkPwnedPassword(
  password: string,
  { fetchImpl, timeoutMs = PWNED_TIMEOUT_MS }: PwnedCheckOptions = {},
): Promise<PwnedCheckResult> {
  let hash: string | null;
  try {
    hash = await sha1Hex(password);
  } catch {
    hash = null;
  }
  if (!hash) return { status: 'unknown', reason: 'no_crypto' };

  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);
  const doFetch: FetchLike | undefined = fetchImpl ?? (typeof fetch === 'function' ? fetch.bind(globalThis) : undefined);
  if (!doFetch) return { status: 'unknown', reason: 'network' };

  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller?.abort();
  }, timeoutMs);

  try {
    const response = await Promise.race([
      doFetch(PWNED_RANGE_URL + prefix, {
        headers: { 'Add-Padding': 'true' },
        signal: controller?.signal ?? null,
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
      }),
      new Promise<never>((_, reject) => {
        controller?.signal.addEventListener('abort', () => reject(new Error('timeout')));
      }),
    ]);
    if (!response.ok) return { status: 'unknown', reason: 'http_error' };
    const count = findSuffixCount(await response.text(), suffix);
    if (count === null) return { status: 'unknown', reason: 'bad_response' };
    return count > 0 ? { status: 'pwned', count } : { status: 'clear' };
  } catch {
    return { status: 'unknown', reason: timedOut ? 'timeout' : 'network' };
  } finally {
    clearTimeout(timer);
  }
}
