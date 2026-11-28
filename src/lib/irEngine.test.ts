import { describe, it, expect } from 'vitest';
import { gerarInformeIR, anosDisponiveis, exportarInformeCSV, csvText, vencimentoDarf } from './irEngine';
import type { Transaction } from '../shared/types/transaction';
import type { Centavos } from '../shared/types/money';

const c = (n: number) => n as Centavos;

function makeTx(overrides: Partial<Transaction> & { value_cents: Centavos }): Transaction {
  return {
    id: crypto.randomUUID(),
    description: 'Test',
    type: 'entrada',
    category: 'Salário',
    date: '2024-06-01',
    isDeleted: false,
    ...overrides,
  } as Transaction;
}

const compra = (date: string, cents: number, tags: string[], description = 'PETR4') =>
  makeTx({ type: 'saida', category: 'Investimento', description, date, value_cents: c(cents), tags: ['compra-ativo', ...tags] });
const venda = (date: string, cents: number, tags: string[], description = 'PETR4') =>
  makeTx({ type: 'entrada', category: 'Investimento', description, date, value_cents: c(cents), tags: ['venda-ativo', ...tags] });

describe('anosDisponiveis', () => {
  it('anos distintos em ordem decrescente, sem excluídas', () => {
    const txs = [
      makeTx({ date: '2022-01-01', value_cents: c(100) }),
      makeTx({ date: '2024-01-01', value_cents: c(100) }),
      makeTx({ date: '2023-01-01', value_cents: c(100), isDeleted: true }),
      makeTx({ date: '2024-05-01', value_cents: c(100) }),
    ];
    expect(anosDisponiveis(txs)).toEqual([2024, 2022]);
    expect(anosDisponiveis([])).toEqual([]);
  });
});

describe('gerarInformeIR — rendimentos', () => {
  it('salário e freelance são tributáveis', () => {
    const informe = gerarInformeIR([
      makeTx({ value_cents: c(500000) }),
      makeTx({ value_cents: c(500000) }),
      makeTx({ category: 'Freelance', value_cents: c(200000) }),
    ], 2024);
    expect(informe.rendimentos.find(r => r.category === 'salario')?.transactionCount).toBe(2);
    expect(informe.totalTributavelCents).toBe(1200000);
  });

  it('investimento e 13º vão para tributação exclusiva, não para o tributável', () => {
    const informe = gerarInformeIR([
      makeTx({ category: 'Investimento', value_cents: c(50000) }),
      makeTx({ category: 'Salário', value_cents: c(300000), tags: ['13o'] }),
    ], 2024);
    expect(informe.totalExclusivaCents).toBe(350000);
    expect(informe.totalTributavelCents).toBe(0);
  });

  it('reembolso, estorno, presente e tag isento são isentos', () => {
    const informe = gerarInformeIR([
      makeTx({ category: 'Reembolso', value_cents: c(10000) }),
      makeTx({ category: 'Estorno', value_cents: c(2000) }),
      makeTx({ category: 'Presente', value_cents: c(30000) }),
      makeTx({ category: 'Outros', value_cents: c(5000), tags: ['isento'] }),
    ], 2024);
    expect(informe.totalIsentoCents).toBe(47000);
    expect(informe.totalTributavelCents).toBe(0);
  });

  it('categoria desconhecida segue como outros tributáveis; saída, excluída e outro ano ficam fora', () => {
    const informe = gerarInformeIR([
      makeTx({ category: 'Aluguel recebido', value_cents: c(80000) }),
      makeTx({ type: 'saida', value_cents: c(999) }),
      makeTx({ value_cents: c(999), isDeleted: true }),
      makeTx({ value_cents: c(999), date: '2023-12-31' }),
    ], 2024);
    expect(informe.totalTributavelCents).toBe(80000);
    expect(informe.rendimentos).toHaveLength(1);
  });
});

