import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Centavos } from '../../../shared/types/money';
import type { Account } from '../../../shared/types/transaction';

const mockUpdateAccount = vi.fn();
const mockUseAccounts = vi.fn();

vi.mock('../../../hooks/useAccounts', () => ({
  useAccounts: (...args: unknown[]) => mockUseAccounts(...args),
}));

import AccountsManager from '../AccountsManager';

const cents = (value: number): Centavos => value as Centavos;

function account(overrides: Partial<Account> = {}): Account {
  return {
    id: 'acc-card',
    name: 'Cartao Teste',
    type: 'cartao',
    balance: cents(-100000),
    schemaVersion: 2,
    createdAt: null,
    updatedAt: null,
    ...overrides,
  } as Account;
}

describe('AccountsManager', () => {
  beforeEach(() => {
    mockUpdateAccount.mockReset();
    mockUseAccounts.mockReturnValue({
      accounts: [account()],
      loadingAccounts: false,
      addAccount: vi.fn(),
      updateAccount: mockUpdateAccount,
      removeAccount: vi.fn(),
    });
  });

  it('mantem saldo negativo ao editar passivo com valor positivo', async () => {
    render(<AccountsManager uid="uid-test" />);

    fireEvent.click(screen.getByTitle('Editar'));
    fireEvent.change(screen.getByDisplayValue('-1000.00'), { target: { value: '1000' } });
    fireEvent.click(screen.getByTitle('Salvar'));

    await waitFor(() => {
      expect(mockUpdateAccount).toHaveBeenCalledWith('acc-card', {
        name: 'Cartao Teste',
        balance: -1000,
      });
    });
  });
});
