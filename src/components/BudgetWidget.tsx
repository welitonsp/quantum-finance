import { useState, useMemo, useEffect, useRef, type FormEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Target, Plus, Trash2, X, TrendingUp,
  ChevronDown, ChevronUp,
  CheckCircle2, AlertTriangle, AlertCircle,
  Sparkles, Check,
  type LucideIcon,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useBudgets, currentMonthStr } from '../hooks/useBudgets';
import { ALLOWED_CATEGORIES } from '../shared/schemas/financialSchemas';
import { formatCurrency } from '../utils/formatters';
import type { Transaction } from '../shared/types/transaction';
import type { BudgetInsight, BudgetWriteData } from '../hooks/useBudgets';
import { fromCentavos, toCentavos } from '../shared/types/money';
import { computeBudgetSuggestions, type BudgetSuggestion } from '../utils/budgetSuggestions';

// ─── Status config ────────────────────────────────────────────────────────────

interface StatusCfg {
  bar:    string;
  badge:  string;
  border: string;
  bg:     string;
  icon:   LucideIcon;
  label:  string;
}

const STATUS_CFG: Record<BudgetInsight['status'], StatusCfg> = {
  success: {
    bar:    'from-emerald-500 to-teal-400',
    badge:  'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
    border: 'border-quantum-border',
    bg:     'bg-quantum-card/40',
    icon:   CheckCircle2,
    label:  'No limite',
  },
  warning: {
    bar:    'from-amber-500 to-yellow-400',
    badge:  'text-amber-400 border-amber-500/30 bg-amber-500/10',
    border: 'border-amber-500/25',
    bg:     'bg-amber-950/10',
    icon:   AlertCircle,
    label:  'Atenção',
  },
  danger: {
    bar:    'from-red-600 to-red-400',
    badge:  'text-red-400 border-red-500/30 bg-red-500/10',
    border: 'border-red-500/25',
    bg:     'bg-red-950/10',
    icon:   AlertTriangle,
    label:  'Excedido',
  },
};

// ─── Month options (last 3 + current + next) ──────────────────────────────────

function buildMonthOptions(): { value: string; label: string }[] {
  const now  = new Date();
  const opts: { value: string; label: string }[] = [];
  for (let i = -3; i <= 1; i++) {
    const d     = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const raw   = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    opts.push({ value, label: raw.charAt(0).toUpperCase() + raw.slice(1) });
  }
  return opts;
}

const MONTH_OPTIONS = buildMonthOptions();

// ─── Budget card ──────────────────────────────────────────────────────────────

interface BudgetCardProps {
  insight:  BudgetInsight;
  onRemove: (id: string) => void;
}

function BudgetCard({ insight, onRemove }: BudgetCardProps) {
  const cfg          = STATUS_CFG[insight.status];
  const Icon         = cfg.icon;
  const pctDisplay   = (insight.progress * 100).toFixed(0);
  const isCurrentMon = insight.month === currentMonthStr();
  const showProj     = isCurrentMon && insight.projectedSpend > insight.spent + 0.01;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 280, damping: 24 }}
      className={`relative rounded-2xl border p-4 transition-colors duration-300 ${cfg.border} ${cfg.bg}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black text-quantum-fg truncate">{insight.category}</p>
          <p className="text-[10px] text-quantum-fgMuted font-mono mt-0.5 tracking-wider">{insight.month}</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border inline-flex items-center gap-1 ${cfg.badge}`}>
            <Icon className="w-2.5 h-2.5" />
            {cfg.label}
          </span>
          <button
            onClick={() => onRemove(insight.id)}
            aria-label={`Remover orçamento de ${insight.category}`}
            className="p-1 text-quantum-fgMuted hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Progress bar — visually clamped at 100% regardless of overrun */}
      <div className="h-1.5 w-full rounded-full overflow-hidden bg-quantum-border/50 mb-2.5">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${cfg.bar} transition-all duration-700 ease-out`}
          style={{ width: `${Math.min(insight.progress * 100, 100)}%` }}
        />
      </div>

      {/* Spent / Target */}
      <div className="flex items-baseline justify-between text-[11px] mb-1">
        <span>
          <span className="font-black text-quantum-fg">{formatCurrency(insight.spent)}</span>
          <span className="text-quantum-fgMuted"> / {formatCurrency(insight.targetAmount)}</span>
          <span className="text-quantum-fgMuted ml-1">({pctDisplay}%)</span>
        </span>
        <span className={`font-bold ${insight.remaining >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
          {insight.remaining >= 0
            ? `Restam ${formatCurrency(insight.remaining)}`
            : `+${formatCurrency(Math.abs(insight.remaining))}`}
        </span>
      </div>

      {/* Projection — current month only, when projection > actual */}
      {showProj && (
        <div className="flex items-center gap-1 text-[10px] text-quantum-fgMuted mt-1.5">
          <TrendingUp className="w-3 h-3 shrink-0" />
          <span>
            Projeção fim do mês:{' '}
            <span className={`font-bold ${insight.projectedSpend > insight.targetAmount ? 'text-red-400' : 'text-amber-400'}`}>
              {formatCurrency(insight.projectedSpend)}
            </span>
          </span>
        </div>
      )}
    </motion.div>
  );
}

