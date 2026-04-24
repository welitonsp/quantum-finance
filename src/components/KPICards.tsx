import { motion } from 'framer-motion';
import CountUp from 'react-countup';
import { TrendingUp, TrendingDown, Wallet, CalendarClock } from 'lucide-react';
import { useFinancialKPIs } from '../hooks/useFinancialKPIs';
import { formatCurrency } from '../utils/formatters';
import type { Transaction } from '../shared/types/transaction';

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  transactions: Transaction[];
}

// ─── Tipos internos ───────────────────────────────────────────────────────────

interface CardDef {
  icon:   React.ComponentType<{ className?: string }>;
  label:  string;
  value:  number;
  sub:    string | null;
  value_class: string;
  card_class:  string;
  icon_class:  string;
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function KPICards({ transactions }: Props) {
  const { totalIncome, totalExpense, balance, burnRate, projectedBalance } =
    useFinancialKPIs(transactions);

  const balPositive  = balance          >= 0;
  const projPositive = projectedBalance >= 0;

  const cards: CardDef[] = [
    {
      icon:        TrendingUp,
      label:       'Receita do Mês',
      value:       totalIncome,
      sub:         null,
      value_class: 'text-emerald-400',
      card_class:  'border-emerald-500/15 hover:border-emerald-500/30',
      icon_class:  'bg-emerald-500/10 text-emerald-400',
    },
    {
      icon:        TrendingDown,
      label:       'Despesa do Mês',
      value:       totalExpense,
      sub:         `${formatCurrency(burnRate)}/dia`,
      value_class: 'text-red-400',
      card_class:  'border-red-500/15 hover:border-red-500/30',
      icon_class:  'bg-red-500/10 text-red-400',
    },
    {
      icon:        Wallet,
      label:       'Saldo Atual',
      value:       balance,
      sub:         null,
      value_class: balPositive ? 'text-quantum-fg' : 'text-red-400',
      card_class:  balPositive
        ? 'border-quantum-border hover:border-quantum-accent/20'
        : 'border-red-500/20 hover:border-red-500/35',
      icon_class:  balPositive
        ? 'bg-quantum-bgSecondary text-quantum-fgMuted'
        : 'bg-red-500/10 text-red-400',
    },
    {
      icon:        CalendarClock,
      label:       'Projeção (fim do mês)',
      value:       projectedBalance,
      sub:         projPositive ? 'Tendência positiva' : 'Atenção ao gasto diário',
      value_class: projPositive ? 'text-cyan-400' : 'text-amber-400',
      card_class:  projPositive
        ? 'border-cyan-500/15 hover:border-cyan-500/30'
        : 'border-amber-500/20 hover:border-amber-500/35',
      icon_class:  projPositive
        ? 'bg-cyan-500/10 text-cyan-400'
        : 'bg-amber-500/10 text-amber-400',
    },
  ];

  return (
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
      {cards.map((card, i) => {
        const Icon = card.icon;
        return (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06, type: 'spring', stiffness: 100, damping: 16 }}
            className={`bg-quantum-card border rounded-2xl p-4 flex flex-col gap-3 transition-colors ${card.card_class}`}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-[10px] font-bold text-quantum-fgMuted uppercase tracking-wider leading-tight">
                {card.label}
              </p>
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${card.icon_class}`}>
                <Icon className="w-3.5 h-3.5" />
              </div>
            </div>

            <div>
              <p className={`text-lg sm:text-xl font-black font-mono leading-none ${card.value_class}`}>
                <CountUp
                  end={card.value}
                  duration={1.4}
                  separator="."
                  decimal=","
                  decimals={2}
                  prefix={card.value < 0 ? '-R$ ' : 'R$ '}
                  formattingFn={(n) =>
                    (n < 0 ? '-R$ ' : 'R$ ') +
                    Math.abs(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                  }
                />
              </p>
              {card.sub && (
                <p className="text-[10px] text-quantum-fgMuted mt-1.5 leading-tight">{card.sub}</p>
              )}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
