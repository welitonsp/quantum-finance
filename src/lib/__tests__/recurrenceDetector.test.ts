import { describe, expect, it } from 'vitest';
import { detectRecurrenceCandidates } from '../recurrenceDetector';
import type { Transaction } from '../../shared/types/transaction';
import type { Centavos } from '../../shared/types/money';

/** Cast local de fixtures de teste para o tipo branded Centavos. */
const cents = (n: number): Centavos => n as Centavos;

let seq = 0;
function tx(partial: Partial<Omit<Transaction, 'value_cents'>> & { value_cents?: number }): Transaction {
  seq += 1;
  const { value_cents, ...rest } = partial;
  return {
    id: `tx-${seq}`,
    description: 'Assinatura',
    date: '2026-01-10',
    value_cents: cents(value_cents ?? 5000),
    type: 'saida',
    ...rest,
  } as Transaction;
}

/** Série mensal regular de mesmo valor (candidata clássica). */
function monthlySeries(desc: string, valueCents: number, category?: string): Transaction[] {
  return ['2026-01-10', '2026-02-10', '2026-03-10'].map((date) =>
    tx({ description: desc, date, value_cents: valueCents, ...(category ? { category } : {}) }),
  );
}

describe('detectRecurrenceCandidates', () => {
  it('detecta série mensal regular de mesmo valor', () => {
    const candidates = detectRecurrenceCandidates(monthlySeries('Netflix', 5000, 'Streaming'));
    expect(candidates).toHaveLength(1);
    const c = candidates[0]!;
    expect(c.description).toBe('netflix');
    expect(c.avgAmountCents).toBe(5000);
    expect(c.intervalDays).toBeGreaterThanOrEqual(28);
    expect(c.intervalDays).toBeLessThanOrEqual(31);
    expect(c.confidence).toBeGreaterThan(0.8); // 0.85 — Fev com 28 dias reduz a regularidade
    expect(c.suggestedCategory).toBe('Streaming');
    expect(c.occurrences).toHaveLength(3);
  });

  it('exige ao menos 3 ocorrências', () => {
    const two = monthlySeries('Spotify', 2000).slice(0, 2);
    expect(detectRecurrenceCandidates(two)).toHaveLength(0);
  });

  it('exclui intervalos irregulares (cv >= 0.20)', () => {
    const irregular = [
      tx({ description: 'Irregular', date: '2026-01-01', value_cents: 3000 }),
      tx({ description: 'Irregular', date: '2026-01-05', value_cents: 3000 }),
      tx({ description: 'Irregular', date: '2026-03-20', value_cents: 3000 }),
    ];
    expect(detectRecurrenceCandidates(irregular)).toHaveLength(0);
  });

  it('exclui quando o valor varia mais de ±15%', () => {
    const volatile = [
      tx({ description: 'Mercado', date: '2026-01-10', value_cents: 10000 }),
      tx({ description: 'Mercado', date: '2026-02-10', value_cents: 10000 }),
      tx({ description: 'Mercado', date: '2026-03-10', value_cents: 20000 }),
    ];
    expect(detectRecurrenceCandidates(volatile)).toHaveLength(0);
  });

  it('exclui transferências, parcelas, receitas e deletadas', () => {
    const excluded = [
      ...monthlySeries('Transf', 5000).map((t) => ({ ...t, type: 'transferencia' as const })),
      ...monthlySeries('Parcela', 5000).map((t) => ({ ...t, installmentGroupId: 'grp-1' })),
      ...monthlySeries('Salario', 5000).map((t) => ({ ...t, type: 'entrada' as const })),
      ...monthlySeries('Apagada', 5000).map((t) => ({ ...t, isDeleted: true })),
    ];
    expect(detectRecurrenceCandidates(excluded)).toHaveLength(0);
  });

  it('ignora transações sem data, sem valor ou com valor <= 0', () => {
    const invalid = [
      tx({ description: 'X', date: '', value_cents: 5000 }),
      tx({ description: 'X', date: '2026-02-10', value_cents: 0 }),
      tx({ description: 'X', date: '2026-03-10', value_cents: -100 }),
    ];
    expect(detectRecurrenceCandidates(invalid)).toHaveLength(0);
  });

  it('omite suggestedCategory quando nenhuma ocorrência tem categoria', () => {
    const candidates = detectRecurrenceCandidates(monthlySeries('Sem categoria', 4000));
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.suggestedCategory).toBeUndefined();
  });

  it('ordena múltiplos candidatos por confiança decrescente', () => {
    const perfect = monthlySeries('Perfeita', 5000);
    const noisy = [
      tx({ description: 'Ruidosa', date: '2026-01-10', value_cents: 5000 }),
      tx({ description: 'Ruidosa', date: '2026-02-12', value_cents: 5400 }),
      tx({ description: 'Ruidosa', date: '2026-03-11', value_cents: 4700 }),
    ];
    const candidates = detectRecurrenceCandidates([...noisy, ...perfect]);
    expect(candidates.length).toBeGreaterThanOrEqual(1);
    for (let i = 1; i < candidates.length; i++) {
      expect(candidates[i - 1]!.confidence).toBeGreaterThanOrEqual(candidates[i]!.confidence);
    }
  });
});
