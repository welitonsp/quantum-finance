import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Centavos } from '../../../shared/types/money';
import type { Account } from '../../../shared/types/transaction';

// ─── Mock framer-motion — sem animação, AnimatePresence renderiza direto ───────
vi.mock('framer-motion', async () => {
  const { createElement, forwardRef, Fragment } = await import('react');
  const makeEl = (tag: string) =>
    forwardRef(function MockMotion(
      { children, animate, initial, exit, transition, whileHover, whileTap, variants, custom, ...props }:
        Record<string, unknown> & { children?: React.ReactNode },
      ref: React.Ref<unknown>,
    ) {
      void animate; void initial; void exit; void transition;
      void whileHover; void whileTap; void variants; void custom;
      return createElement(tag, { ...props, ref: ref as React.Ref<never> }, children);
    });
  return {
    motion:          { div: makeEl('div'), button: makeEl('button'), span: makeEl('span') },
    AnimatePresence: ({ children }: { children?: React.ReactNode }) =>
      createElement(Fragment, null, children),
  };
});

const mockCreateTransfer = vi.fn();
vi.mock('../../../shared/services/FirestoreService', () => ({
  FirestoreService: {
    createTransferWithHistory: (...args: unknown[]) => mockCreateTransfer(...args),
  },
}));

import TransferForm from '../TransferForm';

const cents = (value: number): Centavos => value as Centavos;

function account(overrides: Partial<Account>): Account {
  return {
    id: 'acc',
    name: 'Conta',
    type: 'corrente',
    balance: cents(0),
    schemaVersion: 2,
    createdAt: null,
    updatedAt: null,
    ...overrides,
  } as Account;
}

const corrente = account({ id: 'acc-corrente', name: 'Corrente',        type: 'corrente' });
const poupanca = account({ id: 'acc-poup',     name: 'Poupança',        type: 'poupanca' });
const cartao   = account({ id: 'acc-cartao',   name: 'Cartão Nubank',   type: 'cartao'   });

const ACCOUNTS = [corrente, poupanca, cartao];

function setup(overrides: { onClose?: () => void } = {}) {
  const onClose = overrides.onClose ?? vi.fn();
  render(<TransferForm uid="uid-test" accounts={ACCOUNTS} onClose={onClose} />);
  return { onClose };
}

