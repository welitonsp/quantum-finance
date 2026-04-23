// src/features/transactions/TransactionsManager.tsx
// Motor de Gestão de Movimentações — Quantum Finance v2
import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Filter, Trash2, Edit3, ArrowUpRight, ArrowDownRight,
  CheckSquare, Square, MinusSquare, X, SlidersHorizontal,
  TrendingUp, TrendingDown, Minus, Tag, ArrowUpDown,
  Layers, RotateCcw, AlertTriangle, Check, ShieldAlert,
} from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';
import { ALLOWED_CATEGORIES } from '../../shared/schemas/financialSchemas';
import toast from 'react-hot-toast';
import type { Transaction } from '../../shared/types/transaction';
import type { AllowedCategory } from '../../shared/schemas/financialSchemas';
import type { BulkUpdate } from '../../hooks/useTransactions';

// ─── Types ────────────────────────────────────────────────────────────────────
type SortBy = 'date_desc' | 'date_asc' | 'value_desc' | 'value_asc' | 'cat';
type GroupByOption = 'date' | 'category' | 'none';
type BatchAction = 'delete' | 'recategorize' | null;
type FilterType = 'all' | 'entrada' | 'saida';

interface Group {
  key: string;
  label: string;
  items: Transaction[];
}

interface CatStyleEntry {
  bg: string;
  text: string;
  border: string;
}

interface Props {
  transactions?: Transaction[];
  loading: boolean;
  onEdit: (tx: Transaction) => void;
  onDeleteRequest: (tx: Transaction) => void;
  onBatchDelete: (ids: string[]) => Promise<void>;
  onBulkUpdate?: (ids: string[], updates: BulkUpdate) => Promise<void>;
  isBulkUpdating?: boolean;
  undoLastBulkUpdate?: () => Promise<void>;
  isUndoing?: boolean;
  hasUndoSnapshot?: boolean;
  clearBulkSnapshot?: () => void;
}

// ─── Paleta de cores por categoria ───────────────────────────────────────────
const CAT_STYLE: Record<string, CatStyleEntry> = {
  'Alimentação':    { bg: 'bg-amber-500/10',   text: 'text-amber-400',       border: 'border-amber-500/20'   },
  'Transporte':     { bg: 'bg-blue-500/10',     text: 'text-blue-400',        border: 'border-blue-500/20'    },
  'Assinaturas':    { bg: 'bg-cyan-500/10',     text: 'text-cyan-400',        border: 'border-cyan-500/20'    },
  'Saúde':          { bg: 'bg-rose-500/10',     text: 'text-rose-400',        border: 'border-rose-500/20'    },
  'Moradia':        { bg: 'bg-orange-500/10',   text: 'text-orange-400',      border: 'border-orange-500/20'  },
  'Educação':       { bg: 'bg-indigo-500/10',   text: 'text-indigo-400',      border: 'border-indigo-500/20'  },
  'Lazer':          { bg: 'bg-pink-500/10',     text: 'text-pink-400',        border: 'border-pink-500/20'    },
  'Salário':        { bg: 'bg-emerald-500/10',  text: 'text-emerald-400',     border: 'border-emerald-500/20' },
  'Investimento':   { bg: 'bg-teal-500/10',     text: 'text-teal-400',        border: 'border-teal-500/20'    },
  'Freelance':      { bg: 'bg-violet-500/10',   text: 'text-violet-400',      border: 'border-violet-500/20'  },
  'Impostos/Taxas': { bg: 'bg-red-500/10',      text: 'text-red-400',         border: 'border-red-500/20'     },
  'Vestuário':      { bg: 'bg-purple-500/10',   text: 'text-purple-400',      border: 'border-purple-500/20'  },
  'Diversos':       { bg: 'bg-white/5',         text: 'text-quantum-fgMuted', border: 'border-quantum-border'       },
  'Outros':         { bg: 'bg-white/5',         text: 'text-quantum-fgMuted', border: 'border-quantum-border'       },
};
const catStyle = (cat: string): CatStyleEntry => CAT_STYLE[cat] ?? CAT_STYLE['Diversos']!;

