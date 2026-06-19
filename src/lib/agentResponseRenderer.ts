/**
 * agentResponseRenderer.ts — Renderizador de respostas do Agente Financeiro (FASE H / H-0).
 * Zero React, zero Firebase, zero I/O. 100% testável.
 *
 * Implementa o contrato de resposta de docs/AI_RESPONSE_CONTRACT.md:
 *   • o LLM emite placeholders `{{chave|pipe}}` — NUNCA números finais;
 *   • este renderizador resolve os placeholders a partir do output do motor
 *     (sempre em centavos / formatos canônicos), usando os formatadores do projeto;
 *   • qualquer número monetário/percentual LITERAL vindo do LLM (fora de placeholder)
 *     é REJEITADO — `assertNoLiteralFinancials` lança e o render falha.
 *
 * Pipes suportados: |brl, |pct, |date, |mes (ver AI_RESPONSE_CONTRACT.md §2).
 */
import { formatBRL } from '../shared/types/money';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type Pipe = 'brl' | 'pct' | 'date' | 'mes';

/** Valores que o motor disponibiliza ao renderizador, por chave de placeholder. */
export type RenderContext = Record<string, number | string>;

export class LiteralFinancialError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LiteralFinancialError';
  }
}

export class PlaceholderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlaceholderError';
  }
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const MONTH_NAMES_PT = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
] as const;

const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\|\s*(brl|pct|date|mes)\s*\}\}/g;

// Detecta número financeiro literal: R$, símbolo %, ou número com separador de
// milhar/decimal típico de moeda. Usado APÓS remover os placeholders válidos.
const LITERAL_MONEY_RE = /R\$\s*\d/i;
const LITERAL_PCT_RE = /\d\s*%/;
const LITERAL_DECIMAL_RE = /\d[.,]\d{2}\b/; // 1234,56 / 1.234.56 etc.

// ─── Pipes ──────────────────────────────────────────────────────────────────────

function renderBrl(raw: number | string): string {
  const cents = typeof raw === 'string' ? Number(raw) : raw;
  if (!Number.isFinite(cents)) throw new PlaceholderError('Valor |brl não numérico');
  return formatBRL(Math.round(cents));
}

function renderPct(raw: number | string): string {
  const n = typeof raw === 'string' ? Number(raw) : raw;
  if (!Number.isFinite(n)) throw new PlaceholderError('Valor |pct não numérico');
  // Aceita fração (0.30 → 30%) ou já-percentual (30 → 30%).
  const pct = Math.abs(n) <= 1 ? n * 100 : n;
  return `${Math.round(pct)}%`;
}

function renderDate(raw: number | string): string {
  const s = String(raw).slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) throw new PlaceholderError('Valor |date deve ser YYYY-MM-DD');
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function renderMes(raw: number | string): string {
  const s = String(raw).slice(0, 7);
  const m = /^(\d{4})-(\d{2})$/.exec(s);
  if (!m) throw new PlaceholderError('Valor |mes deve ser YYYY-MM');
  const idx = parseInt(m[2]!, 10) - 1;
  return `${MONTH_NAMES_PT[idx] ?? m[2]}/${m[1]}`;
}

function applyPipe(pipe: Pipe, raw: number | string): string {
  switch (pipe) {
    case 'brl':  return renderBrl(raw);
    case 'pct':  return renderPct(raw);
    case 'date': return renderDate(raw);
    case 'mes':  return renderMes(raw);
  }
}

// ─── API pública ──────────────────────────────────────────────────────────────

/**
 * Garante que `text` (já sem placeholders válidos) não contém número financeiro
 * literal produzido pelo LLM. Lança `LiteralFinancialError` se encontrar.
 */
export function assertNoLiteralFinancials(text: string): void {
  if (LITERAL_MONEY_RE.test(text)) {
    throw new LiteralFinancialError('Valor monetário literal proibido na resposta do LLM');
  }
  if (LITERAL_PCT_RE.test(text)) {
    throw new LiteralFinancialError('Percentual literal proibido na resposta do LLM');
  }
  if (LITERAL_DECIMAL_RE.test(text)) {
    throw new LiteralFinancialError('Número decimal literal proibido na resposta do LLM');
  }
}

/**
 * Resolve todos os placeholders `{{chave|pipe}}` de `template` usando `context`,
 * e então valida que nenhum número financeiro literal restou no texto.
 *
 * Lança:
 *  - `PlaceholderError` se um placeholder referenciar chave ausente ou valor inválido;
 *  - `LiteralFinancialError` se houver número financeiro literal fora de placeholder.
 */
export function renderAgentResponse(template: string, context: RenderContext): string {
  // 1. Valida literais no texto AUTORAL — placeholders válidos são mascarados antes,
  //    pois os valores que ELES produzem (ex.: "R$ 4.000,00") são legítimos.
  const masked = template.replace(PLACEHOLDER_RE, ' ');
  assertNoLiteralFinancials(masked);

  // 2. Substitui os placeholders pelos valores do contexto.
  let missing: string | null = null;
  const resolved = template.replace(PLACEHOLDER_RE, (_full, key: string, pipe: string) => {
    if (!(key in context)) {
      missing = key;
      return '';
    }
    return applyPipe(pipe as Pipe, context[key]!);
  });

  if (missing) {
    throw new PlaceholderError(`Placeholder sem valor no contexto: "${missing}"`);
  }

  return resolved;
}
