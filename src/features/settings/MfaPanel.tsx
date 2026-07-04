// Painel de inscrição MFA TOTP (Settings).
// Depende do resolver de sign-in (src/shared/lib/mfa.ts + LoginScreen) já em
// produção — sem ele, inscrever um fator = lockout no próximo login.
// Pré-requisito de projeto: Identity Platform com TOTP habilitado no console;
// sem isso a inscrição falha com auth/operation-not-allowed (mensagem própria).

import { useCallback, useEffect, useState } from 'react';
import { KeyRound, ShieldCheck, ShieldOff, Copy } from 'lucide-react';
import toast from 'react-hot-toast';
import type { MultiFactorInfo, TotpSecret, User } from 'firebase/auth';
import { auth } from '../../shared/api/firebase/index';
import { logSanitizedFirebaseError } from '../../shared/lib/firebaseErrorHandling';
import {
  finalizeTotpEnrollment,
  isMfaNotConfiguredError,
  isRecentLoginRequiredError,
  listTotpFactors,
  normalizeTotpCode,
  startTotpEnrollment,
  unenrollTotpFactor,
} from '../../shared/lib/mfa';

type PanelState =
  | { step: 'idle' }
  | { step: 'enrolling'; secret: TotpSecret; secretKey: string; otpauthUrl: string };

