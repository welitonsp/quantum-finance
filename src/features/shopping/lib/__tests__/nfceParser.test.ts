import { describe, expect, it } from 'vitest';
import {
  extractChaveAcesso,
  isValidChaveAcesso,
  NfceParseError,
  parseNfceXml,
} from '../nfceParser';

// Chave sintética com DV válido (últimos 8 antes do DV = cNF fake; UF 52 = GO).
const CHAVE_VALIDA = '52260711222333000181650010000001231123456780';
const CHAVE_DV_ERRADO = '52260711222333000181650010000001231123456781';

function buildXml({
  chave = CHAVE_VALIDA,
  mod = '65',
  itens = `
    <det nItem="1">
      <prod>
        <cProd>001</cProd>
        <cEAN>7891234567895</cEAN>
        <xProd>ARROZ TIPO 1 5KG</xProd>
        <uCom>UN</uCom>
        <qCom>2.0000</qCom>
        <vUnCom>21.4500000000</vUnCom>
        <vProd>42.90</vProd>
      </prod>
    </det>
    <det nItem="2">
      <prod>
        <cProd>002</cProd>
        <cEAN>SEM GTIN</cEAN>
        <xProd>TOMATE KG</xProd>
        <uCom>KG</uCom>
        <qCom>0.7480</qCom>
        <vUnCom>8.9900000000</vUnCom>
        <vProd>6.72</vProd>
        <vDesc>0.50</vDesc>
      </prod>
    </det>`,
  vNF = '49.62',
} = {}) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <NFe>
    <infNFe Id="NFe${chave}" versao="4.00">
      <ide>
        <cUF>52</cUF>
        <mod>${mod}</mod>
        <serie>1</serie>
        <nNF>123</nNF>
        <dhEmi>2026-07-04T10:30:00-03:00</dhEmi>
      </ide>
      <emit>
        <CNPJ>11222333000181</CNPJ>
        <xNome>SUPERMERCADO EXEMPLO LTDA</xNome>
      </emit>
      ${itens}
      <total>
        <ICMSTot>
          <vNF>${vNF}</vNF>
        </ICMSTot>
      </total>
    </infNFe>
  </NFe>
</nfeProc>`;
}

describe('isValidChaveAcesso', () => {
  it('aceita chave com DV correto', () => {
    expect(isValidChaveAcesso(CHAVE_VALIDA)).toBe(true);
  });

  it('rejeita DV errado, tamanho errado e não-dígitos', () => {
    expect(isValidChaveAcesso(CHAVE_DV_ERRADO)).toBe(false);
    expect(isValidChaveAcesso(CHAVE_VALIDA.slice(0, 43))).toBe(false);
    expect(isValidChaveAcesso(CHAVE_VALIDA + '0')).toBe(false);
    expect(isValidChaveAcesso('a'.repeat(44))).toBe(false);
    expect(isValidChaveAcesso('')).toBe(false);
  });
});

describe('extractChaveAcesso', () => {
  it('extrai chave válida de URL de QR Code', () => {
    const url = `https://nfe.sefaz.go.gov.br/nfeweb/sites/nfce/danfeNFCe?p=${CHAVE_VALIDA}|2|1|1|HASH`;
    expect(extractChaveAcesso(url)).toBe(CHAVE_VALIDA);
  });

  it('ignora sequências de 44 dígitos com DV inválido', () => {
    expect(extractChaveAcesso(`p=${CHAVE_DV_ERRADO}`)).toBeNull();
  });

  it('retorna null sem nenhuma sequência de 44 dígitos', () => {
    expect(extractChaveAcesso('texto qualquer 123')).toBeNull();
  });
});

