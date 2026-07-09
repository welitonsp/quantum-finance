import { describe, it, expect } from 'vitest';
import { parseOFX } from '../ofxParser';

/** Monta um arquivo OFX mínimo contendo os blocos STMTTRN fornecidos. */
function makeOFXFile(stmtTrnBlocks: string[]): File {
  const body = stmtTrnBlocks.join('\n');
  const content = `OFXHEADER:100\n<OFX>\n<BANKMSGSRSV1><STMTTRNRS><STMTRS>\n${body}\n</STMTRS></STMTTRNRS></BANKMSGSRSV1>\n</OFX>`;
  return new File([content], 'test.ofx', { type: 'text/plain' });
}

/** Monta um bloco <STMTTRN>…</STMTTRN> com os campos fornecidos. */
function stmtTrn(fields: Record<string, string>): string {
  const inner = Object.entries(fields)
    .map(([k, v]) => `<${k}>${v}`)
    .join('\n');
  return `<STMTTRN>\n${inner}\n</STMTTRN>`;
}

describe('parseOFX', () => {
  it('parseia transação de DÉBITO (TRNAMT negativo) como saida com value_cents positivo', async () => {
    const file = makeOFXFile([
      stmtTrn({ TRNTYPE: 'DEBIT', DTPOSTED: '20260715000000', TRNAMT: '-150.00', FITID: 'FIT001', MEMO: 'Netflix' }),
    ]);
    const result = await parseOFX(file);
    expect(result).toHaveLength(1);
    expect(result[0]!.type).toBe('saida');
    expect(result[0]!.value_cents).toBe(15000);
    expect(result[0]!.description).toBe('Netflix');
    expect(result[0]!.date).toBe('2026-07-15');
  });

  it('parseia transação de CRÉDITO (TRNAMT positivo) como entrada', async () => {
    const file = makeOFXFile([
      stmtTrn({ TRNTYPE: 'CREDIT', DTPOSTED: '20260715', TRNAMT: '200.00', FITID: 'FIT002', MEMO: 'Salário' }),
    ]);
    const result = await parseOFX(file);
    expect(result).toHaveLength(1);
    expect(result[0]!.type).toBe('entrada');
    expect(result[0]!.value_cents).toBe(20000);
  });

  it('converte data OFX formato YYYYMMDD para YYYY-MM-DD', async () => {
    const file = makeOFXFile([
      stmtTrn({ DTPOSTED: '20260101', TRNAMT: '-50.00', FITID: 'FIT003' }),
    ]);
    const result = await parseOFX(file);
    expect(result[0]!.date).toBe('2026-01-01');
  });

  it('usa NAME como descrição quando MEMO está ausente', async () => {
    const file = makeOFXFile([
      stmtTrn({ DTPOSTED: '20260715', TRNAMT: '-30.00', FITID: 'FIT004', NAME: 'Amazon Prime' }),
    ]);
    const result = await parseOFX(file);
    expect(result[0]!.description).toBe('Amazon Prime');
  });

  it('OFX sem blocos STMTTRN retorna array vazio', async () => {
    const content = `OFXHEADER:100\n<OFX>\n<BANKMSGSRSV1><STMTTRNRS><STMTRS></STMTRS></STMTTRNRS></BANKMSGSRSV1>\n</OFX>`;
    const file = new File([content], 'empty.ofx', { type: 'text/plain' });
    const result = await parseOFX(file);
    expect(result).toHaveLength(0);
  });

  it('deduplica transações com mesmo FITID', async () => {
    const block = stmtTrn({ DTPOSTED: '20260715', TRNAMT: '-50.00', FITID: 'SAME_ID', MEMO: 'Duplicada' });
    const file = makeOFXFile([block, block]);
    const result = await parseOFX(file);
    expect(result).toHaveLength(1);
  });

  it('lança erro para conteúdo que não é OFX', async () => {
    const file = new File(['isso nao e ofx'], 'invalid.txt', { type: 'text/plain' });
    await expect(parseOFX(file)).rejects.toThrow();
  });

  it('parseia múltiplas transações preservando a ordem', async () => {
    const file = makeOFXFile([
      stmtTrn({ DTPOSTED: '20260701', TRNAMT: '-100.00', FITID: 'A', MEMO: 'Primeira' }),
      stmtTrn({ DTPOSTED: '20260702', TRNAMT: '-200.00', FITID: 'B', MEMO: 'Segunda' }),
    ]);
    const result = await parseOFX(file);
    expect(result).toHaveLength(2);
    expect(result[0]!.description).toBe('Primeira');
    expect(result[1]!.description).toBe('Segunda');
  });
});
