import { useState, useMemo } from 'react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { Target, Filter, AlertCircle } from 'lucide-react';
import TrendsChart from '../features/reports/TrendsChart';

type AnyRecord = Record<string, unknown>;

interface ReportsContentProps {
  transactions: AnyRecord[];
}

interface ParetoEntry {
  name: string;
  valor: number;
  pctAcumulada: number;
  isTop80: boolean;
}

const formatCurrency = (val: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

export default function ReportsContent({ transactions }: ReportsContentProps) {
  const [activeTab, setActiveTab] = useState<'pareto' | 'tendencias'>('pareto');

  const paretoData = useMemo((): ParetoEntry[] => {
    if (!transactions || transactions.length === 0) return [];

    const catTotals: Record<string, number> = {};
    let totalDespesas = 0;

    transactions.forEach(t => {
      if (t.type === 'saida' || t.type === 'despesa') {
        const cat = (t.category as string) || 'Diversos';
        const val = Math.abs(Number(t.value));
        catTotals[cat] = (catTotals[cat] ?? 0) + val;
        totalDespesas += val;
      }
    });

    const sorted = Object.entries(catTotals).sort((a, b) => b[1] - a[1]);

    let acumulado = 0;
    return sorted.map(([name, value]) => {
      acumulado += value;
      return {
        name,
        valor: Number(value.toFixed(2)),
        pctAcumulada: Number(((acumulado / totalDespesas) * 100).toFixed(1)),
        isTop80: ((acumulado / totalDespesas) * 100) <= 80.1,
      };
    });
  }, [transactions]);

  const topCategoriesCount = paretoData.filter(d => d.isTop80).length;

  return (
    <div className="space-y-6 md:space-y-8 animate-in fade-in duration-500 relative z-10">

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-800 dark:text-white tracking-tight">Business Intelligence</h2>
          <p className="text-xs text-slate-500 dark:text-quantum-fgMuted mt-1">Análises profundas para otimização de património.</p>
        </div>
      </div>

      <div className="flex gap-4 md:gap-8 border-b border-slate-200 dark:border-quantum-border overflow-x-auto custom-scrollbar">
        <button
          onClick={() => setActiveTab('pareto')}
          className={`pb-4 text-sm md:text-base font-bold tracking-widest uppercase transition-all border-b-2 whitespace-nowrap ${activeTab === 'pareto' ? 'border-quantum-accent text-quantum-accent' : 'border-transparent text-quantum-fgMuted hover:text-white'}`}
        >
          Análise Pareto (80/20)
        </button>
        <button
          onClick={() => setActiveTab('tendencias')}
          className={`pb-4 text-sm md:text-base font-bold tracking-widest uppercase transition-all border-b-2 whitespace-nowrap ${activeTab === 'tendencias' ? 'border-cyan-500 text-cyan-400' : 'border-transparent text-quantum-fgMuted hover:text-white'}`}
        >
          Tendências Históricas
        </button>
      </div>

      {activeTab === 'pareto' && (
        <div className="space-y-6 animate-in slide-in-from-bottom-4">
          <div className="bg-quantum-card border border-quantum-border rounded-3xl p-6 md:p-8 shadow-lg relative overflow-hidden">
            <div className="absolute top-0 right-0 w-96 h-96 bg-quantum-accent/5 rounded-full blur-3xl pointer-events-none" />

            <div className="flex items-start gap-4 mb-8">
              <div className="p-3 bg-quantum-accent/10 rounded-2xl">
                <Filter className="w-6 h-6 text-quantum-accent" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Regra 80/20 (Princípio de Pareto)</h3>
                <p className="text-sm text-quantum-fgMuted mt-1 max-w-2xl">
                  Identifique os ralos de dinheiro. O gráfico mostra as despesas ordenadas da maior para a menor. A linha amarela representa a acumulação dos gastos até chegar a 100%.
                </p>
              </div>
            </div>

            {paretoData.length > 0 ? (
              <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">
                <div className="xl:col-span-3 h-[400px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={paretoData} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1E2A3F" vertical={false} />
                      <XAxis dataKey="name" stroke="#64748B" fontSize={10} tickLine={false} axisLine={false} dy={10} />
                      <YAxis yAxisId="left" stroke="#64748B" fontSize={10} tickFormatter={(val: number) => `R$ ${val >= 1000 ? (val / 1000).toFixed(1) + 'k' : val}`} tickLine={false} axisLine={false} />
                      <YAxis yAxisId="right" orientation="right" stroke="#F59E0B" fontSize={10} tickFormatter={(val: number) => `${val}%`} tickLine={false} axisLine={false} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#131A2A', borderColor: '#1E2A3F', borderRadius: '12px', color: '#fff' }}
                        itemStyle={{ color: '#E8ECF4' }}
                        formatter={(value: number, name: string) => {
                          if (name === 'valor') return [formatCurrency(value), 'Gasto Bruto'];
                          if (name === 'pctAcumulada') return [`${value}%`, 'Acumulado'];
                          return [value, name];
                        }}
                      />
                      <Bar yAxisId="left" dataKey="valor" radius={[6, 6, 0, 0]} maxBarSize={60}>
                        {paretoData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.isTop80 ? '#EF4444' : '#3B82F6'} fillOpacity={entry.isTop80 ? 0.8 : 0.4} />
                        ))}
                      </Bar>
                      <Line yAxisId="right" type="monotone" dataKey="pctAcumulada" stroke="#F59E0B" strokeWidth={3} dot={{ r: 4, fill: '#131A2A', stroke: '#F59E0B', strokeWidth: 2 }} activeDot={{ r: 6, fill: '#F59E0B' }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>

                <div className="xl:col-span-1 flex flex-col gap-4">
                  <div className="bg-quantum-bgSecondary border border-quantum-border p-5 rounded-2xl">
                    <div className="flex items-center gap-2 mb-2">
                      <Target className="w-4 h-4 text-quantum-red" />
                      <p className="text-xs font-bold uppercase text-quantum-red tracking-wider">Atenção Crítica</p>
                    </div>
                    <p className="text-3xl font-black text-white">{topCategoriesCount}</p>
                    <p className="text-sm text-quantum-fgMuted mt-1 leading-tight">
                      categorias são responsáveis por <span className="text-white font-bold">80%</span> de todos os seus gastos deste mês.
                    </p>
                  </div>

                  <div className="flex-1 bg-quantum-bgSecondary border border-quantum-border p-5 rounded-2xl overflow-y-auto custom-scrollbar max-h-[250px]">
                    <p className="text-xs font-bold uppercase text-quantum-fgMuted tracking-wider mb-4">Top Ralos Financeiros</p>
                    <div className="space-y-3">
                      {paretoData.filter(d => d.isTop80).map((cat, i) => (
                        <div key={i} className="flex justify-between items-center pb-3 border-b border-white/5 last:border-0 last:pb-0">
                          <div>
                            <p className="text-sm font-bold text-white">{cat.name}</p>
                            <p className="text-[10px] text-quantum-red font-medium">{cat.pctAcumulada}% acumulado</p>
                          </div>
                          <p className="text-sm font-bold text-quantum-fgMuted">{formatCurrency(cat.valor)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-12 border-2 border-dashed border-quantum-border rounded-2xl">
                <AlertCircle className="w-12 h-12 text-quantum-fgMuted mx-auto mb-3" />
                <h3 className="text-lg font-bold text-white">Sem dados suficientes</h3>
                <p className="text-sm text-quantum-fgMuted">Importe mais faturas para o sistema calcular o Princípio de Pareto.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'tendencias' && (
        <div className="animate-in slide-in-from-bottom-4">
          <TrendsChart transactions={transactions} />
        </div>
      )}
    </div>
  );
}
