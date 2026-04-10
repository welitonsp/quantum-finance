import React, { useMemo, memo } from 'react';
import { Activity, Info, TrendingUp, TrendingDown } from 'lucide-react';

export const KpiRow = memo(({ savingsRate, debtRatio, goalProgress, patrimonyRisk }) => {
  const kpis = useMemo(() => [
    { label: 'Taxa de Poupança',  val: Math.min(savingsRate, 100),   disp: `${savingsRate.toFixed(1)}%`,   good: savingsRate >= 20,   warn: savingsRate >= 10, tooltip: 'Percentual da renda que você poupa mensalmente. Meta mínima: 20%.' },
    { label: 'Comprometimento',   val: Math.min(debtRatio, 100),     disp: `${debtRatio.toFixed(0)}%`,     good: debtRatio <= 40,      warn: debtRatio <= 70, tooltip: 'Percentual da renda comprometido com despesas. Ideal: abaixo de 40%.' },
    { label: 'Progresso da Meta', val: Math.min(goalProgress, 100),  disp: `${goalProgress.toFixed(0)}%`,  good: goalProgress >= 80,  warn: goalProgress >= 50, tooltip: 'Quanto você já atingiu da sua meta de poupança mensal.' },
    { label: 'Risco Patrimonial', val: Math.min(patrimonyRisk, 100), disp: `${patrimonyRisk.toFixed(0)}%`, good: patrimonyRisk <= 30, warn: patrimonyRisk <= 80, tooltip: 'Relação entre dívidas e patrimônio total. Quanto menor, melhor.' },
  ], [savingsRate, debtRatio, goalProgress, patrimonyRisk]);

  const barColor = (good, warn) => good ? 'bg-emerald-500' : warn ? 'bg-amber-500' : 'bg-red-500';
  const textColor = (good, warn) => good ? 'text-emerald-400' : warn ? 'text-amber-400' : 'text-red-400';

  return (
    <div className="bg-slate-900/40 backdrop-blur-sm rounded-2xl p-6 border border-white/10">
      <div className="flex items-center gap-2 mb-5">
        <Activity className="w-5 h-5 text-cyan-400" />
        <h2 className="text-sm font-bold text-white uppercase tracking-widest">Indicadores de Saúde Financeira</h2>
        <Info className="w-4 h-4 text-slate-500 cursor-help" title="Métricas que avaliam sua saúde financeira com base nos dados inseridos." />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {kpis.map((kpi, i) => (
          <div key={i} className="flex flex-col gap-2 group">
            <div className="flex justify-between items-baseline">
              <div className="flex items-center gap-1">
                <span className="text-sm text-slate-400 font-medium">{kpi.label}</span>
                <Info className="w-3 h-3 text-slate-600 cursor-help" title={kpi.tooltip} />
              </div>
              <span className={`text-base font-bold font-mono tabular-nums ${textColor(kpi.good, kpi.warn)}`}>{kpi.disp}</span>
            </div>
            <div className="h-2.5 bg-slate-800 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-1000 ${barColor(kpi.good, kpi.warn)}`}
                   style={{ width: `${kpi.val}%` }} />
            </div>
            <div className="flex justify-between text-[10px] text-slate-500 mt-1">
              <span>Meta: {kpi.good ? 'Excelente' : kpi.warn ? 'Atenção' : 'Crítico'}</span>
              <span className="flex items-center gap-0.5">
                {kpi.good ? <TrendingUp className="w-3 h-3 text-emerald-500" /> : <TrendingDown className="w-3 h-3 text-red-500" />}
                {kpi.good ? '+5%' : '-2%'} vs meta
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});