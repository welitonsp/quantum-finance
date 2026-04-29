import { describe, expect, it } from 'vitest';
import {
  ALLOWED_CATEGORIES,
  accountCreateSchema,
  accountUpdateSchema,
  creditCardSchema,
  recurringSchema,
  transactionCreateSchema,
  transactionUpdateSchema,
  validateTransaction,
} from './financialSchemas';

const baseTransaction = {
  description: 'Supermercado ABC',
  value_cents: 123456,
  type: 'saida',
  category: 'Alimentação',
  date: '2026-04-01',
  source: 'manual',
  schemaVersion: 2,
} as const;

describe('financialSchemas - transações', () => {
  it('aceita uma transação canônica v2', () => {
    const result = validateTransaction(baseTransaction);
    expect(result.success).toBe(true);
  });

  it('rejeita value float como fonte principal', () => {
    expect(transactionCreateSchema.safeParse({
      ...baseTransaction,
      value: 1234.56,
    }).success).toBe(false);
  });

  it('rejeita value_cents zero, negativo ou fracionado', () => {
    expect(transactionCreateSchema.safeParse({ ...baseTransaction, value_cents: 0 }).success).toBe(false);
    expect(transactionCreateSchema.safeParse({ ...baseTransaction, value_cents: -1 }).success).toBe(false);
    expect(transactionCreateSchema.safeParse({ ...baseTransaction, value_cents: 10.5 }).success).toBe(false);
  });

  it('rejeita tipo inválido', () => {
    expect(transactionCreateSchema.safeParse({
      ...baseTransaction,
      type: 'transferencia',
    }).success).toBe(false);
  });

  it('rejeita data inválida', () => {
    expect(transactionCreateSchema.safeParse({ ...baseTransaction, date: '01/04/2026' }).success).toBe(false);
    expect(transactionCreateSchema.safeParse({ ...baseTransaction, date: '2026-02-30' }).success).toBe(false);
  });

  it('bloqueia campos controlados pelo cliente e campos desconhecidos', () => {
    expect(transactionCreateSchema.safeParse({ ...baseTransaction, id: 'client-id' }).success).toBe(false);
    expect(transactionCreateSchema.safeParse({ ...baseTransaction, uid: 'uid1' }).success).toBe(false);
    expect(transactionCreateSchema.safeParse({ ...baseTransaction, createdAt: new Date() }).success).toBe(false);
    expect(transactionCreateSchema.safeParse({ ...baseTransaction, unknown: true }).success).toBe(false);
  });

  it('aceita todas as categorias permitidas', () => {
    for (const category of ALLOWED_CATEGORIES) {
      expect(transactionCreateSchema.safeParse({ ...baseTransaction, category }).success).toBe(true);
    }
  });

  it('aceita categorias personalizadas como string segura', () => {
    for (const category of ['Petshop', 'Academia', 'Pix da Avó', 'Remédio Manipulado']) {
      const result = transactionCreateSchema.safeParse({ ...baseTransaction, category });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.category).toBe(category);
    }
  });

  it('rejeita categorias vazias, longas ou de tipo inválido', () => {
    expect(transactionCreateSchema.safeParse({ ...baseTransaction, category: '' }).success).toBe(false);
    expect(transactionCreateSchema.safeParse({ ...baseTransaction, category: '     ' }).success).toBe(false);
    expect(transactionCreateSchema.safeParse({ ...baseTransaction, category: 'a'.repeat(81) }).success).toBe(false);
    expect(transactionCreateSchema.safeParse({ ...baseTransaction, category: null }).success).toBe(false);
    expect(transactionCreateSchema.safeParse({ ...baseTransaction, category: undefined }).success).toBe(false);
    expect(transactionCreateSchema.safeParse({ ...baseTransaction, category: 123 }).success).toBe(false);
    expect(transactionCreateSchema.safeParse({ ...baseTransaction, category: { name: 'Petshop' } }).success).toBe(false);
  });

  it('update é strict, parcial e não aceita alteração de createdAt', () => {
    expect(transactionUpdateSchema.safeParse({ category: 'Saúde' }).success).toBe(true);
    expect(transactionUpdateSchema.safeParse({ category: 'Petshop' }).success).toBe(true);
    expect(transactionUpdateSchema.safeParse({}).success).toBe(false);
    expect(transactionUpdateSchema.safeParse({ createdAt: new Date() }).success).toBe(false);
  });
});

describe('financialSchemas - contas, recorrências e cartões', () => {
  it('valida accounts com balance em centavos', () => {
    expect(accountCreateSchema.safeParse({
      name: 'Conta Corrente',
      type: 'corrente',
      balance: 100000,
      schemaVersion: 2,
    }).success).toBe(true);

    expect(accountCreateSchema.safeParse({
      name: 'Conta Corrente',
      type: 'corrente',
      balance: 1000.25,
      schemaVersion: 2,
    }).success).toBe(false);
  });

  it('valida updates de account sem aceitar campos desconhecidos', () => {
    expect(accountUpdateSchema.safeParse({ balance: -2500 }).success).toBe(true);
    expect(accountUpdateSchema.safeParse({ value: 25 }).success).toBe(false);
  });

  it('valida recorrência canônica em centavos', () => {
    expect(recurringSchema.safeParse({
      description: 'Netflix',
      value_cents: 3990,
      type: 'saida',
      category: 'Assinaturas',
      dueDay: 10,
      schemaVersion: 2,
    }).success).toBe(true);

    expect(recurringSchema.safeParse({
      description: 'Netflix',
      value: 39.9,
      category: 'Assinaturas',
      dueDay: 10,
    }).success).toBe(false);
  });

  it('valida cartão de crédito com limite em centavos', () => {
    expect(creditCardSchema.safeParse({
      name: 'Nubank Platinum',
      limit: 500000,
      closingDay: 5,
      dueDay: 15,
      schemaVersion: 2,
    }).success).toBe(true);

    expect(creditCardSchema.safeParse({
      name: 'Nubank Platinum',
      limit: 5000.5,
      closingDay: 5,
      dueDay: 15,
      schemaVersion: 2,
    }).success).toBe(false);
  });
});
