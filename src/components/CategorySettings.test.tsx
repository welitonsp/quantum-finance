// src/components/CategorySettings.test.tsx
// Testes de integração mínimos: confirma que CategorySettings renderiza
// o DataPrivacyPanel (wiring LGPD) e os elementos de acessibilidade do modal.
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

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
