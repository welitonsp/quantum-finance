import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ActionConfirmationSheet } from './ActionConfirmationSheet';

const baseRows = [
  { label: 'Valor', value: 'R$ 4.000,00', emphasis: true },
  { label: 'Data', value: '23/06/2026' },
];

function setup(overrides = {}) {
  const onConfirm = vi.fn();
  const onClose = vi.fn();
  render(
    <ActionConfirmationSheet
      open
      onClose={onClose}
      onConfirm={onConfirm}
      title="Registrar compra"
      question="Registrar a compra do notebook à vista?"
      rows={baseRows}
      status="idle"
      {...overrides}
    />,
  );
  return { onConfirm, onClose };
}

describe('ActionConfirmationSheet', () => {
  it('mostra pergunta, resumo e nota de governança', () => {
    setup();
    expect(screen.getByText('Registrar a compra do notebook à vista?')).toBeTruthy();
    expect(screen.getByText('R$ 4.000,00')).toBeTruthy();
    expect(screen.getByText(/Diário de\s+Decisões/)).toBeTruthy();
  });

  it('Confirmar e Cancelar disparam os callbacks', () => {
    const { onConfirm, onClose } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('desabilita ações enquanto running', () => {
    setup({ status: 'running' });
    expect((screen.getByRole('button', { name: 'Cancelar' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('exibe rota alternativa só quando error.reason casa com route.reason', () => {
    const onRoute = vi.fn();
    setup({
      status: 'error',
      error: { code: 'failed-precondition', message: 'Use o formulário.', reason: 'use_installment_form' },
      route: { reason: 'use_installment_form', label: 'Abrir formulário de compra', onClick: onRoute },
    });
    expect(screen.getByText('Use o formulário.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir formulário de compra' }));
    expect(onRoute).toHaveBeenCalledTimes(1);
  });

  it('não exibe rota quando o reason do erro não casa', () => {
    setup({
      status: 'error',
      error: { code: 'invalid-argument', message: 'Algo deu errado.' },
      route: { reason: 'use_installment_form', label: 'Abrir formulário', onClick: vi.fn() },
    });
    expect(screen.queryByRole('button', { name: 'Abrir formulário' })).toBeNull();
  });

  it('estado de sucesso mostra mensagem e botão Fechar', () => {
    setup({ status: 'success', successMessage: 'Compra registrada!' });
    expect(screen.getByText('Compra registrada!')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Concluir' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Confirmar' })).toBeNull();
  });
});
