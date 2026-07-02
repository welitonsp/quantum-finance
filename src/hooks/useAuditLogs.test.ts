import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { AuditLog } from '../shared/services/AuditService';

const { mockOnSnapshot, mockGetDocs } = vi.hoisted(() => ({
  mockOnSnapshot: vi.fn(),
  mockGetDocs: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({ kind: 'col' })),
  query: vi.fn((ref: unknown) => ref),
  orderBy: vi.fn(),
  limit: vi.fn(),
  startAfter: vi.fn(),
  onSnapshot: mockOnSnapshot,
  getDocs: mockGetDocs,
}));

vi.mock('../shared/api/firebase/index', () => ({
  db: { _isMock: true },
  functions: { _isMock: true },
}));

import { mapLog, useAuditLogs } from './useAuditLogs';

function makeDoc(id: string, overrides: Partial<AuditLog> & Record<string, unknown> = {}) {
  return {
    id,
    data: () => ({
      action: 'BULK_UPDATE',
      entity: 'TRANSACTION',
      userId: 'uid-1',
      metadata: { count: 1, changes: [] },
      createdAt: { toMillis: () => Date.now() },
      schemaVersion: 2,
      ...overrides,
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockOnSnapshot.mockReturnValue(vi.fn()); // default: unsub noop
});

const createdAt = { toMillis: () => 1710000000000 };

function makeLog(overrides: Partial<AuditLog> & Record<string, unknown> = {}): AuditLog {
  return {
    id:            'audit-1',
    userId:        'uid-1',
    action:        'BULK_UPDATE',
    entity:        'TRANSACTION',
    details:       'Detalhes',
    metadata:      { count: 2, changes: [] },
    createdAt,
    schemaVersion: 2,
    ...overrides,
  } as unknown as AuditLog;
}

describe('mapLog', () => {
  it('exibe IMPORT_TRANSACTION como movimentacao importada com origem e valor', () => {
    const view = mapLog(makeLog({
      action: 'IMPORT_TRANSACTION' as never,
      source: 'csv',
      amount_cents: 30,
      metadata: { count: 0, changes: [] },
    }));

    expect(view.title).toBe('Movimentação importada');
    expect(view.subtitle).toContain('Origem: CSV');
    expect(view.subtitle).toContain('Valor: R$ 0,30');
    expect(view.title).not.toBe('Ação do sistema');
    expect(view.subtitle).not.toBe('0 itens afetados');
  });

  it('mantem os mapeamentos existentes de BULK_UPDATE e UNDO_BULK_UPDATE', () => {
    const bulk = mapLog(makeLog({
      metadata: {
        count: 2,
        changes: [
          { id: 'tx-1', from: 'Outros', to: 'Saúde' },
          { id: 'tx-2', from: 'Outros', to: 'Saúde' },
        ],
      },
    }));

    const undo = mapLog(makeLog({
      action: 'UNDO_BULK_UPDATE',
      metadata: { count: 2, changes: [] },
    }));

    expect(bulk.title).toBe('Recategorização em lote');
    expect(bulk.subtitle).toBe("2 transações movidas para 'Saúde'");
    expect(undo.title).toBe('Desfazer alterações');
    expect(undo.subtitle).toBe('2 transações restauradas');
  });

  // ─── safeTimestamp branches ──────────────────────────────────────────────

  it('safeTimestamp: ts falsy retorna Date.now() aproximado (linha 25)', () => {
    const before = Date.now();
    const view = mapLog(makeLog({ createdAt: null as unknown as never }));
    expect(view.timestamp).toBeGreaterThanOrEqual(before);
  });

  it('safeTimestamp: ts numérico finito é usado diretamente (linha 30)', () => {
    const view = mapLog(makeLog({ createdAt: 9999999 as unknown as never }));
    expect(view.timestamp).toBe(9999999);
  });

  it('safeTimestamp: ts numérico não-finito volta para Date.now()', () => {
    const before = Date.now();
    const view = mapLog(makeLog({ createdAt: NaN as unknown as never }));
    expect(view.timestamp).toBeGreaterThanOrEqual(before);
  });

  // ─── getImportSubtitle branches ──────────────────────────────────────────

  it('IMPORT_TRANSACTION com amount_display quando amount_cents ausente', () => {
    const view = mapLog(makeLog({
      action: 'IMPORT_TRANSACTION' as never,
      source: 'ofx',
      amount_display: 99.99,
      metadata: { count: 0, changes: [] },
    }));
    expect(view.subtitle).toContain('99');
  });

  it('IMPORT_TRANSACTION com fileName exibido no subtítulo', () => {
    const view = mapLog(makeLog({
      action: 'IMPORT_TRANSACTION' as never,
      source: 'pdf',
      fileName: 'extrato.pdf',
      metadata: { count: 0, changes: [] },
    }));
    expect(view.subtitle).toContain('extrato.pdf');
  });

  it('IMPORT_TRANSACTION com category incluída no subtítulo', () => {
    const view = mapLog(makeLog({
      action: 'IMPORT_TRANSACTION' as never,
      source: 'csv',
      category: 'Alimentação',
      metadata: { count: 0, changes: [] },
    }));
    expect(view.subtitle).toContain('Alimentação');
  });

  it('IMPORT_TRANSACTION sem campos opcionais retorna "Importação registrada"', () => {
    const view = mapLog(makeLog({
      action: 'IMPORT_TRANSACTION' as never,
      metadata: { count: 0, changes: [] },
    }));
    expect(view.subtitle).toBe('Importação registrada');
  });

  // ─── categoryLabel branches ───────────────────────────────────────────────

  it('BULK_UPDATE sem changes usa "categoria desconhecida"', () => {
    const view = mapLog(makeLog({
      metadata: { count: 3, changes: [] },
    }));
    expect(view.subtitle).toContain('categoria desconhecida');
  });

  it('BULK_UPDATE com múltiplas categorias distintas usa "N categorias diferentes"', () => {
    const view = mapLog(makeLog({
      metadata: {
        count: 3,
        changes: [
          { id: 'tx1', from: 'Outros', to: 'Saúde' },
          { id: 'tx2', from: 'Outros', to: 'Alimentação' },
          { id: 'tx3', from: 'Outros', to: 'Lazer' },
        ],
      },
    }));
    expect(view.subtitle).toContain('3 categorias diferentes');
  });

  // ─── actions adicionais ───────────────────────────────────────────────────

  it('ADD_RECURRING retorna título de ação do sistema (fallback)', () => {
    const view = mapLog(makeLog({
      action: 'ADD_RECURRING' as never,
      metadata: { count: 1, changes: [] },
    }));
    expect(view.title).toBe('Ação do sistema');
  });

  it('ação desconhecida retorna fallback genérico', () => {
    const view = mapLog(makeLog({
      action: 'UNKNOWN_ACTION' as never,
      metadata: { count: 5, changes: [] },
    }));
    expect(view.title).toBe('Ação do sistema');
    expect(view.subtitle).toBe('5 itens afetados');
  });
});

// ─── useAuditLogs hook ────────────────────────────────────────────────────────

describe('useAuditLogs hook', () => {
  it('uid vazio: loading=false, logs vazios, sem onSnapshot', async () => {
    const { result, unmount } = renderHook(() => useAuditLogs(''));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.logs).toEqual([]);
    expect(mockOnSnapshot).not.toHaveBeenCalled();
    unmount();
  });

  it('carrega logs via onSnapshot e para loading', async () => {
    mockOnSnapshot.mockImplementation((_q: unknown, onNext: (snap: { docs: ReturnType<typeof makeDoc>[] }) => void) => {
      onNext({ docs: [makeDoc('log-1')] });
      return vi.fn();
    });

    const { result, unmount } = renderHook(() => useAuditLogs('uid-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.logs).toHaveLength(1);
    unmount();
  });

  it('onSnapshot error callback define error state', async () => {
    mockOnSnapshot.mockImplementation((_q: unknown, _onNext: unknown, onError: (e: Error) => void) => {
      onError(new Error('permission-denied'));
      return vi.fn();
    });

    const { result, unmount } = renderHook(() => useAuditLogs('uid-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeTruthy();
    unmount();
  });

  it('snap menor que PAGE_SIZE — hasMoreLogs=false', async () => {
    const docs = Array.from({ length: 10 }, (_, i) => makeDoc(`log-${i}`));
    mockOnSnapshot.mockImplementation((_q: unknown, onNext: (snap: { docs: typeof docs }) => void) => {
      onNext({ docs });
      return vi.fn();
    });

    const { result, unmount } = renderHook(() => useAuditLogs('uid-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hasMoreLogs).toBe(false);
    unmount();
  });

  it('snap igual a PAGE_SIZE (50) — hasMoreLogs=true', async () => {
    const docs = Array.from({ length: 50 }, (_, i) => makeDoc(`log-${i}`));
    mockOnSnapshot.mockImplementation((_q: unknown, onNext: (snap: { docs: typeof docs }) => void) => {
      onNext({ docs });
      return vi.fn();
    });

    const { result, unmount } = renderHook(() => useAuditLogs('uid-1'));
    await waitFor(() => expect(result.current.hasMoreLogs).toBe(true));
    unmount();
  });

  it('loadMoreLogs sem lastDoc retorna sem chamar getDocs', async () => {
    mockOnSnapshot.mockImplementation((_q: unknown, onNext: (snap: { docs: never[] }) => void) => {
      onNext({ docs: [] });
      return vi.fn();
    });

    const { result, unmount } = renderHook(() => useAuditLogs('uid-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => { await result.current.loadMoreLogs(); });

    expect(mockGetDocs).not.toHaveBeenCalled();
    unmount();
  });

  it('loadMoreLogs com lastDoc carrega página adicional', async () => {
    const fullPage = Array.from({ length: 50 }, (_, i) => makeDoc(`log-${i}`));
    mockOnSnapshot.mockImplementation((_q: unknown, onNext: (snap: { docs: typeof fullPage }) => void) => {
      onNext({ docs: fullPage });
      return vi.fn();
    });
    mockGetDocs.mockResolvedValueOnce({ docs: [makeDoc('older-1'), makeDoc('older-2')] });

    const { result, unmount } = renderHook(() => useAuditLogs('uid-1'));
    await waitFor(() => expect(result.current.hasMoreLogs).toBe(true));

    await act(async () => { await result.current.loadMoreLogs(); });

    expect(mockGetDocs).toHaveBeenCalledOnce();
    await waitFor(() => expect(result.current.logs.length).toBeGreaterThan(50));
    unmount();
  });

  it('loadMoreLogs error define error state', async () => {
    const fullPage = Array.from({ length: 50 }, (_, i) => makeDoc(`log-${i}`));
    mockOnSnapshot.mockImplementation((_q: unknown, onNext: (snap: { docs: typeof fullPage }) => void) => {
      onNext({ docs: fullPage });
      return vi.fn();
    });
    mockGetDocs.mockRejectedValueOnce(new Error('network error'));

    const { result, unmount } = renderHook(() => useAuditLogs('uid-1'));
    await waitFor(() => expect(result.current.hasMoreLogs).toBe(true));

    await act(async () => { await result.current.loadMoreLogs(); });

    await waitFor(() => expect(result.current.error).toBeTruthy());
    unmount();
  });
});
