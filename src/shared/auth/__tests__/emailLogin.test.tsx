import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { signInWithEmail, signUpWithEmail, SupabaseAuthError } from '../../api/supabase/auth';
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
    const out = await signUpWithEmail('eu@x.com', 'segredo123', 'https://app.exemplo', client({ signUp }));
    expect(out).toEqual({ needsConfirmation: true });
    expect(signUp).toHaveBeenCalledWith({
      email: 'eu@x.com', password: 'segredo123', options: { emailRedirectTo: 'https://app.exemplo' },
    });
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
