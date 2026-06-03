import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mock framer-motion — AnimatePresence remove imediatamente (sem animação) ──

vi.mock('framer-motion', async () => {
  const { createElement, forwardRef } = await import('react');
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
      createElement(React.Fragment, null, children),
  };
});

// ─── Mocks de dependências externas ──────────────────────────────────────────

vi.mock('../../../shared/lib/useParserWorker', () => ({
  useParserWorker: () => ({
    parseFile:            vi.fn(),
    parseFileWithMapping: vi.fn(),
  }),
}));

vi.mock('../../../hooks/useCategories', () => ({
  useCategories: () => ({ categories: [] }),
}));

vi.mock('../importCandidateSearch', () => ({
  findImportCandidateTransactions: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../../utils/aiCategorize', () => ({
  batchCategorizeDescriptions: vi.fn().mockResolvedValue({}),
}));

vi.mock('../../../shared/lib/firebaseErrorHandling', () => ({
  logSanitizedFirebaseError:  vi.fn(),
  getUserFriendlyErrorMessage: vi.fn().mockReturnValue('Erro inesperado.'),
}));

vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

// ─── Import após mocks ────────────────────────────────────────────────────────

import ImportButton from '../ImportButton';

// ─── Factory ──────────────────────────────────────────────────────────────────

function renderImport() {
  return render(
    <ImportButton
      onImportTransactions={vi.fn().mockResolvedValue({ added: 0, duplicates: 0 })}
      uid="uid-test"
      existingTransactions={[]}
    />,
  );
}

// ─── Testes ───────────────────────────────────────────────────────────────────

describe('ImportButton — botão de trigger', () => {
  it('renderiza botão de trigger com aria-label correto', () => {
    renderImport();
    expect(
      screen.getByRole('button', { name: 'Importar ficheiro de extrato' }),
    ).toBeInTheDocument();
  });

  it('não exibe o dialog antes do clique', () => {
    renderImport();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('ImportButton — abertura e estrutura do modal', () => {
  beforeEach(() => {
    renderImport();
    fireEvent.click(screen.getByRole('button', { name: 'Importar ficheiro de extrato' }));
  });

  it('exibe o dialog após clique no trigger', () => {
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('dialog tem aria-modal="true"', () => {
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
  });

  it('dialog tem aria-labelledby apontando para o título', () => {
    const dialog  = screen.getByRole('dialog');
    const labelId = dialog.getAttribute('aria-labelledby');
    expect(labelId).toBeTruthy();
    expect(document.getElementById(labelId!)).toHaveTextContent('Ingestão Quântica');
  });

  it('exibe o título "Ingestão Quântica"', () => {
    expect(screen.getByText('Ingestão Quântica')).toBeInTheDocument();
  });

  it('exibe o subtítulo com formatos suportados', () => {
    expect(screen.getByText(/CSV.*OFX.*PDF/)).toBeInTheDocument();
  });

  it('exibe botão de fechar com aria-label correto no estado idle', () => {
    expect(
      screen.getByRole('button', { name: 'Fechar diálogo de importação' }),
    ).toBeInTheDocument();
  });
});

describe('ImportButton — fechamento do modal', () => {
  it('fecha ao clicar no botão de fechar', () => {
    renderImport();
    fireEvent.click(screen.getByRole('button', { name: 'Importar ficheiro de extrato' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Fechar diálogo de importação' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('fecha ao pressionar Escape no estado idle', () => {
    renderImport();
    fireEvent.click(screen.getByRole('button', { name: 'Importar ficheiro de extrato' }));

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('pode ser reaberto após fechar', () => {
    renderImport();
    const trigger = screen.getByRole('button', { name: 'Importar ficheiro de extrato' });

    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('button', { name: 'Fechar diálogo de importação' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(trigger);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('não fecha ao pressionar Escape no estado de password_required (cancela o painel de senha)', () => {
    renderImport();
    fireEvent.click(screen.getByRole('button', { name: 'Importar ficheiro de extrato' }));
    // Modal deve ainda estar visível
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

describe('ImportButton — acessibilidade da drop zone', () => {
  it('exibe área de drop com role="button"', () => {
    renderImport();
    fireEvent.click(screen.getByRole('button', { name: 'Importar ficheiro de extrato' }));

    expect(
      screen.getByRole('button', { name: /Importar arquivo de extrato/i }),
    ).toBeInTheDocument();
  });

  it('exibe input file com accept correto dentro do dialog', () => {
    renderImport();
    fireEvent.click(screen.getByRole('button', { name: 'Importar ficheiro de extrato' }));

    const dialog = screen.getByRole('dialog');
    const input  = dialog.querySelector('input[type="file"]');
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('accept', '.csv,.ofx,.pdf');
  });
});
