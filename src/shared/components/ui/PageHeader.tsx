import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

interface Props {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  /** Ações à direita (botões, filtros) */
  actions?: ReactNode;
  className?: string;
}

/** Cabeçalho padronizado de página/feature (PR 2 — design system). */
export function PageHeader({ title, subtitle, icon: Icon, actions, className = '' }: Props) {
  return (
    <div className={`flex items-start justify-between gap-4 flex-wrap mb-6 ${className}`}>
      <div className="flex items-center gap-3 min-w-0">
        {Icon && (
          <div className="p-2.5 rounded-2xl bg-quantum-accent/10 border border-quantum-accent/20 text-quantum-accent shrink-0">
            <Icon className="w-5 h-5" />
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-xl font-black text-quantum-fg tracking-tight truncate">{title}</h1>
          {subtitle && <p className="text-xs text-quantum-fgMuted">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
