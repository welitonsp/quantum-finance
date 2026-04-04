import React, { useState, useMemo } from 'react';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Target, Filter, TrendingDown, AlertCircle, Calendar, Scissors, Sparkles, AlertTriangle } from 'lucide-react';
import Decimal from 'decimal.js';
import { formatCurrency } from '../../utils/formatters';

const CATEGORIAS_FIXAS = ['Moradia', 'Assinaturas', 'Educação', 'Impostos/Taxas', 'Saúde'];

export default function ReportsContent({ transactions }) {
  const [activeTab, setActiveTab] = useState('pareto');
  const [timeFilter, setTimeFilter] = useState('30d'); 
  const [expenseFilter, setExpenseFilter] = useState('all'); 
  const [showAIInsights, setShowAIInsights] = useState(false);

  const paretoData = useMemo(() => {
    if (!transactions || transactions.length === 0) return [];
    
    const catTotals = {};
    let totalDespesas = new Decimal(0);
    const agora = new Date();

    transactions.forEach(t => {
      if (t.type === 'saida' || t.type === 'despesa') {
        
        const txDate = new Date(t.date || t.createdAt);
        const diffDias = (agora - txDate) / (1000 * 60 * 60 * 24);
        
        if (timeFilter === '30d' && diffDias > 30) return;
        if (timeFilter === '90d' && diffDias > 90) return;
        if (timeFilter === '180d' && diffDias > 180) return;

        const cat = t.category || 'Diversos';
        if (expenseFilter === 'variables' && CATEGORIAS_FIXAS.includes(cat)) return;

        const val = new Decimal(Math.abs(Number(t.value || 0)));
        
        catTotals[cat] = catTotals[cat] 
          ? new Decimal(catTotals[cat]).plus(val).toNumber() 
          : val.toNumber();
          
        totalDespesas = totalDespesas.plus(val);
      }
    });

    const sorted = Object.entries(catTotals).sort((a, b) => b[1] - a[1]);
    const totalFloat = totalDespesas.toNumber();
    
    let acumulado = 0;
    return sorted.map(([name, value], index) => {
      acumulado += value;
      return {
        name,
        valor: Number(value.toFixed(2)),
        pctIndividual: totalFloat > 0 ? Number(((value / totalFloat) * 100).toFixed(1)) : 0,
        pctAcumulada: totalFloat > 0 ? Number(((acumulado / totalFloat) * 100).toFixed(1)) : 0,
        isTop80: totalFloat > 0 && ((acumulado / totalFloat) * 100) <= 80.1,
        rank: index + 1
      };
    });
  }, [transactions, timeFilter, expenseFilter]);

  const topCategoriesCount = paretoData.filter(d => d.isTop80).length;
  const top80Value = paretoData
    .filter(d => d.isTop80)
    .reduce((sum, item) => sum + item.valor, 0);

  // INSIGHTS SIMULADOS (Preparados para receber Gemini real no Backend)
  const aiInsights = useMemo(() => {
    if (paretoData.length === 0) return [];
    const topCategory = paretoData[0];
    return [
      `Os seus ${topCategoriesCount} maiores ralos representam ${formatCurrency(top80Value)} dos gastos neste período.`,
      `A categoria "${topCategory.name}" sozinha consome ${topCategory.pctIndividual}% do seu dinheiro. Recomendo revisão prioritária.`,
      `Foco Tático: Reduzir 20% em "${topCategory.name}" gera uma economia imediata de ${formatCurrency(topCategory.valor * 0.2)}.`
    ];
  }, [paretoData, topCategoriesCount, top80Value]);

  return (
    <div className="space-y-6 md:space-y-8 animate-in fade-in duration-500 relative z-10">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-800 dark:text-white tracking-tight">Business Intelligence</h2>
          <p className="text-xs text-slate-500 mt-1">Análises profundas para otimização de património.</p>
        </div>
      </div>

      <div className="flex gap-4 md:gap-8 border-b border-white/10 overflow-x-auto custom-scrollbar">
        <button onClick={() => setActiveTab('pareto')} className={`pb-4 text-sm font-bold tracking-widest uppercase transition-all border-b-2 whitespace-nowrap ${activeTab === 'pareto' ? 'border-quantum-accent text-quantum-accent' : 'border-transparent text-slate-500 hover:text-white'}`}>Análise Pareto (80/20)</button>
        <button onClick={() => setActiveTab('tendencias')} className={`pb-4 text-sm font-bold tracking-widest uppercase transition-all border-b-2 whitespace-nowrap ${activeTab === 'tendencias' ? 'border-cyan-500 text-cyan-400' : 'border-transparent text-slate-500 hover:text-white'}`}>Tendências (Em Breve)</button>
      </div>

      {activeTab === 'pareto' && (
        <div className="space-y-6 animate-in slide-in-from-bottom-4">
          <div className="bg-quantum-card border border-quantum-border rounded-3xl p-6 shadow-lg relative overflow-hidden">
            
            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 mb-8">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-quantum-accent/10 rounded-2xl"><Filter className="w-6 h-6 text-quantum-accent" /></div>
                <div>
                  <h3 className="text-lg font-bold text-white">Regra 80/20 (Princípio de Pareto)</h3>
                  <p className="text-sm text-slate-500 mt-1 max-w-lg">Identifique os ralos de dinheiro com precisão matemática.</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 bg-slate-900/50 p-2 rounded-2xl border border-white/5">
                <div className="flex items-center gap-1 bg-slate-950/50 p-1 rounded-xl border border-white/5">
                  <Calendar className="w-4 h-4 text-slate-500 ml-2" />
                  <select value={timeFilter} onChange={(e) => setTimeFilter(e.target.value)} className="bg-transparent text-xs font-bold text-slate-300 px-2 py-1.5 focus:outline-none cursor-pointer">
                    <option value="30d">Últimos 30 Dias</option>
                    <option value="90d">Últimos 3 Meses</option>
                    <option value="180d">Últimos 6 Meses</option>
                    <option value="all">Todo o Histórico</option>
                  </select>
                </div>
                <div className="flex items-center gap-1 bg-slate-950/50 p-1 rounded-xl border border-white/5">
                  <Scissors className="w-4 h-4 text-slate-500 ml-2" />
                  <select value={expenseFilter} onChange={(e) => setExpenseFilter(e.target.value)} className="bg-transparent text-xs font-bold text-slate-300 px-2 py-1.5 focus:outline-none cursor-pointer">
                    <option value="all">Todas as Despesas</option>
                    <option value="variables">Apenas Variáveis (Cortáveis)</option>
                  </select>
                </div>
              </div>
            </div>

            {paretoData.length > 0 ? (
              <>
                <div className="flex justify-end mb-4">
                  <button
                    onClick={() => setShowAIInsights(!showAIInsights)}
                    className="flex items-center gap-2 px-5 py-2.5 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 rounded-xl text-sm font-bold text-indigo-400 transition-all"
                  >
                    <Sparkles className="w-4 h-4" />
                    Ver Dicas da IA
                  </button>
                </div>

                <div className="h-[400px] w-full mb-8">
                  <ResponsiveContainer w="100%" height="100%">
                    <ComposedChart data={paretoData} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1E2A3F" vertical={false} />
                      <XAxis dataKey="name" stroke="#64748B" fontSize={10} tickLine={false} axisLine={false} dy={10} />
                      <YAxis yAxisId="left" stroke="#64748B" fontSize={10} tickFormatter={(val) => `R$ ${val >= 1000 ? (val/1000).toFixed(1)+'k' : val}`} tickLine={false} axisLine={false} />
                      <YAxis yAxisId="right" orientation="right" stroke="#F59E0B" fontSize={10} tickFormatter={(val) => `${val}%`} tickLine={false} axisLine={false} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#131A2A', borderColor: '#1E2A3F', borderRadius: '12px', color: '#fff' }}
                        formatter={(value, name) => {
                          if (name === 'valor') return [formatCurrency(value), 'Gasto Bruto'];
                          if (name === 'pctAcumulada') return [`${value}%`, 'Acumulado'];
                          return [value, name];
                        }}
                      />
                      <Bar yAxisId="left" dataKey="valor" radius={[6, 6, 0, 0]} maxBarSize={60}>
                        {paretoData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.isTop80 ? '#EF4444' : '#3B82F6'} fillOpacity={entry.isTop80 ? 0.8 : 0.4} />)}
                      </Bar>
                      <Line yAxisId="right" type="monotone" dataKey="pctAcumulada" stroke="#F59E0B" strokeWidth={3} dot={{ r: 4, fill: '#131A2A', stroke: '#F59E0B', strokeWidth: 2 }} activeDot={{ r: 6, fill: '#F59E0B' }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>

                {/* INSIGHTS DA IA */}
                {showAIInsights && (
                  <div className="mb-8 p-6 bg-slate-900/80 border border-indigo-500/30 rounded-2xl animate-in slide-in-from-top-4">
                    <div className="flex items-center gap-3 mb-4">
                      <Sparkles className="w-5 h-5 text-indigo-400" />
                      <h4 className="font-bold text-indigo-400">Recomendações Quânticas da IA</h4>
                    </div>
                    <ul className="space-y-3 text-sm text-slate-300">
                      {aiInsights.map((insight, i) => (
                        <li key={i} className="flex gap-3">
                          <span className="text-indigo-500 mt-0.5">•</span>
                          <span>{insight}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* TABELA DE RALOS FINANCEIROS */}
                <div>
                  <h4 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-500" />
                    TOP RALOS FINANCEIROS ({topCategoriesCount} categorias = {formatCurrency(top80Value)})
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {paretoData.filter(d => d.isTop80).map((item, idx) => (
                      <div key={idx} className="flex justify-between items-center bg-slate-900/50 p-4 rounded-xl border border-red-500/20 hover:border-red-500/40 transition-colors">
                        <div>
                          <span className="font-bold text-white text-sm">#{item.rank} {item.name}</span>
                          <p className="text-xs text-red-400 mt-0.5">{item.pctAcumulada}% acumulado</p>
                        </div>
                        <div className="text-right">
                          <p className="font-mono font-bold text-white text-sm">{formatCurrency(item.valor)}</p>
                          <p className="text-xs text-slate-400 mt-0.5">{item.pctIndividual}% do total</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center py-12 border-2 border-dashed border-white/10 rounded-2xl">
                <AlertCircle className="w-12 h-12 text-slate-500 mx-auto mb-3" />
                <h3 className="text-lg font-bold text-white">Sem dados para este filtro</h3>
                <p className="text-sm text-slate-500 mt-2">Tente alargar o período ou mudar o tipo de despesa.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}