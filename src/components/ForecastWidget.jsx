import React, { useState, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Zap, Target, TrendingUp, ShieldAlert, AlertTriangle } from 'lucide-react';
import Decimal from 'decimal.js';

export default function ForecastWidget({ transactions, currentMonth, currentYear }) {
  const [activeCollapse, setActiveCollapse] = useState(null);

  const forecastData = useMemo(() => {
    if (!transactions || transactions.length === 0) return [];

    let totalReceitas = new Decimal(0);
    let totalDespesas = new Decimal(0);
    let saldoAtual = new Decimal(0);
    const mesesSet = new Set();

    transactions.forEach(t => {
      const val = new Decimal(Math.abs(Number(t.value || 0)));
      if (t.type === 'receita' || t.type === 'entrada') {
        totalReceitas = totalReceitas.plus(val);
        saldoAtual = saldoAtual.plus(val);
      } else {
        totalDespesas = totalDespesas.plus(val);
        saldoAtual = saldoAtual.minus(val);
      }
      if (t.date || t.createdAt) {
        const d = typeof t.date === 'string' ? t.date : new Date(t.createdAt).toISOString();
        mesesSet.add(d.substring(0, 7)); 
      }
    });

    const numMeses = Math.max(mesesSet.size, 1);
    const mediaReceita = totalReceitas.dividedBy(numMeses);
    const mediaDespesa = totalDespesas.dividedBy(numMeses);

    const fluxoBase = mediaReceita.minus(mediaDespesa);
    const fluxoPareto = mediaReceita.minus(mediaDespesa.times(0.8)); 
    const taxaJurosAgressiva = new Decimal(0.01); 

    const data = [];
    let saldoBase = saldoAtual;
    let saldoPareto = saldoAtual;
    let saldoAgressivo = saldoAtual;

    const nomeMeses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

    data.push({
      mes: 'Hoje',
      Base: saldoBase.toNumber(),
      Pareto: saldoPareto.toNumber(),
      Agressivo: saldoAgressivo.toNumber()
    });

    for (let i = 1; i <= 6; i++) {
      let mesIndex = (currentMonth - 1 + i) % 12;
      
      saldoBase = saldoBase.plus(fluxoBase);
      saldoPareto = saldoPareto.plus(fluxoPareto);
      
      const rendimento = saldoAgressivo.greaterThan(0) ? saldoAgressivo.times(taxaJurosAgressiva) : new Decimal(0);
      saldoAgressivo = saldoAgressivo.plus(fluxoPareto).plus(rendimento);

      data.push({
        mes: nomeMeses[mesIndex],
        Base: Number(saldoBase.toFixed(2)),
        Pareto: Number(saldoPareto.toFixed(2)),
        Agressivo: Number(saldoAgressivo.toFixed(2))
      });
    }

    return data;
  }, [transactions, currentMonth, currentYear]);

  const formatCurrency = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  const handleCollapse = (scenarioName) => setActiveCollapse(activeCollapse === scenarioName ? null : scenarioName);

  const scenarios = [
    { name: 'Base', key: 'Base', color: '#ef4444', icon: ShieldAlert, desc: 'Tendência atual.' },
    { name: 'Pareto', key: 'Pareto', color: '#10b981', icon: Target, desc: 'Cortando 20% gastos.' },
    { name: 'Agressivo', key: 'Agressivo', color: '#3b82f6', icon: TrendingUp, desc: 'Pareto + 1% mês.' }
  ];

  // AVISO DE CENÁRIO NEGATIVO
  const todosCenarioNegativos = forecastData.length > 0 && forecastData[forecastData.length - 1]?.Agressivo < 0;

  return (
    <div className="h-full flex flex-col p-4 md:p-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-400" /> Superposição Quântica
          </h2>
          <p className="text-xs text-slate-500 mt-1">Projeção de 6 meses. Clique num cenário para focar.</p>
        </div>
      </div>

      <div className="flex-1 min-h-[220px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={forecastData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1E2A3F" vertical={false} />
            <XAxis dataKey="mes" stroke="#64748B" fontSize={12} tickLine={false} axisLine={false} dy={10} />
            <YAxis stroke="#64748B" fontSize={10} tickFormatter={(val) => `R$ ${(val/1000).toFixed(0)}k`} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={{ backgroundColor: '#131A2A', borderColor: '#1E2A3F', borderRadius: '12px', color: '#fff' }} formatter={(value) => [formatCurrency(value), 'Património Projetado']} />
            <Legend wrapperStyle={{ paddingTop: '20px', fontSize: '12px' }} />
            {scenarios.map((scenario) => (
              <Line key={scenario.key} type="monotone" dataKey={scenario.key} name={scenario.name} stroke={scenario.color} strokeWidth={activeCollapse === scenario.name ? 4 : 2} strokeOpacity={activeCollapse && activeCollapse !== scenario.name ? 0.2 : 1} dot={activeCollapse === scenario.name ? { r: 6, fill: scenario.color, strokeWidth: 2, stroke: '#131A2A' } : false} activeDot={{ r: 8, fill: scenario.color }} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {todosCenarioNegativos && (
        <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs font-bold text-red-400 flex items-center justify-center gap-2 animate-pulse">
          <AlertTriangle className="w-4 h-4" />
          Aviso Crítico: Todos os cenários projetam falência técnica a 6 meses. Reduza despesas urgentemente.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
        {scenarios.map((s) => {
          const Icon = s.icon;
          const isActive = activeCollapse === s.name;
          return (
            <button key={s.name} onClick={() => handleCollapse(s.name)} className={`p-3 rounded-xl border text-left transition-all duration-300 ${isActive ? `bg-slate-800 shadow-lg scale-[1.02]` : 'bg-slate-900/50 border-white/5 hover:bg-slate-800/80 opacity-70 hover:opacity-100'}`} style={{ borderColor: isActive ? s.color : 'transparent' }}>
              <div className="flex items-center gap-2 mb-1"><Icon className="w-4 h-4" style={{ color: s.color }} /><span className="text-sm font-bold text-white">{s.name}</span></div>
              <p className="text-[10px] text-slate-400 leading-tight">{s.desc}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}