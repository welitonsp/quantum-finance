import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockCollection, mockQuery, mockWhere, mockOrderBy, mockLimit, mockGetDocs, mockLog,
} = vi.hoisted(() => ({
  mockCollection: vi.fn((_db: unknown, ...s: string[]) => ({ path: s.join('/') })),
  mockQuery:      vi.fn((ref: unknown, ...clauses: unknown[]) => ({ ref, clauses })),
  mockWhere:      vi.fn((field: string, op: string, value: unknown) => ({ _where: [field, op, value] })),
  mockOrderBy:    vi.fn((field: string, dir: string) => ({ _orderBy: [field, dir] })),
  mockLimit:      vi.fn((n: number) => ({ _limit: n })),
  mockGetDocs:    vi.fn(),
  mockLog:        vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  collection: mockCollection,
  query:      mockQuery,
  where:      mockWhere,
  orderBy:    mockOrderBy,
  limit:      mockLimit,
  getDocs:    mockGetDocs,
}));

vi.mock('../../shared/api/firebase/index', () => ({ db: { _isMock: true } }));
vi.mock('../../shared/lib/firebaseErrorHandling', () => ({ logSanitizedFirebaseError: mockLog }));

import { findImportCandidateTransactions } from './importCandidateSearch';

const VALID = { uid: 'u1', periodStart: '2026-01-01', periodEnd: '2026-01-31' };

function snapshot(docs: Array<{ id: string; data: Record<string, unknown> }>) {
  return { docs: docs.map(d => ({ id: d.id, data: () => d.data })) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetDocs.mockResolvedValue(snapshot([]));
});

describe('findImportCandidateTransactions — guardas de entrada', () => {
  it.each([
    ['uid vazio',            { ...VALID, uid: '' }],
    ['uid só whitespace',    { ...VALID, uid: '   ' }],
    ['periodStart não-ISO (2026-1-05)', { ...VALID, periodStart: '2026-1-05' }],
    ['periodStart não-ISO (aaaa-bb-cc)', { ...VALID, periodStart: 'aaaa-bb-cc' }],
    ['data ISO inválida no calendário (2026-02-30)', { ...VALID, periodStart: '2026-02-30' }],
    ['periodEnd inválido',   { ...VALID, periodEnd: '2026-13-01' }],
    ['periodStart > periodEnd', { ...VALID, periodStart: '2026-02-01', periodEnd: '2026-01-01' }],
  ])('%s → retorna [] sem consultar', async (_label, params) => {
    const result = await findImportCandidateTransactions(params);
    expect(result).toEqual([]);
    expect(mockGetDocs).not.toHaveBeenCalled();
  });
});

describe('findImportCandidateTransactions — resolveMaxCandidates (via limit)', () => {
  it.each([
    ['omitido → default 300',    undefined, 300],
    ['NaN → default 300',        Number.NaN, 300],
    ['Infinity → default 300',   Number.POSITIVE_INFINITY, 300],
    ['0 → default 300',          0, 300],
    ['negativo → default 300',   -5, 300],
    ['fracionário → Math.floor', 12.9, 12],
    ['dentro do teto',           400, 400],
    ['acima do teto → 500',      999, 500],
  ])('%s', async (_label, maxCandidates, expected) => {
    await findImportCandidateTransactions({ ...VALID, maxCandidates: maxCandidates as number });
    expect(mockLimit).toHaveBeenCalledWith(expected);
  });
});

describe('findImportCandidateTransactions — montagem da query', () => {
  it('usa collection users/{uid}/transactions (uid com trim) e cláusulas de data', async () => {
    await findImportCandidateTransactions({ ...VALID, uid: '  u1  ' });

    expect(mockCollection).toHaveBeenCalledWith(
      { _isMock: true }, 'users', 'u1', 'transactions',
    );
    expect(mockWhere).toHaveBeenCalledWith('date', '>=', '2026-01-01');
    expect(mockWhere).toHaveBeenCalledWith('date', '<=', '2026-01-31');
    expect(mockOrderBy).toHaveBeenCalledWith('date', 'asc');
  });
});

describe('findImportCandidateTransactions — mapeamento e filtro de soft-delete', () => {
  it('mapeia docs e exclui isDeleted/deletedAt', async () => {
    mockGetDocs.mockResolvedValue(snapshot([
      { id: 'a', data: { description: 'Ativa', category: 'Outros' } },
      { id: 'b', data: { description: 'Apagada flag', isDeleted: true } },
      { id: 'c', data: { description: 'Apagada ts', deletedAt: 1710000000 } },
      { id: 'd', data: { description: 'Ativa 2', isDeleted: false, deletedAt: null } },
    ]));

    const result = await findImportCandidateTransactions(VALID);

    expect(result.map(t => t.id)).toEqual(['a', 'd']);
    expect(result[0]).toMatchObject({ id: 'a', description: 'Ativa', category: 'Outros' });
  });
});

describe('findImportCandidateTransactions — erro', () => {
  it('erro no getDocs → retorna [] e loga sanitizado', async () => {
    mockGetDocs.mockRejectedValue(new Error('perm denied'));

    const result = await findImportCandidateTransactions(VALID);

    expect(result).toEqual([]);
    expect(mockLog).toHaveBeenCalledWith('import_candidate_search', expect.any(Error));
  });
});
