// src/hooks/transactionNormalizer.test.ts
// Testes diretos das funções puras extraídas de useTransactions.
import { describe, expect, it } from 'vitest';
import type { Transaction } from '../shared/types/transaction';
import type { Centavos } from '../shared/types/money';
import {
  normalizeTransaction,
  normalizeWriteData,
  buildUpdateWriteData,
  sanitizeForHistory,
  computeChangedFields,
  toMillis,
} from './transactionNormalizer';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const cents = (n: number): Centavos => n as Centavos;

function baseTx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id:            'tx-1',
    description:   'Salário',
    value_cents:   cents(100000),
    type:          'entrada',
    category:      'Salário',
    date:          '2026-06-01',
    schemaVersion: 2,
    ...overrides,
  } as Transaction;
}

// ─── normalizeTransaction ─────────────────────────────────────────────────────

describe('normalizeTransaction', () => {
  it('preserva value_cents inteiro seguro e deriva value em reais', () => {
    const result = normalizeTransaction(baseTx({ value_cents: cents(1050) }));
    expect(result.value_cents).toBe(1050);
    expect(result.value).toBeCloseTo(10.5);
  });

  it('NÃO deriva value_cents a partir de value legado', () => {
    // Se value_cents está ausente/inválido, cai para 0 — nunca lê value float.
    const tx = baseTx({ value_cents: undefined as unknown as Centavos, value: 99.99 });
    const result = normalizeTransaction(tx);
    expect(result.value_cents).toBe(0);
    expect(result.value).toBe(0);
  });

  it('retorna 0 para value_cents negativo', () => {
    const result = normalizeTransaction(baseTx({ value_cents: cents(-500) }));
    expect(result.value_cents).toBe(0);
  });

  it('retorna 0 para value_cents float não inteiro', () => {
    const result = normalizeTransaction(baseTx({ value_cents: 12.5 as Centavos }));
    expect(result.value_cents).toBe(0);
  });

  it('preserva schemaVersion existente', () => {
    const result = normalizeTransaction(baseTx({ schemaVersion: 1 }));
    expect(result.schemaVersion).toBe(1);
  });

  it('usa schemaVersion 1 como fallback quando ausente', () => {
    const tx = { ...baseTx() } as Partial<Transaction>;
    delete tx.schemaVersion;
    const result = normalizeTransaction(tx as Transaction);
    expect(result.schemaVersion).toBe(1);
  });

  it('preserva schemaVersion 2 intacto', () => {
    const result = normalizeTransaction(baseTx({ schemaVersion: 2 }));
    expect(result.schemaVersion).toBe(2);
  });

  it('copia todos os outros campos sem modificação', () => {
    const result = normalizeTransaction(baseTx({ description: 'Uber XPTO', category: 'Transporte' }));
    expect(result.description).toBe('Uber XPTO');
    expect(result.category).toBe('Transporte');
  });
});

// ─── normalizeWriteData ───────────────────────────────────────────────────────

describe('normalizeWriteData', () => {
  it('remove id, uid, value, createdAt, updatedAt, deletedAt, importHash, isDeleted', () => {
    const input = {
      id: 'tx-1', uid: 'u1', value: 10, createdAt: new Date(),
      updatedAt: new Date(), deletedAt: new Date(),
      importHash: 'abc123', isDeleted: true,
      description: 'Mantida', value_cents: cents(500),
    } as unknown as Partial<Transaction>;
    const result = normalizeWriteData(input);
    expect(result).not.toHaveProperty('id');
    expect(result).not.toHaveProperty('uid');
    expect(result).not.toHaveProperty('value');
    expect(result).not.toHaveProperty('createdAt');
    expect(result).not.toHaveProperty('updatedAt');
    expect(result).not.toHaveProperty('deletedAt');
    expect(result).not.toHaveProperty('importHash');
    expect(result).not.toHaveProperty('isDeleted');
  });

  it('preserva value_cents inteiro seguro', () => {
    const result = normalizeWriteData({ value_cents: cents(2000), description: 'OK' });
    expect(result.value_cents).toBe(2000);
  });

  it('omite value_cents negativo', () => {
    const result = normalizeWriteData({ value_cents: cents(-100) });
    expect(result).not.toHaveProperty('value_cents');
  });

  it('omite value_cents float', () => {
    const result = normalizeWriteData({ value_cents: 99.9 as Centavos });
    expect(result).not.toHaveProperty('value_cents');
  });

  it('sempre seta schemaVersion: 2', () => {
    const result = normalizeWriteData({ description: 'Teste' });
    expect(result.schemaVersion).toBe(2);
  });

  it('filtra campos undefined do payload', () => {
    const result = normalizeWriteData({ description: 'OK' } as Partial<Transaction>);
    expect(result).not.toHaveProperty('category');
    expect(result.description).toBe('OK');
  });
});

// ─── buildUpdateWriteData ─────────────────────────────────────────────────────

