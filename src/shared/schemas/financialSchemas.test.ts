import { describe, it, expect } from 'vitest';
import {
  toCentavos,
  fromCentavos,
  validateTransaction,
  validateCreditCard,
  recurringSchema,
  transactionSchema,
  ALLOWED_CATEGORIES,
} from './financialSchemas';

// Helper — gera data YYYY-MM-DD relativa a hoje
const offsetDate = (days: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

describe('Motor Financeiro — Conversão Centavos ↔ Reais', () => {
  describe('toCentavos', () => {
    it('converte valores canónicos sem perda', () => {
      expect(toCentavos(10.5)).toBe(1050);
      expect(toCentavos(0)).toBe(0);
      expect(toCentavos(1)).toBe(100);
      expect(toCentavos(999999.99)).toBe(99_999_999);
    });

    it('arredonda half-up na última casa (bancário)', () => {
      expect(toCentavos(1.005)).toBe(101);   // 1.005 → 1.01
      expect(toCentavos(1.004)).toBe(100);
      expect(toCentavos(0.995)).toBe(100);   // 0.995 → 1.00
      expect(toCentavos(2.675)).toBe(268);   // caso clássico IEEE-754
    });

    it('aceita strings e espaços', () => {
      expect(toCentavos('10.50')).toBe(1050);
      expect(toCentavos('0.01')).toBe(1);
    });

    it('retorna 0 para null, undefined e string vazia', () => {
      expect(toCentavos(null)).toBe(0);
      expect(toCentavos(undefined)).toBe(0);
      expect(toCentavos('')).toBe(0);
    });

    it('preserva sinal negativo', () => {
      expect(toCentavos(-10.5)).toBe(-1050);
      expect(toCentavos('-1.005')).toBe(-101);
    });
  });

  describe('fromCentavos', () => {
    it('reverte sem perda de precisão', () => {
      expect(fromCentavos(1050)).toBe(10.5);
      expect(fromCentavos(1)).toBe(0.01);
      expect(fromCentavos(0)).toBe(0);
      expect(fromCentavos(99_999_999)).toBe(999999.99);
    });

    it('é robusto contra null/undefined', () => {
      expect(fromCentavos(null)).toBe(0);
      expect(fromCentavos(undefined)).toBe(0);
    });

    it('é inverso de toCentavos para valores monetários comuns', () => {
      const samples = [0.01, 1, 9.99, 123.45, 1000, 1234567.89];
      for (const v of samples) {
        expect(fromCentavos(toCentavos(v))).toBe(v);
      }
    });
  });
});

describe('Schemas Zod — transactionSchema', () => {
  const base = {
    description: 'Supermercado ABC',
    value: 1500,
    type: 'saida' as const,
    category: 'Alimentação' as const,
    date: offsetDate(-1),
  };

  it('aceita transação válida com defaults', () => {
    const r = validateTransaction(base);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.isRecurring).toBe(false);
  });

  it('rejeita descrição curta', () => {
    const r = validateTransaction({ ...base, description: 'A' });
    expect(r.success).toBe(false);
  });

  it('rejeita valor negativo, zero ou não-inteiro (centavos)', () => {
    expect(validateTransaction({ ...base, value: -100 }).success).toBe(false);
    expect(validateTransaction({ ...base, value: 0 }).success).toBe(false);
    expect(validateTransaction({ ...base, value: 10.5 }).success).toBe(false);
  });

  it('rejeita tipos fora de "entrada" | "saida"', () => {
    expect(validateTransaction({ ...base, type: 'transferencia' }).success).toBe(false);
  });

  it('rejeita categoria fora da lista permitida', () => {
    expect(validateTransaction({ ...base, category: 'Cassino' }).success).toBe(false);
  });

  it('rejeita formato de data inválido', () => {
    expect(validateTransaction({ ...base, date: '01/04/2026' }).success).toBe(false);
    expect(validateTransaction({ ...base, date: '2026-4-1' }).success).toBe(false);
    expect(validateTransaction({ ...base, date: '' }).success).toBe(false);
  });

  it('rejeita datas demasiado antigas ou demasiado futuras', () => {
    expect(validateTransaction({ ...base, date: offsetDate(-365 * 3) }).success).toBe(false);
    expect(validateTransaction({ ...base, date: offsetDate(60) }).success).toBe(false);
  });

  it('aceita fronteiras razoáveis (hoje, +30 dias, ~-2 anos)', () => {
    expect(validateTransaction({ ...base, date: offsetDate(0) }).success).toBe(true);
    expect(validateTransaction({ ...base, date: offsetDate(29) }).success).toBe(true);
    expect(validateTransaction({ ...base, date: offsetDate(-365) }).success).toBe(true);
  });

  it('todas as ALLOWED_CATEGORIES são aceites', () => {
    for (const category of ALLOWED_CATEGORIES) {
      const r = transactionSchema.safeParse({ ...base, category });
      expect(r.success, `categoria "${category}" deveria ser válida`).toBe(true);
    }
  });
});

describe('Schemas Zod — recurringSchema', () => {
  const base = {
    description: 'Assinatura Netflix',
    value: 3990,
    category: 'Assinaturas' as const,
    dueDay: 10,
  };

  it('aplica default active=true', () => {
    const r = recurringSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.active).toBe(true);
  });

  it('rejeita dueDay fora [1, 31]', () => {
    expect(recurringSchema.safeParse({ ...base, dueDay: 0 }).success).toBe(false);
    expect(recurringSchema.safeParse({ ...base, dueDay: 32 }).success).toBe(false);
  });

  it('rejeita valor não-inteiro', () => {
    expect(recurringSchema.safeParse({ ...base, value: 39.9 }).success).toBe(false);
  });
});

describe('Schemas Zod — creditCardSchema', () => {
  const base = {
    name: 'Nubank Platinum',
    limit: 500_000,
    closingDay: 5,
    dueDay: 15,
  };

  it('aplica defaults (color, active)', () => {
    const r = validateCreditCard(base);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.color).toBe('#00E68A');
      expect(r.data.active).toBe(true);
    }
  });

  it('rejeita limite não-positivo', () => {
    expect(validateCreditCard({ ...base, limit: 0 }).success).toBe(false);
    expect(validateCreditCard({ ...base, limit: -1 }).success).toBe(false);
  });

  it('rejeita closingDay/dueDay fora [1, 31]', () => {
    expect(validateCreditCard({ ...base, closingDay: 0 }).success).toBe(false);
    expect(validateCreditCard({ ...base, dueDay: 32 }).success).toBe(false);
  });

  it('rejeita nome curto', () => {
    expect(validateCreditCard({ ...base, name: 'A' }).success).toBe(false);
  });
});
