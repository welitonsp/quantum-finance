import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

interface RechartsTooltipProps {
  active?: boolean;
  label?: string | number;
  payload?: Array<{ name?: string; value?: number | string; color?: string; payload?: unknown }>;
}

const allocations = [
  { name: 'Cripto',     value: 42, color: '#F7931A' },
  { name: 'Ações BR',   value: 28, color: '#00E68A' },
  { name: 'Ações US',   value: 18, color: '#627EEA' },
  { name: 'Renda Fixa', value: 8,  color: '#FFB800' },
  { name: 'Outros',     value: 4,  color: '#6B7A94' },
];

const CustomTooltip = ({ active, payload }: RechartsTooltipProps) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-quantum-card border border-quantum-border rounded-xl p-3 shadow-xl">
        <p className="text-quantum-fg font-bold text-sm">{payload[0].name}</p>
        <p className="text-quantum-fgMuted font-mono text-xs">{payload[0].value}% do portfólio</p>
      </div>
    );
  }
  return null;
};

export default function AllocationChart() {
  return (
    <div className="glass-card-quantum p-6">
      <h3 className="text-lg font-bold text-quantum-fg mb-4">Alocação</h3>
      <div style={{ minHeight: 192 }}>
        <ResponsiveContainer width="100%" minWidth={100} minHeight={192}>
          <PieChart>
            <Pie data={allocations} cx="50%" cy="50%" innerRadius={60} outerRadius={85} paddingAngle={3} dataKey="value">
              {allocations.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} stroke="transparent" />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-4">
        {allocations.map((a, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: a.color }} />
            <span className="text-xs text-quantum-fgMuted truncate">{a.name}</span>
            <span className="text-xs font-bold text-quantum-fg ml-auto font-mono">{a.value}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
