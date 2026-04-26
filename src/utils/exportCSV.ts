import type { Transaction } from '../shared/types/transaction';

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
    // Valor em reais (vinha em centavos no Firestore, mas useTransactions já normaliza)
    (Math.abs(Number(tx.value ?? 0)) / 100).toFixed(2).replace('.', ','),
    tx.type === 'entrada' || tx.type === 'receita' ? 'Receita' : 'Despesa',
    tx.category ?? 'Outros',
    tx.account ?? '',
  ]);
  // BOM UTF-8 para Excel reconhecer acentos
  const bom = '﻿';
  return bom + [header, ...rows].map(row => row.map(escapeCSV).join(',')).join('\r\n');
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
