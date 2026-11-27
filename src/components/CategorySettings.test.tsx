// src/components/CategorySettings.test.tsx
// Testes de integração mínimos: confirma que CategorySettings renderiza
// o DataPrivacyPanel (wiring LGPD) e os elementos de acessibilidade do modal
// (Escape, clique no backdrop, role=dialog) — inclusive os guardas de
// salvamento e o Escape tratado pela confirmação de exclusão do DataPrivacyPanel.
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../shared/api/firebase', () => ({
  db: {},
  auth: { currentUser: null },
}));

vi.mock('firebase/firestore', () => ({
  collection:  vi.fn(),
  query:       vi.fn(),
  onSnapshot:  vi.fn(() => vi.fn()),   // retorna unsubscribe no-op
  addDoc:      vi.fn(),
  deleteDoc:   vi.fn(),
  doc:         vi.fn(),
  getDoc:      vi.fn(),
  getDocs:     vi.fn().mockResolvedValue({ docs: [] }),
  writeBatch:  vi.fn().mockReturnValue({ delete: vi.fn(), commit: vi.fn() }),
}));

vi.mock('firebase/auth', () => ({
  deleteUser: vi.fn(),
  getAuth:    vi.fn(),
}));

vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

vi.mock('../shared/lib/firebaseErrorHandling', () => ({
  logSanitizedFirebaseError:  vi.fn(),
  getUserFriendlyErrorMessage: vi.fn().mockReturnValue('Erro.'),
}));

// Hook de regras e serviços LGPD controláveis (promessas pendentes simulam
// salvamento / exclusão em andamento).
const h = vi.hoisted(() => ({
  addRule:           vi.fn(),
  deleteUserAccount: vi.fn(),
}));

vi.mock('../hooks/useCategoryRules', () => ({
  useCategoryRules: () => ({ rules: [], loading: false, addRule: h.addRule, removeRule: vi.fn() }),
}));

vi.mock('../shared/services/DataPrivacyService', () => ({
  exportAllUserData: vi.fn().mockResolvedValue(undefined),
  deleteUserAccount: (uid: string) => h.deleteUserAccount(uid),
}));

vi.mock('../shared/services/UserConsentsService', () => ({
  getUserConsents:  vi.fn().mockResolvedValue({ analytics: false, ai: false }),
  saveUserConsents: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../shared/services/DataProcessingLog', () => ({
  logDataProcessingEvent: vi.fn().mockResolvedValue(undefined),
  getDataProcessingLog:   vi.fn().mockResolvedValue([]),
}));

beforeEach(() => {
  h.addRule.mockReset().mockResolvedValue(undefined);
  h.deleteUserAccount.mockReset().mockResolvedValue(undefined);
});

// ─── Import após mocks ────────────────────────────────────────────────────────

import CategorySettings from './CategorySettings';

// ─── Testes ───────────────────────────────────────────────────────────────────

describe('CategorySettings — integração com DataPrivacyPanel', () => {
  it('renderiza o painel Motor de Categorização', () => {
    render(<CategorySettings uid="uid-test" onClose={vi.fn()} />);
    expect(screen.getByText('Motor de Categorização')).toBeInTheDocument();
  });

  it('renderiza a seção Meus Dados (LGPD) — DataPrivacyPanel integrado', () => {
    render(<CategorySettings uid="uid-test" onClose={vi.fn()} />);
    expect(screen.getByText('Meus Dados (LGPD)')).toBeInTheDocument();
  });

  it('renderiza o botão de exportação de dados', () => {
    render(<CategorySettings uid="uid-test" onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Baixar meus dados/i })).toBeInTheDocument();
  });

  it('renderiza a zona de perigo com botão de exclusão de conta', () => {
    render(<CategorySettings uid="uid-test" onClose={vi.fn()} />);
    expect(screen.getByText('Zona de Perigo')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Excluir minha conta/i })).toBeInTheDocument();
  });

  it('botão fechar chama onClose', () => {
    const onClose = vi.fn();
    render(<CategorySettings uid="uid-test" onClose={onClose} />);
    screen.getAllByRole('button').find(b => b.querySelector('svg'))?.click();
  });

  it('texto de exclusão NÃO promete remoção total imediata', () => {
    render(<CategorySettings uid="uid-test" onClose={vi.fn()} />);
    // Garante mensagem honesta: menciona política de retenção
    expect(screen.getByText(/política de retenção/i)).toBeInTheDocument();
    // Garante que o texto antigo ("Todos os seus dados serão removidos") está ausente
    expect(screen.queryByText(/Todos os seus dados serão removidos/i)).not.toBeInTheDocument();
  });
});

