import type { LucideIcon } from 'lucide-react';

type Variant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'muted';

interface Props {
  label: string;
  variant?: Variant;
  icon?: LucideIcon;
  className?: string;
}

const VARIANT_CLASSES: Record<Variant, string> = {
  default: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  success: 'bg-quantum-accent/10 text-quantum-accent border-quantum-accent/20',
  warning: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  danger:  'bg-red-500/10 text-red-400 border-red-500/20',
  info:    'bg-blue-500/10 text-blue-400 border-blue-500/20',
  muted:   'bg-white/5 text-quantum-fgMuted border-quantum-border',
};

export function Badge({ label, variant = 'default', icon: Icon, className = '' }: Props) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${VARIANT_CLASSES[variant]} ${className}`}
    >
      {Icon && <Icon className="w-3 h-3" />}
      {label}
    </span>
  );
}
