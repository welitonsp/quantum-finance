// src/features/ai-chat/GeminiService.js
// ─────────────────────────────────────────────────────────────────────────────
// ARQUITECTURA DE SEGURANÇA (Fase 1 — completa):
//   • Chamadas ao Gemini passam por Firebase Cloud Functions (southamerica-east1)
//   • A chave da API fica EXCLUSIVAMENTE no servidor (defineSecret)
//   • PII Masking aplicado no cliente antes do envio (defense-in-depth)
//   • PII Masking reaplicado no servidor (segunda camada)
//   • VITE_GEMINI_API_KEY removida do cliente
// ─────────────────────────────────────────────────────────────────────────────
import { httpsCallable } from 'firebase/functions';
import { functions }     from '../../shared/api/firebase/index.js';
import { maskPII, buildSafePromptRows } from '../../shared/lib/piiMasker';

// ─── Helpers locais de análise (rodam no cliente, não envolvem dados externos) ─
function groupByCategory(transactions) {
  const map = {};
  transactions.forEach(tx => {
    if (tx.type !== 'saida' && tx.type !== 'despesa') return;
    const cat = tx.category || 'Outros';
    map[cat] = (map[cat] || 0) + Math.abs(Number(tx.value || 0));
  });
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, total]) => ({ cat, total: total.toFixed(2) }));
}

function calcBurnRate(transactions, currentMonth, currentYear) {
  const hoje      = new Date();
  const diaAtual  = hoje.getDate();
  const diasNoMes = new Date(currentYear, currentMonth, 0).getDate();
  const despesasMes = transactions
    .filter(tx => {
      if (tx.type !== 'saida' && tx.type !== 'despesa') return false;
      const d = new Date(tx.date || tx.createdAt);
      return d.getMonth() + 1 === currentMonth && d.getFullYear() === currentYear;
    })
    .reduce((acc, tx) => acc + Math.abs(Number(tx.value || 0)), 0);
  const ritmoDiario = diaAtual > 0 ? despesasMes / diaAtual : 0;
  return {
    gastoAtual:             despesasMes.toFixed(2),
    ritmoDiario:            ritmoDiario.toFixed(2),
    projecaoFinal:          (ritmoDiario * diasNoMes).toFixed(2),
    diasRestantes:          diasNoMes - diaAtual,
    percentualMesDecorrido: Math.round((diaAtual / diasNoMes) * 100),
  };
}

// ─── Wrapper seguro de httpsCallable com timeout e error handling ─────────────
function getFunction(name, timeoutSeconds = 30) {
  return httpsCallable(functions, name, { timeout: timeoutSeconds * 1000 });
}

export class GeminiService {

