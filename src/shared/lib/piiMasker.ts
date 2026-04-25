import type { Transaction } from '../types/transaction';

const CPF_RE      = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;
const CNPJ_RE     = /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g;
const CNPJ_PURE_RE = /\b\d{14}\b/g;
const CPF_PURE_RE  = /\b\d{11}\b/g;
const EMAIL_RE  = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
const UUID_RE   = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const PHONE_RE  = /(?:\+?55[\s-]?)?(?:\(?\d{2}\)?[\s-]?)?\b9\d{4}[\s-]?\d{4}\b/g;
const PIX_PARA_RE = /\bpix\s+(?:para|envio|pgto|pag\.?|transf\.?)\s+[A-Za-zÀ-ÿ][\w\sÀ-ÿ'.]{2,39}/gi;
const PIX_DE_RE   = /\bpix\s+(?:de|rec(?:ebido)?\.?|rece?b?\.?)\s+[A-Za-zÀ-ÿ][\w\sÀ-ÿ'.]{2,39}/gi;
const TRANSF_RE   = /\b(?:ted|doc)\s+(?:para|de)\s+[A-Za-zÀ-ÿ][\w\sÀ-ÿ'.]{2,39}/gi;
const AGENCIA_RE  = /\b(?:ag\.?|agencia|cc|c\.c\.|conta)\s*[\d.\-\/]+/gi;

export function maskPII(text: string | undefined | null): string {
  if (!text) return '';
  if (!text || typeof text !== 'string') return text ?? '';
  return text
    .replace(CPF_RE,       '[CPF]')
    .replace(CNPJ_RE,      '[CNPJ]')
    .replace(CNPJ_PURE_RE, '[CNPJ]')
    .replace(CPF_PURE_RE,  '[CPF]')
    .replace(EMAIL_RE,    '[EMAIL]')
    .replace(UUID_RE,     '[CHAVE-PIX]')
    .replace(PHONE_RE,    '[FONE]')
    .replace(PIX_PARA_RE, 'PIX ENVIADO')
    .replace(PIX_DE_RE,   'PIX RECEBIDO')
    .replace(TRANSF_RE,   'TRANSFERENCIA BANCARIA')
    .replace(AGENCIA_RE,  '[CONTA]');
}

export function maskTransaction(tx: Transaction): Transaction {
  if (!tx) return tx;
  return { ...tx, description: maskPII(tx.description) };
}

export function maskTransactions(transactions: Transaction[] = []): Transaction[] {
  return transactions.map(maskTransaction);
}

export function buildSafePromptRows(transactions: Array<Partial<Transaction>> = []) {
  return transactions.map(tx => ({
    id:          tx.id,
    date:        tx.date        || '',
    value:       tx.value       ?? 0,
    type:        tx.type        || 'saida',
    category:    tx.category    || 'Outros',
    description: maskPII(tx.description),
  }));
}
