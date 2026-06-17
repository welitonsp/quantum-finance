import type { Transaction } from '../shared/types/transaction';
import { getTransactionAbsCentavos, isIncome, isExpense, isInvoicePayment } from './transactionUtils';
import { fromCentavos } from '../shared/types/money';

/** Escapa valor para célula CSV: envolve em aspas se contém vírgula, aspas ou quebra de linha. */
function escapeCSV(val: unknown): string {
  const s = String(val ?? '');
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Converte transações em string CSV (compatível com Excel pt-BR). */
export function transactionsToCSV(transactions: Transaction[]): string {
  const header = ['Data', 'Descrição', 'Valor', 'Tipo', 'Categoria', 'Conta'];
  const rows = transactions.map(tx => [
    tx.date ?? '',
    tx.description ?? '',
    fromCentavos(getTransactionAbsCentavos(tx)).toFixed(2).replace('.', ','),
    tx.type === 'entrada' || tx.type === 'receita' ? 'Receita'
      : isInvoicePayment(tx) ? 'Pagamento Fatura' : 'Despesa',
    tx.category ?? 'Outros',
    tx.account ?? '',
  ]);
  // BOM UTF-8 para Excel reconhecer acentos
  const bom = '﻿';
  return bom + [header, ...rows].map(row => row.map(escapeCSV).join(',')).join('\r\n');
}

export interface MonthlyReportData {
  year:           number;
  month:          number;
  incomeCents:    number;
  expenseCents:   number;
  netCents:       number;
  savingsRate:    number;
  topCategories:  { name: string; cents: number; pct: number }[];
  txCount:        number;
  transferCount:  number;
}

/** Computa dados do relatório mensal a partir de uma lista de transações. */
export function computeMonthlyReport(
  transactions: Transaction[],
  year:  number,
  month: number,
): MonthlyReportData {
  const pad = (n: number) => String(n).padStart(2, '0');
  const prefix = `${year}-${pad(month)}`;

  const txs = transactions.filter(tx => (tx.date ?? '').startsWith(prefix) && tx.isDeleted !== true);

  let incomeCents  = 0;
  let expenseCents = 0;
  let transferCount = 0;
  const catMap = new Map<string, number>();

  for (const tx of txs) {
    const cents = getTransactionAbsCentavos(tx);
    if (tx.type === 'transferencia') { transferCount++; continue; }
    if (isIncome(tx.type))  { incomeCents  += cents; }
    if (isExpense(tx.type) && !isInvoicePayment(tx)) {
      expenseCents += cents;
      const cat = tx.category ?? 'Outros';
      catMap.set(cat, (catMap.get(cat) ?? 0) + cents);
    }
  }

  const netCents    = incomeCents - expenseCents;
  const savingsRate = incomeCents > 0 ? (netCents / incomeCents) * 100 : 0;

  const topCategories = [...catMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, cents]) => ({
      name,
      cents,
      pct: expenseCents > 0 ? (cents / expenseCents) * 100 : 0,
    }));

  return {
    year, month,
    incomeCents, expenseCents, netCents,
    savingsRate,
    topCategories,
    txCount:      txs.length,
    transferCount,
  };
}

/** Gera CSV do relatório mensal completo (sumário + detalhe de transações). */
export function generateMonthlyReportCSV(
  transactions: Transaction[],
  year:  number,
  month: number,
): string {
  const report = computeMonthlyReport(transactions, year, month);
  const pad    = (n: number) => String(n).padStart(2, '0');
  const fmt    = (c: number) => fromCentavos(c).toFixed(2).replace('.', ',');
  const monthName = new Date(year, month - 1, 1)
    .toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  const bom = '﻿';
  const lines: string[] = [];

  // ── Cabeçalho do sumário ──────────────────────────────────────
  lines.push(`Relatório Financeiro — ${monthName}`);
  lines.push('');
  lines.push('SUMÁRIO');
  lines.push(`Receitas,R$ ${fmt(report.incomeCents)}`);
  lines.push(`Despesas,R$ ${fmt(report.expenseCents)}`);
  lines.push(`Saldo,R$ ${fmt(report.netCents)}`);
  lines.push(`Taxa de Poupança,${report.savingsRate.toFixed(1)}%`);
  lines.push(`Transferências,${report.transferCount}`);
  lines.push(`Total de movimentações,${report.txCount}`);
  lines.push('');

  // ── Top categorias ────────────────────────────────────────────
  lines.push('TOP CATEGORIAS DE DESPESA');
  lines.push('Categoria,Valor,% do total');
  for (const cat of report.topCategories) {
    lines.push(`${escapeCSV(cat.name)},R$ ${fmt(cat.cents)},${cat.pct.toFixed(1)}%`);
  }
  lines.push('');

  // ── Detalhe de transações ─────────────────────────────────────
  lines.push('MOVIMENTAÇÕES DO PERÍODO');
  lines.push('Data,Descrição,Valor,Tipo,Categoria,Conta');
  const pad2 = (n: number) => String(n).padStart(2, '0');
  const prefix = `${year}-${pad2(month)}`;
  const txs = transactions
    .filter(tx => (tx.date ?? '').startsWith(prefix) && tx.isDeleted !== true)
    .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));

  for (const tx of txs) {
    const tipo = tx.type === 'transferencia' ? 'Transferência'
      : isIncome(tx.type) ? 'Receita'
      : isInvoicePayment(tx) ? 'Pagamento Fatura' : 'Despesa';
    lines.push([
      tx.date ?? '',
      escapeCSV(tx.description ?? ''),
      fmt(getTransactionAbsCentavos(tx)),
      tipo,
      escapeCSV(tx.category ?? 'Outros'),
      escapeCSV(tx.account ?? ''),
    ].join(','));
  }

  void pad; // suppress unused warning
  return bom + lines.join('\r\n');
}

/** Dispara download de string CSV no navegador. */
export function downloadCSV(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
