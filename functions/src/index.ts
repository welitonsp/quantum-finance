/**
 * functions/src/index.ts — Quantum Finance Cloud Functions v2 (TypeScript)
 *
 * SETUP (executar uma vez):
 *   firebase functions:secrets:set GEMINI_API_KEY
 *
 * DEPLOY:
 *   cd functions && npm run build
 *   firebase deploy --only functions
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as admin from 'firebase-admin';
import {
  CreateTransactionValidationError,
  validateCreateTransactionPayload,
} from './createTransactionValidation';
import { maskPII } from './lib/piiMasker';
import {
  centsToReais,
  safeCategory,
  toSafeCategorizationPromptId,
  txCents,
} from './lib/financialUtils';
import { safeSystemLogDetail, sanitizeFunctionError } from './lib/logger';

admin.initializeApp();
const adminDb = admin.firestore();

// ─── Shared constants ─────────────────────────────────────────────────────────
const REGION         = 'southamerica-east1';
const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY');
const DAILY_AI_LIMIT = 50;
const MAX_BATCH_SIZE = 100;
const MAX_PROMPT_LEN = 4_000;
const IDEM_KEY_RE    = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const CORS_ORIGINS: (string | RegExp)[] = [
  'http://localhost:5173',
  'http://localhost:5174',
  'https://quantum-finance-39235.web.app',
  'https://quantum-finance-39235.firebaseapp.com',
  /https:\/\/quantum-finance[^.]*\.vercel\.app$/,
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function checkAndIncrementRateLimit(uid: string): Promise<boolean> {
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

      const data        = snap.data()!;
      const lastResetMs = (data['lastReset'] as admin.firestore.Timestamp | undefined)?.toMillis?.() ?? 0;

      if (nowMs - lastResetMs > dayMs) {
        tx.update(ref, {
          count:     1,
          lastReset: admin.firestore.FieldValue.serverTimestamp(),
        });
        return true;
      }

      if ((data['count'] as number ?? 0) >= DAILY_AI_LIMIT) return false;

      tx.update(ref, { count: admin.firestore.FieldValue.increment(1) });
      return true;
    });
  } catch (e) {
    console.error('[FunctionError]', sanitizeFunctionError('rate_limit_check', e));
    return false;
  }
}

async function writeStructuredLog(uid: string, type: string, detail: string): Promise<void> {
  try {
    await adminDb.collection(`users/${uid}/system_logs`).add({
      type,
      detail,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (e) {
    console.warn('[FunctionWarning]', sanitizeFunctionError('structured_log_write', e));
  }
}

interface TxLike {
  type?: string;
  category?: string;
  date?: string;
  description?: string;
  value_cents?: number;
  value?: number;
}

function groupByCategory(transactions: TxLike[] = []): string {
  const map: Record<string, number> = {};
  transactions.forEach(tx => {
    if (tx.type !== 'saida' && tx.type !== 'despesa') return;
    const cat = tx.category ?? 'Outros';
    map[cat] = (map[cat] ?? 0) + txCents(tx);
  });
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([cat, total]) => `- ${safeCategory(cat)}: R$ ${centsToReais(total).toFixed(2)}`)
    .join('\n');
}

function buildBurnRate(transactions: TxLike[] = [], month: number, year: number) {
  const hoje      = new Date();
  const dia       = hoje.getDate();
  const diasNoMes = new Date(year, month, 0).getDate();
  const despesas  = transactions
    .filter(tx => {
      if (tx.type !== 'saida' && tx.type !== 'despesa') return false;
      const d = new Date(tx.date ?? '');
      return d.getMonth() + 1 === month && d.getFullYear() === year;
    })
    .reduce((a, tx) => a + txCents(tx), 0);
  const ritmo = dia > 0 ? Math.round(despesas / dia) : 0;
  return {
    gastoAtual:    centsToReais(despesas).toFixed(2),
    ritmoDiario:   centsToReais(ritmo).toFixed(2),
    projecaoFinal: centsToReais(ritmo * diasNoMes).toFixed(2),
    diasRestantes: diasNoMes - dia,
    mesDecorrido:  Math.round((dia / diasNoMes) * 100),
  };
}

async function callGemini(
  apiKey: string,
  fullPrompt: string,
  options: { jsonMode?: boolean } = {},
): Promise<string> {
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

interface RawFinancialContext {
  saldo?: unknown;
  entradas?: unknown;
  saidas?: unknown;
  currentMonth?: unknown;
  currentYear?: unknown;
  transactions?: unknown;
  recurringTasks?: unknown;
}

interface SanitizedFinancialContext {
  saldo: number;
  entradas: number;
  saidas: number;
  currentMonth?: number;
  currentYear?: number;
  transactions: TxLike[];
  recurringTasks: TxLike[];
}

function sanitizeFinancialContext(raw: unknown): SanitizedFinancialContext {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { saldo: 0, entradas: 0, saidas: 0, transactions: [], recurringTasks: [] };
  }
  const r = raw as RawFinancialContext;
  return {
    saldo:          typeof r.saldo    === 'number' ? r.saldo    : 0,
    entradas:       typeof r.entradas === 'number' ? r.entradas : 0,
    saidas:         typeof r.saidas   === 'number' ? r.saidas   : 0,
    currentMonth:
      Number.isInteger(r.currentMonth) &&
      (r.currentMonth as number) >= 1 &&
      (r.currentMonth as number) <= 12
        ? (r.currentMonth as number)
        : undefined,
    currentYear:
      Number.isInteger(r.currentYear) &&
      (r.currentYear as number) >= 2000 &&
      (r.currentYear as number) <= 2100
        ? (r.currentYear as number)
        : undefined,
    transactions:   Array.isArray(r.transactions)   ? (r.transactions   as TxLike[]).slice(0, 50) : [],
    recurringTasks: Array.isArray(r.recurringTasks) ? (r.recurringTasks as TxLike[]).slice(0, 50) : [],
  };
}

function buildFinancialContext(ctx: SanitizedFinancialContext): string {
  const {
    saldo = 0, entradas = 0, saidas = 0,
    transactions = [], recurringTasks = [],
    currentMonth, currentYear,
  } = ctx;
  const month = currentMonth ?? new Date().getMonth() + 1;
  const year  = currentYear  ?? new Date().getFullYear();
  const burn  = buildBurnRate(transactions, month, year);

  const totalRec = recurringTasks
    .filter(t => (t as { active?: boolean }).active !== false && t.type !== 'entrada')
    .reduce((a, t) => a + txCents(t), 0);

  const safeTx = transactions.slice(0, 50).map(t => ({
    ...t, description: maskPII(t.description ?? ''),
  }));

  return `
=== DADOS FINANCEIROS ===
Saldo: R$ ${Number(saldo).toFixed(2)} | Receitas: R$ ${Number(entradas).toFixed(2)} | Despesas: R$ ${Number(saidas).toFixed(2)}
Resultado: R$ ${(entradas - saidas).toFixed(2)}

=== BURN RATE ===
Gasto atual: R$ ${burn.gastoAtual} | Ritmo: R$ ${burn.ritmoDiario}/dia
Projeção fim do mês: R$ ${burn.projecaoFinal} | Dias restantes: ${burn.diasRestantes} | Mês: ${burn.mesDecorrido}%

=== RECORRENTES ===
Total fixo: R$ ${centsToReais(totalRec).toFixed(2)} | Risco: ${entradas > 0 ? ((centsToReais(totalRec) / entradas) * 100).toFixed(1) : 'N/A'}% das receitas

=== TOP CATEGORIAS DE DESPESA ===
${groupByCategory(transactions)}

=== ÚLTIMAS TRANSAÇÕES (PII anonimizada) ===
${safeTx.map(t => `[${t.date ?? ''}] ${t.type === 'entrada' ? '+' : '-'} R$ ${centsToReais(txCents(t)).toFixed(2)} | ${safeCategory(t.category ?? 'Outros')} | ${t.description ?? ''}`).join('\n')}
`;
}

const SYSTEM_PERSONA = `Você é o QUANTUM, um CFO Pessoal de Elite e Auditor Financeiro Implacável.
REGRAS: Seja direto e objetivo. Foque em anomalias. Use alertas ("🔴 Alerta", "🟢 OK"). Formate em Markdown. Base-se APENAS nos dados fornecidos.`;

// ═══════════════════════════════════════════════════════════════════════════════
// FUNÇÃO 0 — createTransaction (server-trusted — auditoria atômica)
// ═══════════════════════════════════════════════════════════════════════════════
export const createTransaction = onCall(
  {
    region: REGION,
    timeoutSeconds: 30,
    enforceAppCheck: true,
    consumeAppCheckToken: true,
    cors: CORS_ORIGINS,
  },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Acesso negado.');
    if (request.app?.alreadyConsumed) throw new HttpsError('permission-denied', 'Requisição duplicada rejeitada.');

    const uid        = request.auth.uid;
    const rawPayload = request.data as Record<string, unknown>;
    if (!rawPayload || typeof rawPayload !== 'object' || Array.isArray(rawPayload)) {
      throw new HttpsError('invalid-argument', 'Payload deve ser um objeto JSON.');
    }

    const idempotencyKey =
      typeof rawPayload['idempotencyKey'] === 'string' &&
      IDEM_KEY_RE.test(rawPayload['idempotencyKey'] as string)
        ? (rawPayload['idempotencyKey'] as string)
        : null;

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { idempotencyKey: _stripped, ...financialPayload } = rawPayload;

    let data: ReturnType<typeof validateCreateTransactionPayload>;
    try {
      data = validateCreateTransactionPayload(financialPayload);
    } catch (error) {
      if (error instanceof CreateTransactionValidationError) {
        throw new HttpsError('invalid-argument', error.message);
      }
      throw error;
    }

    // Fast-path: check idempotency before writing
    if (idempotencyKey) {
      const idemRef  = adminDb.doc(`users/${uid}/idempotency/${idempotencyKey}`);
      const idemSnap = await idemRef.get();
      if (idemSnap.exists) {
        return { id: (idemSnap.data()!['txId'] as string) };
      }
    }

    const descriptionLower = data.description.trim().toLowerCase();
    const txRef   = adminDb.collection(`users/${uid}/transactions`).doc();
    const histRef = adminDb
      .collection(`users/${uid}/transactions`)
      .doc(txRef.id)
      .collection('history')
      .doc();

    const txPayload = {
      description:   data.description,
      descriptionLower,
      value_cents:   data.value_cents,
      type:          data.type,
      category:      data.category,
      date:          data.date,
      source:        data.source,
      schemaVersion: 2,
      fitId:         data.fitId,
      tags:          data.tags,
      isRecurring:   data.isRecurring,
      createdAt:     admin.firestore.FieldValue.serverTimestamp(),
      updatedAt:     admin.firestore.FieldValue.serverTimestamp(),
      ...(data.account   !== undefined ? { account:   data.account   } : {}),
      ...(data.accountId !== undefined ? { accountId: data.accountId } : {}),
      ...(data.cardId    !== undefined ? { cardId:    data.cardId    } : {}),
    };

    const afterSnapshot: Record<string, unknown> = {
      description:   data.description,
      descriptionLower,
      value_cents:   data.value_cents,
      schemaVersion: 2,
      type:          data.type,
      category:      data.category,
      date:          data.date,
      source:        data.source,
      isRecurring:   data.isRecurring,
      ...(data.fitId     !== null      ? { fitId:     data.fitId     } : {}),
      ...(data.tags.length > 0         ? { tags:      data.tags      } : {}),
      ...(data.account   !== undefined ? { account:   data.account   } : {}),
      ...(data.accountId !== undefined ? { accountId: data.accountId } : {}),
      ...(data.cardId    !== undefined ? { cardId:    data.cardId    } : {}),
    };

    const changedFields = Object.keys(afterSnapshot);

    const histPayload = {
      action:        'CREATE',
      txId:          txRef.id,
      createdAt:     admin.firestore.FieldValue.serverTimestamp(),
      schemaVersion: 1,
      origin:        'manual',
      amount_cents:  data.value_cents,
      category:      data.category,
      after:         afterSnapshot,
      changedFields,
    };

    const opResult = await adminDb.runTransaction(async (t) => {
      if (idempotencyKey) {
        const idemRef  = adminDb.doc(`users/${uid}/idempotency/${idempotencyKey}`);
        const idemSnap = await t.get(idemRef);
        if (idemSnap.exists) {
          return { id: idemSnap.data()!['txId'] as string };
        }
        t.set(idemRef, {
          txId:      txRef.id,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
      t.set(txRef,   txPayload);
      t.set(histRef, histPayload);
      return { id: txRef.id };
    });

    return { id: opResult.id };
  },
);

// ═══════════════════════════════════════════════════════════════════════════════
// FUNÇÃO 1 — deleteUserData (LGPD — hard delete via Admin SDK recursiveDelete)
// ═══════════════════════════════════════════════════════════════════════════════
export const deleteUserData = onCall(
  {
    region: REGION,
    timeoutSeconds: 120,
    enforceAppCheck: true,
    consumeAppCheckToken: true,
    cors: CORS_ORIGINS,
  },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Acesso negado.');
    if (request.app?.alreadyConsumed) throw new HttpsError('permission-denied', 'Requisição duplicada rejeitada.');

    const uid     = request.auth.uid;
    const userRef = adminDb.collection('users').doc(uid);
    await adminDb.recursiveDelete(userRef);
    await admin.auth().deleteUser(uid);

    return { deleted: true };
  },
);

// ═══════════════════════════════════════════════════════════════════════════════
// FUNÇÃO 2 — Categorização em Batch
// ═══════════════════════════════════════════════════════════════════════════════
export const categorizeTransactionsBatch = onCall(
  {
    secrets: [GEMINI_API_KEY],
    region: REGION,
    timeoutSeconds: 30,
    enforceAppCheck: true,
    consumeAppCheckToken: true,
  },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Acesso negado.');
    if (request.app?.alreadyConsumed) throw new HttpsError('permission-denied', 'Requisição duplicada rejeitada.');

    const uid = request.auth.uid;
    const { transactions } = request.data as { transactions?: unknown[] };

    if (!Array.isArray(transactions)) {
      throw new HttpsError('invalid-argument', 'transactions deve ser um array.');
    }
    if (transactions.length === 0) return [];
    if (transactions.length > MAX_BATCH_SIZE) {
      throw new HttpsError('invalid-argument', `Máximo ${MAX_BATCH_SIZE} transações por lote.`);
    }

    const allowed = await checkAndIncrementRateLimit(uid);
    if (!allowed) {
      void writeStructuredLog(uid, 'ERROR', `daily AI limit reached (${DAILY_AI_LIMIT}/day) — categorization blocked`);
      throw new HttpsError('resource-exhausted', `Limite diário de ${DAILY_AI_LIMIT} chamadas de IA atingido.`);
    }

    type RawTx = { id?: unknown; description?: unknown; value_cents?: unknown; value?: unknown; type?: unknown; category?: unknown };
    const safeRows = (transactions as RawTx[])
      .filter(t => t && typeof t.id === 'string' && typeof t.description === 'string')
      .map((t, index) => ({
        id:          String(t.id).slice(0, 128),
        promptId:    toSafeCategorizationPromptId(t.id, index),
        description: maskPII(String(t.description ?? '').slice(0, 256)),
        value_cents: txCents(t as TxLike),
      }));

    if (!safeRows.length) return [];

    const prompt =
      `Classifique cada transação em UMA das categorias: Alimentação, Transporte, Assinaturas, Educação, Saúde, Moradia, Impostos/Taxas, Lazer, Vestuário, Salário, Freelance, Investimento, Diversos, Outros.\n` +
      `Responda APENAS um array JSON: [{"id":"id","category":"Categoria"}].\n` +
      `Transações:\n${safeRows.map(t => `ID: ${t.promptId} | "${t.description}" | R$ ${centsToReais(t.value_cents).toFixed(2)}`).join('\n')}`;

    try {
      let text = await callGemini(GEMINI_API_KEY.value(), prompt, { jsonMode: true });
      text = text.replace(/```json/gi, '').replace(/```/g, '').trim();

      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        console.warn('[categorizeTransactionsBatch] JSON parse failed, returning safe defaults');
        void writeStructuredLog(uid, 'ERROR', 'batch categorization: malformed Gemini response');
        return safeRows.map(t => ({ id: t.id, category: 'Outros' }));
      }

      const byId = new Map(
        Array.isArray(parsed)
          ? (parsed as Array<{ id?: unknown; category?: unknown }>)
              .filter(item => item && typeof item.id === 'string')
              .map(item => [String(item.id), safeCategory(String(item.category ?? 'Outros'))])
          : [],
      );

      void writeStructuredLog(uid, 'BATCH', `categorized ${safeRows.length} transactions`);
      return safeRows.map(t => ({ id: t.id, category: byId.get(t.promptId) ?? 'Outros' }));
    } catch (e) {
      console.error('[FunctionError]', sanitizeFunctionError('ai_batch_categorization', e));
      void writeStructuredLog(uid, 'ERROR', safeSystemLogDetail('ai_batch_categorization'));
      return safeRows.map(t => ({ id: t.id, category: 'Outros' }));
    }
  },
);

// ═══════════════════════════════════════════════════════════════════════════════
// FUNÇÃO 3 — Chat / Auditor CFO Pessoal
// ═══════════════════════════════════════════════════════════════════════════════
export const chatWithQuantumAI = onCall(
  {
    secrets: [GEMINI_API_KEY],
    region: REGION,
    timeoutSeconds: 60,
    enforceAppCheck: true,
    consumeAppCheckToken: true,
  },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Acesso negado.');
    if (request.app?.alreadyConsumed) throw new HttpsError('permission-denied', 'Requisição duplicada rejeitada.');

    const uid     = request.auth.uid;
    const allowed = await checkAndIncrementRateLimit(uid);
    if (!allowed) {
      void writeStructuredLog(uid, 'ERROR', 'daily AI limit reached — chat blocked');
      throw new HttpsError('resource-exhausted', `Limite diário de ${DAILY_AI_LIMIT} chamadas de IA atingido.`);
    }

    const { prompt: userMessage, financialContext: rawContext } =
      (request.data ?? {}) as { prompt?: unknown; financialContext?: unknown };

    if (!userMessage || typeof userMessage !== 'string') {
      throw new HttpsError('invalid-argument', 'Mensagem em falta ou inválida.');
    }
    if (userMessage.length > MAX_PROMPT_LEN) {
      throw new HttpsError('invalid-argument', `Mensagem excede ${MAX_PROMPT_LEN} caracteres.`);
    }

    const contextStr   = buildFinancialContext(sanitizeFinancialContext(rawContext));
    const maskedPrompt = maskPII(userMessage);
    const fullPrompt   = `${SYSTEM_PERSONA}\n\n${contextStr}\n\nPERGUNTA: "${maskedPrompt}"`;

    try {
      const reply = await callGemini(GEMINI_API_KEY.value(), fullPrompt);
      void writeStructuredLog(uid, 'AI_CALL', 'chat request completed');
      return { reply };
    } catch (e) {
      console.error('[FunctionError]', sanitizeFunctionError('ai_chat', e));
      void writeStructuredLog(uid, 'ERROR', safeSystemLogDetail('ai_chat'));
      throw new HttpsError('internal', 'Falha no núcleo de IA.');
    }
  },
);

// ═══════════════════════════════════════════════════════════════════════════════
// FUNÇÃO 4 — Audit Report (Briefing Semanal Pró-Ativo)
// ═══════════════════════════════════════════════════════════════════════════════
export const generateAuditReport = onCall(
  {
    secrets: [GEMINI_API_KEY],
    region: REGION,
    timeoutSeconds: 60,
    enforceAppCheck: true,
    consumeAppCheckToken: true,
  },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Acesso negado.');
    if (request.app?.alreadyConsumed) throw new HttpsError('permission-denied', 'Requisição duplicada rejeitada.');

    const uid     = request.auth.uid;
    const allowed = await checkAndIncrementRateLimit(uid);
    if (!allowed) {
      void writeStructuredLog(uid, 'ERROR', 'daily AI limit reached — audit blocked');
      throw new HttpsError('resource-exhausted', `Limite diário de ${DAILY_AI_LIMIT} chamadas de IA atingido.`);
    }

    const { financialContext: rawContext } =
      (request.data ?? {}) as { financialContext?: unknown };

    const contextStr  = buildFinancialContext(sanitizeFinancialContext(rawContext));
    const auditPrompt =
      `${SYSTEM_PERSONA}\n\n${contextStr}\n\n` +
      `TAREFA: Gera um RELATÓRIO DE AUDITORIA COMPLETO. Analisa burn rate, anomalias por categoria, risco de despesas fixas e faz uma previsão de saldo para fim do mês. ` +
      `Identifica os 3 maiores riscos. Usa bullet points organizados por secção. Sê brutalmente honesto.`;

    try {
      const reply = await callGemini(GEMINI_API_KEY.value(), auditPrompt);
      void writeStructuredLog(uid, 'AI_CALL', 'audit report generated');
      return { reply };
    } catch (e) {
      console.error('[FunctionError]', sanitizeFunctionError('ai_audit_report', e));
      void writeStructuredLog(uid, 'ERROR', safeSystemLogDetail('ai_audit_report'));
      throw new HttpsError('internal', 'Falha no motor de auditoria.');
    }
  },
);
