import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { signInWithEmail, signUpWithEmail, SupabaseAuthError } from '../../api/supabase/auth';

const warn = vi.hoisted(() => vi.fn());
vi.mock('../../lib/firebaseErrorHandling', async (orig) => ({
  ...(await orig<typeof import('../../lib/firebaseErrorHandling')>()),
  logSanitizedFirebaseError: warn,
}));

const clearCheck = vi.fn(async () => ({ status: 'clear' as const }));
import LoginScreen from '../../../components/LoginScreen';

const toastError = vi.hoisted(() => vi.fn());
vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: toastError },
  Toaster: () => null,
}));

function client(auth: Record<string, unknown>) {
  return { auth } as unknown as SupabaseClient;
}

describe('login por e-mail (Supabase)', () => {
  it('entra com e-mail aparado e traduz erro conhecido sem vazar a mensagem', async () => {
    const signInWithPassword = vi.fn(async () => ({ data: {}, error: null }));
    await signInWithEmail('  eu@x.com ', 'segredo123', client({ signInWithPassword }));
    expect(signInWithPassword).toHaveBeenCalledWith({ email: 'eu@x.com', password: 'segredo123' });

    const bad = client({ signInWithPassword: vi.fn(async () => ({ data: {}, error: { code: 'invalid_credentials', message: 'Invalid login credentials eu@x.com' } })) });
    await expect(signInWithEmail('eu@x.com', 'errada', bad)).rejects.toMatchObject({ code: 'invalid_credentials' });

    const odd = client({ signInWithPassword: vi.fn(async () => ({ data: {}, error: { code: 'unexpected', message: 'x' } })) });
    const err = await signInWithEmail('eu@x.com', 'x', odd).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SupabaseAuthError);
    expect((err as SupabaseAuthError).code).toBe('email_auth_failed');
  });

  it('cadastro sem sessão pede confirmação por e-mail', async () => {
    const signUp = vi.fn(async () => ({ data: { session: null, user: { id: 'u' } }, error: null }));
    const out = await signUpWithEmail('eu@x.com', 'segredo123', 'https://app.exemplo', client({ signUp }), clearCheck);
    expect(clearCheck).toHaveBeenCalledWith('segredo123');
    expect(out).toEqual({ needsConfirmation: true });
    expect(signUp).toHaveBeenCalledWith({
      email: 'eu@x.com', password: 'segredo123', options: { emailRedirectTo: 'https://app.exemplo' },
    });
  });

  it('senha vazada bloqueia o cadastro antes de chamar o Supabase', async () => {
    const signUp = vi.fn();
    const pwned = vi.fn(async () => ({ status: 'pwned' as const, count: 42 }));
    const err = await signUpWithEmail('eu@x.com', 'password123', 'https://app.exemplo', client({ signUp }), pwned).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SupabaseAuthError);
    expect((err as SupabaseAuthError).code).toBe('pwned_password');
    expect(signUp).not.toHaveBeenCalled();
  });

  it('checagem indisponível não impede o cadastro (fail-open) e registra só o motivo', async () => {
    warn.mockClear();
    const signUp = vi.fn(async () => ({ data: { session: null, user: { id: 'u' } }, error: null }));
    const down = vi.fn(async () => ({ status: 'unknown' as const, reason: 'timeout' as const }));
    await expect(signUpWithEmail('eu@x.com', 'segredo123', 'https://app.exemplo', client({ signUp }), down))
      .resolves.toEqual({ needsConfirmation: true });
    expect(signUp).toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    const [op, logged] = warn.mock.calls[0] as [string, SupabaseAuthError];
    expect(op).toBe('auth_login');
    expect(logged.code).toBe('pwned_check_timeout');
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/segredo123|eu@x\.com/);
  });

  it('tela: senha vazada mostra aviso em português', async () => {
    toastError.mockClear();
    const onSignUp = vi.fn(async () => { throw new SupabaseAuthError('pwned_password'); });
    render(<LoginScreen onLogin={vi.fn(async () => {})} emailAuth={{ onSignIn: vi.fn(), onSignUp }} />);
    fireEvent.click(screen.getByText('Não tem conta? Criar com e-mail'));
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'eu@x.com' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByText('Criar conta'));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith(
      'Esta senha já apareceu em vazamentos de dados na internet e não é segura. Escolha outra senha.',
    ));
  });

  it('tela: entra, cria conta e mostra aviso de confirmação', async () => {
    const onSignIn = vi.fn(async () => {});
    const onSignUp = vi.fn(async () => true);
    render(<LoginScreen onLogin={vi.fn(async () => {})} emailAuth={{ onSignIn, onSignUp }} />);

    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'eu@x.com' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'segredo123' } });
    fireEvent.click(screen.getByText('Entrar com e-mail'));
    await waitFor(() => expect(onSignIn).toHaveBeenCalledWith('eu@x.com', 'segredo123'));

    fireEvent.click(screen.getByText('Não tem conta? Criar com e-mail'));
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'curta' } });
    fireEvent.click(screen.getByText('Criar conta'));
    expect(onSignUp).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledWith('A senha precisa ter pelo menos 8 caracteres.');

    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'segredo123' } });
    fireEvent.click(screen.getByText('Criar conta'));
    expect(await screen.findByRole('status')).toHaveTextContent('clique no link de confirmação');
  });

  it('tela: erro de senha errada vira mensagem amigável; sem emailAuth não há formulário', async () => {
    const onSignIn = vi.fn(async () => { throw new SupabaseAuthError('invalid_credentials'); });
    const { unmount } = render(<LoginScreen onLogin={vi.fn(async () => {})} emailAuth={{ onSignIn, onSignUp: vi.fn(async () => false) }} />);
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'eu@x.com' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'errada' } });
    fireEvent.click(screen.getByText('Entrar com e-mail'));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('E-mail ou senha incorretos.'));
    unmount();

    render(<LoginScreen onLogin={vi.fn(async () => {})} />);
    expect(screen.queryByLabelText('E-mail')).toBeNull();
  });
});
