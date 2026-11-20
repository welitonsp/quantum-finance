import { beforeEach, describe, expect, it, vi } from 'vitest';

type FakeDoc = { id: string; data: () => Record<string, unknown> };

const { mockGetDocs, mockQuery, mockWhere, mockOrderBy, mockLimit, mockStartAfter, mockCollection } = vi.hoisted(() => ({
  mockGetDocs: vi.fn(),
  mockQuery: vi.fn((col: unknown, ...constraints: unknown[]) => ({ col, constraints })),
  mockWhere: vi.fn((field: string, op: string, value: unknown) => ({ kind: 'where', field, op, value })),
  mockOrderBy: vi.fn((field: string, dir: string) => ({ kind: 'orderBy', field, dir })),
  mockLimit: vi.fn((n: number) => ({ kind: 'limit', n })),
  mockStartAfter: vi.fn((cursor: unknown) => ({ kind: 'startAfter', cursor })),
  mockCollection: vi.fn((_db: unknown, ...s: string[]) => ({ path: s.join('/') })),
}));

vi.mock('firebase/firestore', () => ({
  collection: mockCollection,
  getDocs: mockGetDocs,
  limit: mockLimit,
  orderBy: mockOrderBy,
  query: mockQuery,
  startAfter: mockStartAfter,
  where: mockWhere,
}));

vi.mock('../api/firebase/index', () => ({ db: { _isMock: true } }));

import {
  PERIOD_MAX_PAGES,
  PERIOD_PAGE_SIZE,
  fetchEarliestTransactionYear,
  fetchTransactionsInDateRange,
  yearRange,
} from './transactionPeriodRepo';

function docs(n: number, offset = 0, extra: Record<string, unknown> = {}): FakeDoc[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `tx-${offset + i}`,
    data: () => ({ type: 'entrada', value_cents: 100, date: '2025-05-10', ...extra }),
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('fetchTransactionsInDateRange', () => {
  it('valida uid e período', async () => {
    await expect(fetchTransactionsInDateRange('', '2025-01-01', '2025-12-31')).rejects.toThrow(/UID/);
    await expect(fetchTransactionsInDateRange('u1', '2025-12-31', '2025-01-01')).rejects.toThrow(/Período/);
    await expect(fetchTransactionsInDateRange('u1', '2025-1-1', '2025-12-31')).rejects.toThrow(/Período/);
  });

  it('pagina além de 500 até cobrir o período (motivo do P-01)', async () => {
    mockGetDocs
      .mockResolvedValueOnce({ docs: docs(PERIOD_PAGE_SIZE, 0) })
      .mockResolvedValueOnce({ docs: docs(PERIOD_PAGE_SIZE, PERIOD_PAGE_SIZE) })
      .mockResolvedValueOnce({ docs: docs(120, 2 * PERIOD_PAGE_SIZE) });

    const result = await fetchTransactionsInDateRange('u1', '2025-01-01', '2025-12-31');

    expect(result.transactions).toHaveLength(1120);
    expect(result.truncated).toBe(false);
    expect(mockGetDocs).toHaveBeenCalledTimes(3);
    expect(mockStartAfter).toHaveBeenCalledTimes(2);
    expect(mockCollection).toHaveBeenCalledWith({ _isMock: true }, 'users', 'u1', 'transactions');
    expect(mockWhere).toHaveBeenCalledWith('date', '>=', '2025-01-01');
    expect(mockWhere).toHaveBeenCalledWith('date', '<=', '2025-12-31');
  });

  it('descarta soft-delete', async () => {
    mockGetDocs.mockResolvedValueOnce({
      docs: [...docs(2), ...docs(1, 10, { isDeleted: true }), ...docs(1, 20, { deletedAt: { seconds: 1 } })],
    });
    const result = await fetchTransactionsInDateRange('u1', '2025-01-01', '2025-12-31');
    expect(result.transactions.map(t => t.id)).toEqual(['tx-0', 'tx-1']);
  });

  it('para no teto de segurança e sinaliza truncated', async () => {
    mockGetDocs.mockImplementation(async () => ({ docs: docs(PERIOD_PAGE_SIZE) }));
    const result = await fetchTransactionsInDateRange('u1', '2025-01-01', '2025-12-31');
    expect(mockGetDocs).toHaveBeenCalledTimes(PERIOD_MAX_PAGES);
    expect(result.truncated).toBe(true);
  });
});

describe('fetchEarliestTransactionYear / yearRange', () => {
  it('lê o ano da transação mais antiga', async () => {
    mockGetDocs.mockResolvedValueOnce({ docs: [{ id: 'a', data: () => ({ date: '2019-03-02' }) }] });
    await expect(fetchEarliestTransactionYear('u1')).resolves.toBe(2019);
    expect(mockOrderBy).toHaveBeenCalledWith('date', 'asc');
    expect(mockLimit).toHaveBeenCalledWith(1);
  });

  it('retorna null sem transações ou com data inválida', async () => {
    mockGetDocs.mockResolvedValueOnce({ docs: [] });
    await expect(fetchEarliestTransactionYear('u1')).resolves.toBeNull();
    mockGetDocs.mockResolvedValueOnce({ docs: [{ id: 'a', data: () => ({ date: 'x' }) }] });
    await expect(fetchEarliestTransactionYear('u1')).resolves.toBeNull();
  });

  it('yearRange lista do ano atual ao mais antigo', () => {
    expect(yearRange(2022, 2025)).toEqual([2025, 2024, 2023, 2022]);
    expect(yearRange(null, 2025)).toEqual([2025]);
    expect(yearRange(2030, 2025)).toEqual([2025]);
  });
});
