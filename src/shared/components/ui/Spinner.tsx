interface Props {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE = {
  sm: 'w-4 h-4 border-2',
  md: 'w-6 h-6 border-2',
  lg: 'w-10 h-10 border-2',
} as const;

export function Spinner({ size = 'md', className = '' }: Props) {
  return (
    <span
      role="status"
      aria-label="Carregando"
      className={`${SIZE[size]} rounded-full border-quantum-fgMuted/30 border-t-quantum-accent animate-spin inline-block ${className}`}
    />
  );
}
