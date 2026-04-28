// src/features/ai-chat/GeminiService.ts
// Firebase Cloud Functions proxy — chave da API fica exclusivamente no servidor.
import { httpsCallable } from 'firebase/functions';
import { functions }     from '../../shared/api/firebase/index';
import { maskPII, buildSafePromptRows } from '../../shared/lib/piiMasker';
import type { Transaction } from '../../shared/types/transaction';
import type { RecurringTask } from '../../shared/types/transaction';
import { getTransactionAbsCentavos } from '../../utils/transactionUtils';
import { fromCentavos, toCentavos } from '../../shared/types/money';

// ─── Types ────────────────────────────────────────────────────────────────────
interface FinancialContext {
  saldo?:          number;
  entradas?:       number;
  saidas?:         number;
  transactions?:   Transaction[];
  recurringTasks?: RecurringTask[];
  currentMonth?:   number;
  currentYear?:    number;
}

interface CategorizeResult {
  id:       string;
  category?: string;
}

interface AnomalyResult {
  cat:     string;
  current: number;
  avg:     number;
  delta:   number;
}

// ─── Wrapper seguro de httpsCallable ─────────────────────────────────────────
function getFunction(name: string, timeoutSeconds = 30) {
  return httpsCallable(functions, name, { timeout: timeoutSeconds * 1000 });
}

export class GeminiService {

  // ── MOTOR 1 — Categorização Automática em Batch ───────────────────────────
  static async categorizeTransactionsBatch(
    transactions: Pick<Transaction, 'id' | 'description'>[]
  ): Promise<CategorizeResult[]> {
    if (!transactions?.length) return [];

    const safeRows = buildSafePromptRows(transactions);
    try {
      const fn     = getFunction('categorizeTransactionsBatch');
      const result = await fn({ transactions: safeRows });
      return Array.isArray(result.data) ? (result.data as CategorizeResult[]) : [];
    } catch (error) {
      const err = error as { code?: string; message?: string };
      if (err.code === 'functions/unauthenticated') {
        console.error('[GeminiService] Utilizador não autenticado.');
      } else if (err.code === 'functions/not-found') {
        console.warn('[GeminiService] Cloud Function não encontrada. Deploy pendente?');
      } else {
        console.error('[GeminiService] Erro na categorização:', err.message);
      }
      return [];
    }
  }

  // ── MOTOR 2 — Auditor / CFO Pessoal ──────────────────────────────────────
  static async getFinancialAdvice(
    message:          string,
    financialContext: FinancialContext
  ): Promise<string> {
    const {
      saldo         = 0,
      entradas      = 0,
      saidas        = 0,
      transactions  = [],
      recurringTasks = [],
      currentMonth,
      currentYear,
    } = financialContext;

    const maskedContext = {
      saldo, entradas, saidas,
      currentMonth: currentMonth ?? new Date().getMonth() + 1,
      currentYear:  currentYear  ?? new Date().getFullYear(),
      transactions:   buildSafePromptRows(transactions.slice(0, 50)),
      recurringTasks: recurringTasks.map(t => ({
        description: maskPII(t.description ?? ''),
        value_cents: t.value_cents ?? toCentavos(t.value ?? 0),
        type: t.type ?? 'saida',
        category: t.category ?? 'Outros',
        dueDay: t.dueDay,
        active: t.active,
      })),
    };

    try {
      const fn     = getFunction('chatWithQuantumAI', 60);
      const result = await fn({ prompt: message, financialContext: maskedContext });
      const data   = result.data as { reply?: string } | null;
      return data?.reply ?? '⚠️ Resposta vazia do servidor.';
    } catch (error) {
      const err = error as { code?: string; message?: string };
      console.error('[GeminiService] Erro no motor auditor:', err.message);
      if (err.code === 'functions/not-found') {
        return '⚠️ Cloud Function não está deployada ainda. Execute `firebase deploy --only functions`.';
      }
      return `🚨 Interferência quântica: ${err.message ?? 'Erro desconhecido'}`;
    }
  }

