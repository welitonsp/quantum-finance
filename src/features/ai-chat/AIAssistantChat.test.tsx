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

import { AIAssistantChat, preserveLineBreaks } from './AIAssistantChat';

function renderChat() {
  return render(
    <AIAssistantChat uid="u1" transactions={[]} balances={null} isOpen onClose={() => {}} />,
  );
}

function sendMessage(container: HTMLElement, text: string) {
  const input = screen.getByPlaceholderText(/Pergunte sobre seu saldo, gastos, metas/i) as HTMLInputElement;
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

  it('comando de TRANSFERÊNCIA resolve contas e propõe (nomes na sheet, sem executar)', async () => {
    vi.stubEnv('VITE_ENABLE_AGENT_ROUTER', 'true');
    const accounts = [
      { id: 'acc-poup', name: 'Poupança' },
      { id: 'acc-corr', name: 'Conta Corrente' },
    ];
    const { container } = render(
      <AIAssistantChat
        uid="u1"
        transactions={[]}
        balances={null}
        accounts={accounts}
        isOpen
        onClose={() => {}}
      />,
    );
    sendMessage(container, 'transfere 500 da poupança para a corrente');

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Registrar transferência' })).toBeTruthy();
    // Display hints: a sheet mostra os NOMES das contas, nunca os IDs crus.
    expect(within(dialog).getAllByText('Poupança').length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText('Conta Corrente').length).toBeGreaterThan(0);
    expect(within(dialog).queryByText('acc-poup')).toBeNull();
    expect(within(dialog).queryByText('acc-corr')).toBeNull();
    expect(h.classifyMock).not.toHaveBeenCalled();
    expect(h.adviceMock).not.toHaveBeenCalled();
    expect(h.runActionMock).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Transferir' }));
    await waitFor(() => expect(h.runActionMock).toHaveBeenCalledTimes(1));
    const [proposalArg, ctxArg] = h.runActionMock.mock.calls[0]!;
    expect(proposalArg.kind).toBe('register_transfer');
    expect(proposalArg.payload.fromAccountId).toBe('acc-poup');
    expect(proposalArg.payload.toAccountId).toBe('acc-corr');
    expect(ctxArg.intent).toBe('register_transfer_proposal');
  });
});

