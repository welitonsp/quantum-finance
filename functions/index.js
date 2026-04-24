/**
 * functions/index.js — Quantum Finance Cloud Functions v2
 * ──────────────────────────────────────────────────────────────────────────────
 * PROXY SEGURO PARA A API GEMINI — a chave fica exclusivamente no servidor.
 *
 * SETUP (executar uma vez):
 *   firebase functions:secrets:set GEMINI_API_KEY
 *
 * DEPLOY:
 *   cd functions && npm install
 *   firebase deploy --only functions
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret }       = require('firebase-functions/params');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const admin                  = require('firebase-admin');

admin.initializeApp();
const adminDb = admin.firestore();

const GEMINI_API_KEY  = defineSecret('GEMINI_API_KEY');
const DAILY_AI_LIMIT  = 50;
const MAX_BATCH_SIZE  = 100;
const MAX_PROMPT_LEN  = 4_000;

// ─── PII Masker (server-side second layer of defense) ────────────────────────

const CPF_RE      = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;
const CNPJ_RE     = /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g;
const EMAIL_RE    = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
const UUID_RE     = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const PHONE_RE    = /(?:\+?55[\s-]?)?(?:\(?\d{2}\)?[\s-]?)?\b9\d{4}[\s-]?\d{4}\b/g;
const PIX_PARA_RE = /\bpix\s+(?:para|envio|pgto|pag\.?|transf\.?)\s+[A-Za-zÀ-ÿ][\w\sÀ-ÿ'.]{2,39}/gi;
const PIX_DE_RE   = /\bpix\s+(?:de|rec(?:ebido)?\.?)\s+[A-Za-zÀ-ÿ][\w\sÀ-ÿ'.]{2,39}/gi;
const TRANSF_RE   = /\b(?:ted|doc)\s+(?:para|de)\s+[A-Za-zÀ-ÿ][\w\sÀ-ÿ'.]{2,39}/gi;

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

// ─── Persistent rate limiting (Firestore transaction — survives cold starts) ──

async function checkAndIncrementRateLimit(uid) {
  const ref   = adminDb.doc(`users/${uid}/usage/ai_calls`);
  const nowMs = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  try {
    return await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(ref);

      if (!snap.exists) {
        tx.set(ref, {
          count:     1,
          lastReset: admin.firestore.FieldValue.serverTimestamp(),
        });
        return true;
      }

      const data        = snap.data();
      const lastResetMs = data.lastReset?.toMillis?.() ?? 0;

      if (nowMs - lastResetMs > dayMs) {
        tx.update(ref, {
          count:     1,
          lastReset: admin.firestore.FieldValue.serverTimestamp(),
        });
        return true;
      }

      if ((data.count ?? 0) >= DAILY_AI_LIMIT) return false;

      tx.update(ref, { count: admin.firestore.FieldValue.increment(1) });
      return true;
    });
  } catch (e) {
    console.error('[RateLimit] Firestore transaction failed:', e.message);
    return true; // fail open — never block on rate-limit infrastructure errors
  }
}

// ─── Structured logging ───────────────────────────────────────────────────────

async function writeStructuredLog(uid, type, detail) {
  try {
    await adminDb.collection(`users/${uid}/system_logs`).add({
      type,
      detail,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (e) {
    console.warn('[StructuredLog] Write failed (non-critical):', e.message);
  }
}

// ─── Financial analysis helpers ───────────────────────────────────────────────

function groupByCategory(transactions = []) {
  const map = {};
  transactions.forEach(tx => {
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

function buildBurnRate(transactions = [], month, year) {
  const hoje      = new Date();
  const dia       = hoje.getDate();
  const diasNoMes = new Date(year, month, 0).getDate();
  const despesas  = transactions
    .filter(tx => {
      if (tx.type !== 'saida' && tx.type !== 'despesa') return false;
      const d = new Date(tx.date || '');
      return d.getMonth() + 1 === month && d.getFullYear() === year;
    })
    .reduce((a, tx) => a + Math.abs(Number(tx.value || 0)), 0);
  const ritmo = dia > 0 ? despesas / dia : 0;
  return {
    gastoAtual:    despesas.toFixed(2),
    ritmoDiario:   ritmo.toFixed(2),
    projecaoFinal: (ritmo * diasNoMes).toFixed(2),
    diasRestantes: diasNoMes - dia,
    mesDecorrido:  Math.round((dia / diasNoMes) * 100),
  };
}

// ─── Core: Gemini call ────────────────────────────────────────────────────────

async function callGemini(apiKey, fullPrompt, options = {}) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-1.5-flash',
    generationConfig: options.jsonMode
      ? { temperature: 0.1, responseMimeType: 'application/json' }
      : { temperature: 0.7 },
  });
  const result = await model.generateContent(fullPrompt);
  return result.response.text();
}

function buildFinancialContext(financialContext = {}) {
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

  const safeTx = (transactions || []).slice(0, 50).map(t => ({
    ...t, description: maskPII(t.description),
  }));

  return `
=== DADOS FINANCEIROS ===
Saldo: R$ ${Number(saldo).toFixed(2)} | Receitas: R$ ${Number(entradas).toFixed(2)} | Despesas: R$ ${Number(saidas).toFixed(2)}
Resultado: R$ ${(entradas - saidas).toFixed(2)}

=== BURN RATE ===
Gasto atual: R$ ${burn.gastoAtual} | Ritmo: R$ ${burn.ritmoDiario}/dia
Projeção fim do mês: R$ ${burn.projecaoFinal} | Dias restantes: ${burn.diasRestantes} | Mês: ${burn.mesDecorrido}%

=== RECORRENTES ===
Total fixo: R$ ${totalRec.toFixed(2)} | Risco: ${entradas > 0 ? ((totalRec / entradas) * 100).toFixed(1) : 'N/A'}% das receitas

=== TOP CATEGORIAS DE DESPESA ===
${groupByCategory(transactions)}

=== ÚLTIMAS TRANSAÇÕES (PII anonimizada) ===
${safeTx.map(t => `[${t.date}] ${t.type === 'entrada' ? '+' : '-'} R$ ${Number(t.value || 0).toFixed(2)} | ${t.category} | ${t.description}`).join('\n')}
`;
}

const SYSTEM_PERSONA = `Você é o QUANTUM, um CFO Pessoal de Elite e Auditor Financeiro Implacável.
REGRAS: Seja direto e objetivo. Foque em anomalias. Use alertas ("🔴 Alerta", "🟢 OK"). Formate em Markdown. Base-se APENAS nos dados fornecidos.`;

// ═══════════════════════════════════════════════════════════════════════════════
// FUNÇÃO 1 — Categorização em Batch
// ═══════════════════════════════════════════════════════════════════════════════
exports.categorizeTransactionsBatch = onCall(
  { secrets: [GEMINI_API_KEY], region: 'southamerica-east1', timeoutSeconds: 30 },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Acesso negado.');

    const uid = request.auth.uid;

    // Input validation
    const { transactions } = request.data;
    if (!Array.isArray(transactions)) {
      throw new HttpsError('invalid-argument', 'transactions deve ser um array.');
    }
    if (transactions.length === 0) return [];
    if (transactions.length > MAX_BATCH_SIZE) {
      throw new HttpsError('invalid-argument', `Máximo ${MAX_BATCH_SIZE} transações por lote.`);
    }

    // Persistent rate limit (survives cold starts)
    const allowed = await checkAndIncrementRateLimit(uid);
    if (!allowed) {
      void writeStructuredLog(uid, 'ERROR', `daily AI limit reached (${DAILY_AI_LIMIT}/day) — categorization blocked`);
      throw new HttpsError('resource-exhausted', `Limite diário de ${DAILY_AI_LIMIT} chamadas de IA atingido.`);
    }

    const safeRows = transactions
      .filter(t => t && typeof t.id === 'string' && typeof t.description === 'string')
      .map(t => ({
        id:          String(t.id).slice(0, 128),
        description: maskPII(String(t.description || '').slice(0, 256)),
        value:       Number(t.value) || 0,
      }));

    if (!safeRows.length) return [];

    const prompt = `Classifique cada transação em UMA das categorias: Alimentação, Transporte, Assinaturas, Educação, Saúde, Moradia, Impostos/Taxas, Lazer, Vestuário, Salário, Freelance, Investimento, Diversos, Outros.
Responda APENAS um array JSON: [{"id":"id","category":"Categoria"}].
Transações:\n${safeRows.map(t => `ID: ${t.id} | "${t.description}" | R$ ${t.value}`).join('\n')}`;

    try {
      let text = await callGemini(GEMINI_API_KEY.value(), prompt, { jsonMode: true });
      text = text.replace(/```json/gi, '').replace(/```/g, '').trim();

      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        // Gemini returned malformed JSON — safe fallback, never crash caller
        console.warn('[categorizeTransactionsBatch] JSON parse failed, returning safe defaults');
        void writeStructuredLog(uid, 'ERROR', 'batch categorization: malformed Gemini response');
        return safeRows.map(t => ({ id: t.id, category: 'Outros' }));
      }

      void writeStructuredLog(uid, 'BATCH', `categorized ${safeRows.length} transactions`);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.error('[categorizeTransactionsBatch] Gemini call failed:', e.message);
      void writeStructuredLog(uid, 'ERROR', `batch categorization failed: ${e.message}`);
      // Return safe defaults instead of throwing — UI must never crash on AI failure
      return safeRows.map(t => ({ id: t.id, category: 'Outros' }));
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// FUNÇÃO 2 — Chat / Auditor CFO Pessoal
// ═══════════════════════════════════════════════════════════════════════════════
exports.chatWithQuantumAI = onCall(
  { secrets: [GEMINI_API_KEY], region: 'southamerica-east1', timeoutSeconds: 60 },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Acesso negado.');

    const uid = request.auth.uid;

    const allowed = await checkAndIncrementRateLimit(uid);
    if (!allowed) {
      void writeStructuredLog(uid, 'ERROR', `daily AI limit reached — chat blocked`);
      throw new HttpsError('resource-exhausted', `Limite diário de ${DAILY_AI_LIMIT} chamadas de IA atingido.`);
    }

    const { prompt: userMessage, financialContext = {} } = request.data;
    if (!userMessage || typeof userMessage !== 'string') {
      throw new HttpsError('invalid-argument', 'Mensagem em falta ou inválida.');
    }
    if (userMessage.length > MAX_PROMPT_LEN) {
      throw new HttpsError('invalid-argument', `Mensagem excede ${MAX_PROMPT_LEN} caracteres.`);
    }

    const contextStr   = buildFinancialContext(financialContext);
    const maskedPrompt = maskPII(userMessage);
    const fullPrompt   = `${SYSTEM_PERSONA}\n\n${contextStr}\n\nPERGUNTA: "${maskedPrompt}"`;

    try {
      const reply = await callGemini(GEMINI_API_KEY.value(), fullPrompt);
      void writeStructuredLog(uid, 'AI_CALL', 'chat request completed');
      return { reply };
    } catch (e) {
      console.error('[chatWithQuantumAI] Gemini call failed:', e.message);
      void writeStructuredLog(uid, 'ERROR', `chat failed: ${e.message}`);
      throw new HttpsError('internal', 'Falha no núcleo de IA.');
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// FUNÇÃO 3 — Audit Report (Briefing Semanal Pró-Ativo)
// ═══════════════════════════════════════════════════════════════════════════════
exports.generateAuditReport = onCall(
  { secrets: [GEMINI_API_KEY], region: 'southamerica-east1', timeoutSeconds: 60 },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Acesso negado.');

    const uid = request.auth.uid;

    const allowed = await checkAndIncrementRateLimit(uid);
    if (!allowed) {
      void writeStructuredLog(uid, 'ERROR', `daily AI limit reached — audit blocked`);
      throw new HttpsError('resource-exhausted', `Limite diário de ${DAILY_AI_LIMIT} chamadas de IA atingido.`);
    }

    const financialContext = request.data?.financialContext ?? {};
    const contextStr = buildFinancialContext(financialContext);

    const auditPrompt = `${SYSTEM_PERSONA}\n\n${contextStr}\n\nTAREFA: Gera um RELATÓRIO DE AUDITORIA COMPLETO. Analisa burn rate, anomalias por categoria, risco de despesas fixas e faz uma previsão de saldo para fim do mês. Identifica os 3 maiores riscos. Usa bullet points organizados por secção. Sê brutalmente honesto.`;

    try {
      const reply = await callGemini(GEMINI_API_KEY.value(), auditPrompt);
      void writeStructuredLog(uid, 'AI_CALL', 'audit report generated');
      return { reply };
    } catch (e) {
      console.error('[generateAuditReport] Gemini call failed:', e.message);
      void writeStructuredLog(uid, 'ERROR', `audit report failed: ${e.message}`);
      throw new HttpsError('internal', 'Falha no motor de auditoria.');
    }
  }
);
