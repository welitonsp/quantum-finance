import type { ComponentType } from 'react';
import { motion } from 'framer-motion';
import CountUp from 'react-countup';
import { ArrowRightLeft, TrendingDown, TrendingUp } from 'lucide-react';

import { HealthGauge } from '../HealthGauge';
import { SparkLine } from '../SparkLine';
import type { Transaction } from '../../shared/types/transaction';

interface DashboardHeroProps {
  saldo: number;
  receitas: number;
  despesas: number;
  incomeDelta: number;
  score: number;
  color: string;
  status: string;
  rec: string;
  glowColor: string;
  badgeColor: string;
  StatusIcon: ComponentType<{ className?: string }>;
  txSet: Transaction[];
  onNewTransaction: () => void;
}

const heroVariants = {
  hidden:  { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 80, damping: 15 } },
};

export function DashboardHero({
  saldo,
  receitas,
  despesas,
  incomeDelta,
  score,
  color,
  status,
  rec,
  glowColor,
  badgeColor,
  StatusIcon,
  txSet,
  onNewTransaction,
}: DashboardHeroProps) {
  return (
    <motion.div variants={heroVariants} className="relative bg-quantum-card/40 backdrop-blur-xl border border-quantum-border rounded-3xl p-6 md:p-8 overflow-hidden transition-all hover:shadow-2xl">
      <div className={`absolute top-0 right-0 w-[500px] h-[500px] blur-[100px] opacity-20 rounded-full ${glowColor} -translate-y-1/2 translate-x-1/3 animate-slow-rotate`} />

      <div className="relative z-10 flex flex-col xl:flex-row gap-8">
        <div className="flex items-start gap-6 flex-1">
          <HealthGauge score={score} color={color} />
          <div className="flex-1">
            <p className="text-quantum-fgMuted font-bold uppercase text-xs tracking-wider mb-1">Saldo em Caixa</p>
            <div className="flex flex-wrap items-baseline gap-3 mb-3">
              <h1 className="text-4xl md:text-5xl font-black text-quantum-fg tracking-tighter font-mono">
                <CountUp end={saldo} duration={2} separator="." decimal="," decimals={2} prefix="R$ " />
              </h1>
              <div className={`flex items-center gap-1 text-sm font-bold px-3 py-1.5 rounded-xl ${incomeDelta >= 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                {incomeDelta >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                {Math.abs(incomeDelta).toFixed(1)}% retidos
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 mb-4">
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold border ${badgeColor}`}>
                <StatusIcon className="w-4 h-4" />
                {status}
              </div>
            </div>

            <div className={`p-3 bg-quantum-bg/80 border border-quantum-border rounded-xl border-l-4 ${color === 'emerald' ? 'border-l-emerald-500' : color === 'amber' ? 'border-l-amber-500' : 'border-l-red-500'}`}>
              <span className="font-bold text-quantum-fg uppercase text-[10px] tracking-wider mr-2">Status Operacional:</span>
              <span className="text-quantum-fg text-sm">{rec}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-end gap-3 xl:min-w-[260px]">
          <div className="flex flex-col items-end gap-1">
            <span className="text-[9px] font-bold text-quantum-fgMuted uppercase tracking-wider">Tendência 6M</span>
            <SparkLine transactions={txSet} />
          </div>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onNewTransaction}
            aria-label="Nova transação"
            className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 rounded-xl font-bold text-white text-sm transition-shadow focus:outline-none focus:ring-2 focus:ring-cyan-500/50 shadow-lg shadow-cyan-500/20"
          >
            <ArrowRightLeft className="w-4 h-4" />
            Nova Movimentação
          </motion.button>
          <div className="grid grid-cols-2 gap-3 w-full">
            <div className="bg-quantum-card border border-quantum-border rounded-xl p-3 text-center">
              <p className="text-[9px] uppercase text-quantum-fgMuted mb-1">Entradas (Mês)</p>
              <p className="text-sm font-bold text-emerald-400 font-mono">
                <CountUp end={receitas} duration={2} separator="." decimal="," decimals={2} prefix="R$ " />
              </p>
            </div>
            <div className="bg-quantum-card border border-quantum-border rounded-xl p-3 text-center">
              <p className="text-[9px] uppercase text-quantum-fgMuted mb-1">Saídas (Mês)</p>
              <p className="text-sm font-bold text-red-400 font-mono">
                <CountUp end={despesas} duration={2} separator="." decimal="," decimals={2} prefix="R$ " />
              </p>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