describe('TransferForm', () => {
  beforeEach(() => {
    mockCreateTransfer.mockReset();
    mockCreateTransfer.mockResolvedValue('tx-1');
  });

  it('não lista conta cartão como origem, mas lista todas no destino', () => {
    setup();
    const origin      = screen.getByLabelText('Conta de origem') as HTMLSelectElement;
    const destination = screen.getByLabelText('Conta de destino') as HTMLSelectElement;

    expect(within(origin).queryByRole('option', { name: 'Cartão Nubank' })).toBeNull();
    expect(within(origin).getByRole('option', { name: 'Corrente' })).toBeTruthy();
    expect(within(origin).getByRole('option', { name: 'Poupança' })).toBeTruthy();

    expect(within(destination).getByRole('option', { name: 'Cartão Nubank' })).toBeTruthy();
    expect(within(destination).getByRole('option', { name: 'Corrente' })).toBeTruthy();
    expect(within(destination).getByRole('option', { name: 'Poupança' })).toBeTruthy();
  });

  it('bloqueia origem igual ao destino com mensagem e submit desabilitado', () => {
    setup();
    fireEvent.change(screen.getByLabelText('Conta de origem'),  { target: { value: 'acc-corrente' } });
    fireEvent.change(screen.getByLabelText('Conta de destino'), { target: { value: 'acc-corrente' } });

    expect(screen.getByText('Origem e destino não podem ser iguais.')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Registrar transferência/ })).toBeDisabled();
  });

  it('converte para centavos exatos e omite description quando vazia', async () => {
    setup();
    fireEvent.change(screen.getByLabelText('Valor'),           { target: { value: '1.500,00' } });
    fireEvent.change(screen.getByLabelText('Conta de origem'),  { target: { value: 'acc-corrente' } });
    fireEvent.change(screen.getByLabelText('Conta de destino'), { target: { value: 'acc-poup' } });

    // Preview em BRL renderizado
    expect(screen.getByText(/1\.500,00/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Registrar transferência/ }));

    await waitFor(() => expect(mockCreateTransfer).toHaveBeenCalledTimes(1));
    const [uidArg, dto] = mockCreateTransfer.mock.calls[0] as [string, Record<string, unknown>];
    expect(uidArg).toBe('uid-test');
    expect(dto.value_cents).toBe(150000);
    expect(dto.fromAccountId).toBe('acc-corrente');
    expect(dto.toAccountId).toBe('acc-poup');
    expect('description' in dto).toBe(false);
  });

  it('inclui description quando preenchida', async () => {
    setup();
    fireEvent.change(screen.getByLabelText('Valor'),            { target: { value: '10,00' } });
    fireEvent.change(screen.getByLabelText('Conta de origem'),  { target: { value: 'acc-corrente' } });
    fireEvent.change(screen.getByLabelText('Conta de destino'), { target: { value: 'acc-poup' } });
    fireEvent.change(screen.getByLabelText(/Descrição/),        { target: { value: '  Reserva  ' } });

    fireEvent.click(screen.getByRole('button', { name: /Registrar transferência/ }));

    await waitFor(() => expect(mockCreateTransfer).toHaveBeenCalledTimes(1));
    const [, dto] = mockCreateTransfer.mock.calls[0] as [string, Record<string, unknown>];
    expect(dto.description).toBe('Reserva');
  });

  it('rejeita valor inválido (abc) sem chamar o serviço', async () => {
    setup();
    fireEvent.change(screen.getByLabelText('Valor'),            { target: { value: 'abc' } });
    fireEvent.change(screen.getByLabelText('Conta de origem'),  { target: { value: 'acc-corrente' } });
    fireEvent.change(screen.getByLabelText('Conta de destino'), { target: { value: 'acc-poup' } });

    fireEvent.click(screen.getByRole('button', { name: /Registrar transferência/ }));

    await waitFor(() => expect(screen.getByText(/Valor inválido/)).toBeTruthy());
    expect(mockCreateTransfer).not.toHaveBeenCalled();
  });

  it('rejeita valor <= 0 sem chamar o serviço', async () => {
    setup();
    fireEvent.change(screen.getByLabelText('Valor'),            { target: { value: '0,00' } });
    fireEvent.change(screen.getByLabelText('Conta de origem'),  { target: { value: 'acc-corrente' } });
    fireEvent.change(screen.getByLabelText('Conta de destino'), { target: { value: 'acc-poup' } });

    fireEvent.click(screen.getByRole('button', { name: /Registrar transferência/ }));

    await waitFor(() => expect(screen.getByText(/Valor inválido/)).toBeTruthy());
    expect(mockCreateTransfer).not.toHaveBeenCalled();
  });

  it('exibe erro e mantém o form aberto quando o serviço rejeita', async () => {
    mockCreateTransfer.mockRejectedValueOnce(new Error('boom'));
    const { onClose } = setup();
    fireEvent.change(screen.getByLabelText('Valor'),            { target: { value: '10,00' } });
    fireEvent.change(screen.getByLabelText('Conta de origem'),  { target: { value: 'acc-corrente' } });
    fireEvent.change(screen.getByLabelText('Conta de destino'), { target: { value: 'acc-poup' } });

    fireEvent.click(screen.getByRole('button', { name: /Registrar transferência/ }));

    await waitFor(() => expect(screen.getByText(/Erro ao registrar transferência/)).toBeTruthy());
    expect(onClose).not.toHaveBeenCalled();
  });

  it('mostra sucesso e fecha após o timer', async () => {
    const { onClose } = setup();
    fireEvent.change(screen.getByLabelText('Valor'),            { target: { value: '10,00' } });
    fireEvent.change(screen.getByLabelText('Conta de origem'),  { target: { value: 'acc-corrente' } });
    fireEvent.change(screen.getByLabelText('Conta de destino'), { target: { value: 'acc-poup' } });

    fireEvent.click(screen.getByRole('button', { name: /Registrar transferência/ }));

    await waitFor(() => expect(screen.getByText('Transferência registrada!')).toBeTruthy());
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1), { timeout: 2500 });
  });

  it('Esc fecha o formulário', () => {
    const { onClose } = setup();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
