import { describe, it, expect } from 'vitest';
import { getCSVHeaders, parseCSVWithMapping, parseCSV, type CSVParseError } from '../csvParser';

function csvFile(content: string, name = 'test.csv'): File {
  return new File([content], name, { type: 'text/plain' });
}

// ─── detectSeparator — via getCSVHeaders ──────────────────────────────────────

describe('detectSeparator', () => {
  it('detecta separador pipe (|) quando pipes > vírgulas e > ponto-e-vírgulas', async () => {
    const f = csvFile('data|descricao|valor\n2026-07-01|Compra|10.00');
    const { separator } = await getCSVHeaders(f);
    expect(separator).toBe('|');
  });

  it('detecta ponto-e-vírgula (;) quando ; > ,', async () => {
    const f = csvFile('data;descricao;valor\n2026-07-01;Compra;10,00');
    const { separator } = await getCSVHeaders(f);
    expect(separator).toBe(';');
  });

  it('usa vírgula (,) como fallback padrão', async () => {
    const f = csvFile('data,descricao,valor\n2026-07-01,Compra,10.00');
    const { separator } = await getCSVHeaders(f);
    expect(separator).toBe(',');
  });
});

// ─── validateDate — formatos suportados ──────────────────────────────────────

describe('validateDate — formatos via parseCSVWithMapping', () => {
  const mapping = { dateIdx: 0, descIdx: 1, valueIdx: 2 };

  it('aceita formato YYYY-MM-DD', async () => {
    const result = await parseCSVWithMapping(csvFile('data,desc,valor\n2026-07-01,Compra,10.00'), mapping);
    expect(result[0]!.date).toBe('2026-07-01');
  });

  it('rejeita YYYY-MM-DD com mês inválido (2026-13-01)', async () => {
    await expect(parseCSVWithMapping(csvFile('data,desc,valor\n2026-13-01,Compra,10.00'), mapping))
      .rejects.toThrow('Nenhuma transação válida');
  });

  it('aceita formato YYYYMMDD de 8 dígitos', async () => {
    const result = await parseCSVWithMapping(csvFile('data,desc,valor\n20260701,Compra,10.00'), mapping);
    expect(result[0]!.date).toBe('2026-07-01');
  });

  it('rejeita YYYYMMDD com mês inválido (20261301)', async () => {
    await expect(parseCSVWithMapping(csvFile('data,desc,valor\n20261301,Compra,10.00'), mapping))
      .rejects.toThrow('Nenhuma transação válida');
  });

  it('aceita formato pt-BR dd/mm/yyyy', async () => {
    const result = await parseCSVWithMapping(csvFile('data,desc,valor\n01/07/2026,Compra,10.00'), mapping);
    expect(result[0]!.date).toBe('2026-07-01');
  });

  it('aceita formato altISO YYYY/MM/DD', async () => {
    const result = await parseCSVWithMapping(csvFile('data,desc,valor\n2026/07/01,Compra,10.00'), mapping);
    expect(result[0]!.date).toBe('2026-07-01');
  });

  it('rejeita data não reconhecida → linha ignorada', async () => {
    await expect(parseCSVWithMapping(csvFile('data,desc,valor\njan-2026,Compra,10.00'), mapping))
      .rejects.toThrow('Nenhuma transação válida');
  });

  it('campo data ausente (line mais curta que o mapeamento) → linha ignorada', async () => {
    // fields[0] é undefined quando a linha tem menos colunas
    await expect(parseCSVWithMapping(csvFile('data,desc,valor\n,Compra,10.00'), mapping))
      .rejects.toThrow('Nenhuma transação válida');
  });
});

// ─── parseCSVWithMapping — branches de valor e mapeamento ────────────────────

