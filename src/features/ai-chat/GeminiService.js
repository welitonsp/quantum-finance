// src/features/ai-chat/GeminiService.js
// ─────────────────────────────────────────────────────────────────────────────
// ARQUITETURA DE SEGURANÇA:
//   • Fase 1 (atual): chave no VITE_GEMINI_API_KEY + PII masking local
//   • Fase 2 (produção): migrar para Firebase Cloud Function proxy
//     → A função `functions/index.js` já está preparada.
//     → Basta trocar `genAI.getGenerativeModel` por `httpsCallable(functions, 'chatWithQuantumAI')`
//     → e remover VITE_GEMINI_API_KEY do .env do cliente.
// ─────────────────────────────────────────────────────────────────────────────
import { GoogleGenerativeAI } from "@google/generative-ai";
import { maskPII, buildSafePromptRows } from '../../shared/lib/piiMasker';

const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
const genAI  = new GoogleGenerativeAI(apiKey);

// ─── Helper: agrupa despesas por categoria ────────────────────────────────────
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

// ─── Helper: calcula burn rate e projeção ─────────────────────────────────────
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

  const ritmoDiario   = diaAtual > 0 ? despesasMes / diaAtual : 0;
  const projecaoFinal = ritmoDiario * diasNoMes;
  const diasRestantes = diasNoMes - diaAtual;

  return {
    gastoAtual:            despesasMes.toFixed(2),
    ritmoDiario:           ritmoDiario.toFixed(2),
    projecaoFinal:         projecaoFinal.toFixed(2),
    diasRestantes,
    percentualMesDecorrido: Math.round((diaAtual / diasNoMes) * 100),
  };
}

export class GeminiService {

