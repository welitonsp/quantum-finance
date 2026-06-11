import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Save, ArrowRightLeft, AlertCircle, CheckCircle } from 'lucide-react';
import { toCentavos, fromCentavos, formatBRL, type Centavos } from '../../shared/types/money';
import { FirestoreService, type TransferCreateDTO } from '../../shared/services/FirestoreService';
import type { Account } from '../../shared/types/transaction';

const backdropVariants = { hidden: { opacity: 0 }, visible: { opacity: 1 } };
const panelVariants = {
  hidden:  { opacity: 0, y: 40, scale: 0.97 },
  visible: { opacity: 1, y: 0,  scale: 1,   transition: { type: 'spring' as const, stiffness: 340, damping: 28 } },
  exit:    { opacity: 0, y: 24, scale: 0.96, transition: { duration: 0.18 } },
};

export interface TransferInitialValues {
  toAccountId?: string;
  valueCents?:  Centavos;
  description?: string;
}

interface Props {
  uid:            string;
  accounts:       Account[];
  onClose:        () => void;
  initialValues?: TransferInitialValues;
}

function formatFormMoney(raw: string): string | null {
  if (!raw.trim()) return null;
  try {
    const cents = toCentavos(raw);
    if (cents <= 0) return null;
    return formatBRL(cents);
  } catch {
    return null;
  }
}

export default function TransferForm({ uid, accounts, onClose, initialValues }: Props) {
  const today = new Date().toLocaleDateString('sv-SE');

  const initValue = initialValues?.valueCents
    ? fromCentavos(initialValues.valueCents).toFixed(2)
    : '';

  const [fromAccountId, setFromAccountId] = useState('');
  const [toAccountId,   setToAccountId]   = useState(initialValues?.toAccountId ?? '');
  const [value,         setValue]         = useState(initValue);
  const [date,          setDate]          = useState(today);
  const [description,   setDescription]   = useState(initialValues?.description ?? '');
  const [isSubmitting,  setIsSubmitting]  = useState(false);
  const [error,         setError]         = useState('');
  const [saved,         setSaved]         = useState(false);

  const valueRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    valueRef.current?.focus();
  }, []);

  const originAccounts      = accounts.filter(a => a.type !== 'cartao');
  const destinationAccounts = accounts;

  const preview = formatFormMoney(value);
  const sameAccount = fromAccountId && toAccountId && fromAccountId === toAccountId;
  const canSubmit = fromAccountId && toAccountId && !sameAccount && value.trim() && date;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || isSubmitting) return;
    setError('');
    setIsSubmitting(true);

    let cents: number;
    try {
      cents = toCentavos(value);
      if (cents <= 0) throw new Error('Valor deve ser positivo.');
    } catch {
      setError('Valor inválido. Use vírgula para centavos (ex: 1.500,00).');
      setIsSubmitting(false);
      return;
    }

    const dto: TransferCreateDTO = {
      fromAccountId,
      toAccountId,
      value_cents: cents as never,
      date,
      ...(description.trim() ? { description: description.trim() } : {}),
    };

    try {
      await FirestoreService.createTransferWithHistory(uid, dto);
      setSaved(true);
      setTimeout(() => {
        setSaved(false);
        onClose();
      }, 1200);
    } catch (err) {
      setError('Erro ao registrar transferência. Tente novamente.');
      if (import.meta.env.DEV) {
        console.warn('[TransferForm] createTransferWithHistory:', err);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        variants={backdropVariants}
        initial="hidden"
        animate="visible"
        exit="hidden"
      >
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

        <motion.div
          className="relative w-full max-w-md bg-quantum-bg border border-quantum-border rounded-2xl shadow-2xl overflow-hidden"
          variants={panelVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          role="dialog"
          aria-modal="true"
          aria-label="Nova transferência"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-quantum-border">
            <div className="flex items-center gap-2">
              <ArrowRightLeft className="w-5 h-5 text-blue-400" />
              <h2 className="text-base font-semibold text-quantum-fg">Nova Transferência</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-quantum-fgMuted hover:text-quantum-fg hover:bg-quantum-card transition-colors"
              aria-label="Fechar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={(e) => void handleSubmit(e)} className="px-6 pb-6 pt-5 space-y-4">
            {/* Valor */}
            <div>
              <label className="block text-xs font-medium text-quantum-fgMuted mb-1.5" htmlFor="tf-value">
                Valor
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-quantum-fgMuted">R$</span>
                <input
                  id="tf-value"
                  ref={valueRef}
                  type="text"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={value}
                  onChange={e => setValue(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 bg-quantum-card border border-quantum-border rounded-xl text-sm text-quantum-fg placeholder:text-quantum-fgMuted focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  required
                />
              </div>
              {preview && (
                <p className="text-xs text-blue-400 mt-1 pl-1">{preview}</p>
              )}
            </div>

            {/* Data */}
            <div>
              <label className="block text-xs font-medium text-quantum-fgMuted mb-1.5" htmlFor="tf-date">
                Data
              </label>
              <input
                id="tf-date"
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full px-3 py-2.5 bg-quantum-card border border-quantum-border rounded-xl text-sm text-quantum-fg focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                required
              />
            </div>

            {/* Conta origem */}
            <div>
              <label className="block text-xs font-medium text-quantum-fgMuted mb-1.5" htmlFor="tf-from">
                Conta de origem
              </label>
              <select
                id="tf-from"
                value={fromAccountId}
                onChange={e => setFromAccountId(e.target.value)}
                className="w-full px-3 py-2.5 bg-quantum-card border border-quantum-border rounded-xl text-sm text-quantum-fg focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                required
              >
                <option value="">Selecione a conta de origem</option>
                {originAccounts.map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>

            {/* Conta destino */}
            <div>
              <label className="block text-xs font-medium text-quantum-fgMuted mb-1.5" htmlFor="tf-to">
                Conta de destino
              </label>
              <select
                id="tf-to"
                value={toAccountId}
                onChange={e => setToAccountId(e.target.value)}
                className="w-full px-3 py-2.5 bg-quantum-card border border-quantum-border rounded-xl text-sm text-quantum-fg focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                required
              >
                <option value="">Selecione a conta de destino</option>
                {destinationAccounts.map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
              {sameAccount && (
                <p className="text-xs text-red-400 mt-1 pl-1">Origem e destino não podem ser iguais.</p>
              )}
            </div>

            {/* Descrição opcional */}
            <div>
              <label className="block text-xs font-medium text-quantum-fgMuted mb-1.5" htmlFor="tf-desc">
                Descrição <span className="text-quantum-fgMuted/60">(opcional)</span>
              </label>
              <input
                id="tf-desc"
                type="text"
                placeholder="Transferência"
                maxLength={160}
                value={description}
                onChange={e => setDescription(e.target.value)}
                className="w-full px-3 py-2.5 bg-quantum-card border border-quantum-border rounded-xl text-sm text-quantum-fg placeholder:text-quantum-fgMuted focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <p className="text-xs text-red-300">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={!canSubmit || isSubmitting || saved}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all duration-200 bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saved ? (
                <><CheckCircle className="w-4 h-4" />Transferência registrada!</>
              ) : isSubmitting ? (
                'Registrando...'
              ) : (
                <><Save className="w-4 h-4" />Registrar transferência</>
              )}
            </button>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
