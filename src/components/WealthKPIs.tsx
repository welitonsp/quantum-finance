import { PiggyBank, Scale, ShieldAlert, Target } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { FinancialMetrics } from '../hooks/useFinancialMetrics';

interface Props {
  metrics: FinancialMetrics;
  loading: boolean;
}

export default function WealthKPIs({ metrics, loading }: Props) {
  if (loading) return <div className="h-24 bg-quantum-card border border-quantum-border rounded-2xl animate-pulse" />;

  const { taxaPoupanca, endividamento, comprometimento, reservaMeses } = metrics;

  const getStatusColor = (val: number, good: number, warn: number, isInverse = false): string => {
    if (isInverse) {
      return val <= good ? 'text-quantum-accent bg-emerald-500/10' : val <= warn ? 'text-orange-400 bg-orange-500/10' : 'text-quantum-red bg-red-500/10';
    }
    return val >= good ? 'text-quantum-accent bg-emerald-500/10' : val >= warn ? 'text-orange-400 bg-orange-500/10' : 'text-quantum-red bg-red-500/10';
  };

  const kpis: { title: string; value: string; desc: string; icon: LucideIcon; colorClass: string; ideal: string }[] = [
    { title: 'Taxa de Poupança',  value: `${taxaPoupanca.toFixed(1)}%`,  desc: 'Do salário guardado',        icon: PiggyBank,  colorClass: getStatusColor(taxaPoupanca,  20, 10, false), ideal: 'Ideal: > 20%'     },
    { title: 'Índice de Dívida',  value: `${endividamento.toFixed(1)}%`, desc: 'Património comprometido',    icon: Scale,      colorClass: getStatusColor(endividamento, 30, 50, true),  ideal: 'Ideal: < 30%'     },
    { title: 'Comprometimento',   value: `${comprometimento.toFixed(1)}%`, desc: 'Salário vs Custos Fixos', icon: Target,     colorClass: getStatusColor(comprometimento, 35, 50, true), ideal: 'Ideal: < 35%'     },
    { title: 'Sobrevivência',     value: `${reservaMeses.toFixed(1)} m`, desc: 'Meses de Reserva',          icon: ShieldAlert, colorClass: getStatusColor(reservaMeses,  6, 3, false),  ideal: 'Ideal: > 6 meses' },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {kpis.map((kpi, i) => (
        <div key={i} className="bg-quantum-card border border-quantum-border rounded-2xl p-4 md:p-5 relative overflow-hidden group hover:border-quantum-accent/50 transition-colors shadow-sm hover:shadow-[0_0_20px_rgba(0,230,138,0.05)]">
          <div className="absolute -right-6 -top-6 w-24 h-24 bg-white/5 rounded-full blur-2xl group-hover:bg-quantum-accent/10 transition-colors pointer-events-none" />
          <div className="flex justify-between items-start mb-3 md:mb-4">
            <p className="text-[10px] md:text-xs font-bold text-quantum-fgMuted uppercase tracking-widest">{kpi.title}</p>
            <div className={`p-2 rounded-xl ${kpi.colorClass}`}><kpi.icon className="w-4 h-4 md:w-5 md:h-5" /></div>
          </div>
          <div>
            <h4 className="text-xl md:text-2xl font-black text-white tracking-tight">{kpi.value}</h4>
            <p className="text-[10px] md:text-xs text-quantum-fg mt-1 font-medium">{kpi.desc}</p>
            <p className="text-[9px] text-quantum-fgMuted mt-0.5">{kpi.ideal}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
