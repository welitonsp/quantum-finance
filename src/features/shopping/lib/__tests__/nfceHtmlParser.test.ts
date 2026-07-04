import { describe, expect, it } from 'vitest';
import { brlToCents, parseNfceDocument, parseNfceHtml } from '../nfceHtmlParser';
import { NfceParseError } from '../nfceParser';

const CHAVE_VALIDA = '52260711222333000181650010000001231123456780';
const CHAVE_FORMATADA = CHAVE_VALIDA.match(/.{4}/g)!.join(' ');

function buildHtml({
  chave = CHAVE_FORMATADA,
  itens = `
    <tr>
      <td>
        <span class="txtTit">ARROZ TIPO 1 5KG</span>
        <span class="RCod">(Código: 001)</span>
        <span class="Rqtd"><strong>Qtde.:</strong>2</span>
        <span class="RUN"><strong>UN: </strong>UN</span>
        <span class="RvlUnit"><strong>Vl. Unit.:</strong>&nbsp;21,45</span>
      </td>
      <td class="txtTit noWrap"><span class="valor">42,90</span></td>
    </tr>
    <tr>
      <td>
        <span class="txtTit">TOMATE KG</span>
        <span class="RCod">(Código: 002)</span>
        <span class="Rqtd"><strong>Qtde.:</strong>0,748</span>
        <span class="RUN"><strong>UN: </strong>KG</span>
        <span class="RvlUnit"><strong>Vl. Unit.:</strong>&nbsp;8,99</span>
      </td>
      <td class="txtTit noWrap"><span class="valor">6,72</span></td>
    </tr>`,
  totais = `
    <div id="totalNota">
      <div id="linhaTotal"><label>Qtd. total de itens:</label><span class="totalNumb">2</span></div>
      <div id="linhaTotal"><label>Valor total R$:</label><span class="totalNumb">49,62</span></div>
      <div id="linhaTotal"><label>Valor a pagar R$:</label><span class="totalNumb txtMax">49,12</span></div>
    </div>`,
} = {}) {
  return `<!DOCTYPE html>
<html><body>
  <div id="conteudo">
    <div class="txtCenter">
      <div class="txtTopo">SUPERMERCADO EXEMPLO LTDA</div>
      <div class="text">CNPJ: 11.222.333/0001-81</div>
      <div class="text">AV EXEMPLO, 100, GOIANIA, GO</div>
    </div>
    <table id="tabResult">${itens}</table>
    ${totais}
    <div class="chave">${chave}</div>
  </div>
</body></html>`;
}

describe('brlToCents', () => {
  it('converte formatos BRL comuns', () => {
    expect(brlToCents('42,90', 'x')).toBe(4290);
    expect(brlToCents('1.234,56', 'x')).toBe(123456);
    expect(brlToCents('R$ 9,90', 'x')).toBe(990);
    expect(brlToCents(' 0,01 ', 'x')).toBe(1);
  });

  it('fail-closed em formato inválido', () => {
    expect(() => brlToCents('abc', 'x')).toThrowError(NfceParseError);
    expect(() => brlToCents('', 'x')).toThrowError(NfceParseError);
    expect(() => brlToCents('12,345', 'x')).toThrowError(NfceParseError);
  });
});

describe('parseNfceHtml', () => {
  it('extrai chave, emitente, itens e total do layout portal nacional', () => {
    const result = parseNfceHtml(buildHtml());

    expect(result.chaveAcesso).toBe(CHAVE_VALIDA);
    expect(result.emitenteNome).toBe('SUPERMERCADO EXEMPLO LTDA');
    expect(result.emitenteCnpj).toBe('11222333000181');
    expect(result.emitidoEm).toBeNull();
    // "Valor total" tem precedência sobre "Valor a pagar".
    expect(result.totalNotaCents).toBe(4962);

    expect(result.itens).toHaveLength(2);
    const [arroz, tomate] = result.itens as [
      (typeof result.itens)[number],
      (typeof result.itens)[number],
    ];
    expect(arroz.descricaoFiscal).toBe('ARROZ TIPO 1 5KG');
    expect(arroz.codigo).toBe('001');
    expect(arroz.unidade).toBe('UN');
    expect(arroz.quantidadeStr).toBe('2');
    expect(arroz.valorUnitarioStr).toBe('21,45');
    expect(arroz.totalCents).toBe(4290);
    expect(arroz.ean).toBeNull();

    expect(tomate.quantidadeStr).toBe('0,748');
    expect(tomate.totalCents).toBe(672);
    expect(result.somaItensCents).toBe(4290 + 672);
  });

  it('usa "Valor a pagar" como fallback quando não há "Valor total"', () => {
    const html = buildHtml({
      totais: `
        <div id="totalNota">
          <div id="linhaTotal"><label>Valor a pagar R$:</label><span class="totalNumb">49,12</span></div>
        </div>`,
    });
    expect(parseNfceHtml(html).totalNotaCents).toBe(4912);
  });

  it('rejeita HTML sem chave de acesso válida', () => {
    try {
      parseNfceHtml(buildHtml({ chave: '1111 2222 3333' }));
      expect.unreachable();
    } catch (e) {
      expect((e as NfceParseError).code).toBe('chave_ausente');
    }
  });

  it('rejeita HTML sem itens', () => {
    try {
      parseNfceHtml(buildHtml({ itens: '' }));
      expect.unreachable();
    } catch (e) {
      expect((e as NfceParseError).code).toBe('sem_itens');
    }
  });

  it('rejeita HTML de layout desconhecido (nunca inventa dados)', () => {
    expect(() => parseNfceHtml('<html><body><p>página qualquer</p></body></html>'))
      .toThrowError(NfceParseError);
  });

  it('NÃO extrai dados do consumidor presentes na página', () => {
    const html = buildHtml().replace(
      '<div class="chave">',
      '<div id="respostas"><strong>Consumidor</strong> CPF: 123.456.789-01 NOME DO COMPRADOR</div><div class="chave">',
    );
    const result = parseNfceHtml(html);
    const json = JSON.stringify(result);
    expect(json).not.toContain('12345678901');
    expect(json).not.toContain('NOME DO COMPRADOR');
  });
});

describe('parseNfceDocument (roteador colado)', () => {
  it('roteia HTML para o parser de HTML', () => {
    expect(parseNfceDocument(buildHtml()).chaveAcesso).toBe(CHAVE_VALIDA);
  });

  it('roteia XML para o parser de XML', () => {
    const xml = `<?xml version="1.0"?>
<nfeProc><NFe><infNFe Id="NFe${CHAVE_VALIDA}" versao="4.00">
  <ide><mod>65</mod><dhEmi>2026-07-04T10:30:00-03:00</dhEmi></ide>
  <emit><CNPJ>11222333000181</CNPJ><xNome>LOJA XML</xNome></emit>
  <det nItem="1"><prod><cProd>1</cProd><xProd>ITEM</xProd><uCom>UN</uCom>
    <qCom>1.0000</qCom><vUnCom>9.99</vUnCom><vProd>9.99</vProd></prod></det>
  <total><ICMSTot><vNF>9.99</vNF></ICMSTot></total>
</infNFe></NFe></nfeProc>`;
    const result = parseNfceDocument(xml);
    expect(result.emitenteNome).toBe('LOJA XML');
    expect(result.emitidoEm).toBe('2026-07-04T10:30:00-03:00');
  });
});
