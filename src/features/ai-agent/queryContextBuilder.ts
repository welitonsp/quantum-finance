/**
 * queryContextBuilder.ts — Enriquecimento de contexto para query intents (FASE A).
 *
 * Dado um intent de consulta detectado pelo router, constrói um bloco de texto
 * estruturado com os dados financeiros relevantes para incluir no prompt enviado ao
 * Gemini. Isso substitui o fallback ao contexto genérico (saldo + últimas 50 txs) por
 * dados precisos e segmentados por intenção, sem I/O, sem LLM, sem PII.
 *
 * Convenção de unidades:
 *   - balances.geral.* → REAIS (já convertidos por fromCentavos em useFinancialData)
 *   - getTransactionAbsCentavos(tx) → CENTAVOS → usa formatBRL(cents)
 */
import type { AgentIntent } from '../../shared/schemas/agentSchemas';
import type { Transaction, ModuleBalances } from '../../shared/types/transaction';
import { formatBRL } from '../../shared/types/money';
import { getTransactionAbsCentavos } from '../../utils/transactionUtils';

function fmtReais(reais: number): string {
  return reais.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function currentYearMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function currentMonthLabel(): string {
  return new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

/**
 * Retorna um bloco de contexto estruturado para o intent informado, ou `null` se o
 * intent não for de consulta ou se os dados disponíveis forem insuficientes.
 * O resultado deve ser prefixado ao prompt antes de enviá-lo ao Gemini.
 */
export function buildQueryContext(
  intent: AgentIntent,
  transactions: Transaction[],
  balances: Partial<ModuleBalances> | null,
): string | null {
  switch (intent) {
    case 'get_balances':      return buildBalancesContext(balances);
    case 'explain_month':     return buildMonthContext(transactions);
    case 'cashflow_briefing': return buildCashflowContext(transactions, balances);
    case 'get_invoice':       return buildInvoiceContext(transactions);
    default:                  return null;
  }
}

function buildBalancesContext(balances: Partial<ModuleBalances> | null): string | null {
  const g = balances?.geral;
  if (!g) return null;
  const resultado = (g.receitas ?? 0) - (g.despesas ?? 0);
  return [
    '[DADOS DE SALDO — USE ESTES VALORES NA RESPOSTA]',
    `• Saldo total: ${fmtReais(g.saldo ?? 0)}`,
    `• Receitas acumuladas: ${fmtReais(g.receitas ?? 0)}`,
    `• Despesas acumuladas: ${fmtReais(g.despesas ?? 0)}`,
    `• Resultado (receitas − despesas): ${fmtReais(resultado)}`,
    '',
  ].join('\n');
}

function buildMonthContext(transactions: Transaction[]): string | null {
  const ym = currentYearMonth();
  const monthTxs = transactions.filter(tx => (tx.date ?? '').startsWith(ym));
  if (monthTxs.length === 0) return null;

  const byCat: Record<string, number> = {};
  let totalExpenses = 0;
  let totalIncome = 0;

  for (const tx of monthTxs) {
    const cents = getTransactionAbsCentavos(tx);
    if (tx.type === 'saida' || tx.type === 'despesa') {
      const cat = tx.category ?? 'Outros';
      byCat[cat] = (byCat[cat] ?? 0) + cents;
      totalExpenses += cents;
    } else if (tx.type === 'entrada') {
      totalIncome += cents;
    }
  }

  const topCats = Object.entries(byCat)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([cat, cents]) => `  - ${cat}: ${formatBRL(cents)}`);

  return [
    `[RESUMO DO MÊS — ${currentMonthLabel().toUpperCase()}]`,
    `• Movimentações: ${monthTxs.length}`,
    `• Receitas: ${formatBRL(totalIncome)}`,
    `• Despesas: ${formatBRL(totalExpenses)}`,
    `• Resultado do mês: ${formatBRL(totalIncome - totalExpenses)}`,
    ...(topCats.length ? ['• Maiores categorias de gasto:', ...topCats] : []),
    '',
  ].join('\n');
}

function buildCashflowContext(
  transactions: Transaction[],
  balances: Partial<ModuleBalances> | null,
): string | null {
  const now = new Date();
  const months = [-2, -1, 0].map(offset => {
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  const monthlyExpenses = months.map(ym =>
    transactions
      .filter(tx => (tx.date ?? '').startsWith(ym) && (tx.type === 'saida' || tx.type === 'despesa'))
      .reduce((sum, tx) => sum + getTransactionAbsCentavos(tx), 0),
  );

  const nonZero = monthlyExpenses.filter(v => v > 0);
  if (nonZero.length === 0) return null;

  const avgExpenseCents = Math.round(nonZero.reduce((a, b) => a + b, 0) / nonZero.length);
  const saldoCents      = Math.round((balances?.geral?.saldo ?? 0) * 100);
  const projectedCents  = saldoCents - avgExpenseCents;

  const lines = [
    '[ANÁLISE DE FLUXO DE CAIXA — ÚLTIMOS 3 MESES]',
    `• Saldo atual: ${fmtReais(balances?.geral?.saldo ?? 0)}`,
    `• Gasto médio mensal: ${formatBRL(avgExpenseCents)}`,
    `• Projeção de saldo ao fim do mês: ${formatBRL(projectedCents)}`,
  ];
  if (projectedCents < 0) {
    lines.push('• ALERTA: projeção indica saldo negativo neste ritmo de gastos.');
  }
  lines.push('');
  return lines.join('\n');
}

function buildInvoiceContext(transactions: Transaction[]): string | null {
  const ym = currentYearMonth();
  const cardTxs = transactions.filter(tx =>
    (tx.date ?? '').startsWith(ym) &&
    (tx.type === 'saida' || tx.type === 'despesa') &&
    (
      (tx.category ?? '').toLowerCase().includes('cartão') ||
      (tx.category ?? '').toLowerCase().includes('cartao') ||
      (tx.category ?? '').toLowerCase().includes('fatura')
    ),
  );

  if (cardTxs.length === 0) return null;

  const totalCents = cardTxs.reduce((sum, tx) => sum + getTransactionAbsCentavos(tx), 0);
  return [
    `[TRANSAÇÕES DE CARTÃO IDENTIFICADAS — ${ym}]`,
    `• Total identificado: ${formatBRL(totalCents)} em ${cardTxs.length} transação(ões)`,
    '• Para fatura exata e limite disponível, acesse o módulo Cartões de Crédito.',
    '',
  ].join('\n');
}