describe('parseCSVWithMapping', () => {
  const mapping = { dateIdx: 0, descIdx: 1, valueIdx: 2 };

  it('lança quando mapeamento incompleto (dateIdx = -1)', async () => {
    await expect(
      parseCSVWithMapping(csvFile('a,b,c\n2026-07-01,Compra,10.00'), { dateIdx: -1, descIdx: 1, valueIdx: 2 }),
    ).rejects.toThrow('Mapeamento de colunas incompleto');
  });

  it('lança quando CSV tem menos de 2 linhas (só header)', async () => {
    await expect(
      parseCSVWithMapping(csvFile('data,desc,valor'), mapping),
    ).rejects.toThrow('O CSV está vazio');
  });

  it('usa integerMinorUnits quando valueIntegerMinorUnits=true no mapping', async () => {
    // "1200" com integerMinorUnits=true → 1200 centavos (R$12,00)
    const result = await parseCSVWithMapping(
      csvFile('data,desc,valor\n2026-07-01,Compra,1200'),
      { dateIdx: 0, descIdx: 1, valueIdx: 2, valueIntegerMinorUnits: true },
    );
    expect(result[0]!.value_cents).toBe(1200);
  });

  it('detecta integerMinorUnits via nome do header (isCentsHeader — exact match)', async () => {
    // header normalizado 'centavos' → isCentsHeader=true → "500" = 500 centavos
    const result = await parseCSVWithMapping(
      csvFile('data,desc,centavos\n2026-07-01,Compra,500'),
      mapping,
    );
    expect(result[0]!.value_cents).toBe(500);
  });

  it('detecta integerMinorUnits via header com sufixo (endsWith match)', async () => {
    // header 'valorcentavos' → endsWith 'valorcentavos' → isCentsHeader=true
    const result = await parseCSVWithMapping(
      csvFile('data,desc,valorcentavos\n2026-07-01,Compra,200'),
      mapping,
    );
    expect(result[0]!.value_cents).toBe(200);
  });

  it('pula linha com valor inválido e inclui detalhe de erro na exceção', async () => {
    const f = csvFile('data,desc,valor\n2026-07-01,Compra,abc');
    await expect(parseCSVWithMapping(f, mapping)).rejects.toThrow('Nenhuma transação válida');
    try {
      await parseCSVWithMapping(f, mapping);
    } catch (e: unknown) {
      expect((e as Error).message).toContain('Problemas detectados');
    }
  });

  it('pula linha silenciosamente quando amount = 0 (não adiciona ao errors)', async () => {
    const f = csvFile('data,desc,valor\n2026-07-01,Compra,0.00\n2026-07-02,Café,5.00');
    const result = await parseCSVWithMapping(f, mapping);
    expect(result).toHaveLength(1);
    expect(result[0]!.date).toBe('2026-07-02');
  });

  it('valor positivo → type=entrada', async () => {
    const result = await parseCSVWithMapping(csvFile('data,desc,valor\n2026-07-01,Salário,1000.00'), mapping);
    expect(result[0]!.type).toBe('entrada');
  });

  it('valor negativo → type=saida com value_cents positivo (abs)', async () => {
    const result = await parseCSVWithMapping(csvFile('data,desc,valor\n2026-07-01,Compra,-50.00'), mapping);
    expect(result[0]!.type).toBe('saida');
    expect(result[0]!.value_cents).toBe(5000);
  });

  it('campo valor vazio (string vazia após trim) → linha ignorada', async () => {
    // fields[2] = '' → parseAmountCents retorna null (branch !s)
    await expect(
      parseCSVWithMapping(csvFile('data,desc,valor\n2026-07-01,Compra,'), mapping),
    ).rejects.toThrow('Nenhuma transação válida');
  });

  it('desc vazia → fallback para "Linha N"', async () => {
    const result = await parseCSVWithMapping(csvFile('data,desc,valor\n2026-07-01,,10.00'), mapping);
    expect(result[0]!.description).toBe('Linha 2');
  });
});

// ─── parseCSV — autodetecção e erros estruturais ─────────────────────────────

describe('parseCSV', () => {
  it('lança quando CSV tem menos de 2 linhas', async () => {
    await expect(parseCSV(csvFile('data,desc,valor'))).rejects.toThrow('O CSV está vazio');
  });

  it('lança CSVParseError com code=COLUMNS_NOT_FOUND e campos auxiliares', async () => {
    // headers não reconhecidos → nenhuma coluna é identificada automaticamente
    const f = csvFile('col1,col2,col3\n2026-07-01,Compra,10.00');
    let caughtError: CSVParseError | null = null;
    try {
      await parseCSV(f);
    } catch (e) {
      caughtError = e as CSVParseError;
    }
    expect(caughtError).not.toBeNull();
    expect(caughtError!.code).toBe('COLUMNS_NOT_FOUND');
    expect(Array.isArray(caughtError!.headers)).toBe(true);
    expect(typeof caughtError!.separator).toBe('string');
    expect(caughtError!.autoMap).toBeDefined();
    expect(caughtError!.autoMap!.dateIdx).toBe(-1);
  });

  it('autodetecta colunas data/descricao/valor e retorna transações', async () => {
    const f = csvFile('data,descricao,valor\n2026-07-01,Supermercado,75.50\n2026-07-02,Farmácia,-20.00');
    const result = await parseCSV(f);
    expect(result).toHaveLength(2);
    expect(result[0]!.date).toBe('2026-07-01');
    expect(result[0]!.type).toBe('entrada');
    expect(result[1]!.type).toBe('saida');
  });

  it('autodetecta separador pipe junto com colunas', async () => {
    const f = csvFile('data|descricao|valor\n2026-07-01|Aluguel|-1500.00');
    const result = await parseCSV(f);
    expect(result).toHaveLength(1);
    expect(result[0]!.type).toBe('saida');
    expect(result[0]!.value_cents).toBe(150000);
  });
});
