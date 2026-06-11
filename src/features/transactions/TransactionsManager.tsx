// src/features/transactions/TransactionsManager.tsx
// Motor de Gestão de Movimentações — Quantum Finance v2
// Thin orchestrator: holds state, delegates rendering to sub-components.
import { useState, useCallback, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { Check, AlertTriangle } from 'lucide-react';
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
import {
  useTransactionFilters,
} from './hooks/useTransactionFilters';
import { useTransactionSelection } from './hooks/useTransactionSelection';
import { TransactionToolbar } from './components/TransactionToolbar';
import { TransactionSummaryBar } from './components/TransactionSummaryBar';
import { TransactionBulkActions } from './components/TransactionBulkActions';
import { TransactionList } from './components/TransactionList';


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
    filterRisk, setFilterRisk,
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
  }, [search, filterType, filterCat, dateFrom, dateTo, valueMin, valueMax, filterOrigin, filterReconciliationStatus, filterRisk]);

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

  // Unified search value (server or local)
  const effectiveSearch = onServerSearch ? localSearch : search;

  return (
    <div className="flex flex-col h-full">

      {/* ═══ BARRA DE FILTROS ═══════════════════════════════════════════════ */}
      <TransactionToolbar
        localSearch={effectiveSearch}
        onSearchChange={onServerSearch ? handleSearchChange : setSearch}
        onServerSearch={onServerSearch}
        serverSearchTerm={serverSearchTerm}
        filterType={filterType}
        setFilterType={setFilterType}
        filterReconciliationStatus={filterReconciliationStatus}
        setFilterReconciliationStatus={setFilterReconciliationStatus}
        filtersOpen={filtersOpen}
        setFiltersOpen={setFiltersOpen}
        filterCat={filterCat}
        setFilterCat={setFilterCat}
        filterOrigin={filterOrigin}
        setFilterOrigin={setFilterOrigin}
        sortBy={sortBy}
        setSortBy={setSortBy}
        groupBy={groupBy}
        setGroupBy={setGroupBy}
        dateFrom={dateFrom}
        setDateFrom={setDateFrom}
        dateTo={dateTo}
        setDateTo={setDateTo}
        valueMin={valueMin}
        setValueMin={setValueMin}
        valueMax={valueMax}
        setValueMax={setValueMax}
        categoryOptions={categoryOptions}
        catCounts={catCounts}
        filterRisk={filterRisk}
        setFilterRisk={setFilterRisk}
        serverCategoryFilter={serverCategoryFilter}
        onServerCategoryFilter={onServerCategoryFilter}
        activeFilters={activeFilters}
        clearAllFilters={clearAllFilters}
        shouldShowDateScopeNotice={shouldShowDateScopeNotice}
        onOpenAudit={() => setAuditOpen(true)}
        filtered={filtered}
        transactions={transactions}
        reportPickerOpen={reportPickerOpen}
        setReportPickerOpen={setReportPickerOpen}
        reportYear={reportYear}
        setReportYear={setReportYear}
        reportMonth={reportMonth}
        setReportMonth={setReportMonth}
        searchRef={searchRef}
      />

      {/* ═══ SERVER SEARCH BANNER ═══════════════════════════════════════════ */}
      {isServerSearchActive && (
        <div className="flex items-center gap-2 px-4 md:px-5 py-2 bg-quantum-accentDim/30 border-b border-quantum-accent/20 text-xs text-quantum-accent">
          <svg className="w-3.5 h-3.5 shrink-0" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <span>Resultados do servidor para <strong>&quot;{serverSearchTerm}&quot;</strong></span>
          <button
            onClick={() => { handleSearchChange(''); onServerSearch?.(''); }}
            aria-label="Limpar busca no servidor"
            className="ml-auto flex items-center gap-1 text-quantum-accent/70 hover:text-quantum-accent transition-colors"
          >
            <svg className="w-3 h-3" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg> Limpar
          </button>
        </div>
      )}

      {/* ═══ SERVER CATEGORY BANNER ══════════════════════════════════════════ */}
      {isServerCategoryActive && (
        <div className="flex items-center gap-2 px-4 md:px-5 py-2 bg-blue-500/10 border-b border-blue-500/20 text-xs text-blue-400">
          <svg className="w-3.5 h-3.5 shrink-0" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
          <span>Categoria no servidor: <strong>{serverCategoryFilter}</strong></span>
          <button
            onClick={() => onServerCategoryFilter?.('')}
            aria-label="Limpar filtro de categoria no servidor"
            className="ml-auto flex items-center gap-1 text-blue-400/70 hover:text-blue-400 transition-colors"
          >
            <svg className="w-3 h-3" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg> Limpar
          </button>
        </div>
      )}

      {/* ═══ STATS BAR ══════════════════════════════════════════════════════ */}
      <TransactionSummaryBar
        stats={stats}
        filtered={filtered}
        selected={selected}
        allFilteredSelected={allFilteredSelected}
        someSelected={someSelected}
        filterCat={filterCat}
        loadedCount={loadedCount}
        onSelectAll={selectAll}
        onClearSelected={clearSelected}
        onSelectByType={selectByType}
        onSelectByCategory={selectByCategory}
      />

      {/* ═══ BARRA DE AÇÕES EM LOTE ═════════════════════════════════════════ */}
      <TransactionBulkActions
        selected={selected}
        transactions={transactions}
        filtered={filtered}
        categoryOptions={categoryOptions}
        allFilteredSelected={allFilteredSelected}
        allTransactionsSelected={allTransactionsSelected}
        batchAction={batchAction}
        setBatchAction={setBatchAction}
        confirmDelete={confirmDelete}
        setConfirmDelete={setConfirmDelete}
        newCat={newCat}
        setNewCat={setNewCat}
        isBulkUpdating={isBulkUpdating}
        isUndoing={isUndoing}
        hasOnBulkUpdate={!!onBulkUpdate}
        onBatchDelete={handleBatchDelete}
        onClearSelected={clearSelected}
        onSelectAllTransactions={selectAllTransactions}
        onApplyRecategorize={() => void handleBatchRecategorize()}
      />

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
      <TransactionList
        filtered={filtered}
        groups={groups}
        activeFiltersCount={activeFilters.length}
        runningBalances={runningBalances}
        selected={selected}
        onToggle={toggleOne}
        onEdit={onEdit}
        onDeleteRequest={onDeleteRequest}
        onHistory={setHistoryTx}
        onInstallmentClick={setInstallmentTx}
        onClearAllFilters={clearAllFilters}
        useVirtualList={useVirtualList}
        listRef={listRef}
        rowVirtualizer={rowVirtualizer}
        virtualRowEntries={virtualRowEntries}
        hasMoreTransactions={hasMoreTransactions}
        isLoadingMore={isLoadingMore}
        loadedCount={loadedCount}
        onLoadMore={loadMoreTransactions ?? (() => Promise.resolve())}
      />
    </div>
  );
}
