// src/features/transactions/components/TransactionToolbar.tsx
// Barra de filtros, busca, ordenação, tabs e exportação
import { type RefObject } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Filter, X, SlidersHorizontal,
  TrendingUp, TrendingDown, Minus, Tag, ArrowUpDown,
  Layers, History, Download, AlertTriangle, Check,
  ArrowRightLeft, RotateCcw,
} from 'lucide-react';
import { transactionsToCSV, downloadCSV, generateMonthlyReportCSV } from '../../../utils/exportCSV';
import type { Transaction } from '../../../shared/types/transaction';
import { FilterChip } from './FilterChip';
import {
  SOURCE_LABELS,
  type SortBy,
  type GroupByOption,
  type FilterType,
  type ReconciliationStatusFilter,
  type RiskFilter,
} from '../hooks/useTransactionFilters';

interface ActiveFilter {
  id: string;
  label: string;
  clear: () => void;
}

interface TransactionToolbarProps {
  // Search
  localSearch: string;
  onSearchChange: (value: string) => void;
  onServerSearch?: ((term: string) => void) | undefined;
  serverSearchTerm?: string | undefined;

  // Type tabs
  filterType: FilterType;
  setFilterType: (v: FilterType) => void;

  // Reconciliation filter
  filterReconciliationStatus: ReconciliationStatusFilter;
  setFilterReconciliationStatus: (v: ReconciliationStatusFilter) => void;

  // Advanced filters panel
  filtersOpen: boolean;
  setFiltersOpen: (v: boolean | ((prev: boolean) => boolean)) => void;

  // Advanced filter values
  filterCat: string;
  setFilterCat: (v: string) => void;
  filterOrigin: string;
  setFilterOrigin: (v: string) => void;
  sortBy: SortBy;
  setSortBy: (v: SortBy) => void;
  groupBy: GroupByOption;
  setGroupBy: (v: GroupByOption) => void;
  dateFrom: string;
  setDateFrom: (v: string) => void;
  dateTo: string;
  setDateTo: (v: string) => void;
  valueMin: string;
  setValueMin: (v: string) => void;
  valueMax: string;
  setValueMax: (v: string) => void;
  categoryOptions: string[];
  catCounts: Record<string, number>;

  // Risk filter
  filterRisk: RiskFilter;
  setFilterRisk: (v: RiskFilter) => void;

  // Server category filter
  serverCategoryFilter?: string | undefined;
  onServerCategoryFilter?: ((cat: string) => void) | undefined;

  // Active filters / chips
  activeFilters: ActiveFilter[];
  clearAllFilters: () => void;
  shouldShowDateScopeNotice: boolean;

  // Drawers / actions
  onOpenAudit: () => void;

  // Export
  filtered: Transaction[];
  transactions: Transaction[];

  // Report picker state (lifted to parent to keep simple)
  reportPickerOpen: boolean;
  setReportPickerOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
  reportYear: number;
  setReportYear: (v: number) => void;
  reportMonth: number;
  setReportMonth: (v: number) => void;

  // Ref for search input focus (Alt+F)
  searchRef: RefObject<HTMLInputElement | null>;
}

const TYPE_TABS: { v: FilterType; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { v: 'all',           label: 'Todos',          icon: Minus          },
  { v: 'entrada',       label: 'Entradas',        icon: TrendingUp     },
  { v: 'saida',         label: 'Saídas',          icon: TrendingDown   },
  { v: 'transferencia', label: 'Transferências',  icon: ArrowRightLeft },
];

const QUICK_RECON_FILTERS = [
  { v: 'all'          as const, label: 'Todas',                      icon: Minus         },
  { v: 'reconciled'   as const, label: 'Conciliadas',                icon: Check         },
  { v: 'unreconciled' as const, label: 'Importadas não conciliadas', icon: AlertTriangle },
];

export function TransactionToolbar({
  localSearch,
  onSearchChange,
  onServerSearch,
  serverSearchTerm: _serverSearchTerm = '',
  filterType,
  setFilterType,
  filterReconciliationStatus,
  setFilterReconciliationStatus,
  filtersOpen,
  setFiltersOpen,
  filterCat,
  setFilterCat,
  filterOrigin,
  setFilterOrigin,
  sortBy,
  setSortBy,
  groupBy,
  setGroupBy,
  dateFrom,
  setDateFrom,
  dateTo,
  setDateTo,
  valueMin,
  setValueMin,
  valueMax,
  setValueMax,
  categoryOptions,
  catCounts,
  filterRisk,
  setFilterRisk,
  serverCategoryFilter = '',
  onServerCategoryFilter,
  activeFilters,
  clearAllFilters,
  shouldShowDateScopeNotice,
  onOpenAudit,
  filtered,
  transactions,
  reportPickerOpen,
  setReportPickerOpen,
  reportYear,
  setReportYear,
  reportMonth,
  setReportMonth,
  searchRef,
}: TransactionToolbarProps) {
  const hasAdvancedFilter =
    filtersOpen || !!filterCat || !!dateFrom || !!dateTo || !!valueMin || !!valueMax || !!filterOrigin || filterReconciliationStatus !== 'all';

  return (
    <div className="p-4 md:p-5 border-b border-quantum-border bg-quantum-bg/40 space-y-4 select-none">
      <div className="flex flex-wrap gap-2 items-center">
        {/* Search */}
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-quantum-fgMuted" />
          <input
            ref={searchRef}
            type="text"
            aria-label="Pesquisar descrição ou categoria"
            placeholder={onServerSearch ? 'Buscar no servidor... (Alt+F)' : 'Pesquisar descrição ou categoria... (Alt+F)'}
            value={localSearch}
            onChange={e => onSearchChange(e.target.value)}
            className="input-quantum pl-10 pr-8 py-2.5 text-sm"
          />
          {localSearch && (
            <button
              onClick={() => { onSearchChange(''); onServerSearch?.(''); }}
              aria-label="Limpar busca"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-quantum-fgMuted hover:text-quantum-fg transition-colors"
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          )}
        </div>

        {/* Type tabs */}
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

        {/* Reconciliation quick-filter */}
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

        {/* Action buttons */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setFiltersOpen(o => !o)}
            aria-label="Filtros avançados"
            aria-expanded={filtersOpen}
            className={`p-2.5 rounded-xl border transition-all ${
              hasAdvancedFilter
                ? 'bg-quantum-accentDim border-quantum-accent/30 text-quantum-accent'
                : 'bg-quantum-bgSecondary border-quantum-border text-quantum-fgMuted hover:text-quantum-fg'
            }`}
            title="Filtros avançados"
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>

          <button
            onClick={onOpenAudit}
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

          {/* Monthly report picker */}
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

      {/* Advanced filters panel */}
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
                  <Check className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-quantum-fgMuted" />
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
                  <span className="pointer-events-none absolute -top-1.5 left-2 z-10 rounded bg-quantum-bgSecondary px-1 text-[9px] font-bold uppercase text-quantum-fgMuted">
                    Risco
                  </span>
                  <select
                    value={filterRisk}
                    onChange={e => setFilterRisk(e.target.value as RiskFilter)}
                    aria-label="Filtrar por score de risco"
                    className="input-quantum pl-3 py-2 text-xs appearance-none"
                  >
                    <option value="all">Todos os riscos</option>
                    <option value="elevated">🟡 Elevadas ou anômalas</option>
                    <option value="anomalous">🔴 Apenas anômalas</option>
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

      {/* Date scope notice */}
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

      {/* Active filter chips */}
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
  );
}
