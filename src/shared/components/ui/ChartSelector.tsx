import { useId } from 'react';

export interface ChartOption {
  value: string;
  label: string;
}

interface Props {
  /** Rótulo acessível (também exibido) */
  label?: string;
  options: ChartOption[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

/**
 * Seletor de análise/gráfico (PR 2 — design system). Base do modelo "um gráfico
 * herói por vez" da página de Análises (consumido pelo PR 5). Acessível: `<label>`
 * associado ao `<select>` nativo.
 */
export function ChartSelector({ label = 'Análise', options, value, onChange, className = '' }: Props) {
  const id = useId();
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <label htmlFor={id} className="text-[10px] font-bold text-quantum-fgMuted uppercase tracking-widest">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-quantum-card border border-quantum-border rounded-xl px-3 py-1.5 text-sm font-semibold text-quantum-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-quantum-accent/50 focus:border-quantum-accent/60 transition-colors"
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}
