// src/shared/lib/piiMasker.ts

const CPF_RE      = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;
const CNPJ_RE     = /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g;
const EMAIL_RE    = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
const UUID_RE     = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const PHONE_RE    = /(?:\+?55[\s-]?)?(?:\(?\d{2}\)?[\s-]?)?\b9\d{4}[\s-]?\d{4}\b/g;
const PIX_PARA_RE = /\bpix\s+(?:para|envio|pgto|pag\.?|transf\.?)\s+[A-Za-zÀ-ÿ][\w\sÀ-ÿ'.]{2,39}/gi;
const PIX_DE_RE   = /\bpix\s+(?:de|rec(?:ebido)?\.?|rece?b?\.?)\s+[A-Za-zÀ-ÿ][\w\sÀ-ÿ'.]{2,39}/gi;
const TRANSF_RE   = /\b(?:ted|doc)\s+(?:para|de)\s+[A-Za-zÀ-ÿ][\w\sÀ-ÿ'.]{2,39}/gi;
const AGENCIA_RE  = /\b(?:ag\.?|agencia|cc|c\.c\.|conta)\s*[\d.\-\/]+/gi;

export function maskPII(text: string | null | undefined): string {
  if (!text || typeof text !== 'string') return text ?? '';
  return text
    .replace(CPF_RE,      '[CPF]')
    .replace(CNPJ_RE,     '[CNPJ]')
    .replace(EMAIL_RE,    '[EMAIL]')
    .replace(UUID_RE,     '[CHAVE-PIX]')
    .replace(PHONE_RE,    '[FONE]')
    .replace(PIX_PARA_RE, 'PIX ENVIADO')
    .replace(PIX_DE_RE,   'PIX RECEBIDO')
    .replace(TRANSF_RE,   'TRANSFERENCIA BANCARIA')
    .replace(AGENCIA_RE,  '[CONTA]');
}

interface TxWithDescription {
  description?: string;
  [key: string]: unknown;
}

export function maskTransaction<T extends TxWithDescription>(tx: T): T {
  if (!tx) return tx;
  return { ...tx, description: maskPII(tx.description) };
}

export function maskTransactions<T extends TxWithDescription>(transactions: T[] = []): T[] {
  return transactions.map(maskTransaction);
}

interface SafePromptRow {
  id: unknown;
  date: string;
  value: number;
  type: string;
  category: string;
  description: string;
}

export function buildSafePromptRows(transactions: TxWithDescription[] = []): SafePromptRow[] {
  return transactions.map(tx => ({
    id:          tx['id'],
    date:        String(tx['date'] ?? ''),
    value:       Number(tx['value'] ?? 0),
    type:        String(tx['type'] ?? 'saida'),
    category:    String(tx['category'] ?? 'Outros'),
    description: maskPII(tx.description),
  }));
}
