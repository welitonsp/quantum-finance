// Parser offline determinístico de NFC-e (modelo 65) — FASE Compras Inteligentes.
// Escopo autorizado: docs/product/FASE_COMPRAS_RADAR_GITHUB_NFCE_2026-07-04.md
//
// ZERO I/O e ZERO REDE por contrato: recebe uma string XML (fixture, arquivo
// colado pelo usuário) e extrai itens fiscais. Fetch real de NFC-e permanece
// BLOQUEADO até o gate SSRF do threat model passar — este módulo nunca deve
// ganhar código de rede.
//
// Regras monetárias do projeto:
// - Valores fiscais de 2 casas (vProd, vDesc, vNF) → centavos inteiros via
//   Decimal.js, com verificação de integralidade (nunca Math.round/parseFloat).
// - vUnCom/qCom (até 10/4 casas) NÃO são convertidos para centavos: são
//   preservados como string fiscal original; a verdade financeira do item é vProd.
// - Dados do destinatário (CPF do comprador) NUNCA são extraídos (LGPD).

import Decimal from 'decimal.js';
import type { Centavos } from '../../../shared/types/money';

export interface NfceItem {
  /** Código interno do produto no emitente (cProd). */
  codigo: string;
  /** GTIN/EAN quando presente e numérico (cEAN); null para "SEM GTIN". */
  ean: string | null;
  /** Descrição fiscal ORIGINAL, imutável (xProd). */
  descricaoFiscal: string;
  /** Unidade comercial (uCom), ex.: UN, KG. */
  unidade: string;
  /** Quantidade comercial como string fiscal original (qCom). */
  quantidadeStr: string;
  /** Valor unitário como string fiscal original (vUnCom) — pode ter sub-centavo. */
  valorUnitarioStr: string;
  /** Total do item em centavos (vProd) — fonte financeira canônica. */
  totalCents: Centavos;
  /** Desconto do item em centavos (vDesc), 0 se ausente. */
  descontoCents: Centavos;
}

export interface NfceParseResult {
  /** Chave de acesso (44 dígitos) extraída de infNFe@Id, já validada por DV. */
  chaveAcesso: string;
  /** Nome do emitente (emit/xNome). */
  emitenteNome: string;
  /** CNPJ do emitente (emit/CNPJ) — dado público do estabelecimento. */
  emitenteCnpj: string;
  /** Data/hora de emissão ISO (ide/dhEmi), como string fiscal original. */
  emitidoEm: string;
  itens: NfceItem[];
  /** Total da nota em centavos (total/ICMSTot/vNF). */
  totalNotaCents: Centavos;
  /** Soma de totalCents dos itens (conferência; difere de vNF com descontos globais). */
  somaItensCents: Centavos;
}

export type NfceParseErrorCode =
  | 'xml_invalido'
  | 'nao_e_nfce'
  | 'chave_ausente'
  | 'chave_invalida'
  | 'valor_monetario_invalido'
  | 'sem_itens'
  | 'campo_obrigatorio_ausente';

export class NfceParseError extends Error {
  readonly code: NfceParseErrorCode;
  constructor(code: NfceParseErrorCode, message: string) {
    super(message);
    this.name = 'NfceParseError';
    this.code = code;
  }
}

const NFCE_MODELO = '65';
const CHAVE_RE = /^\d{44}$/;

/**
 * Valida a chave de acesso de 44 dígitos pelo dígito verificador (módulo 11,
 * pesos 2..9 da direita para a esquerda sobre os 43 primeiros dígitos).
 */
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

/**
 * Extrai a chave de acesso de uma string arbitrária (URL de QR Code, texto
 * colado, atributo Id). NÃO valida host nem faz fetch — apenas localiza uma
 * sequência de 44 dígitos com DV válido.
 */
export function extractChaveAcesso(raw: string): string | null {
  const matches = raw.match(/\d{44}/g);
  if (!matches) return null;
  for (const candidate of matches) {
    if (isValidChaveAcesso(candidate)) return candidate;
  }
  return null;
}

