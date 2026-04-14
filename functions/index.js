/**
 * functions/index.js — Quantum Finance Cloud Functions
 * ──────────────────────────────────────────────────────────────────────────────
 * PROXY DE SEGURANÇA PARA A API GEMINI
 * A chave da API fica APENAS no servidor. O cliente nunca a vê.
 *
 * SETUP (uma vez):
 *   firebase functions:secrets:set GEMINI_API_KEY
 *   (ou: firebase functions:config:set gemini.key="SUA_CHAVE")
 *
 * DEPLOY:
 *   cd functions && npm install
 *   firebase deploy --only functions
 *
 * MIGRAÇÃO DO CLIENTE:
 *   Substituir chamadas diretas ao GoogleGenerativeAI por:
 *   import { getFunctions, httpsCallable } from 'firebase/functions';
 *   const fn = httpsCallable(getFunctions(), 'chatWithQuantumAI');
 *   const { data } = await fn({ prompt, financialContext });
 */

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret }       = require("firebase-functions/params");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");

// ─── PII Masker (server-side — camada de segurança dupla) ──────────────────────
const CPF_RE      = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;
const CNPJ_RE     = /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g;
const EMAIL_RE    = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
const UUID_RE     = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const PHONE_RE    = /(?:\+?55[\s-]?)?(?:\(?\d{2}\)?[\s-]?)?\b9\d{4}[\s-]?\d{4}\b/g;
const PIX_PARA_RE = /\bpix\s+(?:para|envio|pgto|pag\.?|transf\.?)\s+[A-Za-z\u00C0-\u00FF][\w\s\u00C0-\u00FF'.]{2,39}/gi;
const PIX_DE_RE   = /\bpix\s+(?:de|rec(?:ebido)?\.?)\s+[A-Za-z\u00C0-\u00FF][\w\s\u00C0-\u00FF'.]{2,39}/gi;
const TRANSF_RE   = /\b(?:ted|doc)\s+(?:para|de)\s+[A-Za-z\u00C0-\u00FF][\w\s\u00C0-\u00FF'.]{2,39}/gi;

function maskPII(text) {
  if (!text || typeof text !== 'string') return text ?? '';
  return text
    .replace(CPF_RE,      '[CPF]')
    .replace(CNPJ_RE,     '[CNPJ]')
    .replace(EMAIL_RE,    '[EMAIL]')
    .replace(UUID_RE,     '[CHAVE-PIX]')
    .replace(PHONE_RE,    '[FONE]')
    .replace(PIX_PARA_RE, 'PIX ENVIADO')
    .replace(PIX_DE_RE,   'PIX RECEBIDO')
    .replace(TRANSF_RE,   'TRANSFERENCIA BANCARIA');
}

// ─── Rate limiting simples (per-user, in-memory) ───────────────────────────────
const callCount = new Map();
const RATE_LIMIT = 30; // chamadas por janela
const RATE_WINDOW_MS = 60 * 1000; // 1 minuto

function checkRateLimit(uid) {
  const now  = Date.now();
  const rec  = callCount.get(uid);
  if (!rec || now - rec.windowStart > RATE_WINDOW_MS) {
    callCount.set(uid, { count: 1, windowStart: now });
    return true;
  }
  if (rec.count >= RATE_LIMIT) return false;
  rec.count++;
  return true;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────
function groupByCategory(transactions) {
  const map = {};
  (transactions || []).forEach(tx => {
    if (tx.type !== 'saida' && tx.type !== 'despesa') return;
    const cat = tx.category || 'Outros';
    map[cat] = (map[cat] || 0) + Math.abs(Number(tx.value || 0));
  });
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([cat, total]) => `- ${cat}: R$ ${total.toFixed(2)}`)
    .join('\n');
}

function buildBurnRate(transactions, month, year) {
  const hoje      = new Date();
  const diaAtual  = hoje.getDate();
  const diasNoMes = new Date(year, month, 0).getDate();
  const despesas  = (transactions || [])
    .filter(tx => {
      if (tx.type !== 'saida' && tx.type !== 'despesa') return false;
      const d = new Date(tx.date || '');
      return d.getMonth() + 1 === month && d.getFullYear() === year;
    })
    .reduce((a, tx) => a + Math.abs(Number(tx.value || 0)), 0);
  const ritmo     = diaAtual > 0 ? despesas / diaAtual : 0;
  return {
    gastoAtual:    despesas.toFixed(2),
    ritmoDiario:   ritmo.toFixed(2),
    projecaoFinal: (ritmo * diasNoMes).toFixed(2),
    diasRestantes: diasNoMes - diaAtual,
    mesDecorrido:  Math.round((diaAtual / diasNoMes) * 100),
  };
}

// ─── FUNÇÃO 1: Categorização em Batch ─────────────────────────────────────────
exports.categorizeTransactionsBatch = onCall(
  { secrets: [GEMINI_API_KEY], region: "southamerica-east1" },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Acesso negado.");
    if (!checkRateLimit(request.auth.uid)) throw new HttpsError("resource-exhausted", "Limite de requisições atingido.");

    const { transactions } = request.data;
    if (!Array.isArray(transactions) || transactions.length === 0) return [];

    try {
      const genAI = new GoogleGenerativeAI(GEMINI_API_KEY.value());
      const model = genAI.getGenerativeModel({
        model: "gemini-1.5-flash",
        generationConfig: { temperature: 0.1, responseMimeType: "application/json" },
      });

      // 🛡️ Mascaramento server-side (dupla camada de segurança)
      const safeRows = transactions.map(t => ({
        id:          t.id,
        description: maskPII(t.description),
        value:       t.value,
      }));

      const prompt = `Classifique estas transações em exatamente uma das categorias: Alimentação, Transporte, Assinaturas, Educação, Saúde, Moradia, Impostos/Taxas, Lazer, Vestuário, Salário, Freelance, Investimento, Diversos, Outros.
Responda APENAS um array JSON: [{"id":"id","category":"Categoria"}].
Transações:\n${safeRows.map(t => `ID: ${t.id} | "${t.description}" | R$ ${t.value}`).join('\n')}`;

      const result = await model.generateContent(prompt);
      let text = result.response.text().replace(/```json/gi, '').replace(/```/g, '').trim();
      return JSON.parse(text);
    } catch (e) {
      console.error("Erro categorização:", e);
      throw new HttpsError("internal", "Falha no motor de categorização.");
    }
  }
);

// ─── FUNÇÃO 2: Chat / Auditor CFO ─────────────────────────────────────────────
exports.chatWithQuantumAI = onCall(
  { secrets: [GEMINI_API_KEY], region: "southamerica-east1" },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Acesso negado.");
    if (!checkRateLimit(request.auth.uid)) throw new HttpsError("resource-exhausted", "Limite de requisições atingido.");

    const { prompt: userMessage, financialContext = {} } = request.data;
    if (!userMessage) throw new HttpsError("invalid-argument", "Mensagem em falta.");

    const {
      saldo = 0, entradas = 0, saidas = 0,
      transactions = [], recurringTasks = [],
      currentMonth, currentYear,
    } = financialContext;

    const month = currentMonth || new Date().getMonth() + 1;
    const year  = currentYear  || new Date().getFullYear();
    const burn  = buildBurnRate(transactions, month, year);
    const totalRec = (recurringTasks || [])
      .filter(t => t.active !== false && t.type !== 'entrada')
      .reduce((a, t) => a + Math.abs(Number(t.value || 0)), 0);

    // 🛡️ Mascaramento server-side de todas as descrições
    const safeTx = (transactions || []).slice(0, 50).map(t => ({
      ...t,
      description: maskPII(t.description),
    }));

    const context = `
=== DADOS FINANCEIROS ===
Saldo: R$ ${Number(saldo).toFixed(2)} | Receitas: R$ ${Number(entradas).toFixed(2)} | Despesas: R$ ${Number(saidas).toFixed(2)}
Resultado: R$ ${(entradas - saidas).toFixed(2)}

=== BURN RATE ===
Gasto atual: R$ ${burn.gastoAtual} | Ritmo: R$ ${burn.ritmoDiario}/dia
Projeção fim do mês: R$ ${burn.projecaoFinal} | Dias restantes: ${burn.diasRestantes} | Mês: ${burn.mesDecorrido}%

=== RECORRENTES ===
Total: R$ ${totalRec.toFixed(2)} | Risco: ${entradas > 0 ? ((totalRec / entradas) * 100).toFixed(1) : 'N/A'}% das receitas

=== TOP CATEGORIAS ===
${groupByCategory(transactions)}

=== ÚLTIMAS TRANSAÇÕES (PII anonimizada) ===
${safeTx.map(t => `[${t.date}] ${t.type === 'entrada' ? '+' : '-'} R$ ${Number(t.value || 0).toFixed(2)} | ${t.category} | ${t.description}`).join('\n')}
`;

    try {
      const genAI = new GoogleGenerativeAI(GEMINI_API_KEY.value());
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

      const fullPrompt = `Você é o QUANTUM, um CFO Pessoal de Elite. Seja direto, use Markdown, baseie-se apenas nos dados reais.
Use alertas como "🔴 Alerta Vermelho" ou "🟢 Margem Segura" conforme o contexto.

${context}

PERGUNTA: "${maskPII(userMessage)}"`;

      const result = await model.generateContent(fullPrompt);
      return { reply: result.response.text() };
    } catch (e) {
      console.error("Erro Gemini:", e);
      throw new HttpsError("internal", "Falha no núcleo de IA.");
    }
  }
);

// ─── FUNÇÃO 3: Audit Report (Briefing Semanal Pró-Ativo) ──────────────────────
exports.generateAuditReport = onCall(
  { secrets: [GEMINI_API_KEY], region: "southamerica-east1" },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Acesso negado.");
    if (!checkRateLimit(request.auth.uid)) throw new HttpsError("resource-exhausted", "Limite de requisições atingido.");

    const data = { prompt: "Gera um RELATÓRIO DE AUDITORIA COMPLETO: burn rate, anomalias por categoria, risco das despesas fixas, previsão do saldo no fim do mês. Identifica os 3 maiores riscos. Sê brutalmente honesto. Usa bullet points.", financialContext: request.data.financialContext };
    return exports.chatWithQuantumAI.run({ ...request, data });
  }
);
