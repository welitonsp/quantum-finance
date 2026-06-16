import { useState, useMemo, useCallback } from 'react';
import { Loader2, PlusCircle, Trash2, CheckCircle2, TrendingDown, AlertCircle, CreditCard } from 'lucide-react';
import { LoadingPage } from '../../shared/components/ui';
import toast from 'react-hot-toast';

import {
  useDebts,
  calcMonthlyPaymentCents,
  daysUntilDue,
  type Debt,
  type DebtCategory,
  type DebtCreateDTO,
} from '../../hooks/useDebts';
import { formatBRL, toCentavos } from '../../shared/types/money';
import type { Centavos } from '../../shared/types/money';
import { logSanitizedFirebaseError } from '../../shared/lib/firebaseErrorHandling';

// ─── Props ────────────────────────────────────────────────────────────────────
interface Props {
  uid: string;
}

// ─── Category labels ──────────────────────────────────────────────────────────
const CATEGORY_LABELS: Record<DebtCategory, string> = {
  emprestimo:      'Empréstimo',
  financiamento:   'Financiamento',
  cartao:          'Cartão de Crédito',
  cheque_especial: 'Cheque Especial',
  outro:           'Outro',
};

const CATEGORY_OPTIONS: DebtCategory[] = [
  'emprestimo', 'financiamento', 'cartao', 'cheque_especial', 'outro',
];

// ─── Color helpers ────────────────────────────────────────────────────────────
function debtStatusColor(debt: Debt): 'red' | 'green' | 'yellow' {
  if (debt.paidInstallments >= debt.installments) return 'green';
  const days = daysUntilDue(debt.dueDayOfMonth);
  if (days <= 5) return 'red';
  return 'yellow';
}

const STATUS_CLASSES: Record<'red' | 'green' | 'yellow', string> = {
  red:    'border-red-500/40 bg-red-500/5',
  green:  'border-green-500/40 bg-green-500/5',
  yellow: 'border-yellow-500/40 bg-yellow-500/5',
};

const BADGE_CLASSES: Record<'red' | 'green' | 'yellow', string> = {
  red:    'text-red-400 bg-red-500/10',
  green:  'text-green-400 bg-green-500/10',
  yellow: 'text-yellow-400 bg-yellow-500/10',
};

// ─── AddDebtModal ─────────────────────────────────────────────────────────────
interface AddDebtModalProps {
  onClose: () => void;
  onSave:  (data: DebtCreateDTO) => Promise<void>;
}

const EMPTY_FORM = {
  name:             '',
  creditor:         '',
  totalCents:       '',   // user types BRL value; we convert
  interestRate:     '',   // percent, e.g. "1.85"
  installments:     '',
  dueDayOfMonth:    '',
  startDate:        new Date().toISOString().slice(0, 10),
  category:         'emprestimo' as DebtCategory,
};

