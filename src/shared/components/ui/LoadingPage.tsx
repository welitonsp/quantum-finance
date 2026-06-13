import { Spinner } from './Spinner';

interface Props {
  label?: string;
  className?: string;
}

/** Substitui os padrões inline de "A carregar" / "Carregando" em páginas inteiras */
export function LoadingPage({ label = 'Carregando...', className = '' }: Props) {
  return (
    <div className={`flex flex-col items-center justify-center h-64 gap-4 ${className}`}>
      <Spinner size="lg" />
      <span className="text-xs text-quantum-fgMuted uppercase tracking-widest animate-pulse">
        {label}
      </span>
    </div>
  );
}