export default function MfaPanel() {
  const user: User | null = auth.currentUser;
  const [factors, setFactors] = useState<MultiFactorInfo[]>([]);
  const [state, setState] = useState<PanelState>({ step: 'idle' });
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const refreshFactors = useCallback(() => {
    if (user && !user.isAnonymous) setFactors(listTotpFactors(user));
  }, [user]);

  useEffect(() => { refreshFactors(); }, [refreshFactors]);

  if (!user || user.isAnonymous) return null;

  const handleStart = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const start = await startTotpEnrollment(user);
      setState({ step: 'enrolling', ...start });
    } catch (error) {
      logSanitizedFirebaseError('auth_mfa_enroll', error);
      if (isMfaNotConfiguredError(error)) {
        toast.error('MFA TOTP ainda não está habilitado no projeto (Identity Platform). Contate o administrador.');
      } else if (isRecentLoginRequiredError(error)) {
        toast.error('Por segurança, saia e entre novamente antes de ativar a verificação em duas etapas.');
      } else {
        toast.error('Não foi possível iniciar a ativação. Tente novamente.');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleConfirm = async () => {
    if (busy || state.step !== 'enrolling') return;
    if (!normalizeTotpCode(code)) {
      toast.error('Digite o código de 6 dígitos do seu app autenticador.');
      return;
    }
    setBusy(true);
    try {
      await finalizeTotpEnrollment(user, state.secret, code);
      toast.success('Verificação em duas etapas ativada!');
      setState({ step: 'idle' });
      setCode('');
      refreshFactors();
    } catch (error) {
      logSanitizedFirebaseError('auth_mfa_enroll', error);
      toast.error('Código inválido ou expirado. Confira o app autenticador e tente de novo.');
    } finally {
      setBusy(false);
    }
  };

  const handleUnenroll = async (factorUid: string) => {
    if (busy) return;
    if (!window.confirm('Desativar a verificação em duas etapas? Sua conta ficará menos protegida.')) return;
    setBusy(true);
    try {
      await unenrollTotpFactor(user, factorUid);
      toast.success('Verificação em duas etapas desativada.');
      refreshFactors();
    } catch (error) {
      logSanitizedFirebaseError('auth_mfa_unenroll', error);
      if (isRecentLoginRequiredError(error)) {
        toast.error('Por segurança, saia e entre novamente antes de desativar.');
      } else {
        toast.error('Não foi possível desativar. Tente novamente.');
      }
    } finally {
      setBusy(false);
    }
  };

  const copySecret = async (secretKey: string) => {
    try {
      await navigator.clipboard.writeText(secretKey);
      toast.success('Chave copiada. Cole no seu app autenticador.');
    } catch {
      toast.error('Não foi possível copiar. Digite a chave manualmente.');
    }
  };

  const enrolled = factors.length > 0;

  return (
    <section aria-label="Verificação em duas etapas">
      <div className="flex items-center gap-3 mb-3">
        {enrolled
          ? <ShieldCheck className="w-5 h-5 text-emerald-400" aria-hidden />
          : <ShieldOff className="w-5 h-5 text-amber-400" aria-hidden />}
        <h3 className="text-sm font-bold uppercase tracking-wider text-quantum-fg">
          Verificação em duas etapas (TOTP)
        </h3>
      </div>

      {enrolled ? (
        <div className="space-y-2">
          <p className="text-xs text-quantum-fgMuted">
            Sua conta exige um código do app autenticador a cada login.
          </p>
          {factors.map((f) => (
            <div key={f.uid} className="flex items-center justify-between bg-slate-900/60 border border-quantum-border/50 rounded-lg px-3 py-2">
              <span className="text-xs text-quantum-fg flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-cyan-400" aria-hidden />
                {f.displayName ?? 'App autenticador'}
              </span>
              <button
                onClick={() => void handleUnenroll(f.uid)}
                disabled={busy}
                className="text-xs text-rose-400 hover:text-rose-300 font-semibold disabled:opacity-60"
              >
                Desativar
              </button>
            </div>
          ))}
        </div>
      ) : state.step === 'idle' ? (
        <div className="space-y-3">
          <p className="text-xs text-quantum-fgMuted">
            Proteja sua conta exigindo um código do app autenticador (Google Authenticator,
            1Password, Authy…) além do login Google.
          </p>
          <button
            onClick={() => void handleStart()}
            disabled={busy}
            className="text-xs font-bold uppercase tracking-wider bg-cyan-500/15 text-cyan-300 border border-cyan-500/40 rounded-lg px-4 py-2 hover:bg-cyan-500/25 transition-colors disabled:opacity-60"
          >
            {busy ? 'A preparar…' : 'Ativar verificação em duas etapas'}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-quantum-fgMuted">
            1. No seu app autenticador, adicione uma conta nova digitando esta chave
            (ou abra o link no dispositivo com o autenticador):
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs font-mono bg-slate-900/80 border border-quantum-border/50 rounded-lg px-3 py-2 break-all select-all">
              {state.secretKey}
            </code>
            <button
              onClick={() => void copySecret(state.secretKey)}
              aria-label="Copiar chave"
              className="p-2 rounded-lg border border-quantum-border/50 hover:bg-slate-800 transition-colors"
            >
              <Copy className="w-4 h-4 text-quantum-fgMuted" aria-hidden />
            </button>
          </div>
          <a
            href={state.otpauthUrl}
            className="inline-block text-xs text-cyan-400 hover:text-cyan-300 underline"
          >
            Abrir no app autenticador
          </a>
          <p className="text-xs text-quantum-fgMuted">2. Digite o código de 6 dígitos gerado:</p>
          <div className="flex items-center gap-2">
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={7}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleConfirm(); }}
              placeholder="000000"
              aria-label="Código do app autenticador"
              className="w-32 text-center font-mono tracking-[0.3em] bg-slate-900/80 border border-quantum-border/50 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500"
            />
            <button
              onClick={() => void handleConfirm()}
              disabled={busy}
              className="text-xs font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 rounded-lg px-4 py-2 hover:bg-emerald-500/25 transition-colors disabled:opacity-60"
            >
              {busy ? 'A confirmar…' : 'Confirmar'}
            </button>
            <button
              onClick={() => { setState({ step: 'idle' }); setCode(''); }}
              disabled={busy}
              className="text-xs text-quantum-fgMuted hover:text-quantum-fg transition-colors disabled:opacity-60"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
