/**
 * Motor de apuração de IR — puro, sem I/O, sem float.
 *
 * Responsabilidades:
 * - Agregar rendimentos tributáveis e isentos por ano-calendário
 * - Apurar ganhos de capital (venda - custo médio ponderado)
 * - Gerar informe de rendimentos estruturado
 * - Exportar DARF simplificado (base de cálculo × alíquota)
 *
 * Limitações intencionais:
 * - Não valida CNPJ/CPF da fonte pagadora (dado não existe no modelo)
 * - Não contempla JCP, fundos imobiliários ou renda variável automática
 * - Ganho de capital depende de transações marcadas com tag 'venda-ativo'
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
  | 'investimento_rendimento'
  | 'ganho_capital'
  | 'outros_tributaveis'
  | 'isento';

export interface IRRendimento {
  category: IRCategory;
  label: string;
  totalCents: Centavos;
  transactionCount: number;
}

export interface IRGanhoCapital {
  assetDescription: string;
  costCents: Centavos;      // custo médio ponderado total
  revenueCents: Centavos;   // valor de venda total
  gainCents: Centavos;      // ganho líquido (pode ser negativo = prejuízo)
  aliquota: number;         // 0.15 padrão para ativos comuns
  irDevidoCents: Centavos;  // max(0, gainCents × aliquota)
}

export interface IRInforme {
  ano: number;
  rendimentos: IRRendimento[];
  ganhoCapital: IRGanhoCapital[];
  totalTributavelCents: Centavos;
  totalIsentoCents: Centavos;
  totalIRDevidoCents: Centavos;
  /** Alíquota efetiva sobre tributável (0–1) */
  aliquotaEfetiva: number;
}

// ──────────────────────────────────────────────
// Constantes
// ──────────────────────────────────────────────

const ALIQUOTA_PADRAO = 0.15;

// Categorias que geram renda tributável
const CAT_SALARIO: ReadonlySet<string> = new Set(['Salário']);
const CAT_FREELANCE: ReadonlySet<string> = new Set(['Freelance']);
const CAT_INVESTIMENTO: ReadonlySet<string> = new Set(['Investimento']);

// Tags especiais usadas pelo usuário para marcar operações de capital
const TAG_COMPRA_ATIVO = 'compra-ativo';
const TAG_VENDA_ATIVO = 'venda-ativo';

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
  if (tx.value_cents !== undefined) return tx.value_cents;
  // fallback legado — nunca ocorre em documentos pós-FASE 1.3
  return toCentavos(tx.value ?? 0);
}

function hasTag(tx: Transaction, tag: string): boolean {
  return Array.isArray(tx.tags) && tx.tags.includes(tag);
}

function categorizeRendimento(tx: Transaction): IRCategory | null {
  if (!isEntrada(tx) || tx.isDeleted) return null;
  if (hasTag(tx, TAG_VENDA_ATIVO)) return 'ganho_capital';
  if (CAT_SALARIO.has(tx.category)) return 'salario';
  if (CAT_FREELANCE.has(tx.category)) return 'freelance';
  if (CAT_INVESTIMENTO.has(tx.category)) return 'investimento_rendimento';
  return 'outros_tributaveis';
}

// ──────────────────────────────────────────────
// Motor principal
// ──────────────────────────────────────────────

/** Filtra transações não deletadas de um ano-calendário específico. */
function filterByYear(transactions: Transaction[], ano: number): Transaction[] {
  return transactions.filter(
    (tx) => !tx.isDeleted && getYear(tx.date) === ano,
  );
}

/**
 * Agrega rendimentos por categoria.
 * Transações de venda de ativo são separadas para apuração de ganho de capital.
 */
function aggregateRendimentos(transactions: Transaction[]): Map<IRCategory, { totalCents: Centavos; count: number }> {
  const map = new Map<IRCategory, { totalCents: Centavos; count: number }>();

  for (const tx of transactions) {
    const cat = categorizeRendimento(tx);
    if (cat === null || cat === 'ganho_capital') continue;

    const cents = canonicalCents(tx);
    const existing = map.get(cat);
    if (existing) {
      existing.totalCents = addCentavos(existing.totalCents, cents);
      existing.count += 1;
    } else {
      map.set(cat, { totalCents: cents, count: 1 });
    }
  }

  return map;
}

/**
 * Apura ganhos de capital por ativo.
 * Usa custo médio ponderado simples: soma(compras) vs soma(vendas) por ativo
 * agrupado por description normalizada.
 */