// ─── Add budget form (inline, animated) ──────────────────────────────────────

// Exclude income-only categories from budget targets
const BUDGET_CATEGORIES = ALLOWED_CATEGORIES.filter(
  c => c !== 'Salário' && c !== 'Freelance' && c !== 'Investimento',
);

interface AddFormProps {
  onAdd:    (data: BudgetWriteData) => Promise<void>;
  onClose:  () => void;
}

function AddForm({ onAdd, onClose }: AddFormProps) {
  const [category, setCategory] = useState('');
  const [amount,   setAmount]   = useState('');
  const [month,    setMonth]    = useState(currentMonthStr());
  const [busy,     setBusy]     = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!category)           { toast.error('Selecione uma categoria.');              return; }
    let targetAmount: number;
    try {
      const amountCents = toCentavos(amount);
      if (amountCents <= 0) { toast.error('Insira um valor válido maior que zero.'); return; }
      targetAmount = fromCentavos(amountCents);
    } catch {
      toast.error('Insira um valor monetário válido.');
      return;
    }

    setBusy(true);
    try {
      await onAdd({ category, targetAmount, month, period: 'monthly' });
      toast.success(`Orçamento de ${category} criado!`);
      onClose();
    } catch {
      toast.error('Erro ao criar orçamento. Tente novamente.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.2 }}
      className="overflow-hidden"
    >
      <form
        onSubmit={handleSubmit}
        className="border border-quantum-accent/20 rounded-2xl bg-quantum-accent/5 p-4 space-y-3"
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Category */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-quantum-fgMuted mb-1.5 block">
              Categoria
            </label>
            <select
              value={category}
              onChange={e => setCategory(e.target.value)}
              className="input-quantum text-sm"
              required
            >
              <option value="">— Selecionar —</option>
              {BUDGET_CATEGORIES.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Amount */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-quantum-fgMuted mb-1.5 block">
              Limite (R$)
            </label>
            <input
              type="text"
              inputMode="decimal"
              placeholder="500,00"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className="input-quantum text-sm font-mono"
              required
            />
          </div>

          {/* Month */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-quantum-fgMuted mb-1.5 block">
              Mês
            </label>
            <select
              value={month}
              onChange={e => setMonth(e.target.value)}
              className="input-quantum text-sm"
            >
              {MONTH_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex gap-2 justify-end pt-1">
          <button
            type="button"
            onClick={onClose}
            className="btn-quantum-secondary flex items-center gap-1.5 text-xs px-3 py-2"
          >
            <X className="w-3.5 h-3.5" /> Cancelar
          </button>
          <button
            type="submit"
            disabled={busy}
            className="btn-quantum-primary flex items-center gap-1.5 text-xs px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-3.5 h-3.5" />
            {busy ? 'A guardar…' : 'Criar Orçamento'}
          </button>
        </div>
      </form>
    </motion.div>
  );
}

// ─── Budget AI Suggestions Modal ─────────────────────────────────────────────

interface SuggestModalProps {
  suggestions:    BudgetSuggestion[];
  onApprove:      (selected: BudgetSuggestion[]) => Promise<void>;
  onClose:        () => void;
}

function SuggestModal({ suggestions, onApprove, onClose }: SuggestModalProps) {
  const [selected,   setSelected]   = useState<Set<string>>(() => new Set(suggestions.map(s => s.category)));
  const [adjustMap,  setAdjustMap]  = useState<Record<string, string>>({});
  const [busy,       setBusy]       = useState(false);

  const toggle = (cat: string) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(cat)) { next.delete(cat); } else { next.add(cat); }
    return next;
  });

  const getAmount = (s: BudgetSuggestion): string =>
    adjustMap[s.category] ?? fromCentavos(s.suggestedCents).toFixed(2);

  const handleApprove = async () => {
    const toCreate: BudgetSuggestion[] = [];
    for (const s of suggestions) {
      if (!selected.has(s.category)) continue;
      const raw = adjustMap[s.category];
      let cents: number;
      try {
        cents = raw ? toCentavos(raw) : s.suggestedCents;
        if (cents <= 0) { toast.error(`Valor inválido para ${s.category}.`); return; }
      } catch {
        toast.error(`Valor inválido para ${s.category}.`);
        return;
      }
      toCreate.push({ ...s, suggestedCents: cents });
    }
    if (toCreate.length === 0) { toast.error('Selecione pelo menos uma categoria.'); return; }
    setBusy(true);
    try {
      await onApprove(toCreate);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ type: 'spring', stiffness: 240, damping: 24 }}
        className="bg-white dark:bg-quantum-card w-full max-w-2xl rounded-3xl shadow-2xl border dark:border-quantum-border overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-quantum-border">
          <div className="w-9 h-9 rounded-xl bg-quantum-accent/10 border border-quantum-accent/25 flex items-center justify-center shrink-0">
            <Sparkles className="w-4.5 h-4.5 text-quantum-accent" />
          </div>
          <div className="flex-1">
            <h2 className="text-base font-black text-quantum-fg">Sugestões de Orçamento por IA</h2>
            <p className="text-xs text-quantum-fgMuted">Baseado nos últimos 3 meses. Ajuste os valores antes de confirmar.</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-quantum-fgMuted hover:text-quantum-fg hover:bg-quantum-bgSecondary transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Suggestions list */}
        <div className="p-6 space-y-3 max-h-[60vh] overflow-y-auto">
          {suggestions.length === 0 ? (
            <div className="text-center py-10 text-quantum-fgMuted text-sm">
              Não há dados suficientes nos últimos 3 meses para sugerir orçamentos.
            </div>
          ) : suggestions.map(s => {
            const isSelected = selected.has(s.category);
            return (
              <div
                key={s.category}
                className={`rounded-2xl border p-4 transition-all cursor-pointer ${
                  isSelected
                    ? 'border-quantum-accent/40 bg-quantum-accent/5'
                    : 'border-quantum-border bg-quantum-bgSecondary/30 opacity-60'
                }`}
                onClick={() => toggle(s.category)}
              >
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${
                    isSelected ? 'bg-quantum-accent border-quantum-accent' : 'border-quantum-border'
                  }`}>
                    {isSelected && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <p className="text-sm font-black text-quantum-fg">{s.category}</p>
                      <p className="text-[10px] text-quantum-fgMuted font-mono">
                        Média: R$ {fromCentavos(s.avgCents).toFixed(0)}/mês
                      </p>
                    </div>
                    <p className="text-xs text-quantum-fgMuted mt-0.5">{s.reason}</p>
                  </div>
                  {/* Editable amount */}
                  <div className="shrink-0" onClick={e => e.stopPropagation()}>
                    <label className="text-[9px] font-bold uppercase tracking-wider text-quantum-fgMuted block mb-1">Limite R$</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={getAmount(s)}
                      onChange={e => setAdjustMap(prev => ({ ...prev, [s.category]: e.target.value }))}
                      className="input-quantum text-sm font-mono w-28 text-right"
                      disabled={!isSelected}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center px-6 py-4 border-t border-quantum-border bg-quantum-bgSecondary/30">
          <p className="text-xs text-quantum-fgMuted">
            {selected.size} de {suggestions.length} selecionados
          </p>
          <div className="flex gap-3">
            <button onClick={onClose} className="btn-quantum-secondary text-xs px-4 py-2">
              Cancelar
            </button>
            <button
              onClick={handleApprove}
              disabled={busy || selected.size === 0}
              className="btn-quantum-primary text-xs px-4 py-2 flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Check className="w-3.5 h-3.5" />
              {busy ? 'A criar…' : `Criar ${selected.size} orçamento${selected.size !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  uid:          string;
  transactions: Transaction[];
}

export default function BudgetWidget({ uid, transactions }: Props) {
  const [showAdd,      setShowAdd]      = useState(false);
  const [filterMon,    setFilterMon]    = useState<string>('all');
  const [collapsed,    setCollapsed]    = useState(false);
  const [showSuggest,  setShowSuggest]  = useState(false);

  const { insights, budgets, loading, addBudget, removeBudget } = useBudgets(uid, transactions);

  // ── Budget alerts at 80% and 100% ────────────────────────────────────────
  const alertedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (loading) return;
    for (const insight of insights) {
      if (insight.month !== currentMonthStr()) continue;
      const key80  = `${insight.id}-80`;
      const key100 = `${insight.id}-100`;
      if (insight.progress >= 1.0 && !alertedRef.current.has(key100)) {
        alertedRef.current.add(key100);
        toast.error(`🚨 ${insight.category}: limite de orçamento atingido! (${(insight.progress * 100).toFixed(0)}%)`, { duration: 7000 });
      } else if (insight.progress >= 0.8 && !alertedRef.current.has(key80)) {
        alertedRef.current.add(key80);
        toast(`⚠️ ${insight.category}: 80% do orçamento utilizado.`, { duration: 5000, icon: '⚠️' });
      }
    }
  }, [insights, loading]);

  // ── Budget AI suggestions ────────────────────────────────────────────────
  const existingCategories = useMemo(
    () => new Set(budgets.filter(b => b.month === currentMonthStr()).map(b => b.category)),
    [budgets],
  );

  const suggestions = useMemo(
    () => computeBudgetSuggestions(transactions, existingCategories),
    [transactions, existingCategories],
  );

  const handleApprove = async (selected: import('../utils/budgetSuggestions').BudgetSuggestion[]) => {
    const month = currentMonthStr();
    await Promise.all(
      selected.map(s => addBudget({
        category:     s.category,
        targetAmount: fromCentavos(s.suggestedCents),
        month,
        period:       'monthly',
      })),
    );
    toast.success(`${selected.length} orçamento${selected.length !== 1 ? 's' : ''} criado${selected.length !== 1 ? 's' : ''}!`);
    setShowSuggest(false);
  };

  // Months that have at least one budget — for the filter strip
  const availableMonths = useMemo(() => {
    const set = new Set(insights.map(i => i.month));
    return [...set].sort((a, b) => b.localeCompare(a)); // newest first
  }, [insights]);

  const visibleInsights = useMemo(
    () => filterMon === 'all' ? insights : insights.filter(i => i.month === filterMon),
    [insights, filterMon],
  );

  const dangerCount  = visibleInsights.filter(i => i.status === 'danger').length;
  const warningCount = visibleInsights.filter(i => i.status === 'warning').length;

  const handleRemove = async (id: string) => {
    try {
      await removeBudget(id);
      toast.success('Orçamento removido.');
    } catch {
      toast.error('Erro ao remover orçamento.');
    }
  };

  const handleToggleAdd = () => {
    setShowAdd(s => !s);
    setCollapsed(false);
  };

  return (
    <div className="bg-quantum-card/40 border border-quantum-border backdrop-blur-sm rounded-3xl overflow-hidden">

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-quantum-border">
        <button
          onClick={() => setCollapsed(c => !c)}
          className="flex items-center gap-2.5 group text-left"
        >
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
            dangerCount > 0
              ? 'bg-red-500/10 border border-red-500/30'
              : warningCount > 0
              ? 'bg-amber-500/10 border border-amber-500/30'
              : 'bg-quantum-accent/10 border border-quantum-accent/20'
          }`}>
            <Target className={`w-4 h-4 ${
              dangerCount > 0 ? 'text-red-400' : warningCount > 0 ? 'text-amber-400' : 'text-quantum-accent'
            }`} />
          </div>

          <div>
            <p className="text-sm font-black text-quantum-fg group-hover:text-quantum-accent transition-colors">
              Orçamentos Quânticos
            </p>
            <p className="text-[10px] text-quantum-fgMuted">
              {insights.length === 0
                ? 'Nenhuma categoria monitorizada'
                : `${insights.length} ${insights.length === 1 ? 'categoria' : 'categorias'}`
                  + (dangerCount  > 0 ? ` · ${dangerCount} excedida${dangerCount  > 1 ? 's' : ''}` : '')
                  + (warningCount > 0 ? ` · ${warningCount} em atenção` : '')
              }
            </p>
          </div>

          {collapsed
            ? <ChevronDown className="w-4 h-4 text-quantum-fgMuted ml-1" />
            : <ChevronUp   className="w-4 h-4 text-quantum-fgMuted ml-1" />
          }
        </button>

        <div className="flex items-center gap-2">
          {suggestions.length > 0 && (
            <button
              onClick={() => { setShowSuggest(true); setCollapsed(false); }}
              className="btn-quantum-secondary flex items-center gap-1.5 text-xs px-3 py-2"
              title="Sugerir orçamentos com base nos últimos 3 meses"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sugerir com IA</span>
            </button>
          )}
          <button
            onClick={handleToggleAdd}
            className="btn-quantum-primary flex items-center gap-1.5 text-xs px-3 py-2"
          >
            {showAdd ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            {showAdd ? 'Cancelar' : 'Novo'}
          </button>
        </div>
      </div>

      {/* Suggestions modal */}
      <AnimatePresence>
        {showSuggest && (
          <SuggestModal
            suggestions={suggestions}
            onApprove={handleApprove}
            onClose={() => setShowSuggest(false)}
          />
        )}
      </AnimatePresence>

      {/* ── Collapsible body ────────────────────────────────────────── */}
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden"
          >
            <div className="p-5 space-y-4">

              {/* Add form */}
              <AnimatePresence>
                {showAdd && (
                  <AddForm
                    onAdd={async data => { await addBudget(data); }}
                    onClose={() => setShowAdd(false)}
                  />
                )}
              </AnimatePresence>

              {/* Month filter — only when multiple months present */}
              {availableMonths.length > 1 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-bold text-quantum-fgMuted uppercase tracking-wider">Mês:</span>
                  <button
                    onClick={() => setFilterMon('all')}
                    className={`px-3 py-1 rounded-xl text-[11px] font-bold border transition-all ${
                      filterMon === 'all'
                        ? 'bg-quantum-accent/20 text-quantum-accent border-quantum-accent/40'
                        : 'bg-quantum-card text-quantum-fgMuted border-quantum-border hover:border-quantum-accent/30'
                    }`}
                  >
                    Todos
                  </button>
                  {availableMonths.map(m => (
                    <button
                      key={m}
                      onClick={() => setFilterMon(m)}
                      className={`px-3 py-1 rounded-xl text-[11px] font-bold border transition-all ${
                        filterMon === m
                          ? 'bg-quantum-accent/20 text-quantum-accent border-quantum-accent/40'
                          : 'bg-quantum-card text-quantum-fgMuted border-quantum-border hover:border-quantum-accent/30'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              )}

              {/* Cards grid */}
              {loading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {[0, 1, 2].map(i => (
                    <div key={i} className="h-28 rounded-2xl bg-quantum-bgSecondary animate-pulse" />
                  ))}
                </div>
              ) : visibleInsights.length === 0 ? (
                <div className="py-10 flex flex-col items-center text-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-quantum-bgSecondary border border-quantum-border flex items-center justify-center">
                    <Target className="w-6 h-6 text-quantum-fgMuted" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-quantum-fg">Nenhum orçamento definido</p>
                    <p className="text-xs text-quantum-fgMuted mt-1 max-w-xs leading-relaxed">
                      Crie limites por categoria para monitorizar os seus gastos mês a mês.
                    </p>
                  </div>
                </div>
              ) : (
                <motion.div layout className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <AnimatePresence>
                    {visibleInsights.map(insight => (
                      <BudgetCard
                        key={insight.id}
                        insight={insight}
                        onRemove={handleRemove}
                      />
                    ))}
                  </AnimatePresence>
                </motion.div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