describe('AIAssistantChat — renderização Markdown das respostas da IA', () => {
  it('renderiza **negrito** como <strong> e listas como <ul>/<li>', async () => {
    vi.stubEnv('VITE_ENABLE_AGENT_ROUTER', 'false');
    h.adviceMock.mockResolvedValue('Seu saldo está **positivo**.\n\n- item um\n- item dois');
    const { container } = renderChat();
    sendMessage(container, 'como estou?');

    const strong = await screen.findByText('positivo');
    expect(strong.tagName).toBe('STRONG');
    expect(screen.queryByText(/\*\*positivo\*\*/)).toBeNull();
    const item = screen.getByText('item um');
    expect(item.tagName).toBe('LI');
    expect(item.closest('ul')).not.toBeNull();
  });

  it('não injeta HTML cru (script/img) vindo da resposta', async () => {
    vi.stubEnv('VITE_ENABLE_AGENT_ROUTER', 'false');
    h.adviceMock.mockResolvedValue(
      'antes <script>window.__pwned = true</script> <img src="x" onerror="alert(1)"> <b>html</b> depois',
    );
    const { container } = renderChat();
    sendMessage(container, 'teste');

    await screen.findByText(/antes/);
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
    expect((window as unknown as Record<string, unknown>).__pwned).toBeUndefined();
  });

  it('links NÃO são clicáveis: mostram texto + URL como texto puro', async () => {
    vi.stubEnv('VITE_ENABLE_AGENT_ROUTER', 'false');
    h.adviceMock.mockResolvedValue(
      '[clique aqui](https://evil.example/?d=saldo) e <https://example.com> e [mal](javascript:alert(1))',
    );
    const { container } = renderChat();
    sendMessage(container, 'links');

    await screen.findByText('clique aqui');
    expect(container.querySelector('a')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
    // URL exibida em texto, entre parênteses, ao lado do rótulo.
    expect(screen.getByText('(https://evil.example/?d=saldo)', { exact: false })).toBeTruthy();
    // Autolink: URL == texto → não duplica.
    expect(container.textContent).not.toContain('(https://example.com)');
    expect(screen.getByText('https://example.com')).toBeTruthy();
    // javascript: neutralizado pelo urlTransform → só o rótulo.
    expect(container.textContent).not.toMatch(/javascript:/i);
    expect(screen.getByText('mal')).toBeTruthy();
  });

  it('quebras de linha simples viram <br> (linhas não se fundem)', async () => {
    vi.stubEnv('VITE_ENABLE_AGENT_ROUTER', 'false');
    h.adviceMock.mockResolvedValue('🔴 Alerta: gasto alto\n🟢 OK: saldo positivo');
    const { container } = renderChat();
    sendMessage(container, 'resumo');

    const first = await screen.findByText(/Alerta: gasto alto/);
    const p = first.closest('p') as HTMLElement;
    expect(p.querySelector('br')).not.toBeNull();
    expect(p.textContent).toContain('OK: saldo positivo');
  });

  it('lista com linhas consecutivas continua renderizando ul/li', async () => {
    vi.stubEnv('VITE_ENABLE_AGENT_ROUTER', 'false');
    h.adviceMock.mockResolvedValue('Resumo:\n- primeiro\n- segundo\n- terceiro');
    const { container } = renderChat();
    sendMessage(container, 'lista');

    const li = await screen.findByText('primeiro');
    expect(li.tagName).toBe('LI');
    expect(container.querySelectorAll('ul > li')).toHaveLength(3);
  });

  it('bloco de código cercado é preservado sem hard breaks', async () => {
    vi.stubEnv('VITE_ENABLE_AGENT_ROUTER', 'false');
    h.adviceMock.mockResolvedValue('Veja:\n```\nlinha 1\nlinha 2\n```');
    const { container } = renderChat();
    sendMessage(container, 'code');

    await waitFor(() => expect(container.querySelector('pre code')).not.toBeNull());
    expect(container.querySelector('pre code')?.textContent).toBe('linha 1\nlinha 2\n');
  });
  it('mensagem do usuário permanece texto literal (sem Markdown)', async () => {
    vi.stubEnv('VITE_ENABLE_AGENT_ROUTER', 'false');
    const { container } = renderChat();
    sendMessage(container, 'quanto gastei com **lazer**?');

    expect(await screen.findByText('quanto gastei com **lazer**?')).toBeTruthy();
    await waitFor(() => expect(h.adviceMock).toHaveBeenCalled());
    expect(container.querySelector('strong')).toBeNull();
  });
});

describe('preserveLineBreaks (pré-processador puro)', () => {
  it('adiciona hard break entre linhas consecutivas não vazias', () => {
    expect(preserveLineBreaks('a\nb\nc')).toBe('a  \nb  \nc');
  });

  it('não toca em linhas em branco (parágrafos)', () => {
    expect(preserveLineBreaks('a\n\nb')).toBe('a\n\nb');
  });

  it('mantém blocos cercados (``` e ~~~) inalterados', () => {
    const fenced = 'x\n```ts\nconst a = 1;\nconst b = 2;\n```\ny\n~~~\nk\nz\n~~~';
    expect(preserveLineBreaks(fenced)).toBe('x  \n```ts\nconst a = 1;\nconst b = 2;\n```\ny  \n~~~\nk\nz\n~~~');
  });

  it('não duplica hard break já existente', () => {
    expect(preserveLineBreaks('a  \nb')).toBe('a  \nb');
    expect(preserveLineBreaks('a\\\nb')).toBe('a\\\nb');
  });
});
