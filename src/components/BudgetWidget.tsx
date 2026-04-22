import { useState, useMemo, type FormEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Target, Plus, Trash2, X, TrendingUp,
  ChevronDown, ChevronUp,
  CheckCircle2, AlertTriangle, AlertCircle,
  type LucideIcon,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useBudgets, currentMonthStr } from '../hooks/useBudgets';
import { ALLOWED_CATEGORIES } from '../shared/schemas/financialSchemas';
import { formatCurrency } from '../utils/formatters';
import type { Transaction } from '../shared/types/transaction';
import type { BudgetInsight } from '../hooks/useBudgets';

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
  onAdd:    (data: Omit<BudgetInsight, 'id' | 'createdAt' | 'spent' | 'remaining' | 'progress' | 'projectedSpend' | 'status'>) => Promise<void>;
  onClose:  () => void;
}

function AddForm({ onAdd, onClose }: AddFormProps) {
  const [category, setCategory] = useState('');
  const [amount,   setAmount]   = useState('');
  const [month,    setMonth]    = useState(currentMonthStr());
  const [busy,     setBusy]     = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const num = parseFloat(amount.replace(',', '.'));
    if (!category)           { toast.error('Selecione uma categoria.');              return; }
    if (isNaN(num) || num <= 0) { toast.error('Insira um valor válido maior que zero.'); return; }

    setBusy(true);
    try {
      await onAdd({ category, targetAmount: num, month, period: 'monthly' });
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
              type="number"
              step="0.01"
              min="0.01"
              placeholder="500.00"
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

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  uid:          string;
  transactions: Transaction[];
}

export default function BudgetWidget({ uid, transactions }: Props) {
  const [showAdd,   setShowAdd]   = useState(false);
  const [filterMon, setFilterMon] = useState<string>('all');
  const [collapsed, setCollapsed] = useState(false);

  const { insights, loading, addBudget, removeBudget } = useBudgets(uid, transactions);

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

        <button
          onClick={handleToggleAdd}
          className="btn-quantum-primary flex items-center gap-1.5 text-xs px-3 py-2"
        >
          {showAdd ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
          {showAdd ? 'Cancelar' : 'Novo'}
        </button>
      </div>

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
