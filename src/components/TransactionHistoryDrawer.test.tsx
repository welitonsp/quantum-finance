import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Transaction } from '../shared/types/transaction';
import type { Centavos } from '../shared/types/money';
import type { TransactionHistoryView } from '../hooks/useTransactionHistory';

vi.mock('../hooks/useTransactionHistory', () => ({
  useTransactionHistory: vi.fn(),
}));

import TransactionHistoryDrawer, { isRenderableHistoryField } from './TransactionHistoryDrawer';
import { useTransactionHistory } from '../hooks/useTransactionHistory';

const mockUseTransactionHistory = vi.mocked(useTransactionHistory);
const cents = (value: number): Centavos => value as Centavos;

function transaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id:            'tx-history',
    description:   'Movimentacao historico',
    value_cents:   cents(1000),
    schemaVersion: 2,
    type:          'saida',
    category:      'Diversos',
    date:          '2026-05-01',
    ...overrides,
  } as Transaction;
}

function renderDrawer(events: TransactionHistoryView[]) {
  mockUseTransactionHistory.mockReturnValue({
    events,
    loading: false,
    error:   null,
  });

  return render(
    <TransactionHistoryDrawer
      isOpen
      onClose={vi.fn()}
      uid="uid-prop-secret"
      transaction={transaction()}
    />,
  );
}

describe('TransactionHistoryDrawer sanitizacao de historico', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('bloqueia campos tecnicos e sensiveis na renderizacao do delta', () => {
    renderDrawer([
      {
        id:        'history-1',
        action:    'UPDATE',
        txId:      'tx-history',
        timestamp: Date.UTC(2026, 4, 22, 12, 0, 0),
        origin:    'reconcile',
        changedFields: [
          'category',
          'source',
          'reconciliationStatus',
          'importHash',
          'fitId',
          'uid',
          'reconciledBy',
          '_lastOpId',
          'value',
        ],
        before: {
          category:             'Diversos',
          source:               'manual',
          reconciliationStatus: null,
          importHash:           'secret-import-hash-before',
          fitId:                'secret-fit-before',
          uid:                  'secret-uid-before',
          reconciledBy:         'secret-reconciler-before',
          _lastOpId:            'secret-op-before',
          value:                'legacy-value-before',
        },
        after: {
          category:             'Alimentacao',
          source:               'csv',
          reconciliationStatus: 'reconciled',
          importHash:           'secret-import-hash-after',
          fitId:                'secret-fit-after',
          uid:                  'secret-uid-after',
          reconciledBy:         'secret-reconciler-after',
          _lastOpId:            'secret-op-after',
          value:                'legacy-value-after',
        },
      },
    ]);

    expect(screen.getByText('Conciliada')).toBeInTheDocument();
    expect(screen.getByText('Origem: Conciliação')).toBeInTheDocument();
    expect(screen.getByText(/Categoria: Diversos/)).toBeInTheDocument();
    expect(screen.getByText(/Origem: manual/)).toBeInTheDocument();
    expect(screen.getByText(/Status de conciliação/)).toBeInTheDocument();

    const renderedText = document.body.textContent ?? '';
    expect(renderedText).not.toContain('importHash');
    expect(renderedText).not.toContain('secret-import-hash');
    expect(renderedText).not.toContain('fitId');
    expect(renderedText).not.toContain('secret-fit');
    expect(renderedText).not.toContain('uid-prop-secret');
    expect(renderedText).not.toContain('secret-uid');
    expect(renderedText).not.toContain('reconciledBy');
    expect(renderedText).not.toContain('secret-reconciler');
    expect(renderedText).not.toContain('_lastOpId');
    expect(renderedText).not.toContain('secret-op');
    expect(renderedText).not.toContain('legacy-value');
  });

  it('filtra changedFields mesmo quando o evento nao traz before/after', () => {
    renderDrawer([
      {
        id:            'history-2',
        action:        'UPDATE',
        txId:          'tx-history',
        timestamp:     Date.UTC(2026, 4, 22, 12, 0, 0),
        changedFields: ['fitId', 'category', 'value', 'source'],
      },
    ]);

    expect(screen.getByText('Campos alterados: category, source')).toBeInTheDocument();
    expect(document.body.textContent ?? '').not.toContain('fitId');
    expect(document.body.textContent ?? '').not.toContain('value');
  });

  it('declara explicitamente quais campos de historico podem ser renderizados', () => {
    expect(isRenderableHistoryField('category')).toBe(true);
    expect(isRenderableHistoryField('source')).toBe(true);
    expect(isRenderableHistoryField('reconciliationStatus')).toBe(true);

    for (const field of ['importHash', 'fitId', 'uid', 'reconciledBy', '_lastOpId', 'value']) {
      expect(isRenderableHistoryField(field)).toBe(false);
    }
  });
});
