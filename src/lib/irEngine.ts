/**
 * Motor de apuração de IR — puro, sem I/O, sem float.
 *
 * ESTIMATIVA: ajuda a organizar a declaração e a conferir DARFs; não substitui
 * contador nem o programa da Receita.
 *
 * Rendimentos (ano-calendário):
 * - Salário e Freelance → tributáveis; Investimento e 13º → tributação exclusiva;
 *   reembolso, estorno, presente, doação, herança, indenização, FGTS, poupança,
 *   dividendos, LCI/LCA (categoria ou tag `isento`) → isentos.
 *
 * Ganho de capital (tags nas transações):
 * - `compra-ativo` / `venda-ativo` marcam as operações. O ativo é a tag
 *   `ativo:NOME` ou, sem ela, a descrição.
 * - `qtd:N` (aceita vírgula) informa a quantidade; com quantidade na compra e na
 *   venda, o custo vendido é o preço médio × quantidade. Sem quantidade, a venda
 *   liquida a posição inteira (custo = todo o custo acumulado).
 * - O custo acumulado usa compras de QUALQUER ano (preço médio histórico).
 * - Classe: `acao` (ações à vista), `day-trade`, `fii`, `cripto`; sem tag → outros bens.
 * - Apuração MENSAL:
 *   • ações à vista: isento se as vendas de ações no mês somarem até R$ 20.000;
 *     senão 15% sobre o ganho líquido do mês, compensando prejuízo anterior;
 *   • day trade: 20%, sem isenção, prejuízo compensado só com day trade;
 *   • FII: 20%, sem isenção, prejuízo compensado só com FII;
 *   • outros bens e cripto: isento se as vendas da classe no mês somarem até
 *     R$ 35.000; senão alíquota progressiva por ganho (15% até R$ 5 mi; 17,5% até
 *     R$ 10 mi; 20% até R$ 30 mi; 22,5% acima); sem compensação de prejuízo.
 * - DARF: código 6015 (bolsa) e 4600 (ganho de capital), vencimento no último dia
 *   útil do mês seguinte (feriados não considerados). Abaixo de R$ 10,00 o valor
 *   passa para o mês seguinte.
 */

import Decimal from 'decimal.js';
import type { Transaction } from '../shared/types/transaction';
import type { Centavos } from '../shared/types/money';
import { addCentavos, fromCentavos, toCentavos } from '../shared/types/money';

// ──────────────────────────────────────────────
// Tipos públicos
// ──────────────────────────────────────────────

export type IRCategory =
  | 'salario'
  | 'freelance'
  | 'exclusiva'
  | 'outros_tributaveis'
  | 'isento';

export type IRAssetClass = 'acao' | 'day-trade' | 'fii' | 'cripto' | 'outros';

export interface IRRendimento {
  category: IRCategory;
  label: string;
  totalCents: Centavos;
  transactionCount: number;
}

/** Resultado de um ativo num mês de apuração. */
export interface IRGanhoCapital {
  /** Mês da apuração (YYYY-MM). */
  competencia: string;
  assetDescription: string;
  assetClass: IRAssetClass;
  costCents: Centavos;      // custo médio do que foi vendido
  revenueCents: Centavos;   // valor de venda
  gainCents: Centavos;      // ganho líquido (negativo = prejuízo)
  /** Alíquota aplicada nesta linha (0 quando isento ou sem ganho). */
  aliquota: number;
  /** Parte desta linha no imposto do mês. */
  irDevidoCents: Centavos;
  /** Ganho isento pelo limite mensal de vendas. */
  isento: boolean;
}

export interface IRDarf {
  /** Mês de apuração (YYYY-MM). */
  competencia: string;
  /** 6015 = renda variável em bolsa; 4600 = ganho de capital. */
  codigo: '6015' | '4600';
  valorCents: Centavos;
  /** Último dia útil do mês seguinte (YYYY-MM-DD). */
  vencimento: string;
}

