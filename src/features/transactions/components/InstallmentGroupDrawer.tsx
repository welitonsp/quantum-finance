// src/features/transactions/components/InstallmentGroupDrawer.tsx
// Drawer que exibe todas as parcelas de um grupo e permite cancelar as futuras.
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CreditCard, CheckCircle, Clock, Trash2, AlertTriangle } from 'lucide-react';
import type { Transaction } from '../../../shared/types/transaction';
import { FirestoreService } from '../../../shared/services/FirestoreService';
import { formatBRL, fromCentavos } from '../../../shared/types/money';
import { getTransactionAbsCentavos } from '../../../utils/transactionUtils';
import { logSanitizedFirebaseError } from '../../../shared/lib/firebaseErrorHandling';

interface Props {
  uid:        string;
  groupId:    string;
  onClose:    () => void;
  onCanceled: () => void;
}

function isFuture(dateStr: string | undefined): boolean {
  if (!dateStr) return false;
  const today = new Date().toLocaleDateString('sv-SE');
  return dateStr > today;
}

export default function InstallmentGroupDrawer({ uid, groupId, onClose, onCanceled }: Props) {
  const [installments, setInstallments] = useState<Transaction[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [canceling,    setCanceling]    = useState(false);
  const [confirmFrom,  setConfirmFrom]  = useState<number | null>(null);
  const [error,        setError]        = useState('');

  useEffect(() => {
    setLoading(true);
    FirestoreService.getInstallmentGroup(uid, groupId)
      .then(setInstallments)
      .catch(err => logSanitizedFirebaseError('installment_group_load', err))
      .finally(() => setLoading(false));
  }, [uid, groupId]);

  const handleCancel = useCallback(async (fromIndex: number) => {
    setCanceling(true);
    setError('');
    try {
      await FirestoreService.cancelRemainingInstallments(uid, groupId, fromIndex);
      onCanceled();
      onClose();
    } catch (err) {
      setError('Erro ao cancelar parcelas. Tente novamente.');
      if (import.meta.env.DEV) console.warn('[InstallmentGroupDrawer] cancelRemainingInstallments error', err);
    } finally {
      setCanceling(false);
      setConfirmFrom(null);
    }
  }, [uid, groupId, onCanceled, onClose]);

  const total       = installments[0]?.installmentCount ?? installments.length;
  const totalCents  = installments[0]?.installmentTotalCents ?? 0;
  const futureTxs   = installments.filter(tx => isFuture(tx.date));
  const paidTxs     = installments.filter(tx => !isFuture(tx.date));

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
        style={{ background: 'rgba(2,6,23,0.82)', backdropFilter: 'blur(6px)' }}
        onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      >
        <motion.div
          initial={{ opacity: 0, y: 40, scale: 0.97 }}
          animate={{ opacity: 1, y: 0,  scale: 1, transition: { type: 'spring', stiffness: 340, damping: 28 } }}
          exit={{ opacity: 0, y: 24, scale: 0.96, transition: { duration: 0.18 } }}
          className="relative w-full sm:max-w-lg bg-[#0d1424] border border-quantum-border rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
          onClick={e => e.stopPropagation()}
        >
          {/* Top bar */}
          <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: 'linear-gradient(90deg,transparent,#a855f7,transparent)' }} />

          <div className="flex justify-center pt-3 pb-1 sm:hidden">
            <div className="w-10 h-1 rounded-full bg-white/20" />
          </div>

          <div className="flex items-center justify-between px-6 pt-5 pb-4 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-purple-500/15 flex items-center justify-center">
                <CreditCard className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <h2 className="text-base font-bold text-quantum-fg leading-tight">Parcelamento</h2>
                <p className="text-[11px] text-quantum-fgMuted">
                  {total} parcelas · {totalCents > 0 ? formatBRL(totalCents) : '—'} total
                </p>
              </div>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-quantum-fgMuted hover:text-quantum-fg hover:bg-white/10 transition-all">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Error */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mx-6 mb-3 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-2.5 text-red-400 text-sm"
              >
                <AlertTriangle className="w-4 h-4 shrink-0" />{error}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-2">
            {loading ? (
              <div className="py-12 text-center text-quantum-fgMuted text-sm">Carregando parcelas…</div>
            ) : installments.length === 0 ? (
              <div className="py-12 text-center text-quantum-fgMuted text-sm">Nenhuma parcela encontrada.</div>
            ) : (
              installments.map(tx => {
                const future  = isFuture(tx.date);
                const idx     = tx.installmentIndex ?? 0;
                const cents   = getTransactionAbsCentavos(tx);
                const isConfirmTarget = confirmFrom === idx;

                return (
                  <div
                    key={tx.id}
                    className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${
                      future
                        ? 'bg-quantum-bgSecondary/40 border-quantum-border'
                        : 'bg-emerald-500/5 border-emerald-500/15'
                    }`}
                  >
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${future ? 'bg-purple-500/15 text-purple-400' : 'bg-emerald-500/15 text-emerald-400'}`}>
                      {future ? <Clock className="w-3.5 h-3.5" /> : <CheckCircle className="w-3.5 h-3.5" />}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-quantum-fg truncate">{tx.description}</p>
                      <p className="text-[10px] text-quantum-fgMuted">{tx.date} · Parcela {idx}/{total}</p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-mono text-sm font-bold text-quantum-fg">
                        {formatBRL(fromCentavos(cents))}
                      </span>

                      {future && (
                        isConfirmTarget ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => void handleCancel(idx - 1)}
                              disabled={canceling}
                              className="text-[10px] font-bold px-2 py-1 rounded-lg bg-red-500/20 border border-red-500/40 text-red-300 hover:bg-red-500/30 transition-colors disabled:opacity-50"
                            >
                              {canceling ? '…' : 'Confirmar'}
                            </button>
                            <button
                              onClick={() => setConfirmFrom(null)}
                              disabled={canceling}
                              className="text-[10px] font-bold px-2 py-1 rounded-lg bg-white/5 border border-quantum-border text-quantum-fgMuted hover:text-quantum-fg transition-colors"
                            >
                              Não
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmFrom(idx)}
                            title={`Cancelar parcela ${idx} e seguintes`}
                            className="p-1.5 rounded-lg text-quantum-fgMuted hover:text-red-400 hover:bg-red-500/10 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer summary */}
          {!loading && installments.length > 0 && (
            <div className="shrink-0 border-t border-quantum-border px-6 py-4 flex items-center justify-between gap-4 bg-quantum-bgSecondary/30">
              <div className="text-[11px] text-quantum-fgMuted">
                <span className="text-emerald-400 font-bold">{paidTxs.length} pagas</span>
                {futureTxs.length > 0 && <span className="ml-2 text-purple-400 font-bold">{futureTxs.length} futuras</span>}
              </div>
              {futureTxs.length > 0 && (
                <p className="text-[10px] text-quantum-fgMuted">
                  Clique em <Trash2 className="inline w-3 h-3" /> numa parcela futura para cancelar ela e as seguintes.
                </p>
              )}
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
