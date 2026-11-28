// Painel de inscrição MFA TOTP no Supabase (Settings).
// O login em duas etapas (aal1 → aal2) já é tratado pelo SupabaseAuthGate;
// aqui o usuário ativa ou desativa o fator. Mesmo visual do painel Firebase.

import { useCallback, useEffect, useState } from 'react';
import { KeyRound, ShieldCheck, ShieldOff, Copy } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  finalizeTotpEnrollment,
  listTotpFactors,
  normalizeTotpCode,
  startTotpEnrollment,
  unenrollTotpFactor,
  type TotpEnrollmentStart,
  type TotpFactor,
} from '../../shared/api/supabase/auth';
import { logSanitizedFirebaseError } from '../../shared/lib/firebaseErrorHandling';

type PanelState = { step: 'idle' } | ({ step: 'enrolling' } & TotpEnrollmentStart);

export default function MfaPanelSupabase() {
  const [factors, setFactors] = useState<TotpFactor[]>([]);
  const [state, setState] = useState<PanelState>({ step: 'idle' });
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const refreshFactors = useCallback(async () => {
    try {
      setFactors(await listTotpFactors());
    } catch (error) {
      logSanitizedFirebaseError('auth_mfa_enroll', error);
    }
  }, []);

  useEffect(() => { void refreshFactors(); }, [refreshFactors]);

  const handleStart = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const start = await startTotpEnrollment();
      setState({ step: 'enrolling', ...start });
    } catch (error) {
      logSanitizedFirebaseError('auth_mfa_enroll', error);
      toast.error('Não foi possível iniciar a ativação. Tente novamente.');
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = async () => {
    if (busy || state.step !== 'enrolling') return;
    const pendingId = state.factorId;
    setState({ step: 'idle' });
    setCode('');
    // fator não verificado: remove para não acumular inscrições abandonadas
    try {
      await unenrollTotpFactor(pendingId);
    } catch {
      // sem efeito para o usuário: o Supabase descarta fatores não verificados
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
      await finalizeTotpEnrollment(state.factorId, code);
      toast.success('Verificação em duas etapas ativada!');
      setState({ step: 'idle' });
      setCode('');
      await refreshFactors();
    } catch (error) {
      logSanitizedFirebaseError('auth_mfa_enroll', error);
      toast.error('Código inválido ou expirado. Confira o app autenticador e tente de novo.');
    } finally {
      setBusy(false);
    }
  };

  const handleUnenroll = async (factorId: string) => {
    if (busy) return;
    if (!window.confirm('Desativar a verificação em duas etapas? Sua conta ficará menos protegida.')) return;
    setBusy(true);
    try {
      await unenrollTotpFactor(factorId);
      toast.success('Verificação em duas etapas desativada.');
      await refreshFactors();
    } catch (error) {
      logSanitizedFirebaseError('auth_mfa_unenroll', error);
      toast.error('Não foi possível desativar. Saia, entre de novo com o código e tente outra vez.');
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
            <div key={f.id} className="flex items-center justify-between bg-quantum-bgSecondary border border-quantum-border rounded-lg px-3 py-2">
              <span className="text-xs text-quantum-fg flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-cyan-400" aria-hidden />
                {f.friendlyName ?? 'App autenticador'}
              </span>
              <button
                onClick={() => void handleUnenroll(f.id)}
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
            1. No seu app autenticador, leia o QR code ou digite esta chave:
          </p>
          <img
            src={`data:image/svg+xml;utf-8,${encodeURIComponent(state.qrCodeSvg)}`}
            alt="QR code para o app autenticador"
            className="w-40 h-40 bg-white rounded-lg p-2"
          />
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs font-mono bg-quantum-bgSecondary border border-quantum-border rounded-lg px-3 py-2 break-all select-all">
              {state.secretKey}
            </code>
            <button
              onClick={() => void copySecret(state.secretKey)}
              aria-label="Copiar chave"
              className="p-2 rounded-lg border border-quantum-border hover:bg-quantum-bgSecondary transition-colors"
            >
              <Copy className="w-4 h-4 text-quantum-fgMuted" aria-hidden />
            </button>
          </div>
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
              className="w-32 text-center font-mono tracking-[0.3em] bg-quantum-bgSecondary border border-quantum-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500"
            />
            <button
              onClick={() => void handleConfirm()}
              disabled={busy}
              className="text-xs font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 rounded-lg px-4 py-2 hover:bg-emerald-500/25 transition-colors disabled:opacity-60"
            >
              {busy ? 'A confirmar…' : 'Confirmar'}
            </button>
            <button
              onClick={() => void handleCancel()}
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