export interface IRInforme {
  ano: number;
  rendimentos: IRRendimento[];
  ganhoCapital: IRGanhoCapital[];
  darfs: IRDarf[];
  totalTributavelCents: Centavos;
  totalExclusivaCents: Centavos;
  totalIsentoCents: Centavos;
  /** Soma das DARFs do ano. */
  totalIRDevidoCents: Centavos;
  /** IR ÷ soma dos ganhos positivos do ano (0–1). */
  aliquotaEfetiva: number;
}

// ──────────────────────────────────────────────
// Constantes
// ──────────────────────────────────────────────

const LIMITE_ACOES_CENTS = 2_000_000;      // R$ 20.000 em vendas de ações/mês
const LIMITE_OUTROS_CENTS = 3_500_000;     // R$ 35.000 em vendas/mês (outros bens, cripto)
const DARF_MINIMO_CENTS = 1_000;           // R$ 10,00

/** Faixas progressivas do ganho de capital (limite superior em centavos, alíquota). */
const FAIXAS_PROGRESSIVAS: ReadonlyArray<readonly [number, number]> = [
  [500_000_000, 0.15],
  [1_000_000_000, 0.175],
  [3_000_000_000, 0.20],
  [Number.POSITIVE_INFINITY, 0.225],
];

const CAT_SALARIO = 'salário';
const CAT_FREELANCE = 'freelance';
const CATS_EXCLUSIVA: ReadonlySet<string> = new Set(['investimento', '13º salário', '13o salário']);
const CATS_ISENTO: ReadonlySet<string> = new Set([
  'reembolso', 'estorno', 'presente', 'presentes', 'doação', 'doação recebida', 'herança',
  'indenização', 'fgts', 'poupança', 'dividendos', 'lci', 'lca', 'rendimento isento',
]);

const TAG_COMPRA_ATIVO = 'compra-ativo';
const TAG_VENDA_ATIVO = 'venda-ativo';
const TAG_ISENTO = 'isento';
const TAGS_13 = new Set(['13o', '13º', 'decimo-terceiro']);
const CLASS_TAGS: ReadonlyArray<IRAssetClass> = ['day-trade', 'acao', 'fii', 'cripto'];

// ──────────────────────────────────────────────
// Helpers internos
// ──────────────────────────────────────────────

function getYear(date: string): number {
  return parseInt(date.slice(0, 4), 10);
}

function isEntrada(tx: Transaction): boolean {
  return tx.type === 'entrada' || tx.type === 'receita';
}

function canonicalCents(tx: Transaction): Centavos {
  if (tx.value_cents !== undefined) return Math.abs(tx.value_cents) as Centavos;
  // fallback legado — nunca ocorre em documentos pós-FASE 1.3
  return toCentavos(Math.abs(tx.value ?? 0));
}

function tagsOf(tx: Transaction): string[] {
  return Array.isArray(tx.tags) ? tx.tags.map(t => String(t).trim().toLowerCase()) : [];
}

function hasTag(tx: Transaction, tag: string): boolean {
  return tagsOf(tx).includes(tag);
}

function tagValue(tx: Transaction, prefix: string): string | null {
  const found = tagsOf(tx).find(t => t.startsWith(prefix));
  return found ? found.slice(prefix.length).trim() || null : null;
}

function assetKey(tx: Transaction): string {
  return tagValue(tx, 'ativo:') ?? tx.description.toLowerCase().trim();
}

function assetClass(tx: Transaction): IRAssetClass {
  const tags = tagsOf(tx);
  return CLASS_TAGS.find(c => tags.includes(c)) ?? 'outros';
}

/** Quantidade da tag `qtd:N` (vírgula ou ponto decimal), ou null. */
function quantityOf(tx: Transaction): Decimal | null {
  const raw = tagValue(tx, 'qtd:');
  if (!raw || !/^\d+([.,]\d+)?$/.test(raw)) return null;
  const q = new Decimal(raw.replace(',', '.'));
  return q.greaterThan(0) ? q : null;
}