  // ─────────────────────────────────────────────────────────────────────────
  /**
   * 🤖 MOTOR 1 — Categorização Automática em Batch
   * Descrições mascaradas client-side antes do envio.
   * Server aplica segunda camada de masking.
   */
  static async categorizeTransactionsBatch(transactions) {
    if (!transactions?.length) return [];

    // 🛡️ PII Masking local (defense-in-depth)
    const safeRows = buildSafePromptRows(transactions);

    try {
      const fn     = getFunction('categorizeTransactionsBatch');
      const result = await fn({ transactions: safeRows });
      return Array.isArray(result.data) ? result.data : [];
    } catch (error) {
      // Codes específicos do Firebase Functions
      if (error.code === 'functions/unauthenticated') {
        console.error('[GeminiService] Utilizador não autenticado para chamar a Function.');
      } else if (error.code === 'functions/not-found') {
        console.warn('[GeminiService] Cloud Function não encontrada. Deploy pendente?');
      } else {
        console.error('[GeminiService] Erro na categorização:', error.message);
      }
      return [];
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  /**
   * 🧠 MOTOR 2 — Auditor Implacável / CFO Pessoal
   * Constrói contexto localmente, mascara PII, envia apenas dados anónimos.
   */
  static async getFinancialAdvice(message, financialContext) {
    const {
      saldo         = 0,
      entradas      = 0,
      saidas        = 0,
      transactions  = [],
      recurringTasks = [],
      currentMonth,
      currentYear,
    } = financialContext;

    // 🛡️ Mascara PII antes de enviar qualquer dado à Function
    const maskedContext = {
      saldo,
      entradas,
      saidas,
      currentMonth: currentMonth || new Date().getMonth() + 1,
      currentYear:  currentYear  || new Date().getFullYear(),
      // Últimas 50 transações com descrições mascaradas
      transactions:   buildSafePromptRows(transactions.slice(0, 50)),
      recurringTasks: recurringTasks.map(t => ({
        ...t,
        description: maskPII(t.description),
        value:       t.value,
      })),
    };

    try {
      const fn     = getFunction('chatWithQuantumAI', 60);
      const result = await fn({ prompt: message, financialContext: maskedContext });
      return result.data?.reply ?? '⚠️ Resposta vazia do servidor.';
    } catch (error) {
      console.error('[GeminiService] Erro no motor auditor:', error.message);
      if (error.code === 'functions/not-found') {
        return '⚠️ Cloud Function não está deployada ainda. Execute `firebase deploy --only functions` para activar o Auditor IA.';
      }
      return `🚨 Interferência quântica: ${error.message}`;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  /**
   * 🔍 MOTOR 3 — Análise Pró-Ativa (sem pergunta do utilizador)
   * Briefing completo com anomalias, burn rate e previsão de saldo.
   */
  static async generateAuditReport(financialContext) {
    const {
      transactions  = [],
      recurringTasks = [],
      saldo = 0, entradas = 0, saidas = 0,
      currentMonth, currentYear,
    } = financialContext;

    const maskedContext = {
      saldo, entradas, saidas,
      currentMonth: currentMonth || new Date().getMonth() + 1,
      currentYear:  currentYear  || new Date().getFullYear(),
      transactions:   buildSafePromptRows(transactions.slice(0, 50)),
      recurringTasks: recurringTasks.map(t => ({
        ...t, description: maskPII(t.description),
      })),
    };

    try {
      const fn     = getFunction('generateAuditReport', 60);
      const result = await fn({ financialContext: maskedContext });
      return result.data?.reply ?? '⚠️ Relatório vazio.';
    } catch (error) {
      console.error('[GeminiService] Erro no audit report:', error.message);
      if (error.code === 'functions/not-found') {
        return '⚠️ Cloud Function não deployada. Execute `firebase deploy --only functions`.';
      }
      return `🚨 Interferência quântica: ${error.message}`;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  /**
   * 📊 MOTOR 4 — Detecção Local de Anomalias por Categoria
   * Corre 100% no cliente — compara mês atual vs média histórica.
   * Não envia dados à API.
   */
  static detectAnomalies(currentMonthTxs = [], historicalTxs = [], threshold = 25) {
    try {
      const byMonth = {};
      historicalTxs.forEach(tx => {
        if (tx.type !== 'saida' && tx.type !== 'despesa') return;
        const d   = new Date(tx.date || '');
        const key = `${d.getFullYear()}-${d.getMonth()}`;
        if (!byMonth[key]) byMonth[key] = {};
        const cat = tx.category || 'Outros';
        byMonth[key][cat] = (byMonth[key][cat] || 0) + Math.abs(Number(tx.value || 0));
      });

      const months = Object.values(byMonth);
      if (!months.length) return [];

      const avgByCat = {};
      months.forEach(m => {
        Object.entries(m).forEach(([cat, val]) => {
          if (!avgByCat[cat]) avgByCat[cat] = [];
          avgByCat[cat].push(val);
        });
      });
      Object.keys(avgByCat).forEach(cat => {
        const vals = avgByCat[cat];
        avgByCat[cat] = vals.reduce((a, b) => a + b, 0) / vals.length;
      });

      const currentByCat = {};
      currentMonthTxs.forEach(tx => {
        if (tx.type !== 'saida' && tx.type !== 'despesa') return;
        const cat = tx.category || 'Outros';
        currentByCat[cat] = (currentByCat[cat] || 0) + Math.abs(Number(tx.value || 0));
      });

      return Object.entries(currentByCat)
        .map(([cat, current]) => {
          const avg   = avgByCat[cat] || 0;
          if (avg === 0) return null;
          const delta = ((current - avg) / avg) * 100;
          if (Math.abs(delta) < threshold) return null;
          return { cat, current, avg, delta: Math.round(delta) };
        })
        .filter(Boolean)
        .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    } catch (e) {
      console.error('[GeminiService] Erro na detecção de anomalias:', e);
      return [];
    }
  }
}
