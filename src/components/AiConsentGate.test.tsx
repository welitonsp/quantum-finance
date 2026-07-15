import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AiConsentGate } from './AiConsentGate';

const CHILD = <div data-testid="protected">conteúdo IA</div>;

describe('AiConsentGate', () => {
  it('loading renderiza children (servidor continua fail-closed)', () => {
    render(
      <AiConsentGate aiGranted={false} loading onOpenPrivacy={vi.fn()}>
        {CHILD}
      </AiConsentGate>,
    );
    expect(screen.getByTestId('protected')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /IA desativada/i })).not.toBeInTheDocument();
  });

  it('consentimento concedido renderiza children', () => {
    render(
      <AiConsentGate aiGranted loading={false} onOpenPrivacy={vi.fn()}>
        {CHILD}
      </AiConsentGate>,
    );
    expect(screen.getByTestId('protected')).toBeInTheDocument();
  });

  it('sem consentimento renderiza o card e oculta children', () => {
    render(
      <AiConsentGate aiGranted={false} loading={false} onOpenPrivacy={vi.fn()}>
        {CHILD}
      </AiConsentGate>,
    );
    expect(screen.getByRole('heading', { name: /IA desativada/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ativar consentimento de IA/i })).toBeInTheDocument();
    expect(screen.queryByTestId('protected')).not.toBeInTheDocument();
  });

  it('clique no botão chama onOpenPrivacy', async () => {
    const onOpenPrivacy = vi.fn();
    render(
      <AiConsentGate aiGranted={false} loading={false} onOpenPrivacy={onOpenPrivacy}>
        {CHILD}
      </AiConsentGate>,
    );
    await userEvent.click(screen.getByRole('button', { name: /Ativar consentimento de IA/i }));
    expect(onOpenPrivacy).toHaveBeenCalledTimes(1);
  });
});