  // ─────────────────────────────────────────────────────────────────────────
  /**
   * 🤖 MOTOR 1 — Categorização Automática em Batch
   * Descrições são mascaradas (PII removida) antes do envio.
   */
  static async categorizeTransactionsBatch(transactions) {
    if (!transactions || transactions.length === 0) return [];
    try {
      const model = genAI.getGenerativeModel({
        model: "gemini-1.5-flash",
        generationConfig: { temperature: 0.1, responseMimeType: "application/json" }
      });

      // 🛡️ MASCARAMENTO DE PII — descrições anonimizadas antes de sair do browser
      const safeRows = buildSafePromptRows(transactions);

      const prompt = `Você é um analista financeiro sênior.
Classifique estas transações em exatamente uma das categorias: Alimentação, Transporte, Assinaturas, Educação, Saúde, Moradia, Impostos/Taxas, Lazer, Vestuário, Salário, Freelance, Investimento, Diversos, Outros.
Responda APENAS um array JSON: [{"id": "id", "category": "Categoria"}].
Transações:
${safeRows.map(t => `ID: ${t.id} | Descrição: "${t.description}" | Valor: R$ ${t.value}`).join('\n')}`;

      const result = await model.generateContent(prompt);
      let text = result.response.text();

      // 🛡️ Remove markdown code fences que a IA insere às vezes
      text = text.replace(/```json/gi, '').replace(/```/g, '').trim();

      return JSON.parse(text);
    } catch (error) {
      console.error("Erro na Categorização IA:", error);
      return [];
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  /**
   * 🧠 MOTOR 2 — Auditor Implacável / CFO Pessoal
   * Cruza dados reais para detetar anomalias, burn rate e risco de despesas fixas.
   * Todas as descrições de transações são mascaradas (PII removida).
   */
  static async getFinancialAdvice(message, financialContext) {
    try {
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

      const {
        saldo         = 0,
        entradas      = 0,
        saidas        = 0,
        transactions  = [],
        recurringTasks = [],
        currentMonth,
        currentYear,
      } = financialContext;

      const month = currentMonth || new Date().getMonth() + 1;
      const year  = currentYear  || new Date().getFullYear();

      // Calcular métricas derivadas
      const burnData       = calcBurnRate(transactions, month, year);
      const topCategorias  = groupByCategory(transactions).slice(0, 6);
      const totalRecorrentes = recurringTasks
        .filter(t => t.active !== false && t.type !== 'entrada')
        .reduce((acc, t) => acc + Math.abs(Number(t.value || 0)), 0);
      const riscoFixas = entradas > 0
        ? ((totalRecorrentes / entradas) * 100).toFixed(1)
        : 'N/A';

      // 🛡️ MASCARAMENTO: últimas 50 transações com PII removida
      const safeLastTx = buildSafePromptRows(transactions.slice(0, 50));

      const contextoFinanceiro = `
=== DADOS FINANCEIROS DO UTILIZADOR ===
Saldo Atual: R$ ${Number(saldo).toFixed(2)}
Receitas do Mês: R$ ${Number(entradas).toFixed(2)}
Despesas do Mês: R$ ${Number(saidas).toFixed(2)}
Resultado do Mês: R$ ${(entradas - saidas).toFixed(2)}

=== BURN RATE ===
Gasto Atual no Mês: R$ ${burnData.gastoAtual}
Ritmo Diário: R$ ${burnData.ritmoDiario}/dia
Projeção de Fim de Mês: R$ ${burnData.projecaoFinal}
Dias Restantes no Mês: ${burnData.diasRestantes}
Mês Decorrido: ${burnData.percentualMesDecorrido}%

=== DESPESAS FIXAS (RECORRENTES) ===
Total Mensal de Comprometimentos: R$ ${totalRecorrentes.toFixed(2)}
Risco de Comprometimento: ${riscoFixas}% das receitas
${recurringTasks.filter(t => t.active !== false).map(t => `- ${maskPII(t.description)}: R$ ${Number(t.value || 0).toFixed(2)}`).join('\n')}

=== TOP CATEGORIAS DE DESPESA ===
${topCategorias.map(c => `- ${c.cat}: R$ ${c.total}`).join('\n')}

=== ÚLTIMAS TRANSAÇÕES (50 mais recentes — PII anonimizada) ===
${safeLastTx.map(t => `[${t.date}] ${t.type === 'entrada' ? '+' : '-'} R$ ${Number(t.value || 0).toFixed(2)} | ${t.category} | ${t.description}`).join('\n')}
`;

      const systemPrompt = `Você é o QUANTUM, um CFO Pessoal de Elite e Auditor Financeiro Implacável.

REGRAS DE COMPORTAMENTO:
1. Seja DIRETO e OBJETIVO. Sem rodeios, sem elogios vazios.
2. Foque em ANOMALIAS: categorias com gasto excessivo, burn rate perigoso, risco de despesas fixas acima de 50% da renda.
3. Se o utilizador vai ficar sem dinheiro antes do fim do mês, diga CLARAMENTE.
4. Use linguagem técnica: "Alerta Vermelho", "Zona de Perigo", "Margem Segura".
5. Sempre baseie as suas respostas nos DADOS REAIS fornecidos.
6. Formate em Markdown com cabeçalhos claros.
7. Nunca invente dados que não estão no contexto.

${contextoFinanceiro}

PERGUNTA/PEDIDO DO UTILIZADOR: "${message}"`;

      const result = await model.generateContent(systemPrompt);
      return result.response.text();
    } catch (error) {
      console.error("Erro no Motor Auditor:", error);
      return "🚨 Interferência quântica. Sistemas offline temporariamente. Verifique a chave da API.";
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  /**
   * 🔍 MOTOR 3 — Análise Pró-Ativa (sem pergunta do utilizador)
   * Gera um briefing completo com anomalias, burn rate e previsão de saldo.
   */
  static async generateAuditReport(financialContext) {
    const auditPrompt = "Gera um RELATÓRIO DE AUDITORIA COMPLETO. Analisa TODAS as métricas: burn rate, anomalias por categoria, risco das despesas fixas, e faz uma previsão do saldo no fim do mês. Identifica os 3 maiores riscos financeiros. Sê brutalmente honesto e usa bullet points organizados.";
    return GeminiService.getFinancialAdvice(auditPrompt, financialContext);
  }

  // ─────────────────────────────────────────────────────────────────────────
  /**
   * 📊 MOTOR 4 — Detecção de Anomalias por Categoria
   * Compara mês atual vs média dos 3 meses anteriores por categoria.
   * Retorna lista de categorias com desvio > threshold%.
   */
  static async detectAnomalies(currentMonthTxs, historicalTxs, threshold = 25) {
    try {
      // Calcular média histórica por categoria (últimos 3 meses)
      const historicalByMonth = {};
      historicalTxs.forEach(tx => {
        if (tx.type !== 'saida' && tx.type !== 'despesa') return;
        const d   = new Date(tx.date || tx.createdAt);
        const key = `${d.getFullYear()}-${d.getMonth()}`;
        if (!historicalByMonth[key]) historicalByMonth[key] = {};
        const cat = tx.category || 'Outros';
        historicalByMonth[key][cat] = (historicalByMonth[key][cat] || 0) + Math.abs(Number(tx.value || 0));
      });

      const months = Object.values(historicalByMonth);
      if (months.length === 0) return [];

      const avgByCat = {};
      months.forEach(m => {
        Object.entries(m).forEach(([cat, val]) => {
          if (!avgByCat[cat]) avgByCat[cat] = [];
          avgByCat[cat].push(val);
        });
      });
      Object.keys(avgByCat).forEach(cat => {
        const vals  = avgByCat[cat];
        avgByCat[cat] = vals.reduce((a, b) => a + b, 0) / vals.length;
      });

      // Calcular totais do mês atual
      const currentByCat = {};
      currentMonthTxs.forEach(tx => {
        if (tx.type !== 'saida' && tx.type !== 'despesa') return;
        const cat = tx.category || 'Outros';
        currentByCat[cat] = (currentByCat[cat] || 0) + Math.abs(Number(tx.value || 0));
      });

      // Detectar desvios
      const anomalies = [];
      Object.entries(currentByCat).forEach(([cat, current]) => {
        const avg   = avgByCat[cat] || 0;
        if (avg === 0) return;
        const delta = ((current - avg) / avg) * 100;
        if (Math.abs(delta) >= threshold) {
          anomalies.push({ cat, current, avg, delta: Math.round(delta) });
        }
      });

      return anomalies.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    } catch (e) {
      console.error('Erro na detecção de anomalias:', e);
      return [];
    }
  }
}
