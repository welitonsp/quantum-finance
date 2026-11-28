import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../hooks/useAuditLogs', () => ({
  useAuditLogs: () => ({ logs: [], loading: false }),
}));
vi.mock('../../hooks/useDecisions', () => ({
  useDecisions: () => ({ decisions: [], loading: false, stats: { total: 0, confirmed: 0, reverted: 0 } }),
}));
vi.mock('../../shared/hooks/usePushNotifications', () => ({
  usePushNotifications: () => ({
    permission: 'default', loading: false, error: null, isSupported: false,
    requestPermission: vi.fn(), revokePermission: vi.fn(),
  }),
}));
vi.mock('../../components/AuditTimeline', () => ({ default: () => null }));
vi.mock('./AIJournalDrawer', () => ({ default: () => null }));
vi.mock('../settings/DataPrivacyPanel', () => ({ default: () => null }));

import GovernancePage from './GovernancePage';

describe('GovernancePage — atalho de categorias', () => {
  it('o card de Categorias abre as Configurações', () => {
    const open = vi.fn();
    render(<GovernancePage uid="u1" onOpenCategories={open} />);
    fireEvent.click(screen.getByRole('button', { name: /Abrir Configurações/ }));
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('sem o atalho, só informa onde fica', () => {
    render(<GovernancePage uid="u1" />);
    expect(screen.queryByRole('button', { name: /Abrir Configurações/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Em Configurações/)).toBeInTheDocument();
  });
});
