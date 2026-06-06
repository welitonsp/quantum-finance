// src/features/transactions/hooks/useTransactionFilters.ts
// Estado e lógica de filtragem, ordenação e agrupamento extraídos de TransactionsManager.
import { useState, useMemo, useCallback } from 'react';
import type { Transaction } from '../../../shared/types/transaction';
import type { UserCategory } from '../../../shared/schemas/categorySchemas';
import { fromCentavos } from '../../../shared/types/money';
import {
  calculateRunningBalances,
  getTransactionAbsCentavos,
  isIncome as checkIncome,
  isExpense as checkExpense,
  isImportedUnreconciledTransaction,
} from '../../../utils/transactionUtils';
import { formatCurrency }    from '../../../utils/formatters';
import { ALLOWED_CATEGORIES } from '../../../shared/schemas/financialSchemas';
import {
  calculateTransactionTotalsCents,
  buildTransactionGroup,
  getDateLabel,
  parseBRLToCents,
  type Group,
} from '../transactionGroupUtils';

// ─── Tipos públicos ───────────────────────────────────────────────────────────

export type SortBy                  = 'date_desc' | 'date_asc' | 'value_desc' | 'value_asc' | 'cat';
export type GroupByOption           = 'date' | 'category' | 'none';
export type FilterType              = 'all' | 'entrada' | 'saida' | 'transferencia';
export type ReconciliationStatusFilter = 'all' | 'reconciled' | 'unreconciled';

export type VirtualRowEntry =
  | { kind: 'header'; group: Group }
  | { kind: 'row';    tx:    Transaction };

export interface ActiveFilter { id: string; label: string; clear: () => void }

export const SOURCE_LABELS: Record<string, string> = {
  manual: 'Manual', csv: 'CSV', ofx: 'OFX', pdf: 'PDF',
};

export const RECONCILIATION_FILTER_LABELS: Record<ReconciliationStatusFilter, string> = {
  all:          'Todas',
  reconciled:   'Conciliadas',
  unreconciled: 'Importadas não conciliadas',
};

export const VIRTUAL_THRESHOLD = 100;

// ─── Helper local ─────────────────────────────────────────────────────────────

