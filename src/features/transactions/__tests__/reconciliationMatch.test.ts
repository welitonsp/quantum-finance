import { describe, expect, it } from 'vitest';
import { findMergeCandidate } from '../ReconciliationEngine';
import type { Transaction } from '../../../shared/types/transaction';

type ValueCents = NonNullable<Transaction['value_cents']>;

const cents = (value: number): ValueCents => value as ValueCents;

function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id:            'tx-default',
    description:   'Transacao importada',
    value_cents:   cents(10_000),
    schemaVersion: 2,
    type:          'saida',
    category:      'Diversos',
    date:          '2024-03-15',
    ...overrides,
  };
}

describe('findMergeCandidate — lógica de match da conciliação', () => {
  it('retorna null quando não há transação existente', () => {
    const imported = makeTransaction();

    expect(findMergeCandidate(imported, [])).toBeNull();
  });

  it('retorna null quando diferença de data é maior que 3 dias', () => {
    const imported = makeTransaction({ date: '2024-03-15' });
    const existing = makeTransaction({ id: 'existing-too-far', date: '2024-03-19' });

    expect(findMergeCandidate(imported, [existing])).toBeNull();
  });

  it('retorna null quando diferença percentual de valor é maior que 1%', () => {
    const imported = makeTransaction({ value_cents: cents(10_000) });
    const existing = makeTransaction({ id: 'existing-over-limit', value_cents: cents(10_101) });

    expect(findMergeCandidate(imported, [existing])).toBeNull();
  });

  it('retorna candidato quando data está dentro de 3 dias e valor dentro de 1%', () => {
    const imported = makeTransaction({ date: '2024-03-15', value_cents: cents(10_000) });
    const existing = makeTransaction({ id: 'existing-valid', date: '2024-03-18', value_cents: cents(10_100) });

    const match = findMergeCandidate(imported, [existing]);

    expect(match?.transaction.id).toBe('existing-valid');
    expect(match?.dayDiff).toBe(3);
    expect(match?.pctDiff).toBe(0.01);
  });

  it('preserva a escolha do primeiro candidato válido na ordem do array', () => {
    const imported = makeTransaction({ date: '2024-03-15', value_cents: cents(10_000) });
    const firstValid = makeTransaction({ id: 'first-valid', date: '2024-03-17', value_cents: cents(10_050) });
    const exactLater = makeTransaction({ id: 'exact-later', date: '2024-03-15', value_cents: cents(10_000) });

    const match = findMergeCandidate(imported, [firstValid, exactLater]);

    expect(match?.transaction.id).toBe('first-valid');
  });

  it('confidenceLabel é "Exato" quando data e valor são exatos', () => {
    const imported = makeTransaction({ date: '2024-03-15', value_cents: cents(10_000) });
    const existing = makeTransaction({ id: 'exact', date: '2024-03-15', value_cents: cents(10_000) });

    const match = findMergeCandidate(imported, [existing]);

    expect(match?.confidenceLabel).toBe('Exato');
  });

  it('confidenceLabel é "Alto" para match forte, mas não exato', () => {
    const imported = makeTransaction({ date: '2024-03-15', value_cents: cents(10_000) });
    const existing = makeTransaction({ id: 'strong', date: '2024-03-16', value_cents: cents(10_000) });

    const match = findMergeCandidate(imported, [existing]);

    expect(match?.confidenceLabel).toBe('Alto');
  });

  it('confidenceLabel é "Médio" para match dentro do limite, mas menos forte', () => {
    const imported = makeTransaction({ date: '2024-03-15', value_cents: cents(10_000) });
    const existing = makeTransaction({ id: 'medium', date: '2024-03-17', value_cents: cents(10_050) });

    const match = findMergeCandidate(imported, [existing]);

    expect(match?.confidenceLabel).toBe('Médio');
  });

  it('reasons inclui motivo de valor exato/compatível', () => {
    const imported = makeTransaction({ value_cents: cents(10_000) });
    const exactValue = makeTransaction({ id: 'exact-value', value_cents: cents(10_000) });
    const compatibleValue = makeTransaction({ id: 'compatible-value', value_cents: cents(10_050) });

    expect(findMergeCandidate(imported, [exactValue])?.reasons).toContain('Valor exato');
    expect(findMergeCandidate(imported, [compatibleValue])?.reasons).toContain('Valor compatível');
  });

  it('reasons inclui motivo de data igual/próxima', () => {
    const imported = makeTransaction({ date: '2024-03-15' });
    const sameDate = makeTransaction({ id: 'same-date', date: '2024-03-15' });
    const closeDate = makeTransaction({ id: 'close-date', date: '2024-03-17' });

    expect(findMergeCandidate(imported, [sameDate])?.reasons).toContain('Data igual');
    expect(findMergeCandidate(imported, [closeDate])?.reasons).toContain('Data próxima: 2 dia(s)');
  });

  it('usa value_cents como fonte canônica quando disponível', () => {
    const imported = makeTransaction({
      value:       999_999,
      value_cents: cents(10_000),
    });
    const existing = makeTransaction({
      id:          'canonical-cents',
      value:       1,
      value_cents: cents(10_000),
    });

    const match = findMergeCandidate(imported, [existing]);

    expect(match?.transaction.id).toBe('canonical-cents');
    expect(match?.confidenceLabel).toBe('Exato');
  });

  it('não depende de descrição para match, pois descrição ainda não faz parte do critério', () => {
    const imported = makeTransaction({
      description: 'Supermercado importado',
      date:        '2024-03-15',
      value_cents: cents(10_000),
    });
    const existing = makeTransaction({
      id:          'different-description',
      description: 'Transferencia manual sem relacao textual',
      date:        '2024-03-15',
      value_cents: cents(10_000),
    });

    const match = findMergeCandidate(imported, [existing]);

    expect(match?.transaction.id).toBe('different-description');
  });
});
