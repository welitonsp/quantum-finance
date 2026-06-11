// src/features/transactions/components/TransactionList.tsx
// Lista de transações: virtualizada ou por grupos, com botão "Carregar mais"
import { type RefObject } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Filter, RotateCcw, ChevronDown } from 'lucide-react';
import type { VirtualItem, Virtualizer } from '@tanstack/react-virtual';
import type { Transaction } from '../../../shared/types/transaction';
import type { Centavos } from '../../../shared/types/money';
import { GroupHeader } from './GroupHeader';
import { TransactionRow } from './TransactionRow';

interface TransactionGroup {
  key: string;
  label: string;
  count: number;
  totalInCents: number;
  totalOutCents: number;
  netCents: number;
  items: Transaction[];
}

type VirtualRowEntry =
  | { kind: 'header'; group: { label: string; count: number; totalInCents: number; totalOutCents: number; netCents: number } }
  | { kind: 'row'; tx: Transaction };

interface TransactionListProps {
  filtered: Transaction[];
  groups: TransactionGroup[];
  activeFiltersCount: number;
  runningBalances: Record<string, Centavos>;
  selected: Set<string>;
  onToggle: (id: string) => void;
  onEdit: (tx: Transaction) => void;
  onDeleteRequest: (tx: Transaction) => void;
  onHistory: (tx: Transaction) => void;
  onInstallmentClick: (tx: Transaction) => void;
  onClearAllFilters: () => void;

  // Virtualizer
  useVirtualList: boolean;
  listRef: RefObject<HTMLDivElement | null>;
  rowVirtualizer: Virtualizer<HTMLDivElement, Element>;
  virtualRowEntries: VirtualRowEntry[];

  // Load more
  hasMoreTransactions: boolean;
  isLoadingMore: boolean;
  loadedCount?: number | undefined;
  onLoadMore: () => Promise<void>;
}

export function TransactionList({
  filtered,
  groups,
  activeFiltersCount,
  runningBalances,
  selected,
  onToggle,
  onEdit,
  onDeleteRequest,
  onHistory,
  onInstallmentClick,
  onClearAllFilters,
  useVirtualList,
  listRef,
  rowVirtualizer,
  virtualRowEntries,
  hasMoreTransactions,
  isLoadingMore,
  loadedCount,
  onLoadMore,
}: TransactionListProps) {
  return (
    <div ref={listRef} className="flex-1 overflow-y-auto p-4 md:p-5 space-y-3 custom-scrollbar">
      {filtered.length === 0 ? (
        <div role="status" className="flex flex-col items-center justify-center py-20 gap-4 text-center">
          <div className="p-5 bg-quantum-card rounded-3xl border border-quantum-border">
            <Filter className="w-10 h-10 text-quantum-fgMuted" />
          </div>
          <div>
            <p className="font-bold text-quantum-fg mb-1">
              {activeFiltersCount > 0
                ? 'Nenhuma movimentação encontrada para os filtros atuais.'
                : 'Nenhum resultado encontrado'}
            </p>
            <p className="text-xs text-quantum-fgMuted">
              {activeFiltersCount > 0
                ? 'Verifique se o mês selecionado corresponde ao período filtrado ou limpe os filtros.'
                : 'Tente ajustar os filtros ou importar um extrato bancário.'}
            </p>
          </div>
          {activeFiltersCount > 0 && (
            <button onClick={onClearAllFilters} className="btn-quantum-secondary flex items-center gap-2 text-xs">
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
            {rowVirtualizer.getVirtualItems().map((virtualItem: VirtualItem) => {
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
                      onToggle={onToggle}
                      onEdit={onEdit}
                      onDelete={onDeleteRequest}
                      onHistory={onHistory}
                      onInstallmentClick={onInstallmentClick}
                    />
                  ) : null}
                </div>
              );
            })}
          </div>

          <LoadMoreButton
            hasMore={hasMoreTransactions}
            isLoading={isLoadingMore}
            loadedCount={loadedCount}
            onLoad={onLoadMore}
          />
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
                      onToggle={onToggle}
                      onEdit={onEdit}
                      onDelete={onDeleteRequest}
                      onHistory={onHistory}
                      onInstallmentClick={onInstallmentClick}
                    />
                  ))}
                </div>
              </div>
            ))}
          </AnimatePresence>

          <LoadMoreButton
            hasMore={hasMoreTransactions}
            isLoading={isLoadingMore}
            loadedCount={loadedCount}
            onLoad={onLoadMore}
          />
        </>
      )}
    </div>
  );
}

function LoadMoreButton({
  hasMore,
  isLoading,
  loadedCount,
  onLoad,
}: {
  hasMore: boolean;
  isLoading: boolean;
  loadedCount?: number | undefined;
  onLoad: () => Promise<void>;
}) {
  if (!hasMore && !isLoading) return null;
  return (
    <div className="flex flex-col items-center gap-1.5 py-5">
      <button
        onClick={() => void onLoad()}
        disabled={isLoading || !onLoad}
        className="flex items-center gap-2 px-4 py-2.5 bg-quantum-bgSecondary border border-quantum-border rounded-xl text-sm font-bold text-quantum-fgMuted hover:text-quantum-fg hover:border-quantum-accent/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isLoading ? (
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
  );
}
