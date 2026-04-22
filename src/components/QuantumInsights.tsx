import { TriangleAlert, ShieldAlert, Target, TrendingUp, Info, BrainCircuit, type LucideIcon } from 'lucide-react';
import type { FinancialMetrics } from '../hooks/useFinancialMetrics';

interface Props {
  metrics: FinancialMetrics | null;
  loading: boolean;
}

interface Insight {
  icon: LucideIcon;
  color: string;
  bg: string;
  title: string;
  desc: string;
}

export default function QuantumInsights({ metrics, loading }: Props) {
  if (loading || !metrics) return null;

  const insights: Insight[] = [];

  if (metrics.taxaPoupanca < 10 && metrics.receita > 0) {
    insights.push({
      icon:  TriangleAlert,
      color: 'text-quantum-red',
      bg:    'bg-red-500/10',
      title: 'Taxa de Poupança Crítica',
      desc:  `A sua taxa de poupança (${metrics.taxaPoupanca.toFixed(1)}%) está abaixo do limite seguro de 20%. Reveja os seus gastos supérfluos.`,
    });
  }

  if (metrics.endividamento > 50) {
    insights.push({
      icon:  ShieldAlert,
      color: 'text-quantum-red',
      bg:    'bg-red-500/10',
      title: 'Endividamento Alto',
      desc:  `${metrics.endividamento.toFixed(1)}% do seu património está corroído por dívidas. Pare de usar crédito e priorize abater o passivo.`,
    });
  }

  if (metrics.reservaMeses < 3 && metrics.despesa > 0) {
    insights.push({
      icon:  ShieldAlert,
      color: 'text-orange-400',
      bg:    'bg-orange-500/10',
      title: 'Reserva de Sobrevivência Baixa',
      desc:  `Os seus ativos líquidos cobrem apenas ${metrics.reservaMeses.toFixed(1)} meses do seu custo de vida. Tente acumular até chegar aos 6 meses.`,
    });
  }

  if (metrics.comprometimento > 35) {
    insights.push({
      icon:  Target,
      color: 'text-orange-400',
      bg:    'bg-orange-500/10',
      title: 'Comprometimento de Renda',
      desc:  `${metrics.comprometimento.toFixed(1)}% do seu salário já está gasto em assinaturas e contas fixas. Evite assumir novas mensalidades.`,
    });
  }

  if (metrics.receita > metrics.despesa && metrics.taxaPoupanca >= 20 && metrics.endividamento < 30) {
    insights.push({
      icon:  TrendingUp,
      color: 'text-quantum-accent',
      bg:    'bg-emerald-500/10',
      title: 'Saúde Financeira de Elite',
      desc:  'Excelente disciplina! Tem superávit, guarda uma ótima fatia do salário e tem a dívida controlada. Continue a investir.',
    });
  }

  if (insights.length === 0) {
    insights.push({
      icon:  Info,
      color: 'text-cyan-400',
      bg:    'bg-cyan-500/10',
      title: 'A Alimentar o Motor Quântico',
      desc:  'Continue a registar as suas contas, transações e despesas fixas para a Inteligência Artificial gerar diagnósticos precisos.',
    });
  }

  return (
    <div className="relative mt-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="bg-quantum-card border border-quantum-border rounded-3xl p-6 relative overflow-hidden shadow-lg">
        <div className="absolute top-0 right-0 w-64 h-64 bg-quantum-purple/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex items-center gap-4 mb-6 relative z-10">
          <div className="w-12 h-12 rounded-2xl bg-quantum-purple/20 flex items-center justify-center border border-quantum-purple/30 shadow-[0_0_15px_rgba(168,85,247,0.2)]">
            <BrainCircuit className="w-6 h-6 text-quantum-purple" />
          </div>
          <div>
            <h3 className="text-xl font-black text-quantum-fg tracking-tight">Diagnóstico Quântico</h3>
            <p className="text-xs text-quantum-fgMuted mt-1">Análise em tempo real do seu perfil financeiro.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 relative z-10">
          {insights.map((item, i) => (
            <div key={i} className="flex gap-4 items-start bg-quantum-bgSecondary/60 border border-quantum-border hover:border-quantum-border transition-colors p-4 rounded-2xl">
              <div className={`p-2.5 rounded-xl ${item.bg} ${item.color} shrink-0`}>
                <item.icon className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-quantum-fg mb-1.5">{item.title}</h4>
                <p className="text-xs text-quantum-fgMuted leading-relaxed">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
