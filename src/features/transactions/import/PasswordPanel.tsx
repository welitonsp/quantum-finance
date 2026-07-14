import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, Loader2, ArrowRight } from 'lucide-react';

interface PasswordPanelProps {
  file:          File;
  wrongPassword: boolean;
  onSubmit:      (pwd: string) => void;
  onCancel:      () => void;
}

export function PasswordPanel({ file, wrongPassword, onSubmit, onCancel }: PasswordPanelProps) {
  const [password,   setPassword]   = useState('');
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    if (wrongPassword) setSubmitting(false);
  }, [wrongPassword]);

  const handleSubmit = () => {
    if (!password.trim() || submitting) return;
    setSubmitting(true);
    onSubmit(password);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
      <div className="flex items-start gap-3 p-3.5 bg-quantum-bgSecondary border border-quantum-border rounded-xl">
        <AlertTriangle className="w-4 h-4 text-quantum-gold shrink-0 mt-0.5" aria-hidden="true" />
        <div className="text-xs text-quantum-fg leading-relaxed">
          <p className="font-bold mb-0.5">PDF Protegido por Senha</p>
          <p className="text-quantum-fgMuted truncate max-w-xs" title={file.name}>{file.name}</p>
        </div>
      </div>

      <div>
        <label htmlFor="pdf-password-input" className="block text-xs font-bold uppercase tracking-wider text-quantum-fgMuted mb-1.5">
          Senha do PDF
        </label>
        <input
          ref={inputRef}
          id="pdf-password-input"
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); }}
          autoComplete="new-password"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          data-form-type="other"
          aria-label="Senha do PDF"
          aria-describedby={wrongPassword ? 'pdf-password-error' : undefined}
          aria-invalid={wrongPassword ? true : undefined}
          placeholder="Digite a senha..."
          className="input-quantum w-full"
        />
        {wrongPassword && (
          <span id="pdf-password-error" role="alert" className="block mt-1.5 text-xs text-quantum-red">
            Senha incorreta. Tente novamente.
          </span>
        )}
      </div>

      <div className="flex gap-3">
        <button type="button" onClick={onCancel} className="btn-quantum-secondary flex-1">
          Cancelar
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || !password.trim()}
          className="btn-quantum-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {submitting
            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> A verificar...</>
            : <><ArrowRight className="w-3.5 h-3.5" aria-hidden="true" /> Confirmar</>
          }
        </button>
      </div>
    </motion.div>
  );
}
