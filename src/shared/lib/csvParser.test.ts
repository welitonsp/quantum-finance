import { describe, expect, it } from 'vitest';
import { parseCSV, parseCSVWithMapping } from './csvParser';

function csvFile(content: string): File {
  return new File([content], 'extrato.csv', { type: 'text/csv' });
}

describe('csvParser - parsing monetário brasileiro', () => {
  it('gera value_cents para formatos 1.234,56, 1234,56 e 1234.56', async () => {
    const file = csvFile([
      'data;descricao;valor',
      '01/04/2026;Mercado;1.234,56',
      '02/04/2026;Pix recebido;1234,56',
      '2026-04-03;Compra online;1234.56',
    ].join('\n'));

    const transactions = await parseCSV(file);

    expect(transactions).toHaveLength(3);
    expect(transactions.map(tx => tx.value_cents)).toEqual([123456, 123456, 123456]);
    expect(transactions.map(tx => tx.schemaVersion)).toEqual([2, 2, 2]);
  });

  it('normaliza sinal, ignora valor zero e cria ids determinísticos de preview', async () => {
    const file = csvFile([
      'date,description,amount',
      '2026-04-01,Cafe,-12.34',
      '2026-04-02,Zero,0.00',
    ].join('\n'));

    const transactions = await parseCSV(file);

    expect(transactions).toHaveLength(1);
    expect(transactions[0]).toEqual(expect.objectContaining({
      id: 'csv:1:2026-04-01:1234:Cafe',
      value_cents: 1234,
      type: 'saida',
      source: 'csv',
    }));
  });

  it('rejeita datas inválidas no mapeamento manual', async () => {
    const file = csvFile([
      'valor;descricao;data',
      '10,00;Compra;31/02/2026',
    ].join('\n'));

    await expect(parseCSVWithMapping(file, { valueIdx: 0, descIdx: 1, dateIdx: 2 }))
      .rejects.toThrow('Nenhuma transação válida');
  });

  describe('critério de aceite: "12,00" → value_cents = 1200', () => {
    it('"12,00" em coluna "valor" resulta em 1200 centavos (R$ 12,00)', async () => {
      const file = csvFile([
        'data;descricao;valor',
        '01/04/2026;Cafe;12,00',
      ].join('\n'));

      const transactions = await parseCSV(file);

      expect(transactions).toHaveLength(1);
      expect(transactions[0]!.value_cents).toBe(1200);
    });

    it('"1.200,00" em coluna "valor" resulta em 120000 centavos (R$ 1.200,00)', async () => {
      const file = csvFile([
        'data;descricao;valor',
        '01/04/2026;Salario;1.200,00',
      ].join('\n'));

      const transactions = await parseCSV(file);

      expect(transactions).toHaveLength(1);
      expect(transactions[0]!.value_cents).toBe(120000);
    });
  });

  describe('heurística de header de centavos', () => {
    it('coluna "valor_centavos" com "1200" resulta em 1200 centavos (R$ 12,00)', async () => {
      const file = csvFile([
        'data;descricao;valor_centavos',
        '01/04/2026;Cafe;1200',
      ].join('\n'));

      const transactions = await parseCSV(file);

      expect(transactions).toHaveLength(1);
      expect(transactions[0]!.value_cents).toBe(1200);
    });

    it('coluna "valor" comum com "1200" resulta em 120000 centavos (R$ 1.200,00)', async () => {
      const file = csvFile([
        'data;descricao;valor',
        '01/04/2026;Transferencia;1200',
      ].join('\n'));

      const transactions = await parseCSV(file);

      expect(transactions).toHaveLength(1);
      expect(transactions[0]!.value_cents).toBe(120000);
    });

    it('mapeamento manual com valueIntegerMinorUnits=true força interpretação em centavos', async () => {
      const file = csvFile([
        'date;description;amount',
        '2026-04-01;Pagamento;1200',
      ].join('\n'));

      const transactions = await parseCSVWithMapping(file, {
        dateIdx: 0,
        descIdx: 1,
        valueIdx: 2,
        valueIntegerMinorUnits: true,
      });

      expect(transactions).toHaveLength(1);
      expect(transactions[0]!.value_cents).toBe(1200);
    });
  });
});
