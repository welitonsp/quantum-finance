// src/features/transactions/TransactionsManager.tsx
// Motor de Gestão de Movimentações — Quantum Finance v2
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Filter, Trash2,
  CheckSquare, Square, MinusSquare, X, SlidersHorizontal,
  TrendingUp, TrendingDown, Minus, Tag, ArrowUpDown,
  Layers, RotateCcw, AlertTriangle, Check, ShieldAlert, History, Download,
  ChevronDown, ArrowRightLeft,
} from 'lucide-react';
import { transactionsToCSV, downloadCSV, generateMonthlyReportCSV } from '../../utils/exportCSV';
import { formatCurrency } from '../../utils/formatters';
import toast from 'react-hot-toast';
import type { Transaction } from '../../shared/types/transaction';
import type { BulkUpdate } from '../../hooks/useTransactions';
import { useCategories } from '../../hooks/useCategories';
import { auth } from '../../shared/api/firebase/auth';
import AuditTimeline from '../../components/AuditTimeline';
import TransactionHistoryDrawer from '../../components/TransactionHistoryDrawer';
import InstallmentGroupDrawer from './components/InstallmentGroupDrawer';
import type { UserCategory } from '../../shared/schemas/categorySchemas';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  getUserFriendlyErrorMessage,
  logSanitizedFirebaseError,
} from '../../shared/lib/firebaseErrorHandling';
// Re-export para compatibilidade com testes que importam deste módulo
export { calculateTransactionTotals } from './transactionGroupUtils';
import { useSubscriptionAlerts } from '../../hooks/useSubscriptionAlerts';
import { FilterChip }     from './components/FilterChip';
import { GroupHeader }    from './components/GroupHeader';
import { TransactionRow } from './components/TransactionRow';
import {
  useTransactionFilters,
  SOURCE_LABELS,
  type SortBy,
  type GroupByOption,
  type FilterType,
  type ReconciliationStatusFilter,
} from './hooks/useTransactionFilters';
import { useTransactionSelection } from './hooks/useTransactionSelection';


