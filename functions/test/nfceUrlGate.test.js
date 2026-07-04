const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');

const {
  ALLOWED_HOSTS,
  FETCH_TIMEOUT_MS,
  MAX_RESPONSE_BYTES,
  NFCE_CONSULTA_ALLOWLIST,
  NfceGateError,
  REDIRECT_POLICY,
  assertResolvedAddressesAllowed,
  assertUrlAllowed,
  buildConsultaUrl,
  isForbiddenAddress,
  isValidChaveAcesso,
} = require('../lib/nfceUrlGate');

// Chave sintética GO (cUF=52) com DV válido — mesma dos testes do client.
const CHAVE_GO = '52260711222333000181650010000001231123456780';
const CHAVE_DV_ERRADO = '52260711222333000181650010000001231123456781';
// Chave SP (cUF=35) com DV recalculado — UF fora da allowlist.
function chaveComUf(uf) {
  const base = uf + CHAVE_GO.slice(2, 43);
  let peso = 2;
  let soma = 0;
  for (let i = 42; i >= 0; i--) {
    soma += Number(base[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  const dv = resto === 0 || resto === 1 ? 0 : 11 - resto;
  return base + String(dv);
}

function expectGateError(fn, code) {
  try {
    fn();
    assert.fail(`esperava NfceGateError ${code}`);
  } catch (e) {
    assert.ok(e instanceof NfceGateError, `esperava NfceGateError, veio ${e.name}`);
    assert.equal(e.code, code);
  }
}

describe('guardrail estático — módulo do gate NÃO faz rede', () => {
  it('nfceUrlGate.ts não contém tokens de fetch/http/socket', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'nfceUrlGate.ts'), 'utf8');
    const forbidden = [/\bfetch\s*\(/, /require\(['"]https?['"]\)/, /from\s+['"]https?['"]/,
      /\baxios\b/, /\bnode-fetch\b/, /\bundici\b/, /\bnet\.connect\b/, /\bdns\.(resolve|lookup)\b/];
    for (const re of forbidden) {
      assert.equal(re.test(source), false, `token de rede proibido no gate: ${re}`);
    }
  });
});

describe('isValidChaveAcesso (functions)', () => {
  it('aceita DV correto e rejeita DV errado/formatos', () => {
    assert.equal(isValidChaveAcesso(CHAVE_GO), true);
    assert.equal(isValidChaveAcesso(CHAVE_DV_ERRADO), false);
    assert.equal(isValidChaveAcesso(CHAVE_GO.slice(0, 43)), false);
    assert.equal(isValidChaveAcesso('x'.repeat(44)), false);
  });
});

describe('buildConsultaUrl — URL reconstruída, nunca do usuário', () => {
  it('constrói a URL canônica de GO a partir da chave', () => {
    const url = buildConsultaUrl(CHAVE_GO);
    assert.equal(url.toString(),
      `https://nfe.sefaz.go.gov.br/nfeweb/sites/nfce/danfeNFCe?p=${CHAVE_GO}`);
    assert.equal(url.protocol, 'https:');
    assert.equal(url.port, '');
    assert.equal(url.username, '');
  });

  it('rejeita chave com DV inválido', () => {
    expectGateError(() => buildConsultaUrl(CHAVE_DV_ERRADO), 'chave_invalida');
  });

  it('rejeita UF fora da allowlist (35 = SP não cadastrada)', () => {
    const chaveSp = chaveComUf('35');
    assert.equal(isValidChaveAcesso(chaveSp), true, 'fixture SP deve ter DV válido');
    expectGateError(() => buildConsultaUrl(chaveSp), 'uf_nao_permitida');
  });

  it('URL construída passa na própria validação de host (coerência interna)', () => {
    assert.doesNotThrow(() => assertUrlAllowed(buildConsultaUrl(CHAVE_GO)));
  });
});

describe('assertUrlAllowed — validação de host por igualdade exata', () => {
  it('rejeita domínio parecido (sufixo attacker)', () => {
    expectGateError(
      () => assertUrlAllowed(new URL('https://nfe.sefaz.go.gov.br.attacker.com/x')),
      'host_nao_permitido');
  });

  it('rejeita allowlist como substring de path (attacker.com/dominio-oficial)', () => {
    expectGateError(
      () => assertUrlAllowed(new URL('https://attacker.com/nfe.sefaz.go.gov.br')),
      'host_nao_permitido');
  });

  it('rejeita http, porta explícita e userinfo', () => {
    expectGateError(() => assertUrlAllowed(new URL('http://nfe.sefaz.go.gov.br/x')), 'protocolo_invalido');
    expectGateError(() => assertUrlAllowed(new URL('https://nfe.sefaz.go.gov.br:8443/x')), 'porta_invalida');
    expectGateError(() => assertUrlAllowed(new URL('https://user@nfe.sefaz.go.gov.br/x')), 'userinfo_proibido');
  });

  it('rejeita IP literal (IPv4, IPv6, formas exóticas)', () => {
    expectGateError(() => assertUrlAllowed(new URL('https://127.0.0.1/x')), 'ip_literal_proibido');
    expectGateError(() => assertUrlAllowed(new URL('https://[::1]/x')), 'ip_literal_proibido');
    expectGateError(() => assertUrlAllowed(new URL('https://2130706433/x')), 'ip_literal_proibido');
    expectGateError(() => assertUrlAllowed(new URL('https://0x7f000001/x')), 'ip_literal_proibido');
  });

  it('rejeita host punycode e localhost', () => {
    expectGateError(() => assertUrlAllowed(new URL('https://xn--tst-qla.example/x')), 'host_nao_permitido');
    expectGateError(() => assertUrlAllowed(new URL('https://localhost/x')), 'host_nao_permitido');
  });

  it('trailing dot não burla a comparação', () => {
    assert.doesNotThrow(() => assertUrlAllowed(new URL(`https://nfe.sefaz.go.gov.br./nfeweb/sites/nfce/danfeNFCe?p=${CHAVE_GO}`)));
  });
});

describe('isForbiddenAddress — bloqueio pós-resolução DNS', () => {
  const forbidden = [
    '127.0.0.1', '127.255.255.254',      // loopback
    '10.0.0.1', '172.16.0.1', '172.31.255.255', '192.168.1.1', // RFC1918
    '169.254.169.254',                    // metadata GCP/AWS
    '169.254.0.1',                        // link-local
    '0.0.0.0', '100.64.0.1', '192.0.0.1', '198.18.0.1',
    '224.0.0.1', '255.255.255.255',       // multicast/broadcast
    '::1', '::', 'fe80::1', 'fc00::1', 'fd12::1', 'ff02::1',
    '::ffff:127.0.0.1', '::ffff:10.0.0.5', // IPv4-mapped
    '0177.0.0.1', '2130706433', '0x7f.0.0.1', // formas exóticas → fail-closed
    'not-an-ip', '',
  ];
  for (const ip of forbidden) {
    it(`proíbe ${JSON.stringify(ip)}`, () => {
      assert.equal(isForbiddenAddress(ip), true);
    });
  }

  const allowed = ['8.8.8.8', '200.198.192.1', '2001:4860:4860::8888', '172.15.0.1', '172.32.0.1'];
  for (const ip of allowed) {
    it(`permite público ${ip}`, () => {
      assert.equal(isForbiddenAddress(ip), false);
    });
  }
});

describe('assertResolvedAddressesAllowed — DNS rebinding via multi-record', () => {
  it('rejeita lista vazia', () => {
    expectGateError(() => assertResolvedAddressesAllowed([]), 'resolucao_vazia');
  });

  it('UM endereço privado no meio de públicos rejeita TUDO', () => {
    expectGateError(
      () => assertResolvedAddressesAllowed(['200.198.192.1', '10.0.0.1']),
      'ip_proibido');
    expectGateError(
      () => assertResolvedAddressesAllowed(['8.8.8.8', '169.254.169.254', '8.8.4.4']),
      'ip_proibido');
  });

  it('todos públicos passa', () => {
    assert.doesNotThrow(() => assertResolvedAddressesAllowed(['200.198.192.1', '2001:4860:4860::8888']));
  });
});

describe('constantes normativas da futura fase de fetch', () => {
  it('redirects proibidos, limites definidos, allowlist coerente', () => {
    assert.equal(REDIRECT_POLICY, 'deny');
    assert.ok(MAX_RESPONSE_BYTES > 0 && MAX_RESPONSE_BYTES <= 1024 * 1024);
    assert.ok(FETCH_TIMEOUT_MS > 0 && FETCH_TIMEOUT_MS <= 30_000);
    for (const e of Object.values(NFCE_CONSULTA_ALLOWLIST)) {
      assert.ok(ALLOWED_HOSTS.has(e.host));
      assert.ok(e.host.endsWith('.gov.br'), 'allowlist só aceita domínio oficial .gov.br');
      assert.ok(e.path.startsWith('/'));
    }
  });
});