function AddDebtModal({ onClose, onSave }: AddDebtModalProps) {
  const [form,     setForm]     = useState(EMPTY_FORM);
  const [saving,   setSaving]   = useState(false);
  const [errors,   setErrors]   = useState<Record<string, string>>({});

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!form.name.trim())          errs['name']          = 'Nome obrigatório';
    if (!form.creditor.trim())      errs['creditor']      = 'Credor obrigatório';
    try {
      const cents = toCentavos(form.totalCents);
      if (cents <= 0) errs['totalCents'] = 'Valor deve ser positivo';
    } catch {
      errs['totalCents'] = 'Valor inválido';
    }
    const rate = Number(form.interestRate.replace(',', '.'));
    if (isNaN(rate) || rate < 0)    errs['interestRate']  = 'Taxa inválida';
    const inst = parseInt(form.installments);
    if (!inst || inst <= 0)         errs['installments']  = 'Número de parcelas inválido';
    const day = parseInt(form.dueDayOfMonth);
    if (!day || day < 1 || day > 31) errs['dueDayOfMonth'] = 'Dia inválido (1-31)';
    if (!form.startDate)            errs['startDate']     = 'Data de início obrigatória';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      const totalCents = toCentavos(form.totalCents);

      await onSave({
        name:             form.name.trim(),
        creditor:         form.creditor.trim(),
        totalCents,
        remainingCents:   totalCents,   // starts as full amount
        interestRate:     Number(form.interestRate.replace(',', '.')) / 100, // percent → rate
        installments:     parseInt(form.installments),
        paidInstallments: 0,
        dueDayOfMonth:    parseInt(form.dueDayOfMonth),
        startDate:        form.startDate,
        category:         form.category,
        active:           true,
      });
      toast.success('Dívida adicionada com sucesso.');
      onClose();
    } catch (err) {
      logSanitizedFirebaseError('debt_add', err);
      toast.error('Erro ao salvar dívida. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  const field = (id: string, label: string, placeholder: string, type = 'text') => (
    <div>
      <label htmlFor={id} className="block text-xs font-bold text-quantum-fgMuted mb-1 uppercase tracking-wide">{label}</label>
      <input
        id={id}
        type={type}
        placeholder={placeholder}
        value={form[id as keyof typeof form] as string}
        onChange={e => setForm(f => ({ ...f, [id]: e.target.value }))}
        className="w-full bg-quantum-bg border border-quantum-border rounded-xl px-3 py-2 text-sm text-quantum-fg placeholder-quantum-fgMuted focus:outline-none focus:border-cyan-500/50"
      />
      {errors[id] && <p className="text-xs text-red-400 mt-1">{errors[id]}</p>}
    </div>
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Adicionar dívida"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-quantum-bg/80 backdrop-blur-sm p-4 animate-in fade-in duration-200"
    >
      <div className="bg-quantum-card w-full max-w-lg rounded-3xl p-6 shadow-2xl border border-quantum-border overflow-y-auto max-h-[90vh]">
        <h2 className="text-lg font-bold text-quantum-fg mb-5">Nova Dívida</h2>
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          {field('name',          'Nome da dívida',      'Ex: Empréstimo pessoal Caixa')}
          {field('creditor',      'Credor',              'Ex: Banco Caixa')}
          {field('totalCents',    'Valor total (R$)',     '0,00')}
          {field('interestRate',  'Taxa de juros a.m. (%)', '1.85')}
          {field('installments',  'Nº de parcelas',      '12', 'number')}
          {field('dueDayOfMonth', 'Dia do vencimento',   '10', 'number')}
          {field('startDate',     'Data de início',      '', 'date')}

          <div>
            <label htmlFor="category" className="block text-xs font-bold text-quantum-fgMuted mb-1 uppercase tracking-wide">Categoria</label>
            <select
              id="category"
              value={form.category}
              onChange={e => setForm(f => ({ ...f, category: e.target.value as DebtCategory }))}
              className="w-full bg-quantum-bg border border-quantum-border rounded-xl px-3 py-2 text-sm text-quantum-fg focus:outline-none focus:border-cyan-500/50"
            >
              {CATEGORY_OPTIONS.map(c => (
                <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl font-bold text-quantum-fgMuted hover:text-quantum-fg hover:bg-white/5 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 rounded-xl font-bold bg-cyan-600 hover:bg-cyan-500 text-quantum-fg transition-colors shadow-lg shadow-cyan-500/20 disabled:opacity-50 flex items-center gap-2"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Salvar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── SummaryCard ──────────────────────────────────────────────────────────────
function SummaryCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-quantum-card border border-quantum-border rounded-2xl p-5 flex flex-col gap-1">
      <p className="text-xs font-bold text-quantum-fgMuted uppercase tracking-widest">{label}</p>
      <p className="text-2xl font-black text-quantum-fg">{value}</p>
      {sub && <p className="text-xs text-quantum-fgMuted">{sub}</p>}
    </div>
  );
}

// ─── DebtRow ──────────────────────────────────────────────────────────────────
interface DebtRowProps {
  debt:         Debt;
  onMarkPaid:   (debt: Debt) => void;
  onDelete:     (id: string) => void;
  isProcessing: boolean;
}

function DebtRow({ debt, onMarkPaid, onDelete, isProcessing }: DebtRowProps) {
  const color     = debtStatusColor(debt);
  const progress  = debt.installments > 0 ? debt.paidInstallments / debt.installments : 0;
  const remaining = debt.installments - debt.paidInstallments;
  const monthlyPaymentCents = calcMonthlyPaymentCents(
    debt.remainingCents,
    debt.interestRate,
    remaining > 0 ? remaining : 1,
  );
  const dueDays   = daysUntilDue(debt.dueDayOfMonth);
  const dueLabel  = dueDays < 0
    ? `Venceu há ${Math.abs(dueDays)} dia(s)`
    : dueDays === 0
      ? 'Vence hoje'
      : `Vence em ${dueDays} dia(s)`;
  const isPaid    = debt.paidInstallments >= debt.installments;

  return (
    <div className={`rounded-2xl border p-4 ${STATUS_CLASSES[color]} transition-all`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <span className="font-bold text-quantum-fg truncate">{debt.name}</span>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${BADGE_CLASSES[color]}`}>
              {CATEGORY_LABELS[debt.category]}
            </span>
            {isPaid && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full text-green-400 bg-green-500/10">
                Quitado
              </span>
            )}
          </div>
          <p className="text-xs text-quantum-fgMuted">{debt.creditor}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!isPaid && (
            <button
              onClick={() => onMarkPaid(debt)}
              disabled={isProcessing}
              title="Registrar pagamento"
              className="p-2 rounded-xl text-cyan-400 hover:bg-cyan-500/10 transition-colors disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={() => onDelete(debt.id)}
            disabled={isProcessing}
            title="Excluir dívida"
            className="p-2 rounded-xl text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-3">
        <div className="flex justify-between text-xs text-quantum-fgMuted mb-1">
          <span>{debt.paidInstallments}/{debt.installments} parcelas pagas</span>
          <span>{Math.round(progress * 100)}%</span>
        </div>
        <div className="h-1.5 bg-quantum-border rounded-full overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-cyan-400 transition-all duration-500"
            style={{ width: `${Math.min(progress * 100, 100)}%` }}
          />
        </div>
      </div>

      {/* Details row */}
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-quantum-fgMuted">
        <span>
          <span className="text-quantum-fg font-bold">{formatBRL(debt.remainingCents)}</span> restante
        </span>
        <span>
          Parcela: <span className="text-quantum-fg font-bold">{formatBRL(monthlyPaymentCents)}</span>
        </span>
        <span>
          Juros: <span className="text-quantum-fg font-bold">{(debt.interestRate * 100).toFixed(2)}% a.m.</span>
        </span>
        <span className={color === 'red' ? 'text-red-400 font-bold' : ''}>
          {dueLabel} (dia {debt.dueDayOfMonth})
        </span>
      </div>
    </div>
  );
}

// ─── DebtModule ───────────────────────────────────────────────────────────────
export default function DebtModule({ uid }: Props) {
  const { debts, loading, addDebt, updateDebt, deleteDebt } = useDebts(uid);
  const [isAddOpen,     setIsAddOpen]     = useState(false);
  const [processingId,  setProcessingId]  = useState<string | null>(null);

  // Only active debts shown by default; totals include all active
  const activeDebts = useMemo(() => debts.filter(d => d.active), [debts]);

  const totalRemainingCents = useMemo<Centavos>(
    () => activeDebts.reduce((sum, d) => (sum + d.remainingCents) as Centavos, 0 as Centavos),
    [activeDebts],
  );

  const totalMonthlyPaymentCents = useMemo<Centavos>(() => {
    return activeDebts.reduce((sum, d) => {
      const remaining = d.installments - d.paidInstallments;
      if (remaining <= 0) return sum;
      const monthly = calcMonthlyPaymentCents(d.remainingCents, d.interestRate, remaining);
      return (sum + monthly) as Centavos;
    }, 0 as Centavos);
  }, [activeDebts]);

  const handleMarkPaid = useCallback(async (debt: Debt) => {
    const remaining = debt.installments - debt.paidInstallments;
    if (remaining <= 0) return;
    setProcessingId(debt.id);
    try {
      const newPaid      = debt.paidInstallments + 1;
      const installmentCents = calcMonthlyPaymentCents(debt.remainingCents, debt.interestRate, remaining);
      const newRemaining = Math.max(0, debt.remainingCents - installmentCents) as Centavos;
      const isNowPaid    = newPaid >= debt.installments;
      await updateDebt(debt.id, {
        paidInstallments: newPaid,
        remainingCents:   newRemaining,
        active:           !isNowPaid,
      });
      toast.success(isNowPaid ? 'Dívida quitada!' : 'Pagamento registrado.');
    } catch (err) {
      logSanitizedFirebaseError('debt_update', err);
      toast.error('Erro ao registrar pagamento.');
    } finally {
      setProcessingId(null);
    }
  }, [updateDebt]);

  const handleDelete = useCallback(async (id: string) => {
    setProcessingId(id);
    try {
      await deleteDebt(id);
      toast.success('Dívida removida.');
    } catch (err) {
      logSanitizedFirebaseError('debt_delete', err);
      toast.error('Erro ao remover dívida.');
    } finally {
      setProcessingId(null);
    }
  }, [deleteDebt]);

  const handleSave = useCallback(async (data: DebtCreateDTO) => {
    await addDebt(data);
  }, [addDebt]);

  if (loading) return <LoadingPage label="Carregando dívidas..." />;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-red-500/10 rounded-2xl">
            <TrendingDown className="w-6 h-6 text-red-400" />
          </div>
          <div>
            <h1 className="text-xl font-black text-quantum-fg">Controlo de Dívidas</h1>
            <p className="text-xs text-quantum-fgMuted">Gerencie e acompanhe todas as suas dívidas</p>
          </div>
        </div>
        <button
          onClick={() => setIsAddOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-quantum-fg rounded-xl font-bold text-sm transition-colors shadow-lg shadow-cyan-500/20"
        >
          <PlusCircle className="w-4 h-4" />
          Adicionar Dívida
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SummaryCard
          label="Dívida Total Restante"
          value={formatBRL(totalRemainingCents)}
          sub="Soma de dívidas ativas"
        />
        <SummaryCard
          label="Pagamento Mensal Estimado"
          value={formatBRL(totalMonthlyPaymentCents)}
          sub="Baseado em juros compostos"
        />
        <SummaryCard
          label="Dívidas Ativas"
          value={String(activeDebts.length)}
          sub={debts.length > activeDebts.length ? `${debts.length - activeDebts.length} quitada(s)` : 'Todas ativas'}
        />
      </div>

      {/* Debt list */}
      {activeDebts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
          <div className="p-4 bg-quantum-card border border-quantum-border rounded-3xl">
            <CreditCard className="w-10 h-10 text-quantum-fgMuted" />
          </div>
          <p className="font-bold text-quantum-fg">Nenhuma dívida ativa</p>
          <p className="text-sm text-quantum-fgMuted">Adicione uma dívida para começar o controlo.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <AlertCircle className="w-4 h-4 text-quantum-fgMuted" />
            <span className="text-xs text-quantum-fgMuted uppercase tracking-widest font-bold">Dívidas Ativas</span>
          </div>
          {activeDebts.map(debt => (
            <DebtRow
              key={debt.id}
              debt={debt}
              onMarkPaid={handleMarkPaid}
              onDelete={handleDelete}
              isProcessing={processingId === debt.id}
            />
          ))}
        </div>
      )}

      {/* Paid-off debts */}
      {debts.filter(d => !d.active).length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle2 className="w-4 h-4 text-green-400" />
            <span className="text-xs text-quantum-fgMuted uppercase tracking-widest font-bold">Quitadas</span>
          </div>
          {debts.filter(d => !d.active).map(debt => (
            <DebtRow
              key={debt.id}
              debt={debt}
              onMarkPaid={handleMarkPaid}
              onDelete={handleDelete}
              isProcessing={processingId === debt.id}
            />
          ))}
        </div>
      )}

      {isAddOpen && (
        <AddDebtModal onClose={() => setIsAddOpen(false)} onSave={handleSave} />
      )}
    </div>
  );
}
