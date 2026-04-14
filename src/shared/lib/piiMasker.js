/**
 * piiMasker.js — Anonimizador Local de PII (Personally Identifiable Information)
 * ─────────────────────────────────────────────────────────────────────────────
 * Aplica mascaramento de dados sensíveis ANTES de enviar qualquer texto ao Gemini.
 * Processa LOCALMENTE no cliente — nenhum dado real é transmitido.
 *
 * Cobre:
 *  • CPF (123.456.789-00 / 12345678900)
 *  • CNPJ (12.345.678/0001-00)
 *  • Endereços de e-mail
 *  • Chaves PIX aleatórias (UUID v4)
 *  • Números de telefone (BR)
 *  • Nomes em PIX PARA / PIX DE / TED / DOC
 *  • Agências e contas bancárias
 */

// ─── Expressões regulares ─────────────────────────────────────────────────────
const CPF_RE    = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;
const CNPJ_RE   = /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g;
const EMAIL_RE  = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
const UUID_RE   = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

// Telefone BR: (11) 99999-9999 / +55 11 99999-9999 / 11999999999
const PHONE_RE  = /(?:\+?55[\s-]?)?(?:\(?\d{2}\)?[\s-]?)?\b9\d{4}[\s-]?\d{4}\b/g;

// PIX PARA / PIX DE + nome (ex: "PIX PARA JOAO SILVA")
const PIX_PARA_RE = /\bpix\s+(?:para|envio|pgto|pag\.?|transf\.?)\s+[A-Za-zÀ-ÿ][\w\sÀ-ÿ'.]{2,39}/gi;
const PIX_DE_RE   = /\bpix\s+(?:de|rec(?:ebido)?\.?|rece?b?\.?)\s+[A-Za-zÀ-ÿ][\w\sÀ-ÿ'.]{2,39}/gi;

// TED/DOC PARA/DE + nome
const TRANSF_RE   = /\b(?:ted|doc)\s+(?:para|de)\s+[A-Za-zÀ-ÿ][\w\sÀ-ÿ'.]{2,39}/gi;

// Agência/Conta: AG 1234 / CC 12345-6
const AGENCIA_RE  = /\b(?:ag\.?|agencia|cc|c\.c\.|conta)\s*[\d.\-\/]+/gi;

// ─── Função principal ─────────────────────────────────────────────────────────
/**
 * Recebe uma string (descrição de transação) e retorna versão anonimizada.
 * Ordem importa: mais específico primeiro para evitar matches parciais.
 */
export function maskPII(text) {
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

/**
 * Mascara os campos sensíveis de uma transação individual.
 * Preserva todos os outros campos (valor, data, categoria, id).
 */
export function maskTransaction(tx) {
  if (!tx) return tx;
  return {
    ...tx,
    description: maskPII(tx.description),
  };
}

/**
 * Mascara um array de transações em bulk.
 * Seguro de usar com .map() — não muta os objetos originais.
 */
export function maskTransactions(transactions = []) {
  return transactions.map(maskTransaction);
}

/**
 * Mascara apenas as descrições para construção de prompt AI.
 * Retorna array de objetos mínimos: { id, date, value, category, description }
 */
export function buildSafePromptRows(transactions = []) {
  return transactions.map(tx => ({
    id:          tx.id,
    date:        tx.date        || '',
    value:       tx.value       ?? 0,
    type:        tx.type        || 'saida',
    category:    tx.category    || 'Outros',
    description: maskPII(tx.description),
  }));
}