describe('buildUpdateWriteData', () => {
  it('prioriza value_cents do payload data sobre o do current', () => {
    const current = baseTx({ value_cents: cents(1000) });
    const result  = buildUpdateWriteData(current, { value_cents: cents(2000) });
    expect(result.value_cents).toBe(2000);
  });

  it('usa value_cents do current quando data não traz value_cents', () => {
    const current = baseTx({ value_cents: cents(1500), schemaVersion: 2 });
    const result  = buildUpdateWriteData(current, { description: 'Nova desc' });
    expect(result.value_cents).toBe(1500);
  });

  it('NÃO usa value legado de data para derivar centavos', () => {
    const current = baseTx({ value_cents: cents(1000), schemaVersion: 2 });
    const result  = buildUpdateWriteData(current, { value: 50.0 });
    // value_cents permanece do current, não é calculado de value
    expect(result.value_cents).toBe(1000);
  });

  it('normaliza type receita → entrada', () => {
    const current = baseTx({ type: 'receita' as 'entrada', schemaVersion: 2, value_cents: cents(100) });
    const result  = buildUpdateWriteData(current, {});
    expect(result.type).toBe('entrada');
  });

  it('normaliza type despesa → saida', () => {
    const current = baseTx({ type: 'despesa' as 'saida', schemaVersion: 2, value_cents: cents(100) });
    const result  = buildUpdateWriteData(current, {});
    expect(result.type).toBe('saida');
  });

  it('normaliza source inválido → manual', () => {
    const current = baseTx({ source: 'desconhecido' as 'manual', schemaVersion: 2, value_cents: cents(100) });
    const result  = buildUpdateWriteData(current, {});
    expect(result.source).toBe('manual');
  });

  it('preserva source csv', () => {
    const current = baseTx({ source: 'csv', schemaVersion: 2, value_cents: cents(100) });
    const result  = buildUpdateWriteData(current, {});
    expect(result.source).toBe('csv');
  });

  it('funciona sem current (undefined)', () => {
    const result = buildUpdateWriteData(undefined, { description: 'Nova', value_cents: cents(800) });
    expect(result.value_cents).toBe(800);
    expect(result.description).toBe('Nova');
  });

  it('não preserva value_cents do current se schemaVersion não é 2', () => {
    const current = baseTx({ value_cents: cents(999), schemaVersion: 1 });
    const result  = buildUpdateWriteData(current, {});
    // sem value_cents no data e sem value_cents preservado do current (schema v1)
    expect(result).not.toHaveProperty('value_cents');
  });
});

// ─── sanitizeForHistory ───────────────────────────────────────────────────────

describe('sanitizeForHistory', () => {
  it('remove id, uid, value, importHash, _lastOpId, correlationId', () => {
    const input = {
      id: 'tx-1', uid: 'u1', value: 10, importHash: 'hash123',
      _lastOpId: 'op-1', correlationId: 'corr-1',
      description: 'Mantida', value_cents: cents(500),
    } as unknown as Partial<Transaction>;
    const result = sanitizeForHistory(input);
    expect(result).not.toHaveProperty('id');
    expect(result).not.toHaveProperty('uid');
    expect(result).not.toHaveProperty('value');
    expect(result).not.toHaveProperty('importHash');
    expect(result).not.toHaveProperty('_lastOpId');
    expect(result).not.toHaveProperty('correlationId');
  });

  it('preserva campos financeiros seguros', () => {
    const result = sanitizeForHistory({
      description: 'Salário', value_cents: cents(300000),
      category: 'Salário', type: 'entrada', date: '2026-06-01',
    } as Partial<Transaction>);
    expect(result.description).toBe('Salário');
    expect(result.value_cents).toBe(300000);
    expect(result.category).toBe('Salário');
  });

  it('filtra campos undefined', () => {
    const result = sanitizeForHistory({ description: 'OK' } as Partial<Transaction>);
    expect(result).not.toHaveProperty('category');
  });
});

// ─── computeChangedFields ─────────────────────────────────────────────────────

describe('computeChangedFields', () => {
  it('detecta campo alterado', () => {
    const changed = computeChangedFields(
      { category: 'Alimentação', value_cents: 1000 },
      { category: 'Transporte',  value_cents: 1000 },
    );
    expect(changed).toContain('category');
    expect(changed).not.toContain('value_cents');
  });

  it('detecta campo adicionado', () => {
    const changed = computeChangedFields(
      { description: 'A' },
      { description: 'A', category: 'Novo' },
    );
    expect(changed).toContain('category');
  });

  it('detecta campo removido', () => {
    const changed = computeChangedFields(
      { description: 'A', category: 'Velho' },
      { description: 'A' },
    );
    expect(changed).toContain('category');
  });

  it('retorna lista vazia quando objetos são iguais', () => {
    const changed = computeChangedFields(
      { description: 'A', value_cents: 500 },
      { description: 'A', value_cents: 500 },
    );
    expect(changed).toHaveLength(0);
  });

  it('detecta mudança de centavos', () => {
    const changed = computeChangedFields(
      { value_cents: 1000 },
      { value_cents: 2000 },
    );
    expect(changed).toContain('value_cents');
  });
});

// ─── toMillis ─────────────────────────────────────────────────────────────────

describe('toMillis', () => {
  it('retorna 0 para null', () => {
    expect(toMillis(null as unknown as Transaction['updatedAt'])).toBe(0);
  });

  it('retorna 0 para undefined', () => {
    expect(toMillis(undefined as unknown as Transaction['updatedAt'])).toBe(0);
  });

  it('retorna valor numérico diretamente (ms)', () => {
    expect(toMillis(1_700_000_000_000 as unknown as Transaction['updatedAt'])).toBe(1_700_000_000_000);
  });

  it('parseia string ISO correta para ms', () => {
    const ms = toMillis('2026-06-01T00:00:00.000Z' as unknown as Transaction['updatedAt']);
    expect(ms).toBeGreaterThan(0);
    expect(ms).toBe(Date.parse('2026-06-01T00:00:00.000Z'));
  });

  it('retorna 0 para string inválida', () => {
    expect(toMillis('nao-e-uma-data' as unknown as Transaction['updatedAt'])).toBe(0);
  });

  it('chama toMillis() em objeto Firestore-like', () => {
    const mockTs = { toMillis: () => 1_234_567_890 };
    expect(toMillis(mockTs as unknown as Transaction['updatedAt'])).toBe(1_234_567_890);
  });
});
