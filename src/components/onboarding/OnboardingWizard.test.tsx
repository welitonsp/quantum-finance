import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OnboardingWizard } from './OnboardingWizard';

describe('OnboardingWizard', () => {
  it('renderiza título e as duas ações principais', () => {
    render(
      <OnboardingWizard
        onCreateAccount={vi.fn()}
        onCreateTransaction={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    expect(screen.getByText('Bem-vindo ao Quantum Finance')).toBeDefined();
    expect(screen.getByText('Criar minha primeira conta')).toBeDefined();
    expect(screen.getByText('Registrar uma transação')).toBeDefined();
  });

  it('chama onCreateAccount ao clicar em "Criar minha primeira conta"', () => {
    const onCreateAccount = vi.fn();
    render(
      <OnboardingWizard
        onCreateAccount={onCreateAccount}
        onCreateTransaction={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText('Criar minha primeira conta'));
    expect(onCreateAccount).toHaveBeenCalledOnce();
  });

  it('chama onCreateTransaction ao clicar em "Registrar uma transação"', () => {
    const onCreateTransaction = vi.fn();
    render(
      <OnboardingWizard
        onCreateAccount={vi.fn()}
        onCreateTransaction={onCreateTransaction}
        onDismiss={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText('Registrar uma transação'));
    expect(onCreateTransaction).toHaveBeenCalledOnce();
  });

  it('chama onDismiss ao clicar em "Pular por agora"', () => {
    const onDismiss = vi.fn();
    render(
      <OnboardingWizard
        onCreateAccount={vi.fn()}
        onCreateTransaction={vi.fn()}
        onDismiss={onDismiss}
      />,
    );

    fireEvent.click(screen.getByText('Pular por agora'));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('chama onDismiss ao clicar no botão de fechar (X)', () => {
    const onDismiss = vi.fn();
    render(
      <OnboardingWizard
        onCreateAccount={vi.fn()}
        onCreateTransaction={vi.fn()}
        onDismiss={onDismiss}
      />,
    );

    fireEvent.click(screen.getByLabelText('Fechar'));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('tem role dialog com aria-modal para acessibilidade', () => {
    render(
      <OnboardingWizard
        onCreateAccount={vi.fn()}
        onCreateTransaction={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
  });
});
