import { describe, it, expect } from 'vitest';
import {
  maskPII,
  maskTransaction,
  maskTransactions,
  buildSafePromptRows,
} from './piiMasker';
import type { Transaction } from '../types/transaction';
import type { Centavos } from '../types/money';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fakeTx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id:            'tx-1',
    uid:           'uid-1',
    description:   'Pagamento geral',
    value_cents:   1000 as Centavos,
    type:          'saida',
    category:      'Outros',
    date:          '2026-01-01',
    source:        'manual',
    schemaVersion: 2,
    ...overrides,
  } as Transaction;
}

// ─── Suite: maskPII ───────────────────────────────────────────────────────────

describe('maskPII', () => {
  it('retorna string vazia para null/undefined/string vazia', () => {
    expect(maskPII(null)).toBe('');
    expect(maskPII(undefined)).toBe('');
    expect(maskPII('')).toBe('');
  });

  it('retorna texto limpo sem alteração', () => {
    expect(maskPII('Pagamento de conta de luz')).toBe('Pagamento de conta de luz');
  });

  it('mascara CPF formatado', () => {
    expect(maskPII('CPF 123.456.789-09 aprovado')).toContain('[CPF]');
    expect(maskPII('CPF 123.456.789-09 aprovado')).not.toContain('123.456.789-09');
  });

  it('mascara CPF sem pontuação (11 dígitos)', () => {
    const result = maskPII('pagador 12345678909');
    expect(result).toContain('[CPF]');
  });

  it('mascara CNPJ formatado', () => {
    expect(maskPII('CNPJ 12.345.678/0001-99')).toContain('[CNPJ]');
    expect(maskPII('CNPJ 12.345.678/0001-99')).not.toContain('12.345.678');
  });

  it('mascara CNPJ sem pontuação (14 dígitos)', () => {
    expect(maskPII('12345678000199 empresa')).toContain('[CNPJ]');
  });

  it('mascara e-mail', () => {
    expect(maskPII('contato joao@email.com recebido')).toContain('[EMAIL]');
    expect(maskPII('contato joao@email.com recebido')).not.toContain('joao@email.com');
  });

  it('mascara UUID (chave PIX aleatória)', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    expect(maskPII(`PIX chave ${uuid}`)).toContain('[CHAVE-PIX]');
  });

  it('mascara telefone celular brasileiro', () => {
    expect(maskPII('fone 11 91234-5678')).toContain('[FONE]');
    expect(maskPII('fone 11 91234-5678')).not.toContain('91234');
  });

  it('mascara PIX enviado', () => {
    const result = maskPII('PIX para João Silva pago');
    expect(result).toContain('PIX ENVIADO');
  });

  it('mascara PIX recebido', () => {
    const result = maskPII('PIX de Maria Santos recebido');
    expect(result).toContain('PIX RECEBIDO');
  });

  it('mascara TED/DOC', () => {
    const result = maskPII('TED para Carlos Ferreira realizado');
    expect(result).toContain('TRANSFERENCIA BANCARIA');
  });

  it('mascara agência/conta', () => {
    expect(maskPII('ag. 1234-5 operação')).toContain('[CONTA]');
    expect(maskPII('conta 12345-6 saldo')).toContain('[CONTA]');
  });

  it('múltiplos PII na mesma string são todos mascarados', () => {
    const text = 'CPF 123.456.789-09 e email joao@test.com';
    const result = maskPII(text);
    expect(result).toContain('[CPF]');
    expect(result).toContain('[EMAIL]');
    expect(result).not.toContain('123.456.789-09');
    expect(result).not.toContain('joao@test.com');
  });
});

// ─── Suite: maskTransaction ───────────────────────────────────────────────────

describe('maskTransaction', () => {
  it('mascara description da transação', () => {
    const tx = fakeTx({ description: 'CPF 123.456.789-09 compra' });
    const masked = maskTransaction(tx);
    expect(masked.description).toContain('[CPF]');
    expect(masked.description).not.toContain('123.456.789');
  });

  it('não altera outros campos da transação', () => {
    const tx = fakeTx({ description: 'texto limpo' });
    const masked = maskTransaction(tx);
    expect(masked.id).toBe(tx.id);
    expect(masked.value_cents).toBe(tx.value_cents);
    expect(masked.category).toBe(tx.category);
  });

  it('retorna a transação intocada se falsy', () => {
    // maskTransaction tem guard: if (!tx) return tx
    const result = maskTransaction(null as unknown as Transaction);
    expect(result).toBeNull();
  });

  it('mantém description limpa quando não há PII', () => {
    const tx = fakeTx({ description: 'Supermercado ABC' });
    expect(maskTransaction(tx).description).toBe('Supermercado ABC');
  });
});

// ─── Suite: maskTransactions ──────────────────────────────────────────────────

describe('maskTransactions', () => {
  it('retorna array vazio para lista vazia', () => {
    expect(maskTransactions([])).toEqual([]);
  });

  it('usa default de array vazio quando chamado sem argumento', () => {
    expect(maskTransactions()).toEqual([]);
  });

  it('mascara description de cada transação na lista', () => {
    const txs = [
      fakeTx({ id: 'a', description: 'PIX para Fulano Silva pago' }),
      fakeTx({ id: 'b', description: 'Mercado limpo' }),
    ];
    const masked = maskTransactions(txs);
    expect(masked[0]!.description).toContain('PIX ENVIADO');
    expect(masked[1]!.description).toBe('Mercado limpo');
  });
});

// ─── Suite: buildSafePromptRows ───────────────────────────────────────────────

describe('buildSafePromptRows', () => {
  it('retorna array vazio para entrada vazia ou sem argumento', () => {
    expect(buildSafePromptRows([])).toEqual([]);
    expect(buildSafePromptRows()).toEqual([]);
  });

  it('inclui somente id, date, value_cents, type, category, description mascarada', () => {
    const tx = fakeTx({ description: 'email test@pii.com' });
    const [row] = buildSafePromptRows([tx]);
    expect(row).toHaveProperty('id');
    expect(row).toHaveProperty('date');
    expect(row).toHaveProperty('value_cents');
    expect(row).toHaveProperty('type');
    expect(row).toHaveProperty('category');
    expect(row).toHaveProperty('description');
    // não deve ter campos adicionais
    expect(row).not.toHaveProperty('uid');
    expect(row).not.toHaveProperty('importHash');
    expect(row).not.toHaveProperty('source');
  });

  it('description no prompt está mascarada', () => {
    const tx = fakeTx({ description: 'CPF 123.456.789-09 pagamento' });
    const [row] = buildSafePromptRows([tx]);
    expect(row!.description).toContain('[CPF]');
    expect(row!.description).not.toContain('123.456.789');
  });

  it('date ausente resulta em string vazia', () => {
    const tx = { ...fakeTx(), date: undefined } as unknown as Transaction;
    const [row] = buildSafePromptRows([tx]);
    expect(row!.date).toBe('');
  });

  it('type ausente resulta em saida por padrão', () => {
    const tx = { ...fakeTx(), type: undefined } as unknown as Transaction;
    const [row] = buildSafePromptRows([tx]);
    expect(row!.type).toBe('saida');
  });

  it('category ausente resulta em Outros por padrão', () => {
    const tx = { ...fakeTx(), category: undefined } as unknown as Transaction;
    const [row] = buildSafePromptRows([tx]);
    expect(row!.category).toBe('Outros');
  });
});
