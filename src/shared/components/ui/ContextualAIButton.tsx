import { type ReactNode, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { BottomSheet } from './BottomSheet';

interface Props {
  /** Texto do botão (default: "Explicar com IA") */
  label?: string;
  /** Título do painel (default: usa o label) */
  title?: string;
  /** Conteúdo da explicação de IA, renderizado no BottomSheet */
  children: ReactNode;
  /** Estilo do botão */
  variant?: 'solid' | 'ghost';
  className?: string;
}

/**
 * Botão contextual de IA (PR 7 — UI/UX premium). Um gatilho discreto com ícone ✨
 * que abre um BottomSheet (PR 2) com a explicação/insight, SEM poluir a tela nem
 * abrir uma página de chat. Apenas apresentação: a IA já produziu o conteúdo
 * (passado como children); este componente não calcula nada e não gera números —
 * coerente com docs/AI_AGENT_GUARDRAILS.md ("LLM narra; motores puros calculam").
 */
export function ContextualAIButton({
  label = 'Explicar com IA',
  title,
  children,
  variant = 'ghost',
  className = '',
}: Props) {
  const [open, setOpen] = useState(false);

  const base = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/50';
  const styles = variant === 'solid'
    ? 'bg-violet-500/15 text-violet-300 border border-violet-500/30 hover:bg-violet-500/25'
    : 'text-violet-300 hover:bg-violet-500/10 border border-transparent';

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`${base} ${styles} ${className}`}
        aria-haspopup="dialog"
      >
        <Sparkles className="w-3.5 h-3.5" />
        {label}
      </button>
      <BottomSheet open={open} onClose={() => setOpen(false)} title={title ?? label}>
        {children}
      </BottomSheet>
    </>
  );
}