describe('CategorySettings — fechamento do modal (Escape / backdrop)', () => {
  it('expõe role=dialog + aria-modal rotulado pelo título', () => {
    render(<CategorySettings uid="uid-test" onClose={vi.fn()} />);
    const dialog = screen.getByRole('dialog', { name: 'Motor de Categorização' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('Escape chama onClose', () => {
    const onClose = vi.fn();
    render(<CategorySettings uid="uid-test" onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('outras teclas não fecham', () => {
    const onClose = vi.fn();
    render(<CategorySettings uid="uid-test" onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('remove o listener de Escape ao desmontar', () => {
    const onClose = vi.fn();
    const { unmount } = render(<CategorySettings uid="uid-test" onClose={onClose} />);
    unmount();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('clique no backdrop (mousedown + click nele) chama onClose', () => {
    const onClose = vi.fn();
    render(<CategorySettings uid="uid-test" onClose={onClose} />);
    const backdrop = screen.getByRole('dialog').parentElement as HTMLElement;
    fireEvent.mouseDown(backdrop);
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('arrastar de dentro do painel e soltar no backdrop NÃO fecha', () => {
    const onClose = vi.fn();
    render(<CategorySettings uid="uid-test" onClose={onClose} />);
    const input = screen.getByPlaceholderText(/uber, ifood/i);
    const backdrop = screen.getByRole('dialog').parentElement as HTMLElement;
    fireEvent.mouseDown(input);
    fireEvent.click(backdrop);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Escape ignorado quando já tratado (defaultPrevented) ou em composição IME', () => {
    const onClose = vi.fn();
    render(<CategorySettings uid="uid-test" onClose={onClose} />);

    const prevented = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    prevented.preventDefault();
    document.dispatchEvent(prevented);

    fireEvent.keyDown(document, { key: 'Escape', isComposing: true });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Escape e backdrop ignorados enquanto salva uma regra', async () => {
    h.addRule.mockReturnValue(new Promise(() => {})); // salvamento pendente
    const onClose = vi.fn();
    const { container } = render(<CategorySettings uid="uid-test" onClose={onClose} />);

    fireEvent.change(screen.getByPlaceholderText(/uber, ifood/i), { target: { value: 'uber' } });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Transporte' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }));
    await waitFor(() => expect(container.querySelector('button[type="submit"]')).toBeDisabled());
    expect(h.addRule).toHaveBeenCalledWith('uber', 'Transporte');

    fireEvent.keyDown(document, { key: 'Escape' });
    const backdrop = screen.getByRole('dialog').parentElement as HTMLElement;
    fireEvent.mouseDown(backdrop);
    fireEvent.click(backdrop);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('uid vazio: não renderiza nem registra listener de Escape', () => {
    const addSpy = vi.spyOn(document, 'addEventListener');
    const onClose = vi.fn();
    const { container } = render(<CategorySettings uid="" onClose={onClose} />);
    expect(container).toBeEmptyDOMElement();
    expect(addSpy.mock.calls.some(([type]) => type === 'keydown')).toBe(false);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    addSpy.mockRestore();
  });

  it('não re-inscreve o listener quando o pai re-renderiza com novo onClose', () => {
    const addSpy = vi.spyOn(document, 'addEventListener');
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(<CategorySettings uid="uid-test" onClose={first} />);
    const countAfterMount = addSpy.mock.calls.filter(([type]) => type === 'keydown').length;
    rerender(<CategorySettings uid="uid-test" onClose={second} />);
    expect(addSpy.mock.calls.filter(([type]) => type === 'keydown').length).toBe(countAfterMount);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    addSpy.mockRestore();
  });

  it('clique dentro do painel NÃO chama onClose', () => {
    const onClose = vi.fn();
    render(<CategorySettings uid="uid-test" onClose={onClose} />);
    fireEvent.click(screen.getByRole('dialog'));
    fireEvent.click(screen.getByText('Motor de Categorização'));
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('DataPrivacyPanel dentro do modal — Escape na confirmação de exclusão', () => {
  it('Escape cancela o passo de confirmação sem fechar o modal', () => {
    const onClose = vi.fn();
    render(<CategorySettings uid="uid-test" onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /Excluir minha conta/i }));
    expect(screen.getByPlaceholderText('EXCLUIR')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByPlaceholderText('EXCLUIR')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();

    // Fora da confirmação, Escape volta a fechar o modal.
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Escape é ignorado enquanto a exclusão está em andamento', async () => {
    h.deleteUserAccount.mockReturnValue(new Promise(() => {})); // exclusão pendente
    const onClose = vi.fn();
    render(<CategorySettings uid="uid-test" onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /Excluir minha conta/i }));
    fireEvent.change(screen.getByPlaceholderText('EXCLUIR'), { target: { value: 'EXCLUIR' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Confirmar exclusão/i }));
    });
    await screen.findByText('Excluindo…');

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByPlaceholderText('EXCLUIR')).toBeInTheDocument();
    expect(screen.getByText('Excluindo…')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
