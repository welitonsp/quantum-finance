// src/features/transactions/components/TransactionSummaryBar.tsx
// Barra de resumo persistente (total, entradas, saídas, saldo) + controles de seleção
import { CheckSquare, Square, MinusSquare } from 'lucide-react';
import { formatCurrency } from '../../../utils/formatters';
import type { Transaction } from '../../../shared/types/transaction';

interface Stats {
  count: number;
  totalInCents: number;
  totalOutCents: number;
  netCents: number;
}

interface TransactionSummaryBarProps {
  stats: Stats;
  filtered: Transaction[];
  selected: Set<string>;
  allFilteredSelected: boolean;
  someSelected: boolean;
  filterCat: string;
  loadedCount?: number | undefined;
  onSelectAll: () => void;
  onClearSelected: () => void;
  onSelectByType: (type: 'entrada' | 'saida') => void;
  onSelectByCategory: (cat: string) => void;
}

export function TransactionSummaryBar({
  stats,
  filtered,
  selected,
  allFilteredSelected,
  someSelected,
  filterCat,
  loadedCount,
  onSelectAll,
  onClearSelected,
  onSelectByType,
  onSelectByCategory,
}: TransactionSummaryBarProps) {
  return (
    <div className="flex items-center gap-3 px-4 md:px-5 py-3 bg-quantum-bg/20 border-b border-quantum-border text-xs overflow-x-auto custom-scrollbar">
      <button
        onClick={allFilteredSelected ? onClearSelected : onSelectAll}
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
        <button onClick={() => onSelectByType('entrada')} className="text-quantum-accent hover:underline font-bold">Entradas</button>
        <span className="text-quantum-border">·</span>
        <button onClick={() => onSelectByType('saida')}   className="text-quantum-red hover:underline font-bold">Saídas</button>
        {filterCat && (
          <>
            <span className="text-quantum-border">·</span>
            <button onClick={() => onSelectByCategory(filterCat)} className="text-quantum-gold hover:underline font-bold">{filterCat}</button>
          </>
        )}
      </div>
    </div>
  );
}
