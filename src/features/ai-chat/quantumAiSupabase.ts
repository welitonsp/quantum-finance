// src/features/ai-chat/quantumAiSupabase.ts
// Transporte Supabase da IA: chama a função de borda `quantum-ai` com a sessão do
// usuário. Devolve os MESMOS formatos das callables do Firebase (array na
// categorização, { reply } no chat/relatório) para o GeminiService não mudar.
// Erros viram { code } no estilo do Firebase, que getUserFriendlyErrorMessage entende.
import { getSupabase } from '../../shared/api/supabase/client';

export type AiCallableName = 'categorizeTransactionsBatch' | 'chatWithQuantumAI' | 'generateAuditReport';

const OP_BY_CALLABLE: Record<AiCallableName, 'categorize' | 'chat' | 'audit'> = {
  categorizeTransactionsBatch: 'categorize',
  chatWithQuantumAI:           'chat',
  generateAuditReport:         'audit',
};

const KNOWN_CODES = new Set([
  'invalid-argument', 'unauthenticated', 'permission-denied',
  'resource-exhausted', 'unavailable', 'internal',
]);

export class QuantumAiError extends Error {
  readonly code: string;
  readonly reason: string | undefined;
  constructor(code: string, message: string, reason?: string) {
    super(message);
    this.name = 'QuantumAiError';
    this.code = code;
    this.reason = reason;
  }
}

async function readErrorBody(error: unknown): Promise<{ code?: unknown; message?: unknown; reason?: unknown }> {
  const context = (error as { context?: unknown } | null)?.context;
  if (context && typeof (context as Response).json === 'function') {
    try {
      const body = await (context as Response).json() as { error?: { code?: unknown; message?: unknown; reason?: unknown } };
      return body?.error ?? {};
    } catch {
      return {};
    }
  }
  return {};
}

export async function callQuantumAiSupabase(
  name: AiCallableName,
  data: Record<string, unknown>,
  timeoutSeconds: number,
): Promise<unknown> {
  const { data: result, error } = await getSupabase().functions.invoke('quantum-ai', {
    body: { op: OP_BY_CALLABLE[name], ...data },
    timeout: timeoutSeconds * 1000,
  });
  if (error) {
    const body = await readErrorBody(error);
    const code = typeof body.code === 'string' && KNOWN_CODES.has(body.code) ? body.code : 'unavailable';
    const message = typeof body.message === 'string' ? body.message : 'Falha ao contatar a IA.';
    throw new QuantumAiError(code, message, typeof body.reason === 'string' ? body.reason : undefined);
  }
  return result;
}