const fmtDateBR = (s: string) => s.split('-').reverse().join('/');

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useTransactionFilters(
  transactions: Transaction[],
  categories:   UserCategory[],
) {
  // ── Estado de filtros ──────────────────────────────────────────────────────
  const [search,    setSearch]    = useState('');
  const [filterType,  setFilterType]  = useState<FilterType>('all');
  const [filterCat,   setFilterCat]   = useState('');
  const [sortBy,      setSortBy]      = useState<SortBy>('date_desc');
  const [groupBy,     setGroupBy]     = useState<GroupByOption>('date');
  const [dateFrom,    setDateFrom]    = useState('');
  const [dateTo,      setDateTo]      = useState('');
  const [valueMin,    setValueMin]    = useState('');
  const [valueMax,    setValueMax]    = useState('');
  const [filterOrigin, setFilterOrigin] = useState('');
  const [filterReconciliationStatus, setFilterReconciliationStatus] =
    useState<ReconciliationStatusFilter>('all');

  // ── Derivados simples ──────────────────────────────────────────────────────
  const minCents = parseBRLToCents(valueMin);
  const maxCents = parseBRLToCents(valueMax);

  // ── Lista de categorias disponíveis ───────────────────────────────────────
  const categoryOptions = useMemo(() => {
    const byName = new Map<string, string>();
    categories.filter(c => c.isActive).forEach(c => byName.set(c.name, c.name));
    transactions.forEach(tx => { const n = tx.category ?? 'Outros'; byName.set(n, n); });
    ALLOWED_CATEGORIES.forEach(c => byName.set(c, c));
    return [...byName.values()].sort((a, b) =>
      a.localeCompare(b, 'pt-BR', { sensitivity: 'base' })
    );
  }, [categories, transactions]);

  // ── Lista filtrada + ordenada ──────────────────────────────────────────────
  const filtered = useMemo<Transaction[]>(() => {
    let list = transactions;

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(tx =>
        (tx.description ?? '').toLowerCase().includes(q) ||
        (tx.category    ?? '').toLowerCase().includes(q)
      );
    }
    if (filterType !== 'all') {
      list = list.filter(tx => {
        if (filterType === 'entrada')       return checkIncome(tx.type);
        if (filterType === 'saida')         return checkExpense(tx.type);
        if (filterType === 'transferencia') return tx.type === 'transferencia';
        return true;
      });
    }
    if (filterCat)         list = list.filter(tx => tx.category === filterCat);
    if (dateFrom)          list = list.filter(tx => (tx.date ?? '') >= dateFrom);
    if (dateTo)            list = list.filter(tx => (tx.date ?? '') <= dateTo);
    if (minCents !== null) list = list.filter(tx => getTransactionAbsCentavos(tx) >= minCents);
    if (maxCents !== null) list = list.filter(tx => getTransactionAbsCentavos(tx) <= maxCents);
    if (filterOrigin)      list = list.filter(tx => (tx.source ?? 'manual') === filterOrigin);
    if (filterReconciliationStatus === 'reconciled') {
      list = list.filter(tx => tx.reconciliationStatus === 'reconciled');
    }
    if (filterReconciliationStatus === 'unreconciled') {
      list = list.filter(isImportedUnreconciledTransaction);
    }

    return [...list].sort((a, b) => {
      if (sortBy === 'date_desc')  return (b.date ?? '').localeCompare(a.date ?? '');
      if (sortBy === 'date_asc')   return (a.date ?? '').localeCompare(b.date ?? '');
      if (sortBy === 'value_desc') return getTransactionAbsCentavos(b) - getTransactionAbsCentavos(a);
      if (sortBy === 'value_asc')  return getTransactionAbsCentavos(a) - getTransactionAbsCentavos(b);
      if (sortBy === 'cat')        return (a.category ?? '').localeCompare(b.category ?? '');
      return 0;
    });
  }, [
    transactions, search, filterType, filterCat,
    dateFrom, dateTo, minCents, maxCents,
    filterOrigin, filterReconciliationStatus, sortBy,
  ]);

  // ── Grupos ────────────────────────────────────────────────────────────────
  const groups = useMemo<Group[]>(() => {
    if (groupBy === 'none') return [buildTransactionGroup('', '', filtered)];

    const map = new Map<string, Transaction[]>();
    filtered.forEach(tx => {
      const key = groupBy === 'date'
        ? (tx.date ?? 'sem-data')
        : (tx.category ?? 'Outros');
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(tx);
    });

    const keys = [...map.keys()];
    if (groupBy === 'date')     keys.sort((a, b) => b.localeCompare(a));
    if (groupBy === 'category') keys.sort();

    return keys.map(k => buildTransactionGroup(
      k,
      groupBy === 'date' ? getDateLabel(k) : k,
      map.get(k)!,
    ));
  }, [filtered, groupBy]);

  // ── Stats da lista filtrada ───────────────────────────────────────────────
  const stats = useMemo(() => {
    const totals = calculateTransactionTotalsCents(filtered);
    return { count: filtered.length, ...totals };
  }, [filtered]);

  // ── Saldo acumulado ───────────────────────────────────────────────────────
  const runningBalances = useMemo(
    () => calculateRunningBalances(filtered),
    [filtered],
  );

  // ── Entradas para o virtualizador ─────────────────────────────────────────
  const virtualRowEntries = useMemo<VirtualRowEntry[]>(() => {
    const rows: VirtualRowEntry[] = [];
    for (const group of groups) {
      if (group.key) rows.push({ kind: 'header', group });
      for (const tx of group.items) rows.push({ kind: 'row', tx });
    }
    return rows;
  }, [groups]);

  const useVirtualList = filtered.length > VIRTUAL_THRESHOLD;

  // ── Contagem por categoria (sem filtro de categoria) ──────────────────────
  const baseForCategoryCounts = useMemo<Transaction[]>(() => {
    let list = transactions;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(tx =>
        (tx.description ?? '').toLowerCase().includes(q) ||
        (tx.category    ?? '').toLowerCase().includes(q)
      );
    }
    if (filterType !== 'all') {
      list = list.filter(tx => {
        if (filterType === 'entrada')       return checkIncome(tx.type);
        if (filterType === 'saida')         return checkExpense(tx.type);
        if (filterType === 'transferencia') return tx.type === 'transferencia';
        return true;
      });
    }
    if (dateFrom)          list = list.filter(tx => (tx.date ?? '') >= dateFrom);
    if (dateTo)            list = list.filter(tx => (tx.date ?? '') <= dateTo);
    if (minCents !== null) list = list.filter(tx => getTransactionAbsCentavos(tx) >= minCents);
    if (maxCents !== null) list = list.filter(tx => getTransactionAbsCentavos(tx) <= maxCents);
    if (filterOrigin)      list = list.filter(tx => (tx.source ?? 'manual') === filterOrigin);
    if (filterReconciliationStatus === 'reconciled') {
      list = list.filter(tx => tx.reconciliationStatus === 'reconciled');
    }
    if (filterReconciliationStatus === 'unreconciled') {
      list = list.filter(isImportedUnreconciledTransaction);
    }
    return list;
  }, [
    transactions, search, filterType, dateFrom, dateTo,
    minCents, maxCents, filterOrigin, filterReconciliationStatus,
  ]);

  const catCounts = useMemo<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    baseForCategoryCounts.forEach(tx => {
      const c = tx.category ?? 'Outros';
      map[c] = (map[c] ?? 0) + 1;
    });
    return map;
  }, [baseForCategoryCounts]);

  // ── Intervalo de datas carregado ──────────────────────────────────────────
  const loadedDateRange = useMemo<{ min: string; max: string } | null>(() => {
    let minDate: string | null = null;
    let maxDate: string | null = null;
    for (const tx of transactions) {
      const date = tx.date;
      if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      if (minDate === null || date < minDate) minDate = date;
      if (maxDate === null || date > maxDate) maxDate = date;
    }
    return minDate && maxDate ? { min: minDate, max: maxDate } : null;
  }, [transactions]);

  const hasDateFilterActive = Boolean(dateFrom || dateTo);

  const shouldShowDateScopeNotice = hasDateFilterActive && (
    !loadedDateRange ||
    (dateFrom ? dateFrom < loadedDateRange.min : false) ||
    (dateTo   ? dateTo   > loadedDateRange.max : false)
  );

  // ── Chips de filtros activos ──────────────────────────────────────────────
  const activeFilters = useMemo<ActiveFilter[]>(() => (
    [
      filterType !== 'all'
        ? { id: 'type',   label: filterType === 'entrada' ? '↑ Entradas' : '↓ Saídas', clear: () => setFilterType('all') }
        : null,
      filterCat
        ? { id: 'cat',   label: filterCat, clear: () => setFilterCat('') }
        : null,
      search.trim()
        ? { id: 'search', label: `"${search.trim()}"`, clear: () => setSearch('') }
        : null,
      dateFrom
        ? { id: 'date-from', label: `A partir de ${fmtDateBR(dateFrom)}`, clear: () => setDateFrom('') }
        : null,
      dateTo
        ? { id: 'date-to', label: `Até ${fmtDateBR(dateTo)}`, clear: () => setDateTo('') }
        : null,
      minCents !== null
        ? { id: 'value-min', label: `Mínimo ${formatCurrency(fromCentavos(minCents))}`, clear: () => setValueMin('') }
        : null,
      maxCents !== null
        ? { id: 'value-max', label: `Máximo ${formatCurrency(fromCentavos(maxCents))}`, clear: () => setValueMax('') }
        : null,
      filterOrigin
        ? { id: 'origin', label: `Origem: ${SOURCE_LABELS[filterOrigin] ?? filterOrigin}`, clear: () => setFilterOrigin('') }
        : null,
      filterReconciliationStatus !== 'all'
        ? { id: 'reconciliation', label: `Conciliação: ${RECONCILIATION_FILTER_LABELS[filterReconciliationStatus]}`, clear: () => setFilterReconciliationStatus('all') }
        : null,
    ] as (ActiveFilter | null)[]
  ).filter((f): f is ActiveFilter => f !== null), [
    filterType, filterCat, search, dateFrom, dateTo,
    minCents, maxCents, filterOrigin, filterReconciliationStatus,
  ]);

  const clearAllFilters = useCallback(() => {
    setSearch('');
    setFilterType('all');
    setFilterCat('');
    setDateFrom('');
    setDateTo('');
    setValueMin('');
    setValueMax('');
    setFilterOrigin('');
    setFilterReconciliationStatus('all');
  }, []);

  return {
    // Estado + setters
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
    // Valores derivados
    minCents,
    maxCents,
    categoryOptions,
    filtered,
    groups,
    stats,
    runningBalances,
    virtualRowEntries,
    useVirtualList,
    catCounts,
    loadedDateRange,
    hasDateFilterActive,
    shouldShowDateScopeNotice,
    activeFilters,
    clearAllFilters,
  };
}
