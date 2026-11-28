import { describe, it, expect, vi } from 'vitest';
import {
  checkPwnedPassword,
  findSuffixCount,
  sha1Hex,
  PWNED_RANGE_URL,
} from '../pwnedPassword';

// SHA-1("password") = 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8 (vetor público conhecido)
const PREFIX = '5BAA6';
const SUFFIX = '1E4C9B93F3F0682250B6CF8331B7EE68FD8';
const OTHER = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

function okResponse(body: string) {
  return { ok: true, text: async () => body };
}

describe('pwnedPassword (HIBP k-anonymity)', () => {
  it('gera SHA-1 hexadecimal maiúsculo', async () => {
    expect(await sha1Hex('password')).toBe(PREFIX + SUFFIX);
  });

  it('envia só o prefixo de 5 caracteres, com padding, e nunca a senha', async () => {
    const secret = 'Segredo-Unico-987';
    const hash = (await sha1Hex(secret))!;
    const fetchImpl = vi.fn(async () => okResponse(`${OTHER}:3\r\n`));
    await checkPwnedPassword(secret, { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(PWNED_RANGE_URL + hash.slice(0, 5));
    expect(url).not.toContain(hash.slice(5));
    expect(url).not.toContain(secret);
    expect(init.headers).toEqual({ 'Add-Padding': 'true' });
    expect(JSON.stringify(init)).not.toContain(secret);
    expect(init.credentials).toBe('omit');
  });

  it('senha presente na base → pwned com a contagem', async () => {
    const fetchImpl = vi.fn(async () => okResponse(`${OTHER}:3\r\n${SUFFIX}:9659365\r\n`));
    expect(await checkPwnedPassword('password', { fetchImpl })).toEqual({ status: 'pwned', count: 9659365 });
  });

  it('sufixo ausente ou só em linha de padding (contagem 0) → clear', async () => {
    const absent = vi.fn(async () => okResponse(`${OTHER}:3\n`));
    expect(await checkPwnedPassword('password', { fetchImpl: absent })).toEqual({ status: 'clear' });
    const padded = vi.fn(async () => okResponse(`${SUFFIX.toLowerCase()}:0\n${OTHER}:1\n`));
    expect(await checkPwnedPassword('password', { fetchImpl: padded })).toEqual({ status: 'clear' });
  });

  it('falhas viram unknown (fail-open) com motivo fixo', async () => {
    const http = vi.fn(async () => ({ ok: false, text: async () => '' }));
    expect(await checkPwnedPassword('x', { fetchImpl: http })).toEqual({ status: 'unknown', reason: 'http_error' });

    const net = vi.fn(async () => { throw new TypeError('Failed to fetch'); });
    expect(await checkPwnedPassword('x', { fetchImpl: net })).toEqual({ status: 'unknown', reason: 'network' });

    const html = vi.fn(async () => okResponse('<html>captive portal</html>'));
    expect(await checkPwnedPassword('x', { fetchImpl: html })).toEqual({ status: 'unknown', reason: 'bad_response' });

    const empty = vi.fn(async () => okResponse(''));
    expect(await checkPwnedPassword('x', { fetchImpl: empty })).toEqual({ status: 'unknown', reason: 'bad_response' });
  });

  it('API lenta → timeout (não trava o cadastro)', async () => {
    const hang = vi.fn((_url: string, init?: RequestInit) => new Promise<never>((_, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }));
    expect(await checkPwnedPassword('x', { fetchImpl: hang, timeoutMs: 10 })).toEqual({ status: 'unknown', reason: 'timeout' });

    const deaf = vi.fn(() => new Promise<never>(() => {})); // ignora o abort
    expect(await checkPwnedPassword('x', { fetchImpl: deaf, timeoutMs: 10 })).toEqual({ status: 'unknown', reason: 'timeout' });
  });

  it('sem Web Crypto → unknown no_crypto, sem chamar a rede', async () => {
    const original = globalThis.crypto;
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
    try {
      const fetchImpl = vi.fn();
      expect(await checkPwnedPassword('x', { fetchImpl })).toEqual({ status: 'unknown', reason: 'no_crypto' });
      expect(fetchImpl).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(globalThis, 'crypto', { value: original, configurable: true });
    }
  });

  it('findSuffixCount recusa formato inesperado', () => {
    expect(findSuffixCount(`${SUFFIX}:12`, SUFFIX)).toBe(12);
    expect(findSuffixCount('abc:1', SUFFIX)).toBeNull();
  });
});
