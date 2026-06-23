import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import PurchaseSimulator from './PurchaseSimulator';
import { PrivacyProvider } from '../../contexts/PrivacyContext';

// framer-motion: passthrough em jsdom (AnimatePresence mode="wait" não completa exit
// em testes, travando a transição empty→resultado). Renderiza só o conteúdo.
const ANIM_PROPS = new Set([
  'initial', 'animate', 'exit', 'transition', 'whileHover', 'whileTap', 'whileInView', 'layout', 'variants', 'drag',
]);
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
  motion: new Proxy(
    {},
    {
      get: (_t, tag: string) =>
        ({ children, ...props }: { children?: React.ReactNode } & Record<string, unknown>) => {
          const rest: Record<string, unknown> = {};
          for (const k of Object.keys(props)) if (!ANIM_PROPS.has(k)) rest[k] = props[k];
          return React.createElement(tag, rest, children);
        },
    },
  ),
}));

const runActionMock = vi.fn();
const resetMock = vi.fn();
const agentState: { status: string; error: unknown } = { status: 'idle', error: null };

vi.mock('../../hooks/useAgentAction', () => ({
  useAgentAction: () => ({
    status: agentState.status,
    error: agentState.error,
    result: null,
    runAction: runActionMock,
    reset: resetMock,
  }),
}));

vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

function renderSim(onRegisterPurchase = vi.fn()) {
  render(
    <PrivacyProvider>
      <PurchaseSimulator transactions={[]} balances={null} onRegisterPurchase={onRegisterPurchase} />
    </PrivacyProvider>,
  );
  return { onRegisterPurchase };
}

beforeEach(() => {
  vi.clearAllMocks();
  agentState.status = 'idle';
  agentState.error = null;
});

describe('PurchaseSimulator — registro via assistente (FASE H)', () => {
  it('CTA do assistente fica desabilitado até haver descrição', () => {
    renderSim();
    fireEvent.change(screen.getByPlaceholderText('0,00'), { target: { value: '500' } });
    const cta = screen.getByRole('button', { name: /Registrar com o Assistente/ }) as HTMLButtonElement;
    expect(cta.disabled).toBe(true);
    fireEvent.change(screen.getByPlaceholderText('ex: Notebook'), { target: { value: 'Notebook' } });
    expect((screen.getByRole('button', { name: /Registrar com o Assistente/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('à vista: abre o sheet de confirmação humana', () => {
    renderSim();
    fireEvent.change(screen.getByPlaceholderText('0,00'), { target: { value: '500' } });
    fireEvent.change(screen.getByPlaceholderText('ex: Notebook'), { target: { value: 'Notebook' } });
    fireEvent.click(screen.getByRole('button', { name: /Registrar com o Assistente/ }));
    expect(screen.getByText('Confirmar o registro de "Notebook" à vista?')).toBeTruthy();
  });

  it('confirmar dispara runAction (caminho server-trusted)', async () => {
    runActionMock.mockResolvedValue({ id: 'tx-1', decisionId: 'd-1' });
    renderSim();
    fireEvent.change(screen.getByPlaceholderText('0,00'), { target: { value: '500' } });
    fireEvent.change(screen.getByPlaceholderText('ex: Notebook'), { target: { value: 'Notebook' } });
    fireEvent.click(screen.getByRole('button', { name: /Registrar com o Assistente/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Registrar compra' }));
    expect(runActionMock).toHaveBeenCalledTimes(1);
    const [proposal, ctx] = runActionMock.mock.calls[0]!;
    expect(proposal.kind).toBe('register_purchase');
    expect(proposal.payload.description).toBe('Notebook');
    expect(ctx.intent).toBe('simulate_purchase');
  });

  it('parcelado: roteia direto ao formulário, sem abrir o sheet nem chamar o agente', () => {
    const { onRegisterPurchase } = renderSim();
    fireEvent.change(screen.getByPlaceholderText('0,00'), { target: { value: '500' } });
    fireEvent.change(screen.getByPlaceholderText('ex: Notebook'), { target: { value: 'Notebook' } });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar compra parcelada' }));
    expect(onRegisterPurchase).toHaveBeenCalledTimes(1);
    expect(onRegisterPurchase.mock.calls[0]![0]).toMatchObject({ installmentCount: 10, description: 'Notebook' });
    expect(runActionMock).not.toHaveBeenCalled();
    expect(screen.queryByText(/Confirmar o registro/)).toBeNull();
  });
});
