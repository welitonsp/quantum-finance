import { useRef } from 'react';
import type { KeyboardEvent } from 'react';
import type { LucideIcon } from 'lucide-react';

export interface TabItem {
  id: string;
  label: string;
  icon?: LucideIcon;
}

interface Props {
  tabs: TabItem[];
  activeId: string;
  onChange: (id: string) => void;
  /** Rótulo acessível do conjunto de abas */
  ariaLabel?: string;
  className?: string;
}

/**
 * Abas contextuais acessíveis (PR 2 — design system). Implementa o padrão WAI-ARIA
 * `tablist`/`tab` com navegação por teclado (←/→/Home/End) e roving tabindex —
 * corrige o gap de "tabs sem semântica" identificado na auditoria.
 *
 * O consumidor deve renderizar o painel com:
 *   <div role="tabpanel" id={`tabpanel-${id}`} aria-labelledby={`tab-${id}`}>…</div>
 */
export function TopTabs({ tabs, activeId, onChange, ariaLabel = 'Seções', className = '' }: Props) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  const handleKey = (e: KeyboardEvent<HTMLButtonElement>, idx: number) => {
    let next = -1;
    if (e.key === 'ArrowRight') next = (idx + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') next = (idx - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    if (next < 0) return;
    e.preventDefault();
    const target = tabs[next];
    if (target) {
      onChange(target.id);
      refs.current[target.id]?.focus();
    }
  };

  return (
    <div role="tablist" aria-label={ariaLabel} className={`flex items-center gap-1 overflow-x-auto border-b border-quantum-border ${className}`}>
      {tabs.map((t, i) => {
        const active = t.id === activeId;
        const Icon = t.icon;
        return (
          <button
            key={t.id}
            ref={(el) => { refs.current[t.id] = el; }}
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={active}
            aria-controls={`tabpanel-${t.id}`}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(t.id)}
            onKeyDown={(e) => handleKey(e, i)}
            className={`inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-bold whitespace-nowrap border-b-2 -mb-px transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-quantum-accent/50 rounded-t-lg ${
              active
                ? 'border-quantum-accent text-quantum-accent'
                : 'border-transparent text-quantum-fgMuted hover:text-quantum-fg'
            }`}
          >
            {Icon && <Icon className="w-4 h-4" />}
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
