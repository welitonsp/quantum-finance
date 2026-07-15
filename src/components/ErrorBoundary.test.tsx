import { useEffect, useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary';

const logSpy = vi.fn();
vi.mock('../shared/lib/firebaseErrorHandling', () => ({
  logSanitizedFirebaseError: (...args: unknown[]) => logSpy(...args),
}));

/** Lança durante o render conforme a prop `boom`. */
function Bomb({ boom }: { boom: boolean }) {
  if (boom) throw new Error('kaboom');
  return <div data-testid="safe-child">tudo certo</div>;
}

describe('ErrorBoundary', () => {
  // Erro em render dispara console.error do React/jsdom; silenciado apenas no teste.
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy.mockClear();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('exibe fallback genérico e oculta children quando o child lança', () => {
    render(
      <ErrorBoundary>
        <Bomb boom />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('heading', { name: 'Anomalia Detetada' })).toBeInTheDocument();
    expect(screen.queryByTestId('safe-child')).not.toBeInTheDocument();
  });

  it('inclui o label da feature no heading do fallback', () => {
    render(
      <ErrorBoundary label="Movimentações">
        <Bomb boom />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('heading', { name: 'Anomalia em Movimentações' })).toBeInTheDocument();
  });

  it('registra o erro via logSanitizedFirebaseError com o contexto app_error_boundary', () => {
    render(
      <ErrorBoundary>
        <Bomb boom />
      </ErrorBoundary>,
    );
    expect(logSpy).toHaveBeenCalledWith('app_error_boundary', expect.any(Error));
  });

  it('"Reiniciar Módulo" re-renderiza children que deixaram de lançar', async () => {
    const user = userEvent.setup();

    // O child lança na primeira render; um efeito no pai desarma o `boom` após o
    // mount (o boundary continua no fallback até o reset manual, pois a mudança de
    // children não reseta `hasError` sem `resetKey`).
    function Harness() {
      const [boom, setBoom] = useState(true);
      useEffect(() => { setBoom(false); }, []);
      return (
        <ErrorBoundary>
          <Bomb boom={boom} />
        </ErrorBoundary>
      );
    }

    render(<Harness />);
    expect(screen.getByRole('heading', { name: 'Anomalia Detetada' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Reiniciar Módulo' }));
    expect(screen.getByTestId('safe-child')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Anomalia Detetada' })).not.toBeInTheDocument();
  });

  it('reseta automaticamente quando resetKey muda após um crash', () => {
    const { rerender } = render(
      <ErrorBoundary resetKey="pageA">
        <Bomb boom />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('heading', { name: 'Anomalia Detetada' })).toBeInTheDocument();

    // Navegação para outra página (resetKey muda) + child saudável → recupera.
    rerender(
      <ErrorBoundary resetKey="pageB">
        <Bomb boom={false} />
      </ErrorBoundary>,
    );
    expect(screen.getByTestId('safe-child')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Anomalia Detetada' })).not.toBeInTheDocument();
  });
});