  // ── MOTOR 3 — Relatório de Auditoria Pró-Activa ────────────────────────────
  static async generateAuditReport(financialContext: FinancialContext): Promise<string> {
    const {
      transactions   = [],
      recurringTasks = [],
      saldo = 0, entradas = 0, saidas = 0,
      currentMonth,
      currentYear,
    } = financialContext;

    const maskedContext = {
      saldo, entradas, saidas,
      currentMonth: currentMonth ?? new Date().getMonth() + 1,
      currentYear:  currentYear  ?? new Date().getFullYear(),
      transactions:   buildSafePromptRows(transactions.slice(0, 50)),
      recurringTasks: recurringTasks.map(t => ({
        description: maskPII(t.description ?? ''),
        value_cents: t.value_cents ?? toCentavos(t.value ?? 0),
        type: t.type ?? 'saida',
        category: t.category ?? 'Outros',
        dueDay: t.dueDay,
        active: t.active,
      })),
    };

    try {
      const fn     = getFunction('generateAuditReport', 60);
      const result = await fn({ financialContext: maskedContext });
      const data   = result.data as { reply?: string } | null;
      return data?.reply ?? '⚠️ Relatório vazio.';
    } catch (error) {
      const err = error as { code?: string; message?: string };
      console.error('[GeminiService] Erro no audit report:', err.message);
      if (err.code === 'functions/not-found') {
        return '⚠️ Cloud Function não deployada. Execute `firebase deploy --only functions`.';
      }
      return `🚨 Interferência quântica: ${err.message ?? 'Erro desconhecido'}`;
    }
  }

  // ── MOTOR 4 — Briefing Proativo por Período ───────────────────────────────
  static async generateProactiveBriefing(
    kpis:           { totalBalance: number; totalIncome: number; totalExpense: number },
    categoryData:   { name: string; value: number }[],
    timeRange:      string,
    forecast?:      { projectedBalance: number; minBalance: number; health: string },
    budgetContext?: string
  ): Promise<string> {
    const rangeLabel: Record<string, string> = {
      '7d': 'últimos 7 dias', '30d': 'últimos 30 dias',
      '90d': 'últimos 90 dias', 'all': 'todo o período disponível',
    };
    const periodo = rangeLabel[timeRange] ?? timeRange;

    const retencao = kpis.totalIncome > 0
      ? (((kpis.totalIncome - kpis.totalExpense) / kpis.totalIncome) * 100).toFixed(1)
      : '0.0';

    const topCats = categoryData.slice(0, 5)
      .map(c => `${c.name} (R$ ${c.value.toFixed(2)})`)
      .join(', ') || 'nenhuma despesa registrada';

    const forecastBlock = forecast ? [
      ``,
      `DADOS PREDITIVOS (próximos 30 dias):`,
      `• Saldo projetado ao final: R$ ${forecast.projectedBalance.toFixed(2)}`,
      `• Pior saldo previsto:      R$ ${forecast.minBalance.toFixed(2)}`,
      `• Saúde financeira:        ${forecast.health}`,
      ...(forecast.minBalance < 0 ? [
        `• CRÍTICO: modelo prevê caixa NEGATIVO. Corte imediato de gastos necessário.`,
      ] : []),
    ] : [];

    const budgetBlock = budgetContext ? [
      ``,
      `ALERTA DE ORÇAMENTOS:`,
      budgetContext,
    ] : [];

    const prompt = [
      `Você é um CFO pessoal especialista em finanças pessoais brasileiras.`,
      `Analise os dados financeiros reais do utilizador referentes aos ${periodo}:`,
      ``,
      `DADOS HISTÓRICOS DO PERÍODO:`,
      `• Saldo total acumulado: R$ ${kpis.totalBalance.toFixed(2)}`,
      `• Receitas no período:   R$ ${kpis.totalIncome.toFixed(2)}`,
      `• Despesas no período:   R$ ${kpis.totalExpense.toFixed(2)}`,
      `• Taxa de retenção:      ${retencao}%`,
      `• Maiores categorias de gasto: ${topCats}`,
      ...forecastBlock,
      ...budgetBlock,
      ``,
      `PRIORIDADE TÁTICA (ordem obrigatória):`,
      `1. Risco de saldo negativo (Crítico) — máxima prioridade.`,
      `2. Orçamentos excedidos (DANGER) — alerte e sugira corte na categoria específica.`,
      `3. Orçamentos próximos do limite (WARNING) — avise e recomende cautela.`,
      ``,
      `REGRA DE NÃO CONTRADIÇÃO: A matemática do sistema é SOBERANA. Use os dados fornecidos apenas para explicar a situação e sugerir uma ação prática. NUNCA contradiga o estado calculado — se o saldo projetado for negativo ou o orçamento estourar, a situação NÃO está sob controle.`,
      ``,
      `Escreva um briefing financeiro executivo em português (pt-BR), em exatamente 2 ou 3 frases curtas.`,
      `Tom: direto e acionável. Não use markdown, listas, asteriscos ou emojis. Não repita números literalmente — interprete-os.`,
    ].join('\n');

    try {
      const fn     = getFunction('chatWithQuantumAI', 30);
      const result = await fn({
        prompt,
        financialContext: {
          saldo:    kpis.totalBalance,
          entradas: kpis.totalIncome,
          saidas:   kpis.totalExpense,
        },
      });
      const data = result.data as { reply?: string } | null;
      const text = data?.reply?.trim() ?? '';
      if (!text) throw new Error('Resposta vazia');
      return text;
    } catch (error) {
      const err = error as { code?: string; message?: string };
      console.error('[GeminiService][proactiveBriefing]', err.message);
      throw error;
    }
  }

