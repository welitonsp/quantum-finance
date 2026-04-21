// src/features/ai-chat/GeminiService.ts
// Firebase Cloud Functions proxy — chave da API fica exclusivamente no servidor.
import { httpsCallable } from 'firebase/functions';
import { functions }     from '../../shared/api/firebase/index';
import { maskPII, buildSafePromptRows } from '../../shared/lib/piiMasker';
import type { Transaction } from '../../shared/types/transaction';
import type { RecurringTask } from '../../shared/types/transaction';

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
        ...t,
        description: maskPII(t.description ?? ''),
        value:       t.value,
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
        ...t, description: maskPII(t.description ?? ''),
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

  // ── MOTOR 4 — Detecção Local de Anomalias (100% cliente) ──────────────────
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
        byMonth[key]![cat] = (byMonth[key]![cat] ?? 0) + Math.abs(Number(tx.value ?? 0));
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
        currentByCat[cat] = (currentByCat[cat] ?? 0) + Math.abs(Number(tx.value ?? 0));
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