// ─── Label amigável para datas ────────────────────────────────────────────────
function getDateLabel(dateStr: string): string {
  if (!dateStr) return 'Sem Data';
  const today = new Date();
  const d = new Date(dateStr + 'T12:00:00');
  const diff = Math.round((today.getTime() - d.getTime()) / 86400000);
  if (diff === 0)  return 'Hoje';
  if (diff === 1)  return 'Ontem';
  if (diff === -1) return 'Amanhã';
  return d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateShort(dateStr: string | undefined): string {
  if (!dateStr) return '—';
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

// ─── Chip de Filtro Ativo ─────────────────────────────────────────────────────
interface FilterChipProps {
  label: string;
  onRemove: () => void;
}
function FilterChip({ label, onRemove }: FilterChipProps) {
  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.85 }}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-quantum-accent/10 border border-quantum-accent/20 text-quantum-accent rounded-lg text-xs font-bold"
    >
      {label}
      <button onClick={onRemove} className="hover:text-quantum-fg transition-colors">
        <X className="w-3 h-3" />
      </button>
    </motion.span>
  );
}

// ─── Cabeçalho de Grupo ───────────────────────────────────────────────────────
interface GroupHeaderProps {
  label: string;
  count: number;
  totalIn: number;
  totalOut: number;
}
function GroupHeader({ label, count, totalIn, totalOut }: GroupHeaderProps) {
  const net = totalIn - totalOut;
  return (
    <div className="flex items-center gap-3 py-2 px-1 select-none">
      <span className="text-xs font-black text-quantum-fg uppercase tracking-wider whitespace-nowrap">{label}</span>
      <div className="flex-1 h-px bg-quantum-border" />
      <span className="text-[10px] text-quantum-fgMuted font-mono">{count} reg.</span>
      {totalIn > 0 && (
        <span className="text-[10px] text-quantum-accent font-mono font-bold">
          +{formatCurrency(totalIn)}
        </span>
      )}
      {totalOut > 0 && (
        <span className="text-[10px] text-quantum-red font-mono font-bold">
          -{formatCurrency(totalOut)}
        </span>
      )}
      <span className={`text-[10px] font-mono font-black ${net >= 0 ? 'text-quantum-accent' : 'text-quantum-red'}`}>
        {net >= 0 ? '+' : ''}{formatCurrency(net)}
      </span>
    </div>
  );
}

// ─── Linha de Transação ───────────────────────────────────────────────────────
interface TransactionRowProps {
  tx: Transaction;
  isSelected: boolean;
  onToggle: (id: string) => void;
  onEdit: (tx: Transaction) => void;
  onDelete: (tx: Transaction) => void;
}
const TransactionRow = React.memo(({ tx, isSelected, onToggle, onEdit, onDelete }: TransactionRowProps) => {
  const isIncome = tx.type === 'receita' || tx.type === 'entrada';
  const cs = catStyle(tx.category ?? 'Diversos');

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.15 }}
      className={`group flex items-center gap-3 p-3 rounded-xl border transition-all duration-150 ${
        isSelected
          ? 'bg-quantum-accent/5 border-quantum-accent/25'
          : 'bg-quantum-bgSecondary/50 border-quantum-border hover:border-quantum-accent/20 hover:bg-quantum-bgSecondary'
      }`}
    >
      <button
        onClick={() => onToggle(tx.id)}
        className="shrink-0 text-quantum-fgMuted hover:text-quantum-accent transition-colors"
      >
        {isSelected
          ? <CheckSquare className="w-4 h-4 text-quantum-accent" />
          : <Square className="w-4 h-4" />}
      </button>

      <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
        isIncome ? 'bg-quantum-accentDim text-quantum-accent' : 'bg-quantum-redDim text-quantum-red'
      }`}>
        {isIncome
          ? <ArrowUpRight className="w-4 h-4" />
          : <ArrowDownRight className="w-4 h-4" />}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-quantum-fg truncate leading-tight">{tx.description}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${cs.bg} ${cs.text} ${cs.border}`}>
            {tx.category ?? 'Diversos'}
          </span>
          <span className="text-[10px] text-quantum-fgMuted font-mono">{formatDateShort(tx.date)}</span>
        </div>
      </div>

      <p className={`font-mono font-black text-sm shrink-0 ${
        isIncome ? 'text-quantum-accent' : 'text-quantum-fg'
      }`}>
        {isIncome ? '+' : '-'}{formatCurrency(Math.abs(Number(tx.value ?? 0)))}
      </p>

      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity shrink-0">
        <button
          onClick={() => onEdit(tx)}
          className="p-1.5 text-quantum-fgMuted hover:text-quantum-accent hover:bg-quantum-accentDim rounded-lg transition-all"
          title="Editar (E)"
        >
          <Edit3 className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => onDelete(tx)}
          className="p-1.5 text-quantum-fgMuted hover:text-quantum-red hover:bg-quantum-redDim rounded-lg transition-all"
          title="Apagar (Del)"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </motion.div>
  );
});
TransactionRow.displayName = 'TransactionRow';