describe('gerarInformeIR — ganho de capital', () => {
  it('usa o custo de compras de anos anteriores', () => {
    // comprou por 10.000 em 2025, vendeu por 40.000 em 2026 (outros bens, acima de R$ 35 mil)
    const informe = gerarInformeIR([
      compra('2025-03-10', 1_000_000, []),
      venda('2026-02-10', 4_000_000, []),
    ], 2026);
    const g = informe.ganhoCapital[0]!;
    expect(g.costCents).toBe(1_000_000);
    expect(g.gainCents).toBe(3_000_000);
    expect(g.irDevidoCents).toBe(450_000); // 15% de 30.000
    expect(informe.darfs).toEqual([{ competencia: '2026-02', codigo: '4600', valorCents: c(450_000), vencimento: '2026-03-31' }]);
  });

  it('ações com vendas de até R$ 20 mil no mês são isentas', () => {
    const informe = gerarInformeIR([
      compra('2025-01-10', 1_000_000, ['acao']),
      venda('2026-03-10', 1_200_000, ['acao']),
    ], 2026);
    const g = informe.ganhoCapital[0]!;
    expect(g.gainCents).toBe(200_000);
    expect(g.isento).toBe(true);
    expect(informe.totalIRDevidoCents).toBe(0);
    expect(informe.darfs).toHaveLength(0);
  });

  it('venda parcial com quantidade usa o preço médio', () => {
    const informe = gerarInformeIR([
      compra('2026-01-05', 1_000_000, ['acao', 'qtd:100']),  // R$ 100 cada
      compra('2026-01-20', 2_000_000, ['acao', 'qtd:100']),  // R$ 200 cada → médio R$ 150
      venda('2026-02-10', 2_500_000, ['acao', 'qtd:100']),   // vende metade por R$ 25.000
    ], 2026);
    const g = informe.ganhoCapital[0]!;
    expect(g.costCents).toBe(1_500_000);
    expect(g.gainCents).toBe(1_000_000);
    expect(g.isento).toBe(false);            // vendas acima de R$ 20 mil
    expect(g.irDevidoCents).toBe(150_000);   // 15%
    expect(informe.darfs[0]).toMatchObject({ codigo: '6015', valorCents: 150_000 });
  });

  it('prejuízo em ações é compensado no mês seguinte', () => {
    const informe = gerarInformeIR([
      compra('2026-01-02', 3_000_000, ['acao', 'ativo:vale3'], 'Compra VALE3'),
      venda('2026-01-20', 2_500_000, ['acao', 'ativo:vale3'], 'Venda VALE3'),   // −5.000
      compra('2026-02-02', 2_000_000, ['acao', 'ativo:itub4'], 'Compra ITUB4'),
      venda('2026-02-20', 3_000_000, ['acao', 'ativo:itub4'], 'Venda ITUB4'),   // +10.000
    ], 2026);
    // (10.000 − 5.000) × 15% = 750
    expect(informe.totalIRDevidoCents).toBe(75_000);
    expect(informe.ganhoCapital.map(g => g.assetDescription)).toEqual(['vale3', 'itub4']);
  });

  it('day trade paga 20% sem isenção', () => {
    const informe = gerarInformeIR([
      compra('2026-04-02', 100_000, ['day-trade']),
      venda('2026-04-02', 150_000, ['day-trade']),
    ], 2026);
    expect(informe.ganhoCapital[0]!.irDevidoCents).toBe(10_000);
    expect(informe.darfs[0]).toMatchObject({ codigo: '6015', valorCents: 10_000, vencimento: '2026-05-29' });
  });

  it('DARF abaixo de R$ 10 passa para o mês seguinte', () => {
    const informe = gerarInformeIR([
      compra('2026-04-02', 10_000, ['day-trade']),
      venda('2026-04-02', 12_000, ['day-trade']),   // IR 400
      compra('2026-05-04', 10_000, ['day-trade']),
      venda('2026-05-04', 14_000, ['day-trade']),   // IR 800 + 400 pendente
    ], 2026);
    expect(informe.darfs).toEqual([{ competencia: '2026-05', codigo: '6015', valorCents: c(1_200), vencimento: '2026-06-30' }]);
  });

  it('outros bens até R$ 35 mil de vendas no mês são isentos', () => {
    const informe = gerarInformeIR([
      compra('2025-01-01', 1_000_000, [], 'Carro'),
      venda('2026-06-01', 3_000_000, [], 'Carro'),
    ], 2026);
    expect(informe.ganhoCapital[0]!.isento).toBe(true);
    expect(informe.totalIRDevidoCents).toBe(0);
  });

  it('prejuízo em outros bens não gera imposto', () => {
    const informe = gerarInformeIR([
      compra('2025-01-01', 5_000_000, [], 'Lote'),
      venda('2026-06-01', 4_000_000, [], 'Lote'),
    ], 2026);
    expect(informe.ganhoCapital[0]!.gainCents).toBe(-1_000_000);
    expect(informe.totalIRDevidoCents).toBe(0);
  });

  it('alíquota progressiva acima de R$ 5 milhões de ganho', () => {
    const informe = gerarInformeIR([
      compra('2025-01-01', 100_000_000, [], 'Imóvel'),
      venda('2026-06-01', 700_000_000, [], 'Imóvel'),  // ganho de R$ 6 mi
    ], 2026);
    // 15% de 5 mi + 17,5% de 1 mi = 750.000 + 175.000
    expect(informe.ganhoCapital[0]!.irDevidoCents).toBe(92_500_000);
  });

  it('venda sem compra registrada usa custo zero e só mostra o ano pedido', () => {
    const informe = gerarInformeIR([venda('2026-06-01', 4_000_000, [], 'Ouro')], 2025);
    expect(informe.ganhoCapital).toHaveLength(0);
    const em2026 = gerarInformeIR([venda('2026-06-01', 4_000_000, [], 'Ouro')], 2026);
    expect(em2026.ganhoCapital[0]!.costCents).toBe(0);
  });
});

describe('vencimentoDarf', () => {
  it('último dia útil do mês seguinte', () => {
    expect(vencimentoDarf('2026-01')).toBe('2026-02-27'); // 28/02/2026 é sábado
    expect(vencimentoDarf('2026-12')).toBe('2027-01-29'); // 31/01/2027 é domingo
  });
});

describe('exportarInformeCSV', () => {
  it('usa vírgula decimal, inclui ganhos e DARFs', () => {
    const informe = gerarInformeIR([
      makeTx({ value_cents: c(123456) }),
      compra('2025-03-10', 1_000_000, []),
      venda('2024-02-10', 4_000_000, [], 'ativo a'),
    ], 2024);
    const csv = exportarInformeCSV(informe);
    expect(csv).toContain('2024');
    expect(csv).toContain('"1234,56"');
    expect(csv).toContain('Ganhos de Capital');
    expect(csv).toContain('DARFs');
    expect(csv).not.toMatch(/\d\.\d{2}"/);
  });

  it('sem ganhos não tem a seção', () => {
    const csv = exportarInformeCSV(gerarInformeIR([makeTx({ value_cents: c(100) })], 2024));
    expect(csv).not.toContain('Ganhos de Capital');
  });
});

describe('csvText', () => {
  it('dobra aspas e neutraliza fórmula', () => {
    expect(csvText('Ação "X"')).toBe('"Ação ""X"""');
    expect(csvText('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
    expect(csvText('-10')).toBe('"\'-10"');
  });
});