function roundCents(d: Decimal): Centavos {
  return d.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber() as Centavos;
}

function categorizeRendimento(tx: Transaction): IRCategory | null {
  if (!isEntrada(tx) || tx.isDeleted) return null;
  if (hasTag(tx, TAG_VENDA_ATIVO)) return null; // vai para ganho de capital
  const cat = (tx.category ?? '').trim().toLowerCase();
  if (hasTag(tx, TAG_ISENTO) || CATS_ISENTO.has(cat)) return 'isento';
  if (tagsOf(tx).some(t => TAGS_13.has(t)) || CATS_EXCLUSIVA.has(cat)) return 'exclusiva';
  if (cat === CAT_SALARIO) return 'salario';
  if (cat === CAT_FREELANCE) return 'freelance';
  return 'outros_tributaveis';
}

/** Último dia útil (seg–sex) do mês seguinte a YYYY-MM. */
export function vencimentoDarf(competencia: string): string {
  const [y, m] = competencia.split('-').map(Number) as [number, number];
  // dia 0 do mês m+2 = último dia do mês m+1 (meses do Date são 0-based)
  const d = new Date(Date.UTC(y, m + 1, 0));
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Imposto progressivo sobre um ganho positivo (outros bens). */
function impostoProgressivo(gainCents: number): Decimal {
  let restante = new Decimal(gainCents);
  let piso = 0;
  let imposto = new Decimal(0);
  for (const [teto, aliquota] of FAIXAS_PROGRESSIVAS) {
    if (restante.lte(0)) break;
    const faixa = Decimal.min(restante, new Decimal(teto).minus(piso));
    imposto = imposto.plus(faixa.times(aliquota));
    restante = restante.minus(faixa);
    piso = teto;
  }
  return imposto;
}

// ──────────────────────────────────────────────
// Ganho de capital
// ──────────────────────────────────────────────

interface Venda {
  competencia: string;
  asset: string;
  assetClass: IRAssetClass;
  costCents: Centavos;
  revenueCents: Centavos;
}

/** Percorre compras e vendas em ordem de data e devolve as vendas com o custo médio. */
function apurarVendas(transactions: Transaction[]): Venda[] {
  const ops = transactions
    .filter(tx => !tx.isDeleted && (hasTag(tx, TAG_COMPRA_ATIVO) || hasTag(tx, TAG_VENDA_ATIVO)))
    .map((tx, i) => ({ tx, i }))
    .sort((a, b) => (a.tx.date < b.tx.date ? -1 : a.tx.date > b.tx.date ? 1 : a.i - b.i));

  const pools = new Map<string, { cost: Decimal; qty: Decimal | null }>();
  const vendas: Venda[] = [];

  for (const { tx } of ops) {
    const key = assetKey(tx);
    const pool = pools.get(key) ?? { cost: new Decimal(0), qty: new Decimal(0) };
    const q = quantityOf(tx);
    const value = canonicalCents(tx);

    if (hasTag(tx, TAG_COMPRA_ATIVO)) {
      pool.cost = pool.cost.plus(value);
      pool.qty = pool.qty !== null && q !== null ? pool.qty.plus(q) : null;
      pools.set(key, pool);
      continue;
    }

    // venda: preço médio quando as quantidades são conhecidas; senão liquida a posição
    let custoVendido: Decimal;
    if (q !== null && pool.qty !== null && pool.qty.greaterThan(0) && q.lessThan(pool.qty)) {
      custoVendido = pool.cost.times(q).dividedBy(pool.qty);
      pool.cost = pool.cost.minus(custoVendido);
      pool.qty = pool.qty.minus(q);
    } else {
      custoVendido = pool.cost;
      pool.cost = new Decimal(0);
      pool.qty = new Decimal(0);
    }
    pools.set(key, pool);
    vendas.push({
      competencia: tx.date.slice(0, 7),
      asset: key,
      assetClass: assetClass(tx),
      costCents: roundCents(custoVendido),
      revenueCents: value,
    });
  }
  return vendas;
}

/** Agrupa as vendas por mês e ativo e calcula isenções, compensações e DARFs. */
function apurarGanhoCapital(transactions: Transaction[]): { linhas: IRGanhoCapital[]; darfs: IRDarf[] } {
  const vendas = apurarVendas(transactions);

  // mês → ativo → linha
  const porMes = new Map<string, Map<string, IRGanhoCapital>>();
  for (const v of vendas) {
    const mes = porMes.get(v.competencia) ?? new Map<string, IRGanhoCapital>();
    const k = `${v.assetClass}|${v.asset}`;
    const linha = mes.get(k) ?? {
      competencia: v.competencia, assetDescription: v.asset, assetClass: v.assetClass,
      costCents: 0 as Centavos, revenueCents: 0 as Centavos, gainCents: 0 as Centavos,
      aliquota: 0, irDevidoCents: 0 as Centavos, isento: false,
    };
    linha.costCents = addCentavos(linha.costCents, v.costCents);
    linha.revenueCents = addCentavos(linha.revenueCents, v.revenueCents);
    linha.gainCents = (linha.revenueCents - linha.costCents) as Centavos;
    mes.set(k, linha);
    porMes.set(v.competencia, mes);
  }

  const prejuizo: Record<'acao' | 'day-trade' | 'fii', Decimal> = {
    acao: new Decimal(0), 'day-trade': new Decimal(0), fii: new Decimal(0),
  };
  const pendente: Record<IRDarf['codigo'], Decimal> = { '6015': new Decimal(0), '4600': new Decimal(0) };
  const linhas: IRGanhoCapital[] = [];
  const darfs: IRDarf[] = [];

  for (const competencia of [...porMes.keys()].sort()) {
    const mes = [...porMes.get(competencia)!.values()];
    const impostoMes: Record<IRDarf['codigo'], Decimal> = { '6015': new Decimal(0), '4600': new Decimal(0) };

    // Bolsa: ganho líquido do mês por classe, com compensação de prejuízo
    for (const classe of ['acao', 'day-trade', 'fii'] as const) {
      const doMes = mes.filter(l => l.assetClass === classe);
      if (doMes.length === 0) continue;
      const vendasMes = doMes.reduce((s, l) => s + l.revenueCents, 0);
      const liquido = doMes.reduce((s, l) => s.plus(l.gainCents), new Decimal(0));
      const aliquota = classe === 'acao' ? 0.15 : 0.20;

      if (classe === 'acao' && vendasMes <= LIMITE_ACOES_CENTS) {
        doMes.forEach(l => { l.isento = l.gainCents > 0; });
        if (liquido.lessThan(0)) prejuizo.acao = prejuizo.acao.plus(liquido.abs());
        continue;
      }
      if (liquido.lte(0)) {
        prejuizo[classe] = prejuizo[classe].plus(liquido.abs());
        continue;
      }
      const compensado = Decimal.min(liquido, prejuizo[classe]);
      prejuizo[classe] = prejuizo[classe].minus(compensado);
      const imposto = liquido.minus(compensado).times(aliquota);
      impostoMes['6015'] = impostoMes['6015'].plus(imposto);
      ratear(doMes, imposto, aliquota);
    }

    // Outros bens e cripto: limite de vendas por classe, imposto por ativo
    for (const classe of ['outros', 'cripto'] as const) {
      const doMes = mes.filter(l => l.assetClass === classe);
      if (doMes.length === 0) continue;
      const vendasMes = doMes.reduce((s, l) => s + l.revenueCents, 0);
      for (const l of doMes) {
        if (l.gainCents <= 0) continue;
        if (vendasMes <= LIMITE_OUTROS_CENTS) { l.isento = true; continue; }
        const imposto = impostoProgressivo(l.gainCents);
        l.irDevidoCents = roundCents(imposto);
        l.aliquota = imposto.dividedBy(l.gainCents).toDecimalPlaces(4).toNumber();
        impostoMes['4600'] = impostoMes['4600'].plus(imposto);
      }
    }

    for (const codigo of ['6015', '4600'] as const) {
      const total = impostoMes[codigo].plus(pendente[codigo]);
      if (total.lte(0)) continue;
      const valorCents = roundCents(total);
      if (valorCents < DARF_MINIMO_CENTS) { pendente[codigo] = total; continue; }
      pendente[codigo] = new Decimal(0);
      darfs.push({ competencia, codigo, valorCents, vencimento: vencimentoDarf(competencia) });
    }

    linhas.push(...mes);
  }

  return { linhas, darfs };
}

/** Distribui o imposto do mês entre as linhas com ganho, proporcional ao ganho. */
function ratear(linhas: IRGanhoCapital[], imposto: Decimal, aliquota: number): void {
  const comGanho = linhas.filter(l => l.gainCents > 0);
  const totalGanho = comGanho.reduce((s, l) => s + l.gainCents, 0);
  if (totalGanho <= 0) return;
  const totalCents = roundCents(imposto);
  let distribuido = 0;
  comGanho.forEach((l, i) => {
    const parte = i === comGanho.length - 1
      ? totalCents - distribuido
      : roundCents(new Decimal(totalCents).times(l.gainCents).dividedBy(totalGanho));
    distribuido += parte;
    l.irDevidoCents = parte as Centavos;
    l.aliquota = aliquota;
  });
}

// ──────────────────────────────────────────────
// Motor principal
// ──────────────────────────────────────────────

const RENDIMENTO_LABELS: Record<IRCategory, string> = {
  salario: 'Salários e Pró-labore',
  freelance: 'Rendimentos de Trabalho Autônomo',
  exclusiva: 'Tributação Exclusiva (investimentos, 13º)',
  outros_tributaveis: 'Outros Rendimentos Tributáveis',
  isento: 'Rendimentos Isentos e Não Tributáveis',
};

const ORDER: IRCategory[] = ['salario', 'freelance', 'outros_tributaveis', 'exclusiva', 'isento'];

/**
 * Gera o informe de um ano-calendário. Recebe TODAS as transações: o custo dos
 * ativos usa compras de anos anteriores.
 */
export function gerarInformeIR(transactions: Transaction[], ano: number): IRInforme {
  const map = new Map<IRCategory, { totalCents: Centavos; count: number }>();
  for (const tx of transactions) {
    if (tx.isDeleted || getYear(tx.date) !== ano) continue;
    const cat = categorizeRendimento(tx);
    if (cat === null) continue;
    const cur = map.get(cat) ?? { totalCents: 0 as Centavos, count: 0 };
    cur.totalCents = addCentavos(cur.totalCents, canonicalCents(tx));
    cur.count += 1;
    map.set(cat, cur);
  }

  const rendimentos: IRRendimento[] = [...map.entries()]
    .map(([category, { totalCents, count }]) => ({
      category, label: RENDIMENTO_LABELS[category], totalCents, transactionCount: count,
    }))
    .sort((a, b) => ORDER.indexOf(a.category) - ORDER.indexOf(b.category));

  const soma = (cats: IRCategory[]) => rendimentos
    .filter(r => cats.includes(r.category))
    .reduce((acc, r) => addCentavos(acc, r.totalCents), 0 as Centavos);

  const { linhas, darfs } = apurarGanhoCapital(transactions);
  const anoStr = String(ano);
  const ganhoCapital = linhas.filter(l => l.competencia.startsWith(anoStr));
  const darfsAno = darfs.filter(d => d.competencia.startsWith(anoStr));

  const totalIRDevidoCents = darfsAno.reduce((acc, d) => addCentavos(acc, d.valorCents), 0 as Centavos);
  const ganhosPositivos = ganhoCapital.reduce((s, l) => s + Math.max(0, l.gainCents), 0);
  const aliquotaEfetiva = ganhosPositivos > 0
    ? new Decimal(totalIRDevidoCents).dividedBy(ganhosPositivos).toDecimalPlaces(4).toNumber()
    : 0;

  return {
    ano,
    rendimentos,
    ganhoCapital,
    darfs: darfsAno,
    totalTributavelCents: soma(['salario', 'freelance', 'outros_tributaveis']),
    totalExclusivaCents: soma(['exclusiva']),
    totalIsentoCents: soma(['isento']),
    totalIRDevidoCents,
    aliquotaEfetiva,
  };
}

/** Retorna os anos-calendário distintos presentes nas transações. */
export function anosDisponiveis(transactions: Transaction[]): number[] {
  const anos = new Set<number>();
  for (const tx of transactions) {
    if (!tx.isDeleted) anos.add(getYear(tx.date));
  }
  return Array.from(anos).sort((a, b) => b - a);
}

/**
 * Texto seguro para CSV: aspas dobradas e apóstrofo antes de = + - @ (evita que
 * o Excel trate o conteúdo como fórmula).
 */
export function csvText(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

const CLASSE_LABEL: Record<IRAssetClass, string> = {
  acao: 'Ações', 'day-trade': 'Day trade', fii: 'FII', cripto: 'Cripto', outros: 'Outros bens',
};

export function classeLabel(c: IRAssetClass): string {
  return CLASSE_LABEL[c];
}

/** Gera o CSV do informe (rendimentos, ganhos de capital e DARFs). */
export function exportarInformeCSV(informe: IRInforme): string {
  // número formatado por nós (não vem do usuário): só entre aspas, sem o apóstrofo
  const brl = (c: number) => `"${fromCentavos(c).toFixed(2).replace('.', ',')}"`;
  const lines: string[] = [];
  lines.push(`Informe de Rendimentos ${informe.ano} (estimativa)`);
  lines.push('');
  lines.push('Tipo,Descrição,Valor (R$),Qtd Transações');
  for (const r of informe.rendimentos) {
    lines.push(`Rendimento,${csvText(r.label)},${brl(r.totalCents)},${r.transactionCount}`);
  }

  if (informe.ganhoCapital.length > 0) {
    lines.push('');
    lines.push('Ganhos de Capital');
    lines.push('Mês,Ativo,Classe,Custo (R$),Venda (R$),Ganho Líquido (R$),Situação,IR (R$)');
    for (const g of informe.ganhoCapital) {
      const situacao = g.isento ? 'Isento' : g.irDevidoCents > 0 ? `${(g.aliquota * 100).toFixed(1).replace('.', ',')}%` : '—';
      lines.push([
        g.competencia, csvText(g.assetDescription), CLASSE_LABEL[g.assetClass],
        brl(g.costCents), brl(g.revenueCents), brl(g.gainCents), csvText(situacao), brl(g.irDevidoCents),
      ].join(','));
    }
  }

  if (informe.darfs.length > 0) {
    lines.push('');
    lines.push('DARFs');
    lines.push('Mês,Código,Valor (R$),Vencimento');
    for (const d of informe.darfs) {
      lines.push(`${d.competencia},${d.codigo},${brl(d.valorCents)},${d.vencimento}`);
    }
  }

  lines.push('');
  lines.push(`Total Tributável (R$),${brl(informe.totalTributavelCents)}`);
  lines.push(`Tributação Exclusiva (R$),${brl(informe.totalExclusivaCents)}`);
  lines.push(`Total Isento (R$),${brl(informe.totalIsentoCents)}`);
  lines.push(`IR sobre Ganho de Capital (R$),${brl(informe.totalIRDevidoCents)}`);

  return lines.join('\n');
}
