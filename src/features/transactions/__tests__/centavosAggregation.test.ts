import { describe, expect, it, vi } from 'vitest';
import type { Centavos } from '../../../shared/types/money';

vi.mock('../../../shared/api/firebase/auth', () => ({
  auth: { currentUser: null },
}));

vi.mock('../../../hooks/useCategories', () => ({
  useCategories: vi.fn(() => ({ categories: [] })),
}));

vi.mock('../../../components/AuditTimeline', () => ({
  default: () => null,
}));

vi.mock('../../../shared/lib/useParserWorker', () => ({
  useParserWorker: vi.fn(),
}));

vi.mock('../../../utils/aiCategorize', () => ({
  batchCategorizeDescriptions: vi.fn(),
}));

vi.mock('../../../shared/services/FirestoreService', () => ({
  FirestoreService: { updateTransaction: vi.fn() },
}));

vi.mock('../../../shared/services/AuditService', () => ({
  AuditService: { logTransactionHistory: vi.fn() },
}));

vi.mock('../ReconciliationEngine', () => ({
  default: () => null,
}));

import { calculatePreviewTotals } from '../ImportButton';
import { calculateTransactionTotals } from '../TransactionsManager';

function cents(value: number): Centavos {
  return value as Centavos;
}

describe('P1-1 centavos aggregation', () => {
  it('soma R$ 0,10 + R$ 0,20 e R$ 0,30 em centavos antes da conversao final', () => {
    const transactions = [
      { type: 'entrada' as const, value_cents: cents(10), schemaVersion: 2 as const },
      { type: 'entrada' as const, value_cents: cents(20), schemaVersion: 2 as const },
      { type: 'saida' as const, value_cents: cents(30), schemaVersion: 2 as const },
    ];

    const managerTotals = calculateTransactionTotals(transactions);
    const previewTotals = calculatePreviewTotals(transactions);

    expect(0.1 + 0.2).not.toBe(0.3);
    expect(managerTotals.totalIn).toBe(0.3);
    expect(managerTotals.totalOut).toBe(0.3);
    expect(managerTotals.net).toBe(0);
    expect(previewTotals.totEntry).toBe(0.3);
    expect(previewTotals.totExit).toBe(0.3);
  });
});
