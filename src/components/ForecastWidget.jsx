// src/components/ForecastWidget.jsx
import { useMemo } from 'react';
import { AreaChart, Area, XAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { AlertTriangle, Zap } from 'lucide-react';
import { calculateForecast } from '../utils/forecastEngine';

export default function ForecastWidget({ transactions, currentMonth, currentYear }) {
  
  const forecast = useMemo(() => {
    return calculateForecast(transactions, currentMonth, currentYear);
  }, [transactions, currentMonth, currentYear]);

  const isCurrentMonth = new Date().getMonth() + 1 === currentMonth && new Date().getFullYear() === currentYear;

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-zinc-900 border border-zinc-700/50 p-3 rounded-xl shadow-xl backdrop-blur-md">
          <p className="text-zinc-400 text-xs font-bold uppercase tracking-wider mb-2">Dia {label}</p>
          {payload.map((entry, index) => {
            if (entry.value === null) return null;
            return (
              <div key={index} className="flex items-center gap-2 text-sm font-mono font-bold">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }}></span>
                <span className={entry.dataKey === 'real' ? 'text-zinc-100' : 'text-indigo-400'}>
                  {entry.dataKey === 'real' ? 'Gasto Real: ' : 'Previsão: '}
                  R$ {entry.value.toFixed(2)}
                </span>
              </div>
            );
          })}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="flex flex-col rounded-[2.5rem] border border-zinc-800/60 bg-zinc-900/40 p-6 xl:p-8 shadow-2xl backdrop-blur-sm relative overflow-hidden h-full min-h-[350px]">
      <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-indigo-500/10 blur-[80px] rounded-full"></div>
      
      <div className="flex justify-between items-start mb-6 relative z-10">
        <div>
          <h2 className="text-sm xl:text-base font-bold uppercase tracking-widest text-zinc-500 flex items-center gap-2">
            <Zap size={18} className="text-amber-400" /> Radar de Despesas
          </h2>
          <p className="text-xs text-zinc-400 mt-1">
            {isCurrentMonth ? "Ritmo de gastos vs Fim do Mês" : "Histórico de aceleração de gastos"}
          </p>
        </div>
        
        {isCurrentMonth && (
          <div className="flex flex-col items-end">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Gasto Total Previsto</span>
            <span className="text-2xl font-black font-mono text-indigo-400">
              R$ {forecast.projecaoFinal.toFixed(2)}
            </span>
          </div>
        )}
      </div>

      {isCurrentMonth && forecast.projecaoFinal > 0 && (
        <div className="mb-6 bg-zinc-950/50 border border-zinc-800 rounded-2xl p-4 flex items-start gap-3 relative z-10">
          <AlertTriangle size={20} className="text-indigo-400 shrink-0 mt-0.5" />
          <p className="text-sm text-zinc-300">
            A sua velocidade de queima atual é de <strong className="text-white">R$ {forecast.ritmoDiario.toFixed(2)}/dia</strong>. 
            Se não travar, as suas despesas vão chegar a <strong className="text-indigo-400">R$ {forecast.projecaoFinal.toFixed(2)}</strong> no dia 30.
          </p>
        </div>
      )}

      <div className="flex-1 w-full relative z-10 mt-4">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={forecast.dadosGrafico} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="colorReal" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
              </linearGradient>
              <linearGradient id="colorProjetado" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
              </linearGradient>
            </defs>
            
            <XAxis 
              dataKey="dia" 
              axisLine={false} 
              tickLine={false} 
              tick={{ fontSize: 10, fill: '#71717a' }} 
              dy={10}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#3f3f46', strokeWidth: 1, strokeDasharray: '5 5' }} />
            
            <Area 
              type="monotone" 
              dataKey="real" 
              stroke="#ef4444" 
              strokeWidth={3}
              fillOpacity={1} 
              fill="url(#colorReal)" 
              activeDot={{ r: 6, strokeWidth: 0, fill: '#ef4444' }}
            />
            
            {isCurrentMonth && (
               <Area 
                 type="monotone" 
                 dataKey="projetado" 
                 stroke="#6366f1" 
                 strokeWidth={3}
                 strokeDasharray="5 5"
                 fillOpacity={1} 
                 fill="url(#colorProjetado)" 
               />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}