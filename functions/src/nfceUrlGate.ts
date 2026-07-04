// Gate SSRF para consulta futura de NFC-e — FASE Compras Inteligentes,
// entregável 3 (docs/product/FASE_COMPRAS_RADAR_GITHUB_NFCE_2026-07-04.md).
// Implementa as defesas do threat model §12–§16
// (docs/product/THREAT_MODEL_COMPRAS_INTELIGENTES_NFCE_2026-06-12.md).
//
// PRINCÍPIO CENTRAL: o backend NUNCA faz fetch de URL enviada pelo usuário.
// A única entrada aceita é a CHAVE DE ACESSO (44 dígitos, DV validado);
// a URL é RECONSTRUÍDA canonicamente a partir da allowlist por UF.
//
// ESTE MÓDULO NÃO FAZ REDE — é o validador puro que a futura callable de
// consulta usará. Guardrail estático em functions/test/nfceUrlGate.test.js
// garante ausência de tokens de fetch/http neste arquivo. O fetch real só
// será implementado em fase própria, consumindo estas funções.
//
// Nota de fronteira de domínio: a validação de DV também existe em
// src/features/shopping/lib/nfceParser.ts (client). functions/ não importa
// src/ (zonas separadas) — a duplicação é deliberada e ambas têm suíte própria.

export class NfceGateError extends Error {
  readonly code:
    | 'chave_invalida'
    | 'uf_nao_permitida'
    | 'host_nao_permitido'
    | 'protocolo_invalido'
    | 'porta_invalida'
    | 'userinfo_proibido'
    | 'ip_literal_proibido'
    | 'resolucao_vazia'
    | 'ip_proibido';

  constructor(code: NfceGateError['code'], message: string) {
    super(message);
    this.name = 'NfceGateError';
    this.code = code;
  }
}

// ── Allowlist por UF ──────────────────────────────────────────────────────────
// APENAS domínios oficiais verificados entram aqui. Começa por GO (UF do
// projeto); ampliar exige conferência manual do endpoint oficial da SEFAZ da
// UF (referência de mapeamento: erpbrasil.edoc). NUNCA aceitar host do usuário.

export interface UfConsultaEndpoint {
  uf: string;
  host: string;
  path: string;
}

export const NFCE_CONSULTA_ALLOWLIST: Readonly<Record<string, UfConsultaEndpoint>> = {
  // 52 = Goiás
  '52': { uf: 'GO', host: 'nfe.sefaz.go.gov.br', path: '/nfeweb/sites/nfce/danfeNFCe' },
};

/** Hosts permitidos (derivado da allowlist) — comparação por igualdade exata. */
export const ALLOWED_HOSTS: ReadonlySet<string> = new Set(
  Object.values(NFCE_CONSULTA_ALLOWLIST).map((e) => e.host),
);

// ── Política da futura fase de rede — constantes normativas ─────────────────
// Redirects são PROIBIDOS (threat model §16): qualquer 3xx deve abortar.
export const REDIRECT_POLICY = 'deny' as const;
export const MAX_RESPONSE_BYTES = 512 * 1024; // payload fiscal legítimo é pequeno
export const FETCH_TIMEOUT_MS = 10_000;

// ── Chave de acesso ───────────────────────────────────────────────────────────

const CHAVE_RE = /^\d{44}$/;

