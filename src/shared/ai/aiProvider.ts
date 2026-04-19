// src/shared/ai/aiProvider.ts
// Motor híbrido: Groq (primário) → Ollama (fallback local)
// Chaves lidas exclusivamente de variáveis de ambiente — nunca hardcoded.

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompletionOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

async function groqCompletion(messages: Message[], opts: CompletionOptions): Promise<string> {
  const apiKey = import.meta.env.VITE_GROQ_API_KEY as string | undefined;
  if (!apiKey) throw new Error('VITE_GROQ_API_KEY não configurada');

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: opts.model ?? 'llama-3.1-8b-instant',
      messages,
      temperature: opts.temperature ?? 0.05,
      max_tokens: opts.maxTokens ?? 1024,
    }),
  });

  if (!res.ok) throw new Error(`Groq ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return (data.choices?.[0]?.message?.content as string) ?? '';
}

async function ollamaCompletion(messages: Message[], opts: CompletionOptions): Promise<string> {
  const base = (import.meta.env.VITE_OLLAMA_BASE_URL as string | undefined) ?? 'http://localhost:11434';

  const res = await fetch(`${base}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: opts.model ?? 'llama3',
      messages,
      stream: false,
      options: { temperature: opts.temperature ?? 0.05 },
    }),
  });

  if (!res.ok) throw new Error(`Ollama ${res.status}`);
  const data = await res.json();
  return (data.message?.content as string) ?? '';
}

export const aiProvider = {
  async chatCompletion(messages: Message[], opts: CompletionOptions = {}): Promise<string> {
    try {
      return await groqCompletion(messages, opts);
    } catch (groqErr) {
      console.warn('[aiProvider] Groq indisponível, usando Ollama:', (groqErr as Error).message);
      return await ollamaCompletion(messages, opts);
    }
  },
};