/** Converte valor fiscal de 2 casas ("12.34") em centavos inteiros, fail-closed. */
function fiscalToCents(raw: string, field: string): Centavos {
  const trimmed = raw.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    throw new NfceParseError('valor_monetario_invalido', `Valor fiscal inválido em ${field}.`);
  }
  const cents = new Decimal(trimmed).times(100);
  if (!cents.isInteger() || !cents.abs().lessThanOrEqualTo(Number.MAX_SAFE_INTEGER)) {
    throw new NfceParseError('valor_monetario_invalido', `Valor fiscal não-integral em ${field}.`);
  }
  return cents.toNumber() as Centavos;
}

function textOf(parent: Element, tag: string): string | null {
  const el = parent.getElementsByTagName(tag)[0];
  const text = el?.textContent?.trim();
  return text ? text : null;
}

function requireText(parent: Element, tag: string): string {
  const text = textOf(parent, tag);
  if (text === null) {
    throw new NfceParseError('campo_obrigatorio_ausente', `Campo fiscal obrigatório ausente: ${tag}.`);
  }
  return text;
}

/**
 * Faz o parse de um XML de NFC-e (modelo 65). Determinístico, sem rede.
 * Lança NfceParseError com código estável para roteamento de UI.
 */
export function parseNfceXml(xml: string): NfceParseResult {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new NfceParseError('xml_invalido', 'XML malformado.');
  }

  const infNFe = doc.getElementsByTagName('infNFe')[0];
  if (!infNFe) throw new NfceParseError('nao_e_nfce', 'Documento não contém infNFe.');

  const ide = infNFe.getElementsByTagName('ide')[0];
  if (!ide || textOf(ide, 'mod') !== NFCE_MODELO) {
    throw new NfceParseError('nao_e_nfce', 'Documento não é NFC-e (modelo 65).');
  }

  const idAttr = infNFe.getAttribute('Id') ?? '';
  const chaveAcesso = extractChaveAcesso(idAttr);
  if (!chaveAcesso) {
    if (!/\d{44}/.test(idAttr)) {
      throw new NfceParseError('chave_ausente', 'Chave de acesso ausente em infNFe@Id.');
    }
    throw new NfceParseError('chave_invalida', 'Chave de acesso com dígito verificador inválido.');
  }

  const emit = infNFe.getElementsByTagName('emit')[0];
  if (!emit) throw new NfceParseError('campo_obrigatorio_ausente', 'Bloco emit ausente.');

  const dets = Array.from(infNFe.getElementsByTagName('det'));
  if (dets.length === 0) throw new NfceParseError('sem_itens', 'NFC-e sem itens (det).');

  const itens: NfceItem[] = dets.map((det) => {
    const prod = det.getElementsByTagName('prod')[0];
    if (!prod) {
      throw new NfceParseError('campo_obrigatorio_ausente', 'Item det sem bloco prod.');
    }
    const eanRaw = textOf(prod, 'cEAN');
    const vDescRaw = textOf(prod, 'vDesc');
    return {
      codigo: requireText(prod, 'cProd'),
      ean: eanRaw && /^\d{8,14}$/.test(eanRaw) ? eanRaw : null,
      descricaoFiscal: requireText(prod, 'xProd'),
      unidade: requireText(prod, 'uCom'),
      quantidadeStr: requireText(prod, 'qCom'),
      valorUnitarioStr: requireText(prod, 'vUnCom'),
      totalCents: fiscalToCents(requireText(prod, 'vProd'), 'vProd'),
      descontoCents: vDescRaw ? fiscalToCents(vDescRaw, 'vDesc') : (0 as Centavos),
    };
  });

  const icmsTot = infNFe.getElementsByTagName('ICMSTot')[0];
  if (!icmsTot) throw new NfceParseError('campo_obrigatorio_ausente', 'Bloco ICMSTot ausente.');

  const somaItensCents = itens.reduce((acc, item) => acc + item.totalCents, 0) as Centavos;

  return {
    chaveAcesso,
    emitenteNome: requireText(emit, 'xNome'),
    emitenteCnpj: requireText(emit, 'CNPJ'),
    emitidoEm: requireText(ide, 'dhEmi'),
    itens,
    totalNotaCents: fiscalToCents(requireText(icmsTot, 'vNF'), 'vNF'),
    somaItensCents,
  };
}