interface Props {
  transactions?: Transaction[];
  loading: boolean;
  onEdit: (tx: Transaction) => void;
  onDeleteRequest: (tx: Transaction) => void;
  onBatchDelete: (ids: string[]) => Promise<void>;
  onBulkUpdate?: ((ids: string[], updates: BulkUpdate) => Promise<void>) | undefined;
  isBulkUpdating?: boolean | undefined;
  undoLastBulkUpdate?: (() => Promise<void>) | undefined;
  isUndoing?: boolean | undefined;
  hasUndoSnapshot?: boolean | undefined;
  clearBulkSnapshot?: (() => void) | undefined;
  /** UID do utilizador autenticado. Fallback automático para auth.currentUser. */
  uid?: string;
  categories?: UserCategory[];
  // ── Paginação ────────────────────────────────────────────────────────────
  hasMoreTransactions?: boolean;
  isLoadingMore?: boolean;
  loadedCount?: number;
  loadMoreTransactions?: () => Promise<void>;
  // ── Busca server-side ────────────────────────────────────────────────────
  serverSearchTerm?: string;
  onServerSearch?: (term: string) => void;
  serverCategoryFilter?: string;
  onServerCategoryFilter?: (cat: string) => void;
  // ── Nova transação ───────────────────────────────────────────────────────
  onAddNew?: () => void;
  // ── Recorrentes (para alertas de assinaturas) ────────────────────────────
  recurringTasks?: import('../../shared/types/transaction').RecurringTask[];
}

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
  uid,
  categories: providedCategories,
  hasMoreTransactions = false,
  isLoadingMore = false,
  loadedCount,
  loadMoreTransactions,
  serverSearchTerm = '',
  onServerSearch,
  serverCategoryFilter = '',
  onServerCategoryFilter,
  onAddNew,
  recurringTasks = [],
}: Props) {
  const effectiveUid = uid ?? auth.currentUser?.uid ?? '';
  const { categories: loadedCategories } = useCategories(providedCategories ? '' : effectiveUid);
  const categories = providedCategories ?? loadedCategories;

  // ── Alertas de assinaturas ────────────────────────────────────────────────
  const subscriptionAlerts = useSubscriptionAlerts(recurringTasks, transactions);

  // ── Estado de UI (painéis) ────────────────────────────────────────────────
  const [filtersOpen,   setFiltersOpen]   = useState(false);
  const [auditOpen,     setAuditOpen]     = useState(false);
  const [historyTx,     setHistoryTx]     = useState<Transaction | null>(null);
  const [installmentTx, setInstallmentTx] = useState<Transaction | null>(null);
  const [reportPickerOpen, setReportPickerOpen] = useState(false);
  const [reportYear,  setReportYear]  = useState(() => new Date().getFullYear());
  const [reportMonth, setReportMonth] = useState(() => new Date().getMonth() + 1);

  const searchRef    = useRef<HTMLInputElement>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef      = useRef<HTMLDivElement>(null);

  // ── Busca server-side com debounce ────────────────────────────────────────
  const [localSearch, setLocalSearch] = useState(serverSearchTerm);
  const serverSearchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchChange = useCallback((value: string) => {
    setLocalSearch(value);
    if (!onServerSearch) return;
    if (serverSearchDebounceRef.current) clearTimeout(serverSearchDebounceRef.current);
    serverSearchDebounceRef.current = setTimeout(() => {
      onServerSearch(value);
    }, 400);
  }, [onServerSearch]);

  useEffect(() => {
    return () => {
      if (serverSearchDebounceRef.current) clearTimeout(serverSearchDebounceRef.current);
    };
  }, []);

  const isServerSearchActive = serverSearchTerm.trim().length >= 2;
  const isServerCategoryActive = !isServerSearchActive && serverCategoryFilter.trim().length > 0;

  // ── Filtros e dados derivados (hook extraído) ─────────────────────────────
  const {
    search,    setSearch,
    filterType,  setFilterType,
    filterCat,   setFilterCat,
    sortBy,      setSortBy,
    groupBy,     setGroupBy,
    dateFrom,    setDateFrom,
    dateTo,      setDateTo,
    valueMin,    setValueMin,
    valueMax,    setValueMax,
    filterOrigin,  setFilterOrigin,
    filterReconciliationStatus, setFilterReconciliationStatus,
    categoryOptions,
    filtered,
    groups,
    stats,
    runningBalances,
    virtualRowEntries,
    useVirtualList,
    catCounts,
    shouldShowDateScopeNotice,
    activeFilters,
    clearAllFilters,
  } = useTransactionFilters(transactions, categories);

  // ── Seleção e ações em lote (hook extraído) ───────────────────────────────
  const {
    selected, setSelected,
    batchAction,   setBatchAction,
    newCat,        setNewCat,
    confirmDelete, setConfirmDelete,
    toggleOne, selectAll, clearSelected, cancelBatch,
    selectByType, selectByCategory, selectAllTransactions,
    allFilteredSelected, allTransactionsSelected, someSelected,
  } = useTransactionSelection(transactions, filtered, categoryOptions);

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
      if (e.key === 'Escape' && !auditOpen && historyTx === null) {
        cancelBatch();
      }
      // Shortcut N = nova transação (apenas quando foco não está em campo de texto)
      if (
        e.key === 'n' &&
        !e.altKey && !e.ctrlKey && !e.metaKey &&
        onAddNew &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA' &&
        document.activeElement?.tagName !== 'SELECT' &&
        !(document.activeElement as HTMLElement | null)?.isContentEditable
      ) {
        e.preventDefault();
        onAddNew();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [auditOpen, historyTx, cancelBatch, onAddNew]);

  // Sincroniza newCat com as categorias disponíveis
  useEffect(() => {
    if (categoryOptions.length > 0 && !categoryOptions.includes(newCat)) {
      setNewCat(categoryOptions[0]!);
    }
  }, [categoryOptions, newCat, setNewCat]);

  // Limpa seleção ao mudar filtros — evita batch actions sobre itens obsoletos
  useEffect(() => {
    setSelected(new Set());
    setBatchAction(null);
  }, [search, filterType, filterCat, dateFrom, dateTo, valueMin, valueMax, filterOrigin, filterReconciliationStatus]);

  // eslint-disable-next-line react-hooks/incompatible-library
  const rowVirtualizer = useVirtualizer({
    count: virtualRowEntries.length,
    getScrollElement: () => listRef.current,
    estimateSize: (i) => (virtualRowEntries[i]?.kind === 'header' ? 48 : 80),
    overscan: 10,
  });

  const handleBatchDelete = useCallback(async () => {
    const ids = Array.from(selected);
    if (!ids.length) return;
    try {
      await onBatchDelete(ids);
      clearSelected();
      setConfirmDelete(false);
    } catch (error) {
      logSanitizedFirebaseError('transaction_delete_batch', error);
      toast.error(getUserFriendlyErrorMessage(error, 'transaction_delete_batch'));
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
                    .catch((error: unknown) => {
                      logSanitizedFirebaseError('transaction_bulk_undo', error);
                      toast.error(getUserFriendlyErrorMessage(error, 'transaction_bulk_undo'), { id: undoId });
                    });
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
    } catch (error) {
      logSanitizedFirebaseError('transaction_bulk_update', error);
      toast.error(getUserFriendlyErrorMessage(error, 'transaction_bulk_update'), { id: loadingId });
    }
  }, [selected, newCat, onBulkUpdate, undoLastBulkUpdate, clearBulkSnapshot, clearSelected]);

  if (loading) return (
    <div role="status" aria-label="Carregando movimentações" className="flex flex-col p-4 gap-2">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="animate-pulse flex items-center gap-3 px-4 py-3 border border-quantum-border rounded-xl bg-quantum-bgSecondary/50">
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/4" />
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/6 ml-auto" />
        </div>
      ))}
    </div>
  );

  const TYPE_TABS: { v: FilterType; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { v: 'all',           label: 'Todos',         icon: Minus           },
    { v: 'entrada',       label: 'Entradas',      icon: TrendingUp      },
    { v: 'saida',         label: 'Saídas',        icon: TrendingDown    },
    { v: 'transferencia', label: 'Transferências', icon: ArrowRightLeft  },
  ];

  const QUICK_RECON_FILTERS = [
    { v: 'all',          label: 'Todas', icon: Minus },
    { v: 'reconciled',   label: 'Conciliadas', icon: Check },
    { v: 'unreconciled', label: 'Importadas não conciliadas', icon: AlertTriangle },
  ] as const;

  return (
    <div className="flex flex-col h-full">

      {/* ═══ BARRA DE FILTROS ═══════════════════════════════════════════════ */}
      <div className="p-4 md:p-5 border-b border-quantum-border bg-quantum-bg/40 space-y-4 select-none">
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-quantum-fgMuted" />
            <input
              ref={searchRef}
              type="text"
              aria-label="Pesquisar descrição ou categoria"
              placeholder={onServerSearch ? 'Buscar no servidor... (Alt+F)' : 'Pesquisar descrição ou categoria... (Alt+F)'}
              value={onServerSearch ? localSearch : search}
              onChange={e => onServerSearch ? handleSearchChange(e.target.value) : setSearch(e.target.value)}
              className="input-quantum pl-10 pr-8 py-2.5 text-sm"
            />
            {(onServerSearch ? localSearch : search) && (
              <button
                onClick={() => onServerSearch ? (handleSearchChange(''), onServerSearch('')) : setSearch('')}
                aria-label="Limpar busca"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-quantum-fgMuted hover:text-quantum-fg transition-colors"
              >
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            )}
          </div>

          <div className="flex bg-quantum-bgSecondary border border-quantum-border rounded-xl p-1 gap-1 shrink-0">
            {TYPE_TABS.map(({ v, label, icon: Icon }) => (
              <button
                key={v}
                onClick={() => setFilterType(v)}
                aria-pressed={filterType === v}
                aria-label={label}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  filterType === v
                    ? v === 'entrada'       ? 'bg-quantum-accentDim text-quantum-accent border border-quantum-accent/20'
                    : v === 'saida'         ? 'bg-quantum-redDim   text-quantum-red    border border-quantum-red/20'
                    : v === 'transferencia' ? 'bg-blue-500/15 text-blue-400 border border-blue-500/25'
                    :                         'bg-quantum-cardHover text-quantum-fg border border-quantum-border'
                    : 'text-quantum-fgMuted hover:text-quantum-fg'
                }`}
              >
                <Icon className="w-3 h-3" aria-hidden="true" />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>

          <div className="flex bg-quantum-bgSecondary border border-quantum-border rounded-xl p-1 gap-1 shrink-0">
            {QUICK_RECON_FILTERS.map(({ v, label, icon: Icon }) => (
              <button
                key={v}
                onClick={() => setFilterReconciliationStatus(v)}
                aria-pressed={filterReconciliationStatus === v}
                aria-label={label}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  filterReconciliationStatus === v
                    ? v === 'reconciled'   ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : v === 'unreconciled' ? 'bg-amber-500/10   text-amber-400   border border-amber-500/20'
                    :                        'bg-quantum-cardHover text-quantum-fg       border border-quantum-border'
                    : 'text-quantum-fgMuted hover:text-quantum-fg'
                }`}
                title={label}
              >
                <Icon className="w-3 h-3" aria-hidden="true" />
                <span className="hidden xl:inline">{label}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setFiltersOpen(o => !o)}
              aria-label="Filtros avançados"
              aria-expanded={filtersOpen}
              className={`p-2.5 rounded-xl border transition-all ${
                filtersOpen || filterCat || dateFrom || dateTo || valueMin || valueMax || filterOrigin || filterReconciliationStatus !== 'all'
                  ? 'bg-quantum-accentDim border-quantum-accent/30 text-quantum-accent'
                  : 'bg-quantum-bgSecondary border-quantum-border text-quantum-fgMuted hover:text-quantum-fg'
              }`}
              title="Filtros avançados"
            >
              <SlidersHorizontal className="w-4 h-4" />
            </button>

            <button
              onClick={() => setAuditOpen(true)}
              aria-label="Histórico de ações"
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-quantum-border bg-quantum-bgSecondary text-quantum-fgMuted hover:text-quantum-fg hover:border-quantum-accent/20 transition-all text-xs font-bold"
              title="Histórico de ações"
            >
              <History className="w-4 h-4" />
              <span className="hidden sm:inline">Histórico</span>
            </button>

            <button
              onClick={() => {
                const csv = transactionsToCSV(filtered);
                const date = new Date().toISOString().slice(0, 10);
                downloadCSV(`quantum-finance-transacoes-${date}.csv`, csv);
              }}
              aria-label="Exportar CSV"
              className="flex items-center gap-2 px-3 py-2 bg-quantum-card border border-quantum-border rounded-xl text-xs font-bold text-quantum-fgMuted hover:text-quantum-fg hover:border-quantum-accent/40 transition-all"
              title="Exportar transações filtradas como CSV"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Exportar CSV</span>
            </button>

            <div className="relative">
              <button
                onClick={() => setReportPickerOpen(o => !o)}
                aria-label="Relatório mensal"
                className="flex items-center gap-2 px-3 py-2 bg-quantum-card border border-quantum-border rounded-xl text-xs font-bold text-quantum-fgMuted hover:text-quantum-fg hover:border-quantum-accent/40 transition-all"
                title="Baixar relatório mensal em CSV"
              >
                <Layers className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Relatório Mensal</span>
              </button>

              <AnimatePresence>
                {reportPickerOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 6, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0,  scale: 1 }}
                    exit={{ opacity: 0, y: 4, scale: 0.97 }}
                    className="absolute right-0 top-full mt-2 z-50 bg-[#0d1424] border border-quantum-border rounded-2xl p-4 shadow-2xl min-w-[220px]"
                    onClick={e => e.stopPropagation()}
                  >
                    <p className="text-[10px] font-bold text-quantum-fgMuted uppercase tracking-widest mb-3">Período do Relatório</p>
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <div>
                        <label className="text-[10px] text-quantum-fgMuted">Mês</label>
                        <select
                          value={reportMonth}
                          onChange={e => setReportMonth(Number(e.target.value))}
                          className="input-quantum w-full text-sm mt-1"
                        >
                          {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                            <option key={m} value={m}>
                              {new Date(2000, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long' })}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] text-quantum-fgMuted">Ano</label>
                        <select
                          value={reportYear}
                          onChange={e => setReportYear(Number(e.target.value))}
                          className="input-quantum w-full text-sm mt-1"
                        >
                          {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map(y => (
                            <option key={y} value={y}>{y}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        const pad = (n: number) => String(n).padStart(2, '0');
                        const csv = generateMonthlyReportCSV(transactions, reportYear, reportMonth);
                        downloadCSV(`relatorio-${reportYear}-${pad(reportMonth)}.csv`, csv);
                        setReportPickerOpen(false);
                      }}
                      className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold bg-quantum-accent/15 border border-quantum-accent/30 text-quantum-accent hover:bg-quantum-accent/25 transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Baixar CSV
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        <AnimatePresence>
          {filtersOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="pt-2 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="relative">
                    <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-quantum-fgMuted" />
                    <select
                      value={filterCat}
                      onChange={e => setFilterCat(e.target.value)}
                      aria-label="Filtrar por categoria"
                      className="input-quantum pl-9 py-2 text-xs appearance-none"
                    >
                      <option value="">Todas as categorias</option>
                      {categoryOptions.map(c => (
                        <option key={c} value={c}>{c} ({catCounts[c] ?? 0})</option>
                      ))}
                    </select>
                  </div>

                  {onServerCategoryFilter && (
                    <div className="relative">
                      <span className="pointer-events-none absolute -top-1.5 left-2 z-10 rounded bg-quantum-bgSecondary px-1 text-[9px] font-bold uppercase text-blue-400">
                        Servidor
                      </span>
                      <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-blue-400/70" />
                      <select
                        value={serverCategoryFilter}
                        onChange={e => onServerCategoryFilter(e.target.value)}
                        aria-label="Filtrar por categoria no servidor"
                        className="input-quantum pl-9 py-2 text-xs appearance-none border-blue-500/30 focus:border-blue-500/60"
                      >
                        <option value="">Todas (servidor)</option>
                        {categoryOptions.map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="relative">
                    <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-quantum-fgMuted" />
                    <select
                      value={filterOrigin}
                      onChange={e => setFilterOrigin(e.target.value)}
                      aria-label="Filtrar por origem"
                      className="input-quantum pl-9 py-2 text-xs appearance-none"
                    >
                      <option value="">Todas as origens</option>
                      {Object.entries(SOURCE_LABELS).map(([val, label]) => (
                        <option key={val} value={val}>{label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="relative">
                    <span className="pointer-events-none absolute -top-1.5 left-2 z-10 rounded bg-quantum-bgSecondary px-1 text-[9px] font-bold uppercase text-quantum-fgMuted">
                      Conciliação
                    </span>
                    <CheckSquare className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-quantum-fgMuted" />
                    <select
                      value={filterReconciliationStatus}
                      onChange={e => setFilterReconciliationStatus(e.target.value as ReconciliationStatusFilter)}
                      aria-label="Filtrar por status de conciliação"
                      className="input-quantum pl-9 py-2 text-xs appearance-none"
                    >
                      <option value="all">Todas</option>
                      <option value="reconciled">Conciliadas</option>
                      <option value="unreconciled">Importadas não conciliadas</option>
                    </select>
                  </div>

                  <div className="relative">
                    <ArrowUpDown className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-quantum-fgMuted" />
                    <select
                      value={sortBy}
                      onChange={e => setSortBy(e.target.value as SortBy)}
                      aria-label="Ordenar movimentações"
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
                      aria-label="Agrupar movimentações"
                      className="input-quantum pl-9 py-2 text-xs appearance-none"
                    >
                      <option value="date">Agrupar por Data</option>
                      <option value="category">Agrupar por Categoria</option>
                      <option value="none">Sem Agrupamento</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="filter-date-from" className="block text-[10px] text-quantum-fgMuted uppercase tracking-wider mb-1">
                      Data início
                    </label>
                    <input
                      id="filter-date-from"
                      type="date"
                      value={dateFrom}
                      onChange={e => setDateFrom(e.target.value)}
                      aria-label="Filtrar a partir de"
                      max={dateTo || undefined}
                      className="input-quantum py-2 text-xs w-full"
                    />
                  </div>
                  <div>
                    <label htmlFor="filter-date-to" className="block text-[10px] text-quantum-fgMuted uppercase tracking-wider mb-1">
                      Data fim
                    </label>
                    <input
                      id="filter-date-to"
                      type="date"
                      value={dateTo}
                      onChange={e => setDateTo(e.target.value)}
                      aria-label="Filtrar até"
                      min={dateFrom || undefined}
                      className="input-quantum py-2 text-xs w-full"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="filter-value-min" className="block text-[10px] text-quantum-fgMuted uppercase tracking-wider mb-1">
                      Valor mínimo
                    </label>
                    <input
                      id="filter-value-min"
                      type="text"
                      value={valueMin}
                      onChange={e => setValueMin(e.target.value)}
                      aria-label="Valor mínimo"
                      placeholder="R$ 0,00"
                      className="input-quantum py-2 text-xs w-full"
                    />
                  </div>
                  <div>
                    <label htmlFor="filter-value-max" className="block text-[10px] text-quantum-fgMuted uppercase tracking-wider mb-1">
                      Valor máximo
                    </label>
                    <input
                      id="filter-value-max"
                      type="text"
                      value={valueMax}
                      onChange={e => setValueMax(e.target.value)}
                      aria-label="Valor máximo"
                      placeholder="R$ 0,00"
                      className="input-quantum py-2 text-xs w-full"
                    />
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {shouldShowDateScopeNotice && (
            <motion.div
              role="note"
              aria-live="polite"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="flex items-start gap-1.5 rounded-lg border border-quantum-gold/25 bg-quantum-goldDim/35 px-2.5 py-2"
            >
              <AlertTriangle className="w-3.5 h-3.5 text-quantum-gold shrink-0 mt-0.5" aria-hidden="true" />
              <p className="text-[11px] leading-snug text-quantum-fgMuted">
                Atenção: o filtro de data atua apenas sobre as movimentações carregadas. Para consultar outro mês, altere o mês no topo.
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {activeFilters.length > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-wrap items-center gap-1.5 rounded-lg border border-quantum-border bg-quantum-bgSecondary/50 px-2.5 py-2"
            >
              <span className="text-[10px] text-quantum-fgMuted uppercase tracking-wider">Filtros aplicados:</span>
              {activeFilters.map((f) => (
                <FilterChip key={f.id} label={f.label} onRemove={f.clear} />
              ))}
              <button onClick={clearAllFilters} aria-label="Limpar todos os filtros" className="text-[10px] text-quantum-fgMuted hover:text-quantum-red transition-colors inline-flex items-center gap-1">
                <RotateCcw className="w-3 h-3" aria-hidden="true" /> Limpar tudo
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ═══ SERVER SEARCH BANNER ═══════════════════════════════════════════ */}
      {isServerSearchActive && (
        <div className="flex items-center gap-2 px-4 md:px-5 py-2 bg-quantum-accentDim/30 border-b border-quantum-accent/20 text-xs text-quantum-accent">
          <Search className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Resultados do servidor para <strong>&quot;{serverSearchTerm}&quot;</strong></span>
          <button
            onClick={() => { handleSearchChange(''); onServerSearch?.(''); }}
            aria-label="Limpar busca no servidor"
            className="ml-auto flex items-center gap-1 text-quantum-accent/70 hover:text-quantum-accent transition-colors"
          >
            <X className="w-3 h-3" aria-hidden="true" /> Limpar
          </button>
        </div>
      )}

      {/* ═══ SERVER CATEGORY BANNER ══════════════════════════════════════════ */}
      {isServerCategoryActive && (
        <div className="flex items-center gap-2 px-4 md:px-5 py-2 bg-blue-500/10 border-b border-blue-500/20 text-xs text-blue-400">
          <Tag className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Categoria no servidor: <strong>{serverCategoryFilter}</strong></span>
          <button
            onClick={() => onServerCategoryFilter?.('')}
            aria-label="Limpar filtro de categoria no servidor"
            className="ml-auto flex items-center gap-1 text-blue-400/70 hover:text-blue-400 transition-colors"
          >
            <X className="w-3 h-3" aria-hidden="true" /> Limpar
          </button>
        </div>
      )}

      {/* ═══ STATS BAR ══════════════════════════════════════════════════════ */}
      <div className="flex items-center gap-3 px-4 md:px-5 py-3 bg-quantum-bg/20 border-b border-quantum-border text-xs overflow-x-auto custom-scrollbar">
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
          Resultado filtrado/carregado: <span className="font-black text-quantum-fg">{stats.count}</span> registos
        </span>
        {loadedCount !== undefined && (
          <>
            <div className="w-px h-3 bg-quantum-border shrink-0" />
            <span className="text-quantum-fgMuted shrink-0">
              Carregadas: <span className="font-bold text-quantum-fg">{loadedCount}</span>
            </span>
          </>
        )}
        <div className="w-px h-3 bg-quantum-border shrink-0" />
        <span className="text-quantum-fgMuted shrink-0">
          Entradas: <span className="font-bold text-quantum-accent">{formatCurrency(stats.totalInCents, { cents: true })}</span>
        </span>
        <div className="w-px h-3 bg-quantum-border shrink-0" />
        <span className="text-quantum-fgMuted shrink-0">
          Saídas: <span className="font-bold text-quantum-red">{formatCurrency(stats.totalOutCents, { cents: true })}</span>
        </span>
        <div className="w-px h-3 bg-quantum-border shrink-0" />
        <span className="text-quantum-fgMuted shrink-0">
          Saldo: <span className={`font-black ${stats.netCents >= 0 ? 'text-quantum-accent' : 'text-quantum-red'}`}>
            {stats.netCents >= 0 ? '+' : ''}{formatCurrency(stats.netCents, { cents: true })}
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
            <div className="px-4 py-3 space-y-3 select-none">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-2">
                  <CheckSquare className="w-4 h-4 text-quantum-accent" />
                  <span aria-live="polite" aria-atomic="true" className="text-sm font-black text-quantum-fg">
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
                      onChange={e => setNewCat(e.target.value)}
                      aria-label="Selecionar nova categoria"
                      className="input-quantum py-1.5 text-xs flex-1 min-w-[160px]"
                    >
                      {categoryOptions.map(c => (
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

      {/* ═══ AUDIT TIMELINE DRAWER ═══════════════════════════════════════════ */}
      <AuditTimeline
        uid={effectiveUid}
        open={auditOpen}
        onClose={() => setAuditOpen(false)}
      />

      <TransactionHistoryDrawer
        uid={effectiveUid}
        isOpen={historyTx !== null}
        transaction={historyTx}
        onClose={() => setHistoryTx(null)}
      />

      {installmentTx?.installmentGroupId && (
        <InstallmentGroupDrawer
          uid={effectiveUid}
          groupId={installmentTx.installmentGroupId}
          onClose={() => setInstallmentTx(null)}
          onCanceled={() => setInstallmentTx(null)}
        />
      )}

      {/* ═══ ALERTAS DE ASSINATURAS ═════════════════════════════════════════ */}
      {subscriptionAlerts.length > 0 && (
        <div className="px-4 md:px-5 py-2 border-b border-quantum-border bg-amber-500/5 space-y-1">
          {subscriptionAlerts.slice(0, 3).map(alert => (
            <div key={alert.taskId} className="flex items-center gap-2 text-xs text-amber-400">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              {alert.type === 'price_increase'
                ? `${alert.description}: aumento de ${alert.increasePercent?.toFixed(1)}% detectado`
                : `${alert.description}: sem cobrança há 2+ meses`}
            </div>
          ))}
          {subscriptionAlerts.length > 3 && (
            <p className="text-[10px] text-amber-400/70">+{subscriptionAlerts.length - 3} outros alertas</p>
          )}
        </div>
      )}

      {/* ═══ LISTA DE TRANSAÇÕES ════════════════════════════════════════════ */}
      <div ref={listRef} className="flex-1 overflow-y-auto p-4 md:p-5 space-y-3 custom-scrollbar">
        {filtered.length === 0 ? (
          <div role="status" className="flex flex-col items-center justify-center py-20 gap-4 text-center">
            <div className="p-5 bg-quantum-card rounded-3xl border border-quantum-border">
              <Filter className="w-10 h-10 text-quantum-fgMuted" />
            </div>
            <div>
              <p className="font-bold text-quantum-fg mb-1">
                {activeFilters.length > 0
                  ? 'Nenhuma movimentação encontrada para os filtros atuais.'
                  : 'Nenhum resultado encontrado'}
              </p>
              <p className="text-xs text-quantum-fgMuted">
                {activeFilters.length > 0
                  ? 'Verifique se o mês selecionado corresponde ao período filtrado ou limpe os filtros.'
                  : 'Tente ajustar os filtros ou importar um extrato bancário.'}
              </p>
            </div>
            {activeFilters.length > 0 && (
              <button onClick={clearAllFilters} className="btn-quantum-secondary flex items-center gap-2 text-xs">
                <RotateCcw className="w-3.5 h-3.5" /> Limpar filtros
              </button>
            )}
          </div>
        ) : useVirtualList ? (
          <>
            <div
              aria-label="Lista de movimentações"
              style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }}
            >
              {rowVirtualizer.getVirtualItems().map(virtualItem => {
                const entry = virtualRowEntries[virtualItem.index];
                return (
                  <div
                    key={virtualItem.key}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${virtualItem.start}px)`,
                      paddingBottom: entry?.kind === 'row' ? '6px' : '4px',
                    }}
                  >
                    {entry?.kind === 'header' ? (
                      <GroupHeader
                        label={entry.group.label}
                        count={entry.group.count}
                        totalInCents={entry.group.totalInCents}
                        totalOutCents={entry.group.totalOutCents}
                        netCents={entry.group.netCents}
                      />
                    ) : entry?.kind === 'row' ? (
                      <TransactionRow
                        tx={entry.tx}
                        runningBalanceCents={runningBalances[entry.tx.id]}
                        isSelected={selected.has(entry.tx.id)}
                        onToggle={toggleOne}
                        onEdit={onEdit}
                        onDelete={onDeleteRequest}
                        onHistory={setHistoryTx}
                        onInstallmentClick={setInstallmentTx}
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>

            {/* ═══ CARREGAR MAIS ═══════════════════════════════════════════════ */}
            {(hasMoreTransactions || isLoadingMore) && (
              <div className="flex flex-col items-center gap-1.5 py-5">
                <button
                  onClick={() => void loadMoreTransactions?.()}
                  disabled={isLoadingMore || !loadMoreTransactions}
                  className="flex items-center gap-2 px-4 py-2.5 bg-quantum-bgSecondary border border-quantum-border rounded-xl text-sm font-bold text-quantum-fgMuted hover:text-quantum-fg hover:border-quantum-accent/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoadingMore ? (
                    <>
                      <span className="w-4 h-4 border-2 border-quantum-fgMuted/30 border-t-quantum-fgMuted rounded-full animate-spin" />
                      A carregar mais...
                    </>
                  ) : (
                    <>
                      <ChevronDown className="w-4 h-4" />
                      Carregar mais movimentações
                    </>
                  )}
                </button>
                {loadedCount !== undefined && (
                  <span className="text-[10px] text-quantum-fgMuted font-mono">
                    {loadedCount} movimentações carregadas
                  </span>
                )}
              </div>
            )}
          </>
        ) : (
          <>
            <AnimatePresence mode="popLayout">
              {groups.map(group => (
                <div key={group.key || 'ungrouped'}>
                  {group.key && (
                    <GroupHeader
                      label={group.label}
                      count={group.count}
                      totalInCents={group.totalInCents}
                      totalOutCents={group.totalOutCents}
                      netCents={group.netCents}
                    />
                  )}
                  <div className="space-y-1.5 mb-2">
                    {group.items.map(tx => (
                      <TransactionRow
                        key={tx.id}
                        tx={tx}
                        runningBalanceCents={runningBalances[tx.id]}
                        isSelected={selected.has(tx.id)}
                        onToggle={toggleOne}
                        onEdit={onEdit}
                        onDelete={onDeleteRequest}
                        onHistory={setHistoryTx}
                        onInstallmentClick={setInstallmentTx}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </AnimatePresence>

            {/* ═══ CARREGAR MAIS ═══════════════════════════════════════════════ */}
            {(hasMoreTransactions || isLoadingMore) && (
              <div className="flex flex-col items-center gap-1.5 py-5">
                <button
                  onClick={() => void loadMoreTransactions?.()}
                  disabled={isLoadingMore || !loadMoreTransactions}
                  className="flex items-center gap-2 px-4 py-2.5 bg-quantum-bgSecondary border border-quantum-border rounded-xl text-sm font-bold text-quantum-fgMuted hover:text-quantum-fg hover:border-quantum-accent/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoadingMore ? (
                    <>
                      <span className="w-4 h-4 border-2 border-quantum-fgMuted/30 border-t-quantum-fgMuted rounded-full animate-spin" />
                      A carregar mais...
                    </>
                  ) : (
                    <>
                      <ChevronDown className="w-4 h-4" />
                      Carregar mais movimentações
                    </>
                  )}
                </button>
                {loadedCount !== undefined && (
                  <span className="text-[10px] text-quantum-fgMuted font-mono">
                    {loadedCount} movimentações carregadas
                  </span>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