// ─── Componente Principal ─────────────────────────────────────────────────────
export default function TransactionsManager({
  transactions = [],
  loading,
  onEdit,
  onDeleteRequest,
  onBatchDelete,
  onBulkUpdate,
  isBulkUpdating = false,
  undoLastBulkUpdate,
  isUndoing = false,
  clearBulkSnapshot,
}: Props) {
  const [search,        setSearch]        = useState('');
  const [filterType,    setFilterType]    = useState<FilterType>('all');
  const [filterCat,     setFilterCat]     = useState('');
  const [sortBy,        setSortBy]        = useState<SortBy>('date_desc');
  const [groupBy,       setGroupBy]       = useState<GroupByOption>('date');
  const [filtersOpen,   setFiltersOpen]   = useState(false);

  const [selected,      setSelected]      = useState<Set<string>>(new Set());
  const [batchAction,   setBatchAction]   = useState<BatchAction>(null);
  const [newCat,        setNewCat]        = useState<AllowedCategory>(ALLOWED_CATEGORIES[0]);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const searchRef    = useRef<HTMLInputElement>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Limpa timer de undo ao desmontar (evita clearBulkSnapshot em componente morto)
  useEffect(() => () => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.altKey && e.key?.toLowerCase() === 'f') {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === 'Escape') { setBatchAction(null); setConfirmDelete(false); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const filtered = useMemo(() => {
    let list = transactions;

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(tx =>
        (tx.description ?? '').toLowerCase().includes(q) ||
        (tx.category    ?? '').toLowerCase().includes(q)
      );
    }
    if (filterType !== 'all') {
      list = list.filter(tx =>
        filterType === 'entrada'
          ? (tx.type === 'entrada' || tx.type === 'receita')
          : (tx.type === 'saida'   || tx.type === 'despesa')
      );
    }
    if (filterCat) {
      list = list.filter(tx => tx.category === filterCat);
    }

    return [...list].sort((a, b) => {
      if (sortBy === 'date_desc')  return (b.date ?? '').localeCompare(a.date ?? '');
      if (sortBy === 'date_asc')   return (a.date ?? '').localeCompare(b.date ?? '');
      if (sortBy === 'value_desc') return Math.abs(Number(b.value)) - Math.abs(Number(a.value));
      if (sortBy === 'value_asc')  return Math.abs(Number(a.value)) - Math.abs(Number(b.value));
      if (sortBy === 'cat')        return (a.category ?? '').localeCompare(b.category ?? '');
      return 0;
    });
  }, [transactions, search, filterType, filterCat, sortBy]);

  const groups = useMemo<Group[]>(() => {
    if (groupBy === 'none') return [{ key: '', label: '', items: filtered }];

    const map = new Map<string, Transaction[]>();
    filtered.forEach(tx => {
      const key = groupBy === 'date'
        ? (tx.date ?? 'sem-data')
        : (tx.category ?? 'Outros');
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(tx);
    });

    let keys = [...map.keys()];
    if (groupBy === 'date')     keys.sort((a, b) => b.localeCompare(a));
    if (groupBy === 'category') keys.sort();

    return keys.map(k => ({
      key:   k,
      label: groupBy === 'date' ? getDateLabel(k) : k,
      items: map.get(k)!,
    }));
  }, [filtered, groupBy]);

  const stats = useMemo(() => {
    let totalIn = 0, totalOut = 0;
    filtered.forEach(tx => {
      const v = Math.abs(Number(tx.value ?? 0));
      if (tx.type === 'entrada' || tx.type === 'receita') totalIn  += v;
      else                                                totalOut += v;
    });
    return { count: filtered.length, totalIn, totalOut, net: totalIn - totalOut };
  }, [filtered]);

  const catCounts = useMemo(() => {
    const map: Record<string, number> = {};
    transactions.forEach(tx => {
      const c = tx.category ?? 'Outros';
      map[c] = (map[c] ?? 0) + 1;
    });
    return map;
  }, [transactions]);

  const toggleOne = useCallback((id: string) => setSelected(s => {
    const n = new Set(s);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  }), []);

  const selectAll     = useCallback(() => setSelected(new Set(filtered.map(t => t.id))), [filtered]);
  const clearSelected = useCallback(() => { setSelected(new Set()); setBatchAction(null); setConfirmDelete(false); }, []);

  const selectByType = useCallback((type: 'entrada' | 'saida') => {
    setSelected(new Set(
      filtered.filter(tx =>
        type === 'entrada'
          ? (tx.type === 'entrada' || tx.type === 'receita')
          : (tx.type === 'saida'   || tx.type === 'despesa')
      ).map(t => t.id)
    ));
  }, [filtered]);

  const selectByCategory = useCallback((cat: string) => {
    setSelected(new Set(filtered.filter(tx => tx.category === cat).map(t => t.id)));
  }, [filtered]);

  const selectAllTransactions = useCallback(() => {
    setSelected(new Set(transactions.map(t => t.id)));
  }, [transactions]);

  const allFilteredSelected     = filtered.length > 0 && filtered.every(t => selected.has(t.id));
  const allTransactionsSelected = transactions.length > 0 && transactions.every(t => selected.has(t.id));
  const someSelected            = selected.size > 0 && !allFilteredSelected;

  const handleBatchDelete = useCallback(async () => {
    const ids = Array.from(selected);
    if (!ids.length) return;
    try {
      await onBatchDelete(ids);
      clearSelected();
      setConfirmDelete(false);
    } catch {
      toast.error('Falha ao apagar em lote.');
    }
  }, [selected, onBatchDelete, clearSelected]);

  const handleBatchRecategorize = useCallback(async () => {
    const ids = Array.from(selected);
    if (!ids.length || !newCat || !onBulkUpdate) return;
    const loadingId = toast.loading(`A re-categorizar ${ids.length} transações...`);
    try {
      await onBulkUpdate(ids, { category: newCat });
      toast.dismiss(loadingId);

      // Limpa timer anterior se houver (nova operação sobrepõe a anterior)
      if (undoTimerRef.current) {
        clearTimeout(undoTimerRef.current);
        undoTimerRef.current = null;
      }

      // Toast customizado com botão DESFAZER (10 s)
      const capturedCount = ids.length;
      const capturedCat   = newCat;
      toast(
        (t) => (
          <div className="flex items-center gap-3 min-w-0">
            <Check className="w-4 h-4 text-quantum-accent shrink-0" />
            <span className="text-sm text-quantum-fg flex-1 min-w-0 truncate">
              <strong>{capturedCount}</strong> transações → <strong>{capturedCat}</strong>
            </span>
            {undoLastBulkUpdate && (
              <button
                onClick={() => {
                  toast.dismiss(t.id);
                  if (undoTimerRef.current) {
                    clearTimeout(undoTimerRef.current);
                    undoTimerRef.current = null;
                  }
                  const undoId = toast.loading('A desfazer alterações...');
                  undoLastBulkUpdate()
                    .then(() => toast.success('Alterações desfeitas.', { id: undoId }))
                    .catch(() => toast.error('Falha ao desfazer. Verifique manualmente.', { id: undoId }));
                }}
                className="shrink-0 px-2.5 py-1 bg-quantum-accent/15 border border-quantum-accent/30 text-quantum-accent rounded-lg text-xs font-black hover:bg-quantum-accent/25 transition-colors"
              >
                DESFAZER
              </button>
            )}
          </div>
        ),
        { duration: 10_000 }
      );

      // Após 10 s o toast expira → descarta snapshot (undo já não é possível)
      undoTimerRef.current = setTimeout(() => {
        clearBulkSnapshot?.();
        undoTimerRef.current = null;
      }, 10_000);

      clearSelected();
      setBatchAction(null);
    } catch {
      toast.error('Falha ao re-categorizar. Tente novamente.', { id: loadingId });
    }
  }, [selected, newCat, onBulkUpdate, undoLastBulkUpdate, clearBulkSnapshot, clearSelected]);

  interface ActiveFilter { label: string; clear: () => void }
  const activeFilters = (
    [
      filterType !== 'all' ? { label: filterType === 'entrada' ? '↑ Entradas' : '↓ Saídas', clear: () => setFilterType('all') } : null,
      filterCat            ? { label: filterCat, clear: () => setFilterCat('') }                                                 : null,
      search.trim()        ? { label: `"${search.trim()}"`, clear: () => setSearch('') }                                        : null,
    ] as (ActiveFilter | null)[]
  ).filter((f): f is ActiveFilter => f !== null);

  const clearAllFilters = () => { setSearch(''); setFilterType('all'); setFilterCat(''); };

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-20 gap-3 text-quantum-fgMuted">
      <div className="w-8 h-8 border-2 border-quantum-accent/30 border-t-quantum-accent rounded-full animate-spin" />
      <span className="text-xs uppercase tracking-widest animate-pulse">A Sincronizar Matriz...</span>
    </div>
  );

  const TYPE_TABS: { v: FilterType; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { v: 'all',    label: 'Todos',    icon: Minus },
    { v: 'entrada', label: 'Entradas', icon: TrendingUp },
    { v: 'saida',   label: 'Saídas',   icon: TrendingDown },
  ];

  return (
    <div className="flex flex-col h-full select-none">

      {/* ═══ BARRA DE FILTROS ═══════════════════════════════════════════════ */}
      <div className="p-4 border-b border-quantum-border bg-quantum-bg/40 space-y-3">
        <div className="flex gap-2 items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-quantum-fgMuted" />
            <input
              ref={searchRef}
              type="text"
              placeholder="Pesquisar por descrição ou categoria... (Alt+F)"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="input-quantum pl-10 pr-8 py-2.5 text-sm"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-quantum-fgMuted hover:text-quantum-fg transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex bg-quantum-bgSecondary border border-quantum-border rounded-xl p-1 gap-1 shrink-0">
            {TYPE_TABS.map(({ v, label, icon: Icon }) => (
              <button
                key={v}
                onClick={() => setFilterType(v)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  filterType === v
                    ? v === 'entrada' ? 'bg-quantum-accentDim text-quantum-accent border border-quantum-accent/20'
                    : v === 'saida'   ? 'bg-quantum-redDim   text-quantum-red    border border-quantum-red/20'
                    :                   'bg-quantum-cardHover text-quantum-fg          border border-quantum-border'
                    : 'text-quantum-fgMuted hover:text-quantum-fg'
                }`}
              >
                <Icon className="w-3 h-3" />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>

          <button
            onClick={() => setFiltersOpen(o => !o)}
            className={`p-2.5 rounded-xl border transition-all shrink-0 ${
              filtersOpen || filterCat
                ? 'bg-quantum-accentDim border-quantum-accent/30 text-quantum-accent'
                : 'bg-quantum-bgSecondary border-quantum-border text-quantum-fgMuted hover:text-quantum-fg'
            }`}
            title="Filtros avançados"
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>
        </div>

        <AnimatePresence>
          {filtersOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                <div className="relative">
                  <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-quantum-fgMuted" />
                  <select
                    value={filterCat}
                    onChange={e => setFilterCat(e.target.value)}
                    className="input-quantum pl-9 py-2 text-xs appearance-none"
                  >
                    <option value="">Todas as categorias</option>
                    {ALLOWED_CATEGORIES.map(c => (
                      <option key={c} value={c}>{c} ({catCounts[c] ?? 0})</option>
                    ))}
                  </select>
                </div>

                <div className="relative">
                  <ArrowUpDown className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-quantum-fgMuted" />
                  <select
                    value={sortBy}
                    onChange={e => setSortBy(e.target.value as SortBy)}
                    className="input-quantum pl-9 py-2 text-xs appearance-none"
                  >
                    <option value="date_desc">Data (mais recente)</option>
                    <option value="date_asc">Data (mais antiga)</option>
                    <option value="value_desc">Valor (maior → menor)</option>
                    <option value="value_asc">Valor (menor → maior)</option>
                    <option value="cat">Categoria (A-Z)</option>
                  </select>
                </div>

                <div className="relative">
                  <Layers className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-quantum-fgMuted" />
                  <select
                    value={groupBy}
                    onChange={e => setGroupBy(e.target.value as GroupByOption)}
                    className="input-quantum pl-9 py-2 text-xs appearance-none"
                  >
                    <option value="date">Agrupar por Data</option>
                    <option value="category">Agrupar por Categoria</option>
                    <option value="none">Sem Agrupamento</option>
                  </select>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {activeFilters.length > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-wrap items-center gap-2"
            >
              <span className="text-[10px] text-quantum-fgMuted uppercase tracking-wider">Filtros:</span>
              {activeFilters.map((f, i) => (
                <FilterChip key={i} label={f.label} onRemove={f.clear} />
              ))}
              <button onClick={clearAllFilters} className="text-[10px] text-quantum-fgMuted hover:text-quantum-red transition-colors flex items-center gap-1">
                <RotateCcw className="w-3 h-3" /> Limpar tudo
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ═══ STATS BAR ══════════════════════════════════════════════════════ */}
      <div className="flex items-center gap-3 px-4 py-2.5 bg-quantum-bg/20 border-b border-quantum-border text-xs overflow-x-auto custom-scrollbar">
        <button
          onClick={allFilteredSelected ? clearSelected : selectAll}
          title={allFilteredSelected ? 'Desmarcar tudo' : `Marcar todos os ${filtered.length} visíveis`}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border font-bold transition-all shrink-0 ${
            allFilteredSelected
              ? 'bg-quantum-accentDim border-quantum-accent/40 text-quantum-accent'
              : someSelected
              ? 'bg-quantum-bgSecondary border-quantum-accent/20 text-quantum-accent/70'
              : 'bg-quantum-bgSecondary border-quantum-border text-quantum-fgMuted hover:text-quantum-fg hover:border-quantum-accent/20'
          }`}
        >
          {allFilteredSelected
            ? <CheckSquare className="w-3.5 h-3.5" />
            : someSelected
            ? <MinusSquare  className="w-3.5 h-3.5" />
            : <Square       className="w-3.5 h-3.5" />
          }
          <span className="hidden sm:inline">
            {allFilteredSelected ? 'Desmarcar' : 'Marcar Todos'}
          </span>
          <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-black ${
            allFilteredSelected ? 'bg-quantum-accent/20 text-quantum-accent' : 'bg-quantum-border/60 text-quantum-fgMuted'
          }`}>
            {allFilteredSelected ? selected.size : filtered.length}
          </span>
        </button>

        <div className="w-px h-4 bg-quantum-border shrink-0" />
        <span className="text-quantum-fgMuted shrink-0">
          <span className="font-black text-quantum-fg">{stats.count}</span> registos
        </span>
        <div className="w-px h-3 bg-quantum-border shrink-0" />
        <span className="text-quantum-fgMuted shrink-0">
          Entradas: <span className="font-bold text-quantum-accent">{formatCurrency(stats.totalIn)}</span>
        </span>
        <div className="w-px h-3 bg-quantum-border shrink-0" />
        <span className="text-quantum-fgMuted shrink-0">
          Saídas: <span className="font-bold text-quantum-red">{formatCurrency(stats.totalOut)}</span>
        </span>
        <div className="w-px h-3 bg-quantum-border shrink-0" />
        <span className="text-quantum-fgMuted shrink-0">
          Saldo: <span className={`font-black ${stats.net >= 0 ? 'text-quantum-accent' : 'text-quantum-red'}`}>
            {stats.net >= 0 ? '+' : ''}{formatCurrency(stats.net)}
          </span>
        </span>

        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          <span className="text-quantum-fgMuted hidden md:inline">Selecionar:</span>
          <button onClick={() => selectByType('entrada')} className="text-quantum-accent hover:underline font-bold">Entradas</button>
          <span className="text-quantum-border">·</span>
          <button onClick={() => selectByType('saida')}   className="text-quantum-red hover:underline font-bold">Saídas</button>
          {filterCat && (
            <>
              <span className="text-quantum-border">·</span>
              <button onClick={() => selectByCategory(filterCat)} className="text-quantum-gold hover:underline font-bold">{filterCat}</button>
            </>
          )}
        </div>
      </div>

      {/* ═══ BARRA DE AÇÕES EM LOTE ═════════════════════════════════════════ */}
      <AnimatePresence>
        {selected.size > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-b border-quantum-accent/20 bg-quantum-accentDim/50"
          >
            <div className="px-4 py-3 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-2">
                  <CheckSquare className="w-4 h-4 text-quantum-accent" />
                  <span className="text-sm font-black text-quantum-fg">
                    {selected.size} selecionada{selected.size > 1 ? 's' : ''}
                  </span>
                  {allTransactionsSelected && (
                    <span className="text-[10px] px-2 py-0.5 bg-quantum-accent/20 border border-quantum-accent/30 text-quantum-accent rounded-full font-bold">
                      TODOS os {transactions.length}
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap gap-2 ml-2">
                  <button
                    onClick={() => { setBatchAction('delete'); setConfirmDelete(true); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-quantum-redDim border border-quantum-red/30 text-quantum-red rounded-xl text-xs font-bold hover:bg-quantum-red/20 transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Apagar {selected.size}
                  </button>

                  <button
                    onClick={() => setBatchAction(a => a === 'recategorize' ? null : 'recategorize')}
                    disabled={isBulkUpdating || isUndoing}
                    className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-xl text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                      batchAction === 'recategorize'
                        ? 'bg-quantum-goldDim border-quantum-gold/30 text-quantum-gold'
                        : 'bg-quantum-bgSecondary border-quantum-border text-quantum-fgMuted hover:text-quantum-fg hover:border-quantum-accent/30'
                    }`}
                  >
                    <Tag className="w-3.5 h-3.5" /> Re-categorizar
                  </button>

                  <button
                    onClick={clearSelected}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-quantum-bgSecondary border border-quantum-border text-quantum-fgMuted rounded-xl text-xs font-bold hover:text-quantum-fg transition-all"
                  >
                    <X className="w-3.5 h-3.5" /> Limpar
                  </button>
                </div>
              </div>

              <AnimatePresence>
                {allFilteredSelected && !allTransactionsSelected && transactions.length > filtered.length && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="flex flex-wrap items-center gap-3 px-3 py-2.5 bg-quantum-bg/60 border border-quantum-accent/15 rounded-xl">
                      <ShieldAlert className="w-4 h-4 text-quantum-accent shrink-0" />
                      <span className="text-xs text-quantum-fgMuted flex-1">
                        Todos os <strong className="text-quantum-fg">{filtered.length}</strong> lançamentos visíveis estão selecionados.
                      </span>
                      <button
                        onClick={selectAllTransactions}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-quantum-accentDim border border-quantum-accent/30 text-quantum-accent rounded-lg text-xs font-black hover:bg-quantum-accent/20 transition-all shrink-0"
                      >
                        <CheckSquare className="w-3.5 h-3.5" />
                        Selecionar todos os {transactions.length} lançamentos
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <AnimatePresence>
                {batchAction === 'delete' && confirmDelete && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className={`p-3 border rounded-xl space-y-2.5 ${
                      allTransactionsSelected
                        ? 'bg-red-950/40 border-red-500/50'
                        : 'bg-quantum-redDim border-quantum-red/30'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <AlertTriangle className={`w-4 h-4 shrink-0 mt-0.5 ${allTransactionsSelected ? 'text-red-400' : 'text-quantum-red'}`} />
                      <div className="flex-1 min-w-0">
                        {allTransactionsSelected ? (
                          <p className="text-xs text-red-300 font-bold leading-relaxed">
                            ⚠️ Atenção! Vai apagar <strong className="text-red-200">TODOS os {selected.size} lançamentos</strong> da sua conta permanentemente.
                          </p>
                        ) : (
                          <p className="text-xs text-quantum-fg leading-relaxed">
                            Tem a certeza? Vai apagar <strong>{selected.size} movimentações</strong> permanentemente.
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => { setBatchAction(null); setConfirmDelete(false); }}
                        className="px-3 py-1.5 bg-quantum-bgSecondary border border-quantum-border rounded-lg text-xs text-quantum-fgMuted hover:text-quantum-fg font-bold"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={() => void handleBatchDelete()}
                        className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-black transition-colors ${
                          allTransactionsSelected
                            ? 'bg-red-600 hover:bg-red-500 text-white'
                            : 'bg-quantum-red hover:bg-red-600 text-white'
                        }`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        {allTransactionsSelected ? 'Apagar TUDO' : `Confirmar Apagar ${selected.size}`}
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <AnimatePresence>
                {batchAction === 'recategorize' && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="flex flex-wrap items-center gap-3 p-3 bg-quantum-goldDim border border-quantum-gold/30 rounded-xl"
                  >
                    <Tag className="w-4 h-4 text-quantum-gold shrink-0" />
                    <span className="text-xs text-quantum-fg">
                      Mover <strong>{selected.size}</strong> transações para:
                    </span>
                    <select
                      value={newCat}
                      onChange={e => setNewCat(e.target.value as AllowedCategory)}
                      className="input-quantum py-1.5 text-xs flex-1 min-w-[160px]"
                    >
                      {ALLOWED_CATEGORIES.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                    <div className="flex gap-2 shrink-0">
                      <button onClick={() => setBatchAction(null)} className="px-3 py-1.5 bg-quantum-bgSecondary border border-quantum-border rounded-lg text-xs text-quantum-fgMuted font-bold hover:text-quantum-fg">
                        Cancelar
                      </button>
                      <button
                        onClick={() => void handleBatchRecategorize()}
                        disabled={isBulkUpdating || isUndoing || !onBulkUpdate}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-quantum-gold text-quantum-bg rounded-lg text-xs font-black hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {(isBulkUpdating || isUndoing)
                          ? <><span className="w-3.5 h-3.5 border-2 border-quantum-bg/40 border-t-quantum-bg rounded-full animate-spin inline-block" /> A processar...</>
                          : <><Check className="w-3.5 h-3.5" /> Aplicar</>
                        }
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ LISTA DE TRANSAÇÕES ════════════════════════════════════════════ */}
      <div className="flex-1 overflow-y-auto p-3 md:p-4 space-y-1 custom-scrollbar">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
            <div className="p-5 bg-quantum-card rounded-3xl border border-quantum-border">
              <Filter className="w-10 h-10 text-quantum-fgMuted" />
            </div>
            <div>
              <p className="font-bold text-quantum-fg mb-1">Nenhum resultado encontrado</p>
              <p className="text-xs text-quantum-fgMuted">Tente ajustar os filtros ou importar um extrato bancário.</p>
            </div>
            {activeFilters.length > 0 && (
              <button onClick={clearAllFilters} className="btn-quantum-secondary flex items-center gap-2 text-xs">
                <RotateCcw className="w-3.5 h-3.5" /> Limpar filtros
              </button>
            )}
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {groups.map(group => (
              <div key={group.key || 'ungrouped'}>
                {group.key && (() => {
                  const gIn  = group.items.reduce((a, t) => (t.type === 'entrada' || t.type === 'receita') ? a + Math.abs(Number(t.value ?? 0)) : a, 0);
                  const gOut = group.items.reduce((a, t) => (t.type === 'saida'   || t.type === 'despesa') ? a + Math.abs(Number(t.value ?? 0)) : a, 0);
                  return (
                    <GroupHeader
                      label={group.label}
                      count={group.items.length}
                      totalIn={gIn}
                      totalOut={gOut}
                    />
                  );
                })()}
                <div className="space-y-1.5 mb-2">
                  {group.items.map(tx => (
                    <TransactionRow
                      key={tx.id}
                      tx={tx}
                      isSelected={selected.has(tx.id)}
                      onToggle={toggleOne}
                      onEdit={onEdit}
                      onDelete={onDeleteRequest}
                    />
                  ))}
                </div>
              </div>
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
