interface Props {
  children: React.ReactNode;
  className?: string;
  /** Adiciona borda luminosa de destaque */
  glow?: boolean;
  onClick?: () => void;
}

export function Card({ children, className = '', glow = false, onClick }: Props) {
  const base = 'bg-quantum-card/50 backdrop-blur-sm rounded-2xl border border-quantum-border p-4';
  const glowClass = glow ? 'shadow-[0_0_20px_rgba(0,230,138,0.07)]' : '';
  const interactiveClass = onClick ? 'cursor-pointer hover:border-quantum-accent/30 hover:bg-quantum-card/70 transition-all' : '';

  if (onClick) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(e) => e.key === 'Enter' && onClick()}
        className={`${base} ${glowClass} ${interactiveClass} ${className}`}
      >
        {children}
      </div>
    );
  }

  return (
    <div className={`${base} ${glowClass} ${className}`}>
      {children}
    </div>
  );
}