/** DV módulo-11 (pesos 2..9 da direita para a esquerda sobre os 43 primeiros). */
export function isValidChaveAcesso(chave: string): boolean {
  if (!CHAVE_RE.test(chave)) return false;
  let peso = 2;
  let soma = 0;
  for (let i = 42; i >= 0; i--) {
    soma += Number(chave[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  const dv = resto === 0 || resto === 1 ? 0 : 11 - resto;
  return dv === Number(chave[43]);
}

// ── Reconstrução canônica da URL ─────────────────────────────────────────────

/**
 * Reconstrói a URL de consulta a partir da CHAVE (nunca de URL do usuário).
 * Protocolo fixo https, sem porta, sem userinfo; query montada por allowlist
 * de parâmetros (apenas `p`). UF fora da allowlist → recusa.
 */
export function buildConsultaUrl(chaveRaw: string): URL {
  const chave = chaveRaw.trim();
  if (!isValidChaveAcesso(chave)) {
    throw new NfceGateError('chave_invalida', 'Chave de acesso inválida (formato ou DV).');
  }
  const cUF = chave.slice(0, 2);
  const endpoint = NFCE_CONSULTA_ALLOWLIST[cUF];
  if (!endpoint) {
    throw new NfceGateError('uf_nao_permitida', `UF ${cUF} fora da allowlist de consulta.`);
  }
  const url = new URL(`https://${endpoint.host}${endpoint.path}`);
  url.searchParams.set('p', chave);
  return url;
}

// ── Validação de URL/host (defesa em profundidade sobre a URL reconstruída) ──

/**
 * Revalida uma URL antes de qualquer conexão (e obrigatoriamente sobre CADA
 * redirect, se a política um dia mudar — hoje redirects são proibidos).
 * Comparação por hostname REAL e igualdade exata — nunca substring.
 */
export function assertUrlAllowed(url: URL): void {
  if (url.protocol !== 'https:') {
    throw new NfceGateError('protocolo_invalido', 'Apenas https é permitido.');
  }
  if (url.port !== '') {
    throw new NfceGateError('porta_invalida', 'Porta explícita não é permitida.');
  }
  if (url.username !== '' || url.password !== '') {
    throw new NfceGateError('userinfo_proibido', 'Userinfo na URL não é permitido.');
  }
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  if (isIpLiteral(hostname)) {
    throw new NfceGateError('ip_literal_proibido', 'Host IP literal não é permitido.');
  }
  if (hostname.split('.').some((label) => label.startsWith('xn--'))) {
    // Punycode nunca aparece nos hosts oficiais da allowlist.
    throw new NfceGateError('host_nao_permitido', 'Host punycode não é permitido.');
  }
  if (!ALLOWED_HOSTS.has(hostname)) {
    throw new NfceGateError('host_nao_permitido', 'Host fora da allowlist oficial.');
  }
}

function isIpLiteral(hostname: string): boolean {
  if (hostname.startsWith('[') || hostname.includes(':')) return true; // IPv6
  // Qualquer host só-dígitos-e-pontos é tratado como tentativa de IP
  // (inclui formas decimais/octais exóticas) — fail-closed.
  return /^[0-9.]+$/.test(hostname) || /^0x/i.test(hostname);
}

// ── Bloqueio de IP privado/loopback/link-local/metadata (pós-resolução DNS) ──

/** Parse estrito de IPv4 decimal-pontuado; formas exóticas → null (rejeitadas). */
function parseStrictIpv4(ip: string): [number, number, number, number] | null {
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const octets = m.slice(1).map(Number) as [number, number, number, number];
  return octets.every((o) => o >= 0 && o <= 255) ? octets : null;
}

/**
 * true se o IP resolvido é PROIBIDO para conexão de saída.
 * Formato não reconhecido → proibido (fail-closed).
 */
export function isForbiddenAddress(ipRaw: string): boolean {
  const ip = ipRaw.trim().toLowerCase();
  if (ip === '') return true;

  // IPv6 (inclui IPv4-mapped)
  if (ip.includes(':')) {
    const mapped = ip.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
    if (mapped && mapped[1]) return isForbiddenAddress(mapped[1]);
    if (ip === '::' || ip === '::1') return true;              // unspecified/loopback
    if (/^fe[89ab]/.test(ip)) return true;                     // link-local fe80::/10
    if (/^f[cd]/.test(ip)) return true;                        // ULA fc00::/7
    if (/^ff/.test(ip)) return true;                           // multicast
    if (/^2001:0?db8/.test(ip)) return true;                   // documentação
    return false;
  }

  const octets = parseStrictIpv4(ip);
  if (!octets) return true; // octal/hex/decimal-único/overflow → fail-closed
  const [a, b] = octets;

  if (a === 0) return true;                                    // 0.0.0.0/8
  if (a === 10) return true;                                   // RFC1918
  if (a === 100 && b >= 64 && b <= 127) return true;           // CGNAT 100.64/10
  if (a === 127) return true;                                  // loopback
  if (a === 169 && b === 254) return true;                     // link-local + metadata
  if (a === 172 && b >= 16 && b <= 31) return true;            // RFC1918
  if (a === 192 && b === 168) return true;                     // RFC1918
  if (a === 192 && b === 0) return true;                       // 192.0.0/24 + doc
  if (a === 198 && (b === 18 || b === 19)) return true;        // benchmark
  if (a >= 224) return true;                                   // multicast/reservado/broadcast
  return false;
}

/**
 * Valida o conjunto COMPLETO de endereços resolvidos para o host.
 * TODOS devem ser públicos — um único endereço proibido rejeita tudo
 * (bloqueia DNS rebinding via múltiplos A/AAAA records). Lista vazia rejeita.
 * A futura fase de fetch deve resolver e conectar no MESMO endereço validado
 * (revalidação no momento da conexão, threat model §15).
 */
export function assertResolvedAddressesAllowed(ips: readonly string[]): void {
  if (ips.length === 0) {
    throw new NfceGateError('resolucao_vazia', 'Resolução DNS vazia.');
  }
  for (const ip of ips) {
    if (isForbiddenAddress(ip)) {
      throw new NfceGateError('ip_proibido', 'Host resolve para endereço proibido.');
    }
  }
}
