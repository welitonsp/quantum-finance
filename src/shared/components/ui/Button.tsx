import type { LucideIcon } from 'lucide-react';
import { Spinner } from './Spinner';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

interface Props {
  children?: React.ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit' | 'reset';
  variant?: Variant;
  size?: Size;
  icon?: LucideIcon;
  iconPosition?: 'left' | 'right';
  loading?: boolean;
  disabled?: boolean;
  className?: string;
  title?: string;
  'aria-label'?: string;
}

const VARIANT_CLASSES: Record<Variant, string> = {
  primary:   'btn-quantum-primary',
  secondary: 'bg-quantum-card hover:bg-quantum-cardHover text-quantum-fg border border-quantum-border hover:border-quantum-accent/30 transition-all',
  danger:    'bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 transition-all',
  ghost:     'hover:bg-white/5 text-quantum-fgMuted hover:text-quantum-fg border border-transparent transition-colors',
};

const SIZE_CLASSES: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-xs gap-1.5 rounded-lg',
  md: 'px-4 py-2 text-sm gap-2 rounded-xl',
  lg: 'px-5 py-2.5 text-sm gap-2 rounded-xl',
};

export function Button({
  children,
  onClick,
  type = 'button',
  variant = 'secondary',
  size = 'md',
  icon: Icon,
  iconPosition = 'left',
  loading = false,
  disabled = false,
  className = '',
  title,
  'aria-label': ariaLabel,
}: Props) {
  const isDisabled = disabled || loading;

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={isDisabled}
      title={title}
      aria-label={ariaLabel}
      aria-busy={loading}
      className={`inline-flex items-center font-semibold ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}
    >
      {loading && <Spinner size="sm" />}
      {!loading && Icon && iconPosition === 'left' && <Icon className="w-4 h-4 flex-shrink-0" />}
      {children}
      {!loading && Icon && iconPosition === 'right' && <Icon className="w-4 h-4 flex-shrink-0" />}
    </button>
  );
}
