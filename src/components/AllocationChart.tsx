// src/components/AllocationChart.tsx
import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

interface Allocation {
  name: string;
  value: number;
  color: string;
}

interface TooltipPayload {
  name: string;
  value: number;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayload[];
}

const allocations: Allocation[] = [
  { name: 'Cripto',     value: 42, color: '#F7931A' },
  { name: 'Ações BR',   value: 28, color: '#00E68A' },
  { name: 'Ações US',   value: 18, color: '#627EEA' },
  { name: 'Renda Fixa', value:  8, color: '#FFB800' },
  { name: 'Outros',     value:  4, color: '#6B7A94' },
];

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-quantum-card border border-quantum-border rounded-xl p-3 shadow-xl">
        <p className="text-white font-bold text-sm">{payload[0].name}</p>
        <p className="text-quantum-fgMuted font-mono text-xs">{payload[0].value}% do portfólio</p>
      </div>
    );
  }
  return null;
}

export default function AllocationChart() {
  return (
    <div className="glass-card-quantum p-6">
      <h3 className="text-lg font-bold text-white mb-4">Alocação</h3>

      <div className="h-48 w-full min-h-[192px]">
        <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={192}>
          <PieChart>
            <Pie
              data={allocations}
              innerRadius="70%"
              outerRadius="90%"
              paddingAngle={4}
              dataKey="value"
              stroke="none"
            >
              {allocations.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-2 gap-3 mt-4">
        {allocations.map((a) => (
          <div key={a.name} className="flex items-center gap-2 text-xs">
            <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: a.color }} />
            <span className="text-quantum-fgMuted truncate">{a.name}</span>
            <span className="ml-auto font-mono font-bold text-white">{a.value}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
