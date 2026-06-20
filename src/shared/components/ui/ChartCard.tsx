import { type ReactNode, useId } from 'react';
import type { LucideIcon } from 'lucide-react';

interface Props {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  /** Ações à direita (ex.: período, "Explicar com IA") */
  actions?: ReactNode;
  /** Alternativa textual do gráfico para leitores de tela (acessibilidade) */
  summary?: string;
  children: ReactNode;
  className?: string;
}

/**
 * Wrapper acessível de gráfico (PR 2 — design system). Usa `<figure>`/`<figcaption>`
 * e expõe o conteúdo do gráfico como `role="img"` com `aria-label`/`summary`,
 * cobrindo o gap de "gráficos sem alternativa textual". Não renderiza dados — só envolve.
 */
export function ChartCard({ title, subtitle, icon: Icon, actions, summary, children, className = '' }: Props) {
  const id = useId();
  return (
    <figure className={`bg-quantum-card/40 backdrop-blur-sm border border-quantum-border rounded-2xl p-5 m-0 ${className}`}>
      <figcaption className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-2 min-w-0">
          {Icon && <Icon className="w-4 h-4 text-quantum-accent shrink-0" />}
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-quantum-fg truncate">{title}</h3>
            {subtitle && <p className="text-[11px] text-quantum-fgMuted">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </figcaption>
      <div
        role="img"
        aria-label={summary ? `${title}. ${summary}` : title}
        {...(summary ? { 'aria-describedby': `${id}-summary` } : {})}
      >
        {children}
      </div>
      {summary && <p id={`${id}-summary`} className="sr-only">{summary}</p>}
    </figure>
  );
}
