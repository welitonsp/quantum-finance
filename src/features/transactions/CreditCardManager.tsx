// src/features/transactions/CreditCardManager.tsx
import React, { useState, useRef, useEffect, useId } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CreditCard, Plus, Trash2, Edit2, CheckCircle,
  AlertTriangle, ShieldAlert, Banknote, X, Save,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useCreditCards } from '../../hooks/useCreditCards';
import { logSanitizedFirebaseError } from '../../shared/lib/firebaseErrorHandling';
import { fromCentavos } from '../../shared/schemas/financialSchemas';
import { formatCurrency } from '../../utils/formatters';
import { formatBRL } from '../../shared/types/money';
import type { CreditCard as CreditCardType, CreditCardWithMetrics, Transaction, Account } from '../../shared/types/transaction';
import type { Centavos, MoneyInput } from '../../shared/types/money';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Props {
  uid:           string;
  transactions?: Transaction[];
  accounts?:     Account[];
}

interface CardFormData {
  name:       string;
  limit:      number | string;
  closingDay: number;
  dueDay:     number;
  color:      string;
  active:     boolean;
}

type CreditCardFormPayload = Omit<CreditCardType, 'id' | 'limit'> & {
  limit: MoneyInput;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const COMPETENCIA_MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** Formata competência 'YYYY-MM' para rótulo curto pt-BR (ex.: 'abr/2025'). */
function formatCompetencia(competencia: string): string {
  const [year, month] = competencia.split('-').map(Number);
  const idx = (month ?? 1) - 1;
  return `${COMPETENCIA_MESES[idx] ?? '???'}/${year ?? ''}`;
}

// ─── CardVisual ───────────────────────────────────────────────────────────────
function CardVisual({ card }: { card: CreditCardWithMetrics }) {
  const { metrics } = card;
  const color = card.color ?? '#00E68A';

  const alertColors = {
    safe:     { bar: color,     text: 'text-emerald-400' },
    warning:  { bar: '#FFB800', text: 'text-yellow-400'  },
    critical: { bar: '#FF4757', text: 'text-red-400'     },
  } as const;
  const ac = alertColors[metrics.alertLevel] ?? alertColors.safe;

  return (
    <div
      className="relative w-full aspect-[1.586] rounded-2xl p-5 overflow-hidden select-none"
      style={{
        background:  `linear-gradient(135deg, rgba(19,26,42,0.95) 0%, rgba(10,14,23,0.99) 100%)`,
        border:      `1px solid ${color}30`,
        boxShadow:   `0 8px 32px rgba(0,0,0,0.4), 0 0 20px ${color}15, inset 0 1px 0 rgba(255,255,255,0.05)`,
      }}
    >
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-8 -right-8 w-40 h-40 rounded-full blur-3xl opacity-20" style={{ background: color }} />
        <div className="absolute -bottom-8 -left-8 w-32 h-32 rounded-full blur-3xl opacity-10" style={{ background: color }} />
        <svg className="absolute inset-0 w-full h-full opacity-5" viewBox="0 0 400 252">
          <path d="M0 100 Q200 50 400 100" stroke="white" strokeWidth="1" fill="none" />
          <path d="M0 150 Q200 100 400 150" stroke="white" strokeWidth="0.5" fill="none" />
        </svg>
      </div>

      <div className="relative z-10 h-full flex flex-col justify-between">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-widest font-medium" style={{ color: `${color}99` }}>
              Quantum Finance
            </p>
            <p className="text-base font-black text-quantum-fg mt-0.5">{card.name}</p>
          </div>
          <div className="p-2 rounded-xl" style={{ background: `${color}20`, border: `1px solid ${color}30` }}>
            <CreditCard className="w-5 h-5" style={{ color }} />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="w-9 h-7 rounded-md border-2 opacity-60" style={{ borderColor: `${color}60`, background: `${color}15` }} />
          <div className="h-0.5 w-12 opacity-20" style={{ background: color }} />
          <div className="h-0.5 w-8 opacity-10"  style={{ background: color }} />
        </div>

        <div>
          <div className="flex justify-between text-xs mb-1.5">
            <span className="text-white/40">Usado</span>
            <span className={`font-bold font-mono ${ac.text}`}>{metrics.compromisso.toFixed(1)}%</span>
          </div>
          <div className="w-full h-1.5 rounded-full overflow-hidden mb-3" style={{ background: 'rgba(255,255,255,0.08)' }}>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${metrics.compromisso}%` }}
              transition={{ duration: 1, ease: 'easeOut' }}
              className="h-full rounded-full"
              style={{ background: `linear-gradient(90deg, ${ac.bar}, ${ac.bar}CC)`, boxShadow: `0 0 8px ${ac.bar}80` }}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-[9px] uppercase tracking-widest text-white/30 mb-0.5">Disponível</p>
              <p className="text-sm font-black font-mono text-quantum-fg">
                {formatCurrency(fromCentavos(metrics.effectiveAvailableCents))}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[9px] uppercase tracking-widest text-white/30 mb-0.5">Limite Total</p>
              <p className="text-sm font-bold font-mono" style={{ color: `${color}CC` }}>
                {formatCurrency(fromCentavos(metrics.limitCents))}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── PayInvoiceModal ──────────────────────────────────────────────────────────
interface PayInvoiceModalProps {
  card:        CreditCardWithMetrics;
  accounts:    Account[];
  onClose:     () => void;
  onPay:       (cardId: string, amountCents: Centavos, fromAccountId: string) => Promise<void>;
}

function PayInvoiceModal({ card, accounts, onClose, onPay }: PayInvoiceModalProps) {
  const [fromAccountId, setFromAccountId] = useState('');
  const [isSubmitting,  setIsSubmitting]  = useState(false);
  const selectRef = useRef<HTMLSelectElement>(null);

  useEffect(() => { selectRef.current?.focus(); }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const payableAccounts = accounts.filter(a => a.type !== 'cartao');
  const canSubmit = Boolean(fromAccountId) && !isSubmitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setIsSubmitting(true);
    try {
      await onPay(card.id, card.metrics.faturaCents, fromAccountId);
      toast.success('Pagamento registrado!');
      onClose();
    } catch (err) {
      logSanitizedFirebaseError('invoice_payment', err);
      toast.error('Erro ao registrar pagamento.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <motion.div
        className="relative w-full max-w-sm bg-quantum-bg border border-quantum-border rounded-2xl shadow-2xl overflow-hidden"
        initial={{ opacity: 0, y: 32, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.96 }}
        role="dialog"
        aria-modal="true"
        aria-label="Pagar fatura"
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-quantum-border">
          <div className="flex items-center gap-2">
            <Banknote className="w-5 h-5 text-blue-400" />
            <h2 className="text-sm font-semibold text-quantum-fg">Pagar fatura — {card.name}</h2>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-quantum-fgMuted hover:text-quantum-fg transition-colors" aria-label="Fechar">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="px-5 pb-5 pt-4 space-y-4">
          <div className="flex justify-between items-center p-3 bg-quantum-bgSecondary rounded-xl">
            <span className="text-xs text-quantum-fgMuted">Valor da fatura</span>
            <span className="text-sm font-bold text-quantum-red font-mono">
              {formatBRL(card.metrics.faturaCents)}
            </span>
          </div>

          <div>
            <label className="block text-xs font-medium text-quantum-fgMuted mb-1.5" htmlFor="pi-from">
              Conta de origem
            </label>
            <select
              id="pi-from"
              ref={selectRef}
              value={fromAccountId}
              onChange={e => setFromAccountId(e.target.value)}
              className="w-full px-3 py-2.5 bg-quantum-card border border-quantum-border rounded-xl text-sm text-quantum-fg focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              required
            >
              <option value="">Selecione a conta</option>
              {payableAccounts.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {isSubmitting ? 'Registrando...' : <><Save className="w-4 h-4" />Confirmar pagamento</>}
          </button>
        </form>
      </motion.div>
    </motion.div>
  );
}

// ─── CardForm ─────────────────────────────────────────────────────────────────
const CARD_COLORS = ['#00E68A', '#A855F7', '#06B6D4', '#FFB800', '#FF4757', '#3B82F6', '#F43F5E'];

interface CardFormProps {
  initial?: CreditCardWithMetrics | null;
  onSave:   (data: CreditCardFormPayload) => void;
  onCancel: () => void;
}
function CardForm({ initial, onSave, onCancel }: CardFormProps) {
  const fieldId = useId();
  const [form, setForm] = useState<CardFormData>({
    name:       initial?.name       ?? '',
    limit:      initial ? fromCentavos(initial.limit) : '',
    closingDay: initial?.closingDay ?? 1,
    dueDay:     initial?.dueDay     ?? 10,
    color:      initial?.color      ?? '#00E68A',
    active:     initial?.active     !== false,
  });

  const set = <K extends keyof CardFormData>(k: K, v: CardFormData[K]) =>
    setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.limit) {
      toast.error('Preencha nome e limite.');
      return;
    }
    onSave({ ...form, name: form.name.trim(), limit: String(form.limit).trim() });
  };

  return (
    <motion.form
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      onSubmit={handleSubmit}
      className="space-y-4"
    >
      <div>
        <label htmlFor={`${fieldId}-name`} className="text-xs text-quantum-fgMuted uppercase tracking-wider mb-1.5 block">Nome do Cartão</label>
        <input
          id={`${fieldId}-name`}
          className="input-quantum"
          placeholder="Ex: Nubank Platinum"
          value={form.name}
          onChange={e => set('name', e.target.value)}
          required
        />
      </div>
      <div>
        <label htmlFor={`${fieldId}-limit`} className="text-xs text-quantum-fgMuted uppercase tracking-wider mb-1.5 block">Limite (R$)</label>
        <input
          id={`${fieldId}-limit`}
          className="input-quantum"
          type="number"
          placeholder="5000.00"
          value={form.limit}
          onChange={e => set('limit', e.target.value)}
          required min="1" step="0.01"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor={`${fieldId}-closing`} className="text-xs text-quantum-fgMuted uppercase tracking-wider mb-1.5 block">Dia de Fecho</label>
          <input
            id={`${fieldId}-closing`}
            className="input-quantum"
            type="number" min="1" max="31"
            value={form.closingDay}
            onChange={e => set('closingDay', Number(e.target.value))}
          />
        </div>
        <div>
          <label htmlFor={`${fieldId}-due`} className="text-xs text-quantum-fgMuted uppercase tracking-wider mb-1.5 block">Dia de Vencimento</label>
          <input
            id={`${fieldId}-due`}
            className="input-quantum"
            type="number" min="1" max="31"
            value={form.dueDay}
            onChange={e => set('dueDay', Number(e.target.value))}
          />
        </div>
      </div>
      <div>
        <span className="text-xs text-quantum-fgMuted uppercase tracking-wider mb-2 block">Cor do Cartão</span>
        <div className="flex gap-2 flex-wrap">
          {CARD_COLORS.map(c => (
            <button
              key={c}
              type="button"
              onClick={() => set('color', c)}
              className="w-8 h-8 rounded-lg transition-all border-2"
              style={{
                background:  c,
                borderColor: form.color === c ? 'white' : 'transparent',
                boxShadow:   form.color === c ? `0 0 12px ${c}80` : 'none',
                transform:   form.color === c ? 'scale(1.15)' : 'scale(1)',
              }}
            />
          ))}
        </div>
      </div>
      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onCancel} className="flex-1 py-2.5 bg-quantum-bgSecondary border border-quantum-border text-quantum-fgMuted rounded-xl text-sm font-bold hover:text-quantum-fg transition-colors">
          Cancelar
        </button>
        <button type="submit" className="flex-1 btn-quantum-primary">
          {initial ? 'Guardar Alterações' : 'Adicionar Cartão'}
        </button>
      </div>
    </motion.form>
  );
}

// ─── Componente Principal ─────────────────────────────────────────────────────
export default function CreditCardManager({ uid, transactions = [], accounts = [] }: Props) {
  const { cards, loading, addCard, updateCard, removeCard, payInvoice } = useCreditCards(uid, transactions);
  const [showForm,    setShowForm]    = useState(false);
  const [editingCard, setEditingCard] = useState<CreditCardWithMetrics | null>(null);
  const [deletingId,  setDeletingId]  = useState<string | null>(null);
  const [payingCard,  setPayingCard]  = useState<CreditCardWithMetrics | null>(null);

  const handleSave = async (data: CreditCardFormPayload) => {
    try {
      if (editingCard) {
        await updateCard(editingCard.id, data);
        toast.success('Cartão atualizado!');
      } else {
        await addCard(data);
        toast.success('Cartão adicionado!');
      }
      setShowForm(false);
      setEditingCard(null);
    } catch (err) {
      logSanitizedFirebaseError(editingCard ? 'credit_card_update' : 'credit_card_create', err);
      toast.error('Erro ao guardar cartão.');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await removeCard(id);
      toast.success('Cartão removido.');
    } catch {
      toast.error('Erro ao remover cartão.');
    } finally {
      setDeletingId(null);
    }
  };

  const alertIcon = (level: 'safe' | 'warning' | 'critical') => {
    if (level === 'critical') return <ShieldAlert  className="w-4 h-4 text-quantum-red" />;
    if (level === 'warning')  return <AlertTriangle className="w-4 h-4 text-quantum-gold" />;
    return <CheckCircle className="w-4 h-4 text-quantum-accent" />;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-quantum-fg flex items-center gap-3">
            <div className="p-2 bg-quantum-accentDim rounded-xl border border-quantum-accent/20">
              <CreditCard className="w-5 h-5 text-quantum-accent" />
            </div>
            Cartões de Crédito
          </h2>
          <p className="text-sm text-quantum-fgMuted ml-12 mt-0.5">Monitorização de limites e faturas em tempo real</p>
        </div>
        <button
          onClick={() => { setEditingCard(null); setShowForm(true); }}
          className="btn-quantum-primary flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Novo Cartão</span>
        </button>
      </div>

      <AnimatePresence>
        {(showForm || editingCard) && (
          <motion.div
            key="card-form"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="glass-card-quantum p-5 border border-quantum-accent/20"
          >
            <h3 className="text-sm font-bold text-quantum-fg mb-4">
              {editingCard ? 'Editar Cartão' : 'Adicionar Novo Cartão'}
            </h3>
            <CardForm
              initial={editingCard}
              onSave={data => void handleSave(data)}
              onCancel={() => { setShowForm(false); setEditingCard(null); }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-quantum-fgMuted">
          <div className="w-6 h-6 border-2 border-quantum-accent/30 border-t-quantum-accent rounded-full animate-spin" />
        </div>
      ) : cards.length === 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center py-16 gap-4 text-center">
          <div className="p-5 bg-quantum-card rounded-3xl border border-quantum-border">
            <CreditCard className="w-10 h-10 text-quantum-fgMuted" />
          </div>
          <p className="text-sm text-quantum-fgMuted">Sem cartões registados. Adicione o primeiro cartão.</p>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          <AnimatePresence>
            {cards.map((card, i) => (
              <motion.div
                key={card.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ delay: i * 0.07 }}
                className="space-y-3"
              >
                <CardVisual card={card} />

                <div className="glass-card-quantum p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {alertIcon(card.metrics.alertLevel)}
                      <span className="text-xs font-bold text-quantum-fg">
                        {card.metrics.alertLevel === 'critical' ? 'Limite Crítico'
                          : card.metrics.alertLevel === 'warning' ? 'Atenção'
                          : 'Margem Segura'}
                      </span>
                    </div>
                    <span className="text-xs text-quantum-fgMuted">Vence em {card.metrics.daysUntilDue}d</span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-quantum-bgSecondary rounded-xl p-2.5">
                      <p className="text-[9px] text-quantum-fgMuted uppercase tracking-wider mb-1">Fatura</p>
                      <p className="text-xs font-bold text-quantum-red font-mono">{formatCurrency(fromCentavos(card.metrics.faturaCents))}</p>
                    </div>
                    <div className="bg-quantum-bgSecondary rounded-xl p-2.5">
                      <p className="text-[9px] text-quantum-fgMuted uppercase tracking-wider mb-1">Livre</p>
                      <p className="text-xs font-bold text-quantum-accent font-mono">{formatCurrency(fromCentavos(card.metrics.effectiveAvailableCents))}</p>
                    </div>
                    <div className="bg-quantum-bgSecondary rounded-xl p-2.5">
                      <p className="text-[9px] text-quantum-fgMuted uppercase tracking-wider mb-1">Fecho</p>
                      <p className="text-xs font-bold text-quantum-fg">Dia {card.closingDay}</p>
                    </div>
                  </div>

                  {card.metrics.futureInvoices.length > 0 && (
                    <div className="bg-quantum-bgSecondary/60 rounded-xl p-2.5 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] text-quantum-fgMuted uppercase tracking-wider">Comprometido futuro</span>
                        <span className="text-xs font-bold text-quantum-gold font-mono">{formatCurrency(fromCentavos(card.metrics.committedFutureCents))}</span>
                      </div>
                      <div className="space-y-1">
                        {card.metrics.futureInvoices.slice(0, 6).map(inv => (
                          <div key={inv.competencia} className="flex items-center justify-between text-[11px]">
                            <span className="text-quantum-fgMuted">{formatCompetencia(inv.competencia)}</span>
                            <span className="text-quantum-fg font-mono">{formatCurrency(fromCentavos(inv.netCents))}</span>
                          </div>
                        ))}
                        {card.metrics.futureInvoices.length > 6 && (
                          <p className="text-[10px] text-quantum-fgMuted text-center pt-0.5">+{card.metrics.futureInvoices.length - 6} meses</p>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2">
                    {card.metrics.faturaCents > 0 && (
                      <button
                        onClick={() => setPayingCard(card)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-blue-500/10 border border-blue-500/20 rounded-xl text-xs text-blue-400 hover:text-blue-300 hover:border-blue-400/40 transition-all"
                      >
                        <Banknote className="w-3.5 h-3.5" /> Pagar fatura
                      </button>
                    )}
                    <button
                      onClick={() => { setEditingCard(card); setShowForm(false); }}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-quantum-bgSecondary border border-quantum-border rounded-xl text-xs text-quantum-fgMuted hover:text-quantum-fg hover:border-quantum-accent/30 transition-all"
                    >
                      <Edit2 className="w-3.5 h-3.5" /> Editar
                    </button>

                    {deletingId === card.id ? (
                      <div className="flex gap-1.5 flex-1">
                        <button onClick={() => setDeletingId(null)} className="flex-1 py-2 bg-quantum-bgSecondary border border-quantum-border rounded-xl text-xs text-quantum-fgMuted hover:text-quantum-fg transition-all">Não</button>
                        <button onClick={() => void handleDelete(card.id)} className="flex-1 py-2 bg-quantum-redDim border border-quantum-red/30 rounded-xl text-xs text-quantum-red font-bold hover:bg-quantum-red/20 transition-all">Confirmar</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeletingId(card.id)}
                        className="p-2 bg-quantum-bgSecondary border border-quantum-border rounded-xl text-quantum-fgMuted hover:text-quantum-red hover:border-quantum-red/30 transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      <AnimatePresence>
        {payingCard && (
          <PayInvoiceModal
            key="pay-invoice-modal"
            card={payingCard}
            accounts={accounts}
            onClose={() => setPayingCard(null)}
            onPay={payInvoice}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
