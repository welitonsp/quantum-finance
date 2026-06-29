/**
 * accountResolution.ts — Resolução DETERMINÍSTICA de nome de conta → ID (FASE H — PR 2).
 *
 * O agente extrai NOMES de conta em linguagem natural ("poupança", "conta corrente");
 * esta camada pura mapeia cada nome para o `id` real do usuário, usando a lista de
 * contas (read-only). O LLM NUNCA inventa IDs — toda resolução é local, testável e
 * sem I/O. Match por nome normalizado (sem acentos/caixa): exato vence; senão, match
 * parcial único; múltiplos parciais → ambíguo; nenhum → não encontrado.
 */

/** Forma mínima de conta necessária para resolução (subset de `Account`). */
export interface AccountRef {
  id: string;
  name: string;
}

export type AccountMatch =
  | { ok: true; id: string; name: string }
  | { ok: false; reason: 'not_found' | 'ambiguous' };

/** lowercase + sem acentos + colapsa espaços. Determinístico. */
export function normalizeAccountName(s: string): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Remove artigos/qualificadores iniciais comuns ("a", "o", "minha", "conta"). */
function stripLeadingQualifiers(s: string): string {
  return s
    .replace(/^(?:a|o|as|os|minha|meu|na|no|da|do|conta)\s+/i, '')
    .trim();
}

/**
 * Resolve um nome livre para uma conta do usuário. Tenta o termo cru e, se necessário,
 * sem qualificadores iniciais. Exato (nome normalizado ===) tem prioridade sobre parcial.
 */
export function resolveAccountByName(rawName: string, accounts: AccountRef[]): AccountMatch {
  const candidates = Array.from(new Set([
    normalizeAccountName(rawName),
    normalizeAccountName(stripLeadingQualifiers(rawName)),
  ].filter(Boolean)));

  if (candidates.length === 0 || accounts.length === 0) return { ok: false, reason: 'not_found' };

  for (const q of candidates) {
    const exact = accounts.filter((a) => normalizeAccountName(a.name) === q);
    if (exact.length === 1) return { ok: true, id: exact[0]!.id, name: exact[0]!.name };
    if (exact.length > 1) return { ok: false, reason: 'ambiguous' };

    const partial = accounts.filter((a) => {
      const n = normalizeAccountName(a.name);
      return n.includes(q) || q.includes(n);
    });
    if (partial.length === 1) return { ok: true, id: partial[0]!.id, name: partial[0]!.name };
    if (partial.length > 1) return { ok: false, reason: 'ambiguous' };
  }

  return { ok: false, reason: 'not_found' };
}
