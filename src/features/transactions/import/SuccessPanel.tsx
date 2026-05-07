import { motion } from 'framer-motion';
import { CheckCircle2 } from 'lucide-react';
import { formatCurrency } from '../../../utils/formatters';
import { formatPeriodDate } from './importConstants';
import type { ImportStats } from './importTypes';

export function SuccessPanel({ stats }: { stats: ImportStats }) {
  const periodLabel = stats.periodStart && stats.periodEnd
    ? `${formatPeriodDate(stats.periodStart)} - ${formatPeriodDate(stats.periodEnd)}`
    : 'N/D';
  const netLabel = `${stats.netCents >= 0 ? '+' : ''}${formatCurrency(stats.netCents, { cents: true })}`;

  return (
    <motion.div
      role="status"
      aria-live="polite"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="py-8 flex flex-col items-center text-center gap-5"
    >
      <div className="relative">
        <div className="absolute inset-0 bg-quantum-accent/20 rounded-full blur-2xl" />
        <CheckCircle2 className="w-16 h-16 text-quantum-accent relative z-10" />
      </div>
      <div>
        <h4 className="text-lg font-black text-quantum-fg mb-1">Ingestão Concluída</h4>
        <p className="text-xs text-quantum-fgMuted">O cofre foi atualizado com sucesso.</p>
      </div>
      <div className="flex gap-3">
        <div className="px-4 py-2.5 bg-quantum-bgSecondary rounded-xl border border-quantum-border text-center">
          <p className="text-[10px] text-quantum-fgMuted uppercase mb-1">Lidas</p>
          <p className="text-lg font-black text-quantum-fg font-mono">{stats.total}</p>
        </div>
        <div className="px-4 py-2.5 bg-quantum-accentDim border border-quantum-accent/20 rounded-xl text-center">
          <p className="text-[10px] text-quantum-accent uppercase mb-1">Novas</p>
          <p className="text-lg font-black text-quantum-accent font-mono">{stats.added}</p>
        </div>
        <div className="px-4 py-2.5 bg-quantum-bgSecondary border border-quantum-border rounded-xl text-center">
          <p className="text-[10px] text-quantum-fgMuted uppercase mb-1">Ignoradas</p>
          <p className="text-lg font-black text-quantum-fgMuted font-mono">{stats.duplicates}</p>
        </div>
      </div>

      <div className="w-full rounded-xl border border-quantum-border bg-quantum-bgSecondary/50 p-3 text-left">
        <p className="text-[10px] text-quantum-fgMuted uppercase mb-1">Arquivo</p>
        <p className="text-xs font-bold text-quantum-fg truncate" title={stats.fileName || 'Arquivo importado'}>
          {stats.fileName || 'Arquivo importado'}
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-quantum-fgMuted">
          <span>Origem: <strong className="text-quantum-fg">{stats.source}</strong></span>
          <span>Periodo: <strong className="text-quantum-fg">{periodLabel}</strong></span>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 w-full">
        <div className="px-3 py-2.5 bg-quantum-bgSecondary rounded-xl border border-quantum-border text-center">
          <p className="text-[10px] text-quantum-fgMuted uppercase mb-1">Importaveis</p>
          <p className="text-lg font-black text-quantum-fg font-mono">{stats.importable}</p>
        </div>
        <div className="px-3 py-2.5 bg-cyan-500/10 rounded-xl border border-cyan-500/20 text-center">
          <p className="text-[10px] text-cyan-300 uppercase mb-1">Reconciliadas</p>
          <p className="text-lg font-black text-cyan-300 font-mono">{stats.reconciled}</p>
        </div>
        <div className="px-3 py-2.5 bg-quantum-redDim rounded-xl border border-quantum-red/20 text-center">
          <p className="text-[10px] text-quantum-red uppercase mb-1">Invalidas</p>
          <p className="text-lg font-black text-quantum-red font-mono">{stats.invalid}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 w-full">
        <div className="px-3 py-2.5 bg-quantum-bgSecondary rounded-xl border border-quantum-border text-center">
          <p className="text-[10px] text-quantum-fgMuted uppercase mb-1">Entradas</p>
          <p className="text-sm font-black text-quantum-accent font-mono">{formatCurrency(stats.totalInCents, { cents: true })}</p>
        </div>
        <div className="px-3 py-2.5 bg-quantum-bgSecondary rounded-xl border border-quantum-border text-center">
          <p className="text-[10px] text-quantum-fgMuted uppercase mb-1">Saidas</p>
          <p className="text-sm font-black text-quantum-red font-mono">{formatCurrency(stats.totalOutCents, { cents: true })}</p>
        </div>
        <div className="px-3 py-2.5 bg-quantum-bgSecondary rounded-xl border border-quantum-border text-center">
          <p className="text-[10px] text-quantum-fgMuted uppercase mb-1">Saldo</p>
          <p className={`text-sm font-black font-mono ${stats.netCents >= 0 ? 'text-quantum-accent' : 'text-quantum-red'}`}>{netLabel}</p>
        </div>
      </div>
    </motion.div>
  );
}
