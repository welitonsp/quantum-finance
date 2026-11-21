import type { ReactNode } from 'react';
import toast from 'react-hot-toast';
import LoginScreen from '../../components/LoginScreen';
import { useSupabaseAuth } from './useSupabaseAuth';
import type { AppUser } from './appUser';

interface Props {
  /** Renderiza o app autenticado; só é chamado com sessão aal2 (ou sem MFA inscrito). */
  children: (user: AppUser, logout: () => Promise<void>) => ReactNode;
}

/**
 * Porta de entrada do login pelo Supabase (Google ou e-mail e senha + TOTP).
 * Carregada sob demanda (React.lazy) só quando VITE_AUTH_PROVIDER=supabase,
 * para o supabase-js não pesar no bundle enquanto o app roda no Firebase.
 */
export default function SupabaseAuthGate({ children }: Props) {
  const { ready, stage, appUser, login, loginWithEmail, signUpWithEmail, submitMfaCode, cancelMfa, logout } = useSupabaseAuth();

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-quantum-bg text-cyan-400 font-bold animate-pulse uppercase">
        A inicializar o Quantum Finance...
      </div>
    );
  }

  if (!appUser) {
    return (
      <LoginScreen
        onLogin={login}
        emailAuth={{ onSignIn: loginWithEmail, onSignUp: signUpWithEmail }}
        mfaPending={stage === 'needs_mfa'}
        onSubmitMfaCode={async (code) => {
          try {
            await submitMfaCode(code);
            toast.success('Bem-vindo de volta.');
          } catch {
            toast.error('Código inválido ou expirado. Tente novamente.');
          }
        }}
        onCancelMfa={() => {
          void cancelMfa().catch(() => toast.error('Erro ao sair.'));
        }}
      />
    );
  }

  return <>{children(appUser, logout)}</>;
}
