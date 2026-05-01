import { describe, expect, it, vi } from 'vitest';
import type { AuditLog } from '../shared/services/AuditService';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  query: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  onSnapshot: vi.fn(),
}));

vi.mock('../shared/api/firebase/index', () => ({
  db: { _isMock: true },
}));

import { mapLog } from './useAuditLogs';

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
});
