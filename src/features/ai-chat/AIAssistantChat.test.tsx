import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

// ── Mocks ────────────────────────────────────────────────────────────────────────
// framer-motion: passthrough (AnimatePresence não completa `exit` em jsdom).
vi.mock('framer-motion', () => {
  const SKIP = new Set([
    'initial', 'animate', 'exit', 'transition', 'whileHover', 'whileTap',
    'whileInView', 'variants', 'layout', 'layoutId', 'drag',
  ]);
  const make = (Tag: string) =>
    React.forwardRef<HTMLElement, Record<string, unknown>>((props, ref) => {
      const dom: Record<string, unknown> = { ref };
      for (const k of Object.keys(props)) {
        if (k === 'children' || SKIP.has(k)) continue;
        dom[k] = props[k];
      }
      return React.createElement(Tag, dom, props['children'] as React.ReactNode);
    });
  return {
    AnimatePresence: ({ children }: { children?: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    motion: new Proxy({} as Record<string, unknown>, { get: (_t, tag) => make(String(tag)) }),
  };
});

// Hooks/serviços que tocam firebase ou o LLM são isolados via vi.hoisted.
const h = vi.hoisted(() => ({
  classifyMock: vi.fn(),
  adviceMock: vi.fn(),
  runActionMock: vi.fn(),
  resetAgentMock: vi.fn(),
}));

vi.mock('../ai-agent/geminiIntentClassifier', () => ({
  geminiIntentClassifier: (input: unknown) => h.classifyMock(input),
}));

vi.mock('./GeminiService', () => ({
  GeminiService: { getFinancialAdvice: (...args: unknown[]) => h.adviceMock(...args) },
}));

vi.mock('../../hooks/useAgentAction', () => ({
  useAgentAction: () => ({
    status: 'idle',
    error: null,
    result: null,
    runAction: h.runActionMock,
    reset: h.resetAgentMock,
  }),
}));

import { AIAssistantChat } from './AIAssistantChat';

function renderChat() {
  return render(
    <AIAssistantChat uid="u1" transactions={[]} balances={null} isOpen onClose={() => {}} />,
  );
}

function sendMessage(container: HTMLElement, text: string) {
  const input = screen.getByPlaceholderText(/Analise os meus gastos/i) as HTMLInputElement;
  fireEvent.change(input, { target: { value: text } });
  const submit = container.querySelector('button[type="submit"]') as HTMLButtonElement;
  fireEvent.click(submit);
}

beforeEach(() => {
  // jsdom não implementa scrollIntoView (usado no auto-scroll do chat).
  Element.prototype.scrollIntoView = vi.fn();
  localStorage.clear();
  h.classifyMock.mockReset();
  h.adviceMock.mockReset().mockResolvedValue('resposta do chat');
  h.runActionMock.mockReset().mockResolvedValue({ id: 'tx1', decisionId: null });
  h.resetAgentMock.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('AIAssistantChat — intent router wiring', () => {
  it('flag OFF: não classifica e segue no chat normal', async () => {
    vi.stubEnv('VITE_ENABLE_AGENT_ROUTER', 'false');
    const { container } = renderChat();
    sendMessage(container, 'posso comprar um notebook de 4 mil?');

    await waitFor(() => expect(h.adviceMock).toHaveBeenCalled());
    expect(h.classifyMock).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('flag ON + proposta: abre o sheet de confirmação (sem chamar advice)', async () => {
    vi.stubEnv('VITE_ENABLE_AGENT_ROUTER', 'true');
    h.classifyMock.mockResolvedValue({
      intent: 'simulate_purchase',
      slots: { description: 'Notebook', amountCents: 400000, category: 'Eletrônicos' },
      confidence: 0.9,
    });
    const { container } = renderChat();
    sendMessage(container, 'comprar um notebook de 4000');

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Registrar compra' })).toBeTruthy();
    expect(within(dialog).getAllByText(/4\.000,00/).length).toBeGreaterThan(0);
    expect(h.adviceMock).not.toHaveBeenCalled();
  });

  it('flag ON + need_more_info: pede o slot faltante e não abre sheet', async () => {
    vi.stubEnv('VITE_ENABLE_AGENT_ROUTER', 'true');
    h.classifyMock.mockResolvedValue({
      intent: 'simulate_purchase',
      slots: { description: 'Notebook' }, // falta amountCents
      confidence: 0.9,
    });
    const { container } = renderChat();
    sendMessage(container, 'quero comprar um notebook');

    await waitFor(() => expect(screen.getByText(/preciso saber o valor/i)).toBeTruthy());
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(h.adviceMock).not.toHaveBeenCalled();
  });

  it('flag ON + baixa confiança: degrada para o chat normal', async () => {
    vi.stubEnv('VITE_ENABLE_AGENT_ROUTER', 'true');
    h.classifyMock.mockResolvedValue({ intent: 'get_balances', slots: {}, confidence: 0.2 });
    const { container } = renderChat();
    sendMessage(container, 'sei lá');

    await waitFor(() => expect(h.adviceMock).toHaveBeenCalled());
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('confirmar a proposta dispara runAction e registra a confirmação no chat', async () => {
    vi.stubEnv('VITE_ENABLE_AGENT_ROUTER', 'true');
    h.classifyMock.mockResolvedValue({
      intent: 'simulate_purchase',
      slots: { description: 'Notebook', amountCents: 400000 },
      confidence: 0.95,
    });
    const { container } = renderChat();
    sendMessage(container, 'comprar notebook 4000');

    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Registrar compra' }));

    await waitFor(() => expect(h.runActionMock).toHaveBeenCalledTimes(1));
    const [proposalArg, ctxArg] = h.runActionMock.mock.calls[0]!;
    expect(proposalArg.kind).toBe('register_purchase');
    expect(ctxArg.intent).toBe('simulate_purchase');
    await waitFor(() => expect(screen.getByText('Compra registrada pelo assistente.')).toBeTruthy());
  });
});

describe('AIAssistantChat — confirmação determinística de mutação (flag ON)', () => {
  it('comando "registre despesa" PROPÕE e não executa nem cai no chat freeform', async () => {
    vi.stubEnv('VITE_ENABLE_AGENT_ROUTER', 'true');
    const { container } = renderChat();
    sendMessage(container, 'Registre uma despesa de 35 reais no mercado hoje.');

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Registrar compra' })).toBeTruthy();
    // A pergunta aparece no chat e também dentro do sheet de confirmação.
    expect(
      screen.getAllByText(/Detectei uma despesa de R\$\s?35,00 em Mercado para hoje/).length,
    ).toBeGreaterThan(0);
    // Determinístico: nem LLM, nem chat freeform, nem escrita.
    expect(h.classifyMock).not.toHaveBeenCalled();
    expect(h.adviceMock).not.toHaveBeenCalled();
    expect(h.runActionMock).not.toHaveBeenCalled();
  });

  it('responder "confirmar" por texto executa a ação', async () => {
    vi.stubEnv('VITE_ENABLE_AGENT_ROUTER', 'true');
    const { container } = renderChat();
    sendMessage(container, 'Registre uma despesa de 35 reais no mercado hoje.');
    await screen.findByRole('dialog');

    sendMessage(container, 'confirmar');
    await waitFor(() => expect(h.runActionMock).toHaveBeenCalledTimes(1));
    const [proposalArg, ctxArg] = h.runActionMock.mock.calls[0]!;
    expect(proposalArg.kind).toBe('register_purchase');
    expect(proposalArg.status).toBe('pending'); // o hook é quem sela como confirmed
    expect(ctxArg.intent).toBe('simulate_purchase');
  });

  it('responder "cancelar" por texto descarta sem executar', async () => {
    vi.stubEnv('VITE_ENABLE_AGENT_ROUTER', 'true');
    const { container } = renderChat();
    sendMessage(container, 'Registre uma despesa de 35 reais no mercado hoje.');
    await screen.findByRole('dialog');

    sendMessage(container, 'cancelar');
    await waitFor(() => expect(screen.getByText('Ok, cancelei. Nada foi registrado.')).toBeTruthy());
    expect(h.runActionMock).not.toHaveBeenCalled();
  });

  it('comando de RECEITA gera proposta confirmável (sem execução, sem chat freeform)', async () => {
    vi.stubEnv('VITE_ENABLE_AGENT_ROUTER', 'true');
    const { container } = renderChat();
    sendMessage(container, 'Registre uma receita de 1000 de salário hoje.');

    // Mesma cadeia segura da despesa: abre a sheet de confirmação, nada executa ainda.
    await screen.findByRole('dialog');
    expect(h.runActionMock).not.toHaveBeenCalled();
    expect(h.adviceMock).not.toHaveBeenCalled();

    sendMessage(container, 'confirmar');
    await waitFor(() => expect(h.runActionMock).toHaveBeenCalledTimes(1));
    const [proposalArg, ctxArg] = h.runActionMock.mock.calls[0]!;
    expect(proposalArg.kind).toBe('register_income');
    expect(proposalArg.status).toBe('pending'); // o hook é quem sela como confirmed
    expect(ctxArg.intent).toBe('register_income_proposal');
  });

  it('chama onActionExecuted após a execução confirmada', async () => {
    vi.stubEnv('VITE_ENABLE_AGENT_ROUTER', 'true');
    const onExec = vi.fn();
    const { container } = render(
      <AIAssistantChat
        uid="u1"
        transactions={[]}
        balances={null}
        isOpen
        onClose={() => {}}
        onActionExecuted={onExec}
      />,
    );
    sendMessage(container, 'Registre uma despesa de 35 reais no mercado hoje.');
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Registrar compra' }));

    await waitFor(() => expect(onExec).toHaveBeenCalledWith({ id: 'tx1', decisionId: null }));
  });

  it('NÃO afirma "registrada" quando a callable falha', async () => {
    vi.stubEnv('VITE_ENABLE_AGENT_ROUTER', 'true');
    h.runActionMock.mockRejectedValueOnce({ code: 'internal', message: 'falha' });
    const { container } = renderChat();
    sendMessage(container, 'Registre uma despesa de 35 reais no mercado hoje.');
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Registrar compra' }));

    await waitFor(() => expect(h.runActionMock).toHaveBeenCalled());
    expect(screen.queryByText('Compra registrada pelo assistente.')).toBeNull();
  });
});
