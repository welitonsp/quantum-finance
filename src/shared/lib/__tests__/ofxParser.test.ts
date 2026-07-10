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

  // ─── branches adicionais ───────────────────────────────────────────────────

  it('usa "Transação OFX" como descrição quando MEMO e NAME estão ausentes', async () => {
    const file = makeOFXFile([
      stmtTrn({ DTPOSTED: '20260715', TRNAMT: '-50.00', FITID: 'FIT010' }),
    ]);
    const result = await parseOFX(file);
    expect(result[0]!.description).toBe('Transação OFX');
  });

  it('gera id automático quando FITID está ausente', async () => {
    const file = makeOFXFile([
      stmtTrn({ DTPOSTED: '20260715', TRNAMT: '-75.00', MEMO: 'Sem FITID' }),
    ]);
    const result = await parseOFX(file);
    expect(result).toHaveLength(1);
    // id gerado automaticamente (não contém fitId da transação)
    expect(result[0]!.fitId).toBeNull();
    expect(result[0]!.id).toContain('ofx:');
  });

  it('pula transação com TRNAMT = 0', async () => {
    const file = makeOFXFile([
      stmtTrn({ DTPOSTED: '20260715', TRNAMT: '0.00', FITID: 'FIT011', MEMO: 'Zero' }),
      stmtTrn({ DTPOSTED: '20260715', TRNAMT: '-10.00', FITID: 'FIT012', MEMO: 'Valida' }),
    ]);
    const result = await parseOFX(file);
    expect(result).toHaveLength(1);
    expect(result[0]!.description).toBe('Valida');
  });

  it('usa data de hoje como fallback quando DTPOSTED está ausente', async () => {
    const file = makeOFXFile([
      stmtTrn({ TRNAMT: '-20.00', FITID: 'FIT013', MEMO: 'Sem data' }),
    ]);
    const result = await parseOFX(file);
    expect(result).toHaveLength(1);
    // data deve ser YYYY-MM-DD (hoje ou formato válido)
    expect(result[0]!.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('pula transação com TRNAMT inválido (não numérico)', async () => {
    const file = makeOFXFile([
      stmtTrn({ DTPOSTED: '20260715', TRNAMT: 'abc', FITID: 'FIT014', MEMO: 'Invalido' }),
      stmtTrn({ DTPOSTED: '20260715', TRNAMT: '-5.00', FITID: 'FIT015', MEMO: 'Valida' }),
    ]);
    const result = await parseOFX(file);
    expect(result).toHaveLength(1);
    expect(result[0]!.description).toBe('Valida');
  });

  it('reconhece OFX que contém <OFX> mas não OFXHEADER', async () => {
    // Cobre o segundo ramo da validação de formato: !includes(OFXHEADER) && !includes(<OFX>)
    // Se incluir <OFX>, não lança erro
    const content = `<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS>
<STMTTRN>
<DTPOSTED>20260715
<TRNAMT>-50.00
<FITID>FITONLY
<MEMO>Sem header
</STMTTRN>
</STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
    const file = new File([content], 'noheader.ofx', { type: 'text/plain' });
    const result = await parseOFX(file);
    expect(result).toHaveLength(1);
    expect(result[0]!.description).toBe('Sem header');
  });

  it('parseOFXDate retorna null quando dígitos < 8 (data inválida curta)', async () => {
    // DTPOSTED "2026" → 4 dígitos < 8 → parseOFXDate retorna null → usa today fallback
    const file = makeOFXFile([
      stmtTrn({ DTPOSTED: '2026', TRNAMT: '-30.00', FITID: 'FIT020', MEMO: 'Data curta' }),
    ]);
    const result = await parseOFX(file);
    // Não deve lançar; usa data fallback de hoje
    expect(result).toHaveLength(1);
    expect(result[0]!.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
