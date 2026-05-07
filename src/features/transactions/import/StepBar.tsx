import React from 'react';
import type { ImportStatus } from './importTypes';

const STEPS = ['Ficheiro', 'Categorizar', 'Pré-visualizar', 'Importar'];
const STEP_MAP: Partial<Record<ImportStatus, number>> = {
  parsing: 0, col_mapping: 0, ai_processing: 1, preview: 2, importing: 3,
};

export function StepBar({ current }: { current: ImportStatus }) {
  const active = STEP_MAP[current] ?? -1;
  return (
    <div className="flex items-center gap-1 px-6 py-3 bg-quantum-bg/50 border-b border-quantum-border">
      {STEPS.map((label, i) => (
        <React.Fragment key={label}>
          <div className="flex items-center gap-1.5" aria-current={i === active ? 'step' : undefined}>
            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black transition-all duration-300 ${
              i < active   ? 'bg-quantum-accent text-quantum-bg' :
              i === active ? 'bg-quantum-accent/20 border border-quantum-accent text-quantum-accent animate-pulse' :
                             'bg-quantum-bgSecondary border border-quantum-border text-quantum-fgMuted'
            }`}>
              {i < active ? '✓' : i + 1}
            </div>
            <span className={`text-[10px] font-bold uppercase tracking-wider transition-colors ${
              i === active ? 'text-quantum-accent' : i < active ? 'text-quantum-fg' : 'text-quantum-fgMuted'
            }`}>{label}</span>
          </div>
          {i < STEPS.length - 1 && (
            <div className={`flex-1 h-px transition-all duration-500 ${i < active ? 'bg-quantum-accent/50' : 'bg-quantum-border'}`} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}