  // ── MOTOR 5 — Detecção Local de Anomalias (100% cliente) ──────────────────
  static detectAnomalies(
    currentMonthTxs: Transaction[] = [],
    historicalTxs:   Transaction[] = [],
    threshold        = 25
  ): AnomalyResult[] {
    try {
      const byMonth: Record<string, Record<string, number>> = {};
      historicalTxs.forEach(tx => {
        if (tx.type !== 'saida' && tx.type !== 'despesa') return;
        const d   = new Date(tx.date ?? '');
        const key = `${d.getFullYear()}-${d.getMonth()}`;
        if (!byMonth[key]) byMonth[key] = {};
        const cat = tx.category ?? 'Outros';
        byMonth[key]![cat] = (byMonth[key]![cat] ?? 0) + fromCentavos(getTransactionAbsCentavos(tx));
      });

      const months = Object.values(byMonth);
      if (!months.length) return [];

      const avgByCat: Record<string, number | number[]> = {};
      months.forEach(m => {
        Object.entries(m).forEach(([cat, val]) => {
          if (!avgByCat[cat]) avgByCat[cat] = [];
          (avgByCat[cat] as number[]).push(val);
        });
      });
      Object.keys(avgByCat).forEach(cat => {
        const vals = avgByCat[cat] as number[];
        avgByCat[cat] = vals.reduce((a, b) => a + b, 0) / vals.length;
      });

      const currentByCat: Record<string, number> = {};
      currentMonthTxs.forEach(tx => {
        if (tx.type !== 'saida' && tx.type !== 'despesa') return;
        const cat = tx.category ?? 'Outros';
        currentByCat[cat] = (currentByCat[cat] ?? 0) + fromCentavos(getTransactionAbsCentavos(tx));
      });

      return Object.entries(currentByCat)
        .map(([cat, current]) => {
          const avg   = avgByCat[cat] as number | undefined ?? 0;
          if (avg === 0) return null;
          const delta = ((current - avg) / avg) * 100;
          if (Math.abs(delta) < threshold) return null;
          return { cat, current, avg, delta: Math.round(delta) };
        })
        .filter((x): x is AnomalyResult => x !== null)
        .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    } catch (e) {
      console.error('[GeminiService] Erro na detecção de anomalias:', e);
      return [];
    }
  }
}
