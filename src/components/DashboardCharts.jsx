// src/components/DashboardCharts.jsx
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, Legend
} from 'recharts';

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-slate-900/95 border border-white/10 p-3 rounded-xl shadow-2xl backdrop-blur-xl z-50">
        <p className="text-slate-300 text-xs font-bold mb-2 uppercase">{label}</p>
        {payload.map((entry, index) => (
          <div key={index} className="flex items-center gap-2 text-sm font-mono">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color || entry.payload.fill }}></span>
            <span className="text-white">R$ {entry.value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

export default function DashboardCharts({ categoryData, topExpensesData }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
      <div className="glass-card-dark p-6 flex flex-col min-h-[350px]">
        <h2 className="text-sm font-bold uppercase tracking-widest text-slate-300 mb-4">Despesas por Categoria</h2>
        {categoryData.length > 0 ? (
          <div className="flex-1 w-full relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <RechartsTooltip content={<CustomTooltip />} />
                <Pie data={categoryData} innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value" stroke="none">
                  {categoryData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                </Pie>
                <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '12px', color: '#94a3b8' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">Sem despesas neste mês.</div>
        )}
      </div>

      <div className="glass-card-dark p-6 flex flex-col min-h-[350px]">
        <h2 className="text-sm font-bold uppercase tracking-widest text-slate-300 mb-4">Top Despesas (Mês)</h2>
        {topExpensesData.length > 0 ? (
          <div className="flex-1 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topExpensesData} layout="vertical" margin={{ top: 0, right: 20, left: 20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fill: '#cbd5e1', fontSize: 12 }} width={100} />
                <RechartsTooltip content={<CustomTooltip />} cursor={{ fill: '#1e293b', opacity: 0.4 }} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={20}>
                  {topExpensesData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">Sem dados suficientes.</div>
        )}
      </div>
    </div>
  );
}