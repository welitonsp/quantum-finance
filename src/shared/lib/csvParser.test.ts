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
});
