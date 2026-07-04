// Parser offline de HTML COLADO da consulta pública de NFC-e — FASE Compras
// Inteligentes, entregável 2 (docs/product/FASE_COMPRAS_RADAR_GITHUB_NFCE_2026-07-04.md).
//
// Cenário: quando a consulta da SEFAZ exige CAPTCHA, o usuário abre a página
// no navegador e COLA o HTML aqui. ZERO I/O e ZERO REDE por contrato — este
// módulo nunca deve ganhar código de fetch (isso pertence ao gate SSRF futuro).
//
// Layout suportado: "portal nacional" da consulta resumida de NFC-e (spans
// .txtTit/.Rqtd/.RvlUnit/.valor em #tabResult, chave em .chave), usado por
// várias UFs. Layouts fora desse padrão → erro claro, nunca dado inventado.
//
// Regras monetárias: valores BRL ("1.234,56") → centavos inteiros via
// Decimal.js fail-closed (nunca Math.round/parseFloat). EAN não existe na
// página pública → sempre null. Dados do consumidor nunca são extraídos.

import Decimal from 'decimal.js';
import type { Centavos } from '../../../shared/types/money';
import {
  extractChaveAcesso,
  NfceParseError,
  parseNfceXml,
  type NfceItem,
  type NfceParseResult,
} from './nfceParser';

/** Converte valor em formato BRL ("1.234,56", "R$ 42,90") em centavos, fail-closed. */
export function brlToCents(raw: string, field: string): Centavos {
  const normalized = raw
    .replace(/R\$/gi, '')
    .replace(/\s+/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    throw new NfceParseError('valor_monetario_invalido', `Valor BRL inválido em ${field}.`);
  }
  const cents = new Decimal(normalized).times(100);
  if (!cents.isInteger() || !cents.abs().lessThanOrEqualTo(Number.MAX_SAFE_INTEGER)) {
    throw new NfceParseError('valor_monetario_invalido', `Valor BRL não-integral em ${field}.`);
  }
  return cents.toNumber() as Centavos;
}

function textContent(el: Element | null | undefined): string {
  return el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

/** Remove o rótulo em <strong> (ex.: "Qtde.:2" → "2"). */
function stripLabel(el: Element | null | undefined): string {
  if (!el) return '';
  const clone = el.cloneNode(true) as Element;
  for (const strong of Array.from(clone.getElementsByTagName('strong'))) {
    strong.remove();
  }
  return textContent(clone);
}

/**
 * Faz o parse do HTML da consulta pública de NFC-e (layout portal nacional).
 * Determinístico, sem rede. Lança NfceParseError com código estável.
 */
export function parseNfceHtml(html: string): NfceParseResult {
  const doc = new DOMParser().parseFromString(html, 'text/html');

  // Chave de acesso: âncora de confiança — sem ela (com DV válido), rejeita.
  const chaveEl = doc.querySelector('.chave');
  const chaveAcesso = extractChaveAcesso(textContent(chaveEl).replace(/\s+/g, ''))
    ?? extractChaveAcesso(html.replace(/[\s.-]+/g, ''));
  if (!chaveAcesso) {
    throw new NfceParseError(
      'chave_ausente',
      'Chave de acesso não encontrada no HTML colado (ou DV inválido). Cole a página completa da consulta.',
    );
  }

  const rows = Array.from(doc.querySelectorAll('#tabResult tr'));
  const itens: NfceItem[] = [];
  for (const row of rows) {
    const desc = row.querySelector('.txtTit');
    const valorEl = row.querySelector('.valor');
    if (!desc || !valorEl) continue; // linha de layout, não de item

    const codigoRaw = textContent(row.querySelector('.RCod'));
    const codigoMatch = codigoRaw.match(/C[óo]digo:\s*([^)]+)\)?/i);

    itens.push({
      codigo: codigoMatch?.[1]?.trim() ?? '',
      ean: null, // a página pública não expõe GTIN
      descricaoFiscal: textContent(desc),
      unidade: stripLabel(row.querySelector('.RUN')),
      quantidadeStr: stripLabel(row.querySelector('.Rqtd')),
      valorUnitarioStr: stripLabel(row.querySelector('.RvlUnit')),
      totalCents: brlToCents(textContent(valorEl), 'valor do item'),
      descontoCents: 0 as Centavos, // desconto por item não aparece na consulta resumida
    });
  }
  if (itens.length === 0) {
    throw new NfceParseError('sem_itens', 'Nenhum item encontrado no HTML (esperado #tabResult).');
  }

  // Total da nota: "Valor total R$" preferido; "Valor a pagar R$" como fallback.
  let totalNotaCents: Centavos | null = null;
  let valorAPagar: Centavos | null = null;
  for (const linha of Array.from(doc.querySelectorAll('#totalNota #linhaTotal, #linhaTotal'))) {
    const label = textContent(linha.querySelector('label')).toLowerCase();
    const num = linha.querySelector('.totalNumb');
    if (!num) continue;
    if (label.includes('valor total')) totalNotaCents = brlToCents(textContent(num), 'valor total');
    else if (label.includes('valor a pagar')) valorAPagar = brlToCents(textContent(num), 'valor a pagar');
  }
  const total = totalNotaCents ?? valorAPagar;
  if (total === null) {
    throw new NfceParseError('campo_obrigatorio_ausente', 'Total da nota não encontrado no HTML.');
  }

  // Emitente: .txtTopo (nome) + primeiro CNPJ no texto (dado público da loja).
  const emitenteNome = textContent(doc.querySelector('.txtTopo'));
  if (!emitenteNome) {
    throw new NfceParseError('campo_obrigatorio_ausente', 'Nome do emitente não encontrado no HTML.');
  }
  const cnpjMatch = (doc.body?.textContent ?? '').match(/CNPJ:?\s*([\d./-]{14,18})/i);
  const emitenteCnpj = cnpjMatch?.[1]?.replace(/\D/g, '') ?? '';
  if (!/^\d{14}$/.test(emitenteCnpj)) {
    throw new NfceParseError('campo_obrigatorio_ausente', 'CNPJ do emitente não encontrado no HTML.');
  }

  const somaItensCents = itens.reduce((acc, i) => acc + i.totalCents, 0) as Centavos;

  return {
    chaveAcesso,
    emitenteNome,
    emitenteCnpj,
    emitidoEm: null, // a data na página varia por UF; não inventamos formato
    itens,
    totalNotaCents: total,
    somaItensCents,
  };
}

/**
 * Ponto de entrada único para conteúdo colado: detecta XML fiscal vs HTML da
 * consulta pública e roteia para o parser adequado. Sem rede, sempre.
 */
export function parseNfceDocument(raw: string): NfceParseResult {
  const trimmed = raw.trimStart();
  const looksLikeXml =
    trimmed.startsWith('<?xml') || /<(nfeProc|NFe|infNFe)[\s>]/.test(trimmed.slice(0, 2000));
  return looksLikeXml ? parseNfceXml(raw) : parseNfceHtml(raw);
}
