// src/components/AnomalyAlerts.tsx
import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, TrendingDown, TrendingUp } from 'lucide-react';
import { GeminiService } from '../features/ai-chat/GeminiService';
import type { Transaction } from '../shared/types/transaction';
import { formatBRL } from '../shared/types/money';

interface Props {
  transactions: Transaction[];
}

function getMonthRange(tx: Transaction[]): { current: Transaction[]; historical: Transaction[] } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();

  const current    = tx.filter(t => {
    const d = new Date(t.date ?? '');
    return d.getFullYear() === y && d.getMonth() === m;
  });

  const historical = tx.filter(t => {
    const d = new Date(t.date ?? '');
    const tYear = d.getFullYear();
    const tMonth = d.getMonth();
    return tYear < y || (tYear === y && tMonth < m);
  });

  return { current, historical };
}

export default function AnomalyAlerts({ transactions }: Props) {
  const anomalies = useMemo(() => {
    const { current, historical } = getMonthRange(transactions);
    if (historical.length < 5) return [];
    return GeminiService.detectAnomalies(current, historical, 25);
  }, [transactions]);

  if (anomalies.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="bg-quantum-card border border-amber-500/25 rounded-3xl p-6 shadow-lg"
    >
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center border border-amber-500/25">
          <AlertTriangle className="w-5 h-5 text-amber-400" />
        </div>
        <div>
          <h3 className="text-base font-black text-quantum-fg">Alertas de Anomalia</h3>
          <p className="text-[11px] text-quantum-fgMuted">
            {anomalies.length} categoria{anomalies.length > 1 ? 's' : ''} com gasto atípico este mês
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <AnimatePresence initial={false}>
          {anomalies.map((a, i) => {
            const isUp  = a.delta > 0;
            const color = isUp ? 'text-red-400' : 'text-emerald-400';
            const bg    = isUp ? 'bg-red-500/8 border-red-500/20' : 'bg-emerald-500/8 border-emerald-500/20';

            return (
              <motion.div
                key={a.cat}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.06 }}
                className={`flex items-center justify-between rounded-xl border px-4 py-3 ${bg}`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {isUp
                    ? <TrendingUp  className="w-4 h-4 text-red-400 shrink-0" />
                    : <TrendingDown className="w-4 h-4 text-emerald-400 shrink-0" />
                  }
                  <span className="text-sm font-bold text-quantum-fg truncate">{a.cat}</span>
                </div>
                <div className="flex items-center gap-4 shrink-0 ml-3">
                  <div className="text-right hidden sm:block">
                    <p className="text-[10px] text-quantum-fgMuted">Média</p>
                    <p className="text-xs font-bold text-quantum-fg">{formatBRL(a.avg)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-quantum-fgMuted">Este mês</p>
                    <p className="text-xs font-bold text-quantum-fg">{formatBRL(a.current)}</p>
                  </div>
                  <span className={`text-sm font-black w-16 text-right ${color}`}>
                    {isUp ? '+' : ''}{a.delta}%
                  </span>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