function apurarGanhoCapital(transactions: Transaction[]): IRGanhoCapital[] {
  const compras = new Map<string, Centavos>();
  const vendas = new Map<string, Centavos>();

  for (const tx of transactions) {
    if (tx.isDeleted) continue;
    const key = tx.description.toLowerCase().trim();

    if (hasTag(tx, TAG_COMPRA_ATIVO)) {
      const prev = compras.get(key) ?? (0 as Centavos);
      compras.set(key, addCentavos(prev, canonicalCents(tx)));
    } else if (hasTag(tx, TAG_VENDA_ATIVO)) {
      const prev = vendas.get(key) ?? (0 as Centavos);
      vendas.set(key, addCentavos(prev, canonicalCents(tx)));
    }
  }

  const result: IRGanhoCapital[] = [];

  for (const [asset, revenueCents] of vendas.entries()) {
    const costCents = compras.get(asset) ?? (0 as Centavos);
    const gainDecimal = new Decimal(revenueCents).minus(costCents);
    const gainCents = gainDecimal.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber() as Centavos;
    const irDevidoCents = gainCents > 0
      ? new Decimal(gainCents).times(ALIQUOTA_PADRAO).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber() as Centavos
      : 0 as Centavos;

    result.push({
      assetDescription: asset,
      costCents,
      revenueCents,
      gainCents,
      aliquota: ALIQUOTA_PADRAO,
      irDevidoCents,
    });
  }

  return result.sort((a, b) => b.gainCents - a.gainCents);
}

const RENDIMENTO_LABELS: Record<IRCategory, string> = {
  salario: 'Salários e Pró-labore',
  freelance: 'Rendimentos de Trabalho Autônomo',
  investimento_rendimento: 'Rendimentos de Investimentos',
  ganho_capital: 'Ganhos de Capital',
  outros_tributaveis: 'Outros Rendimentos Tributáveis',
  isento: 'Rendimentos Isentos e Não Tributáveis',
};

/**
 * Gera o informe de rendimentos completo para um ano-calendário.
 * Recebe todas as transações do usuário — filtra internamente por ano.
 */
export function gerarInformeIR(transactions: Transaction[], ano: number): IRInforme {
  const anoTxs = filterByYear(transactions, ano);

  const rendimentosMap = aggregateRendimentos(anoTxs);
  const ganhoCapital = apurarGanhoCapital(anoTxs);

  const rendimentos: IRRendimento[] = [];
  let totalTributavelCents = 0 as Centavos;
  let totalIsentoCents = 0 as Centavos;

  for (const [cat, { totalCents, count }] of rendimentosMap.entries()) {
    rendimentos.push({
      category: cat,
      label: RENDIMENTO_LABELS[cat],
      totalCents,
      transactionCount: count,
    });
    if (cat === 'isento') {
      totalIsentoCents = addCentavos(totalIsentoCents, totalCents);
    } else {
      totalTributavelCents = addCentavos(totalTributavelCents, totalCents);
    }
  }

  // Ordena: salário, freelance, investimento, ganho_capital, outros, isento
  const ORDER: IRCategory[] = [
    'salario', 'freelance', 'investimento_rendimento',
    'ganho_capital', 'outros_tributaveis', 'isento',
  ];
  rendimentos.sort((a, b) => ORDER.indexOf(a.category) - ORDER.indexOf(b.category));

  const totalIRDevidoCents = ganhoCapital.reduce(
    (acc, g) => addCentavos(acc, g.irDevidoCents),
    0 as Centavos,
  );

  const aliquotaEfetiva = totalTributavelCents > 0
    ? new Decimal(totalIRDevidoCents).dividedBy(totalTributavelCents).toDecimalPlaces(4).toNumber()
    : 0;

  return {
    ano,
    rendimentos,
    ganhoCapital,
    totalTributavelCents,
    totalIsentoCents,
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
 * Gera linhas CSV do informe para exportação.
 * Cabeçalho + rendimentos + ganhos de capital.
 */
export function exportarInformeCSV(informe: IRInforme): string {
  const lines: string[] = [];
  lines.push(`Informe de Rendimentos ${informe.ano}`);
  lines.push('');
  lines.push('Tipo,Descrição,Valor (R$),Qtd Transações');

  const brl = (c: number) => fromCentavos(c).toFixed(2).replace('.', ',');

  for (const r of informe.rendimentos) {
    lines.push(`Rendimento,"${r.label}","${brl(r.totalCents)}",${r.transactionCount}`);
  }

  if (informe.ganhoCapital.length > 0) {
    lines.push('');
    lines.push('Ganhos de Capital');
    lines.push('Ativo,Custo (R$),Receita (R$),Ganho Líquido (R$),Alíquota,IR Devido (R$)');

    for (const g of informe.ganhoCapital) {
      const aliq = `${(g.aliquota * 100).toFixed(0)}%`;
      lines.push(`"${g.assetDescription}","${brl(g.costCents)}","${brl(g.revenueCents)}","${brl(g.gainCents)}","${aliq}","${brl(g.irDevidoCents)}"`);
    }
  }

  lines.push('');
  lines.push(`Total Tributável (R$),"${brl(informe.totalTributavelCents)}"`);
  lines.push(`Total Isento (R$),"${brl(informe.totalIsentoCents)}"`);
  lines.push(`IR Devido sobre Ganho de Capital (R$),"${brl(informe.totalIRDevidoCents)}"`);
  lines.push(`Alíquota Efetiva,"${(informe.aliquotaEfetiva * 100).toFixed(2).replace('.', ',')}%"`);

  return lines.join('\n');
}
