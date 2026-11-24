// supabase/functions/quantum-ai/index.ts
// Função de borda (Deno) que substitui as Cloud Functions chatWithQuantumAI,
// generateAuditReport e categorizeTransactionsBatch.
//
// Segurança:
//  * o gateway do Supabase exige JWT válido (verify_jwt padrão); aqui o cliente
//    do banco usa o MESMO JWT do usuário, então auth.uid() é o dele e a RLS vale;
//  * consume_ai_call() barra sem consentimento de IA (fail-closed) e acima de 50/dia
//    ANTES de qualquer dado sair para o Gemini;
//  * as chaves (GEMINI_API_KEY ou OPENROUTER_API_KEY) ficam só nos secrets da
//    função, nunca no app. Gemini tem prioridade; sem ela, usa o OpenRouter
//    (modelo em OPENROUTER_MODEL, padrão um modelo gratuito);
//  * logs só com operação e código; nada do usuário (sem prompt, valor ou id).
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  GEMINI_MODEL,
  SYSTEM_PERSONA,
  buildAuditPrompt,
  buildCategorizePrompt,
  buildChatPrompt,
  parseAiRequest,
  parseCategorizeResponse,
  todayInSaoPaulo,
} from './prompt.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type ErrorCode =
  | 'invalid-argument' | 'unauthenticated' | 'permission-denied'
  | 'resource-exhausted' | 'unavailable' | 'internal';

const STATUS: Record<ErrorCode, number> = {
  'invalid-argument': 400,
  unauthenticated: 401,
  'permission-denied': 403,
  'resource-exhausted': 429,
  unavailable: 503,
  internal: 500,
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function fail(code: ErrorCode, message: string, reason?: string): Response {
  return json({ error: { code, message, ...(reason ? { reason } : {}) } }, STATUS[code]);
}

function logError(op: string, code: string): void {
  console.error('[quantum-ai]', JSON.stringify({ op, code }));
}

async function callGemini(
  apiKey: string,
  prompt: string,
  opts: { jsonMode?: boolean; systemInstruction?: string },
): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      signal: AbortSignal.timeout(50_000),
      body: JSON.stringify({
        ...(opts.systemInstruction ? { systemInstruction: { parts: [{ text: opts.systemInstruction }] } } : {}),
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: opts.jsonMode
          ? { temperature: 0.1, responseMimeType: 'application/json' }
          : { temperature: 0.7 },
      }),
    },
  );
  if (!res.ok) throw new Error(`gemini_http_${res.status}`);
  const data = await res.json() as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = (data.candidates?.[0]?.content?.parts ?? []).map(p => p.text ?? '').join('');
  if (!text.trim()) throw new Error('gemini_empty');
  return text;
}

const OPENROUTER_DEFAULT_MODEL = 'deepseek/deepseek-chat-v3-0324:free';

async function callOpenRouter(
  apiKey: string,
  model: string,
  prompt: string,
  opts: { jsonMode?: boolean; systemInstruction?: string },
): Promise<string> {
  const messages = [
    ...(opts.systemInstruction ? [{ role: 'system', content: opts.systemInstruction }] : []),
    { role: 'user', content: prompt },
  ];
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(50_000),
    body: JSON.stringify({ model, messages, temperature: opts.jsonMode ? 0.1 : 0.7 }),
  });
  if (!res.ok) throw new Error(`openrouter_http_${res.status}`);
  const data = await res.json() as { choices?: { message?: { content?: string } }[] };
  const text = data.choices?.[0]?.message?.content ?? '';
  if (!text.trim()) throw new Error('openrouter_empty');
  return text;
}

type AiCaller = (prompt: string, opts: { jsonMode?: boolean; systemInstruction?: string }) => Promise<string>;

/** Escolhe o provedor pelos secrets: Gemini primeiro, depois OpenRouter; null se nenhum. */
function pickProvider(): AiCaller | null {
  const gemini = Deno.env.get('GEMINI_API_KEY') ?? '';
  if (gemini) return (prompt, opts) => callGemini(gemini, prompt, opts);
  const openrouter = Deno.env.get('OPENROUTER_API_KEY') ?? '';
  if (openrouter) {
    const model = Deno.env.get('OPENROUTER_MODEL') || OPENROUTER_DEFAULT_MODEL;
    return (prompt, opts) => callOpenRouter(openrouter, model, prompt, opts);
  }
  return null;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return fail('invalid-argument', 'Método não suportado.');

  const authorization = req.headers.get('Authorization') ?? '';
  if (!authorization.startsWith('Bearer ')) return fail('unauthenticated', 'Acesso negado.');

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail('invalid-argument', 'Pedido inválido.');
  }
  const parsed = parseAiRequest(body);
  if (!parsed.ok) return fail('invalid-argument', parsed.message);
  const request = parsed.request;

  if (request.op === 'categorize' && request.rows.length === 0) return json([]);

  const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Consentimento + limite diário (fail-closed): nada vai ao provedor de IA sem passar aqui.
  const gate = await db.rpc('consume_ai_call');
  if (gate.error) {
    const code = gate.error.code;
    if (code === 'QF401') return fail('unauthenticated', 'Acesso negado.');
    if (code === '42501') {
      return fail('permission-denied', 'Consentimento de uso de IA não concedido. Ative-o em Configurações › Privacidade.', 'ai_consent_required');
    }
    if (code === 'QF429') return fail('resource-exhausted', 'Limite diário de 50 chamadas de IA atingido.');
    logError(request.op, 'gate_failed');
    return fail('internal', 'Não foi possível validar o limite de uso da IA. Tente novamente em instantes.');
  }

  const callAi = pickProvider();
  if (!callAi) {
    logError(request.op, 'missing_api_key');
    if (request.op === 'categorize') return json(request.rows.map(t => ({ id: t.id, category: 'Outros' })));
    return fail('unavailable', 'A IA ainda não foi configurada no servidor.');
  }

  const today = todayInSaoPaulo();
  try {
    switch (request.op) {
      case 'chat': {
        const reply = await callAi(buildChatPrompt(request.prompt, request.context, today), { systemInstruction: SYSTEM_PERSONA });
        return json({ reply });
      }
      case 'audit': {
        const reply = await callAi(buildAuditPrompt(request.context, today), { systemInstruction: SYSTEM_PERSONA });
        return json({ reply });
      }
      case 'categorize': {
        const text = await callAi(buildCategorizePrompt(request.rows), { jsonMode: true });
        return json(parseCategorizeResponse(text, request.rows));
      }
    }
  } catch (e) {
    logError(request.op, e instanceof Error ? e.message.slice(0, 40) : 'unknown');
    // Categorização nunca quebra o fluxo: volta 'Outros' (igual à Cloud Function).
    if (request.op === 'categorize') return json(request.rows.map(t => ({ id: t.id, category: 'Outros' })));
    return fail('internal', request.op === 'audit' ? 'Falha no motor de auditoria.' : 'Falha no núcleo de IA.');
  }
});
