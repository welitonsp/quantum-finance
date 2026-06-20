import { type ReactNode, useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface Props {
  title: string;
  icon?: LucideIcon;
  children: ReactNode;
  /** Permite recolher/expandir a seção */
  collapsible?: boolean;
  /** Inicia recolhida (só quando collapsible) */
  defaultCollapsed?: boolean;
  /** Ação opcional no canto (ex.: link "Ver tudo") */
  action?: ReactNode;
  className?: string;
}

/**
 * Seção de dashboard padronizada, opcionalmente recolhível (PR 2 — design system).
 * Usada para esvaziar o dashboard movendo blocos para seções/tabs sem perder função.
 */
export function DashboardSection({
  title, icon: Icon, children,
  collapsible = false, defaultCollapsed = false, action, className = '',
}: Props) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed && collapsible);
  const id = useId();

  return (
    <section aria-labelledby={`${id}-title`} className={`space-y-3 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {Icon && <Icon className="w-4 h-4 text-quantum-accent shrink-0" />}
          <h2 id={`${id}-title`} className="text-xs font-bold text-quantum-fg uppercase tracking-widest truncate">
            {title}
          </h2>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {action}
          {collapsible && (
            <button
              type="button"
              onClick={() => setCollapsed(c => !c)}
              aria-expanded={!collapsed}
              aria-controls={`${id}-content`}
              aria-label={collapsed ? `Expandir ${title}` : `Recolher ${title}`}
              className="p-1 rounded-lg text-quantum-fgMuted hover:text-quantum-fg hover:bg-white/5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-quantum-accent/50"
            >
              <ChevronDown className={`w-4 h-4 transition-transform ${collapsed ? '-rotate-90' : ''}`} />
            </button>
          )}
        </div>
      </div>
      {!collapsed && <div id={`${id}-content`}>{children}</div>}
    </section>
  );
}
