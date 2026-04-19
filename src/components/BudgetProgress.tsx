// src/components/BudgetProgress.tsx
import { useEffect, useRef } from 'react';
import { Target, AlertTriangle, CheckCircle2, TrendingUp, Sparkles } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import toast from 'react-hot-toast';

interface BudgetProgressProps {
  totalExpenses: number;
  monthlyGoal: number;
  onSetGoal: () => void;
}

export default function BudgetProgress({ totalExpenses, monthlyGoal, onSetGoal }: BudgetProgressProps) {
  const prevLevelRef = useRef(0);

  const percentage       = monthlyGoal > 0 ? (totalExpenses / monthlyGoal) * 100 : 0;
  const cappedPercentage = Math.min(percentage, 100);

  useEffect(() => {
    if (monthlyGoal === 0) { prevLevelRef.current = 0; return; }

    let currentLevel = 0;
    if (percentage >= 100) currentLevel = 2;
    else if (percentage >= 80) currentLevel = 1;

    if (currentLevel === 2 && prevLevelRef.current < 2) {
      toast.error('Alerta Vermelho: Teto de gastos ultrapassado! Consulte a IA para otimizar.', {
        duration: 6000, style: { background: '#ef4444', color: '#fff', fontWeight: 'bold' },
      });
    } else if (currentLevel === 1 && prevLevelRef.current < 1) {
      toast('Atenção: Atingiu 80% do seu orçamento mensal.', {
        icon: '⚠️', duration: 5000, style: { background: '#f59e0b', color: '#fff', fontWeight: 'bold' },
      });
    }
    prevLevelRef.current = currentLevel;
  }, [percentage, monthlyGoal]);

  let progressColor = 'from-emerald-400 to-emerald-500';
  let bgGlow        = 'shadow-emerald-500/50';
  let textColor     = 'text-emerald-600 dark:text-emerald-400';
  let Icon: LucideIcon = CheckCircle2;

  if (percentage >= 100) {
    progressColor = 'from-red-500 to-red-600'; bgGlow = 'shadow-red-500/50';
    textColor = 'text-red-600 dark:text-red-400'; Icon = AlertTriangle;
  } else if (percentage >= 80) {
    progressColor = 'from-orange-400 to-orange-500'; bgGlow = 'shadow-orange-500/50';
    textColor = 'text-orange-600 dark:text-orange-400'; Icon = TrendingUp;
  }

  return (
    <div className="glass-card-quantum p-6 relative overflow-hidden transition-all duration-300">
      <div className={`absolute -right-10 -top-10 w-32 h-32 blur-3xl rounded-full opacity-10 dark:opacity-20 ${percentage >= 80 ? (percentage >= 100 ? 'bg-red-500' : 'bg-orange-500') : 'bg-emerald-500'}`} />

      <div className="relative z-10">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-4 gap-4">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/5 shadow-sm dark:shadow-none ${textColor} transition-colors`}>
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-800 dark:text-white uppercase tracking-wider flex items-center gap-2 transition-colors">
                Teto de Gastos
                {monthlyGoal === 0 && <Sparkles className="w-4 h-4 text-cyan-500 dark:text-cyan-400 animate-pulse" />}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {monthlyGoal > 0 ? 'Monitorização ativa do seu orçamento.' : 'Defina uma meta para ativar a IA.'}
              </p>
            </div>
          </div>
          <button onClick={onSetGoal} className="px-4 py-2 bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-white text-xs font-bold uppercase tracking-widest rounded-xl transition-all border border-slate-200 dark:border-white/10 hover:border-cyan-500/50 shadow-sm dark:shadow-none whitespace-nowrap">
            {monthlyGoal > 0 ? 'Ajustar Limite' : 'Definir Limite'}
          </button>
        </div>

        {monthlyGoal > 0 ? (
          <div className="mt-6">
            <div className="flex justify-between items-end mb-2">
              <span className={`text-2xl font-black tracking-tight ${textColor} transition-colors`}>{percentage.toFixed(1)}%</span>
              <div className="text-right">
                <span className="text-slate-800 dark:text-white font-black block transition-colors">
                  R$ {totalExpenses.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
                <span className="text-slate-500 text-xs font-bold">
                  de R$ {monthlyGoal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
            <div className="h-4 w-full bg-slate-200 dark:bg-slate-900/80 rounded-full overflow-hidden border border-slate-300 dark:border-white/5 shadow-inner transition-colors">
              <div
                className={`h-full rounded-full bg-gradient-to-r ${progressColor} shadow-[0_0_10px_rgba(0,0,0,0.2)] dark:shadow-[0_0_10px_rgba(0,0,0,0.5)] ${bgGlow} transition-all duration-1000 ease-out relative`}
                style={{ width: `${cappedPercentage}%` }}
              >
                <div className="absolute top-0 left-0 bottom-0 w-full bg-gradient-to-r from-transparent via-white/40 dark:via-white/20 to-transparent -translate-x-full animate-[shimmer_2s_infinite]" />
              </div>
            </div>
            {percentage >= 100 && (
              <p className="text-xs text-red-600 dark:text-red-400 font-bold mt-3 flex items-center gap-1.5 bg-red-50 dark:bg-red-500/10 p-2 rounded-lg border border-red-200 dark:border-red-500/20 transition-colors">
                <AlertTriangle className="w-4 h-4" /> Atenção: Limite mensal excedido!
              </p>
            )}
          </div>
        ) : (
          <div className="mt-4 p-4 border border-dashed border-slate-300 dark:border-white/10 rounded-2xl text-center bg-slate-50 dark:bg-slate-900/30 transition-colors">
            <Target className="w-8 h-8 text-slate-400 dark:text-slate-600 mx-auto mb-2" />
            <p className="text-sm font-bold text-slate-500 dark:text-slate-400">Nenhum orçamento definido para este mês.</p>
          </div>
        )}
      </div>
    </div>
  );
}