describe('parseNfceXml', () => {
  it('extrai chave, emitente, itens e totais em centavos', () => {
    const result = parseNfceXml(buildXml());

    expect(result.chaveAcesso).toBe(CHAVE_VALIDA);
    expect(result.emitenteNome).toBe('SUPERMERCADO EXEMPLO LTDA');
    expect(result.emitenteCnpj).toBe('11222333000181');
    expect(result.emitidoEm).toBe('2026-07-04T10:30:00-03:00');
    expect(result.totalNotaCents).toBe(4962);

    expect(result.itens).toHaveLength(2);
    const [arroz, tomate] = result.itens as [
      (typeof result.itens)[number],
      (typeof result.itens)[number],
    ];

    expect(arroz.descricaoFiscal).toBe('ARROZ TIPO 1 5KG');
    expect(arroz.ean).toBe('7891234567895');
    expect(arroz.totalCents).toBe(4290);
    expect(arroz.descontoCents).toBe(0);
    expect(arroz.quantidadeStr).toBe('2.0000');
    expect(arroz.valorUnitarioStr).toBe('21.4500000000');

    expect(tomate.ean).toBeNull(); // "SEM GTIN" não é EAN
    expect(tomate.totalCents).toBe(672);
    expect(tomate.descontoCents).toBe(50);

    expect(result.somaItensCents).toBe(4290 + 672);
  });

  it('preserva a descrição fiscal original sem normalização', () => {
    const xml = buildXml({
      itens: `
        <det nItem="1">
          <prod>
            <cProd>X</cProd>
            <xProd>  REFRIG. COCA 2L c/ açúcar &amp; gás </xProd>
            <uCom>UN</uCom>
            <qCom>1.0000</qCom>
            <vUnCom>9.99</vUnCom>
            <vProd>9.99</vProd>
          </prod>
        </det>`,
      vNF: '9.99',
    });
    const result = parseNfceXml(xml);
    // trim das bordas (textContent), mas conteúdo interno intacto.
    expect(result.itens[0]?.descricaoFiscal).toBe('REFRIG. COCA 2L c/ açúcar & gás');
  });

  it('rejeita XML malformado', () => {
    expect(() => parseNfceXml('<nfe><aberto')).toThrowError(NfceParseError);
    try {
      parseNfceXml('<nfe><aberto');
    } catch (e) {
      expect((e as NfceParseError).code).toBe('xml_invalido');
    }
  });

  it('rejeita modelo 55 (NF-e comum, não NFC-e)', () => {
    try {
      parseNfceXml(buildXml({ mod: '55' }));
      expect.unreachable();
    } catch (e) {
      expect((e as NfceParseError).code).toBe('nao_e_nfce');
    }
  });

  it('rejeita chave com DV inválido', () => {
    try {
      parseNfceXml(buildXml({ chave: CHAVE_DV_ERRADO }));
      expect.unreachable();
    } catch (e) {
      expect((e as NfceParseError).code).toBe('chave_invalida');
    }
  });

  it('rejeita nota sem itens', () => {
    try {
      parseNfceXml(buildXml({ itens: '' }));
      expect.unreachable();
    } catch (e) {
      expect((e as NfceParseError).code).toBe('sem_itens');
    }
  });

  it('rejeita valor monetário com mais de 2 casas em vProd (fail-closed)', () => {
    const xml = buildXml({
      itens: `
        <det nItem="1">
          <prod>
            <cProd>X</cProd>
            <xProd>ITEM</xProd>
            <uCom>UN</uCom>
            <qCom>1.0000</qCom>
            <vUnCom>1.234</vUnCom>
            <vProd>1.234</vProd>
          </prod>
        </det>`,
      vNF: '1.23',
    });
    try {
      parseNfceXml(xml);
      expect.unreachable();
    } catch (e) {
      expect((e as NfceParseError).code).toBe('valor_monetario_invalido');
    }
  });

  it('NUNCA expõe dados do destinatário (CPF do comprador)', () => {
    const xml = buildXml().replace(
      '<emit>',
      '<dest><CPF>12345678901</CPF><xNome>COMPRADOR</xNome></dest><emit>',
    );
    const result = parseNfceXml(xml);
    expect(JSON.stringify(result)).not.toContain('12345678901');
    expect(JSON.stringify(result)).not.toContain('COMPRADOR');
  });
});
