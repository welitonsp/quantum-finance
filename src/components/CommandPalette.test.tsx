// src/components/CommandPalette.test.tsx
// Foco do input da paleta ⌘K ao abrir (inclusive no primeiro carregamento lazy).
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../contexts/PrivacyContext', () => ({
  usePrivacy: () => ({ isPrivacyMode: false, togglePrivacy: vi.fn() }),
}));

vi.mock('../contexts/NavigationContext', () => ({
  useNavigation: () => ({ currentPage: 'dashboard', setCurrentPage: vi.fn() }),
}));


import CommandPalette from './CommandPalette';

describe('CommandPalette — foco do input ao abrir', () => {
  beforeEach(() => {
    // jsdom não implementa scrollIntoView (usado na navegação por setas).
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('input recebe foco quando a paleta abre', async () => {
    const { rerender } = render(<CommandPalette isOpen={false} onClose={vi.fn()} />);
    expect(screen.queryByRole('searchbox')).toBeNull();

    rerender(<CommandPalette isOpen onClose={vi.fn()} />);
    const input = screen.getByRole('searchbox', { name: 'Paleta de Comandos' });
    await waitFor(() => expect(input).toHaveFocus());
  });

  it('input tem foco quando já monta aberta (carregamento lazy com isOpen=true)', async () => {
    render(<CommandPalette isOpen onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole('searchbox')).toHaveFocus());
  });

  it('limpa rAF e timeout ao desmontar', () => {
    const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame');
    const clearSpy  = vi.spyOn(window, 'clearTimeout');
    const { unmount } = render(<CommandPalette isOpen onClose={vi.fn()} />);
    unmount();
    expect(cancelSpy).toHaveBeenCalled();
    expect(clearSpy).toHaveBeenCalled();
    cancelSpy.mockRestore();
    clearSpy.mockRestore();
  });
});
