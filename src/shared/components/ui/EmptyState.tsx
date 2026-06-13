import type { LucideIcon } from 'lucide-react';

interface Props {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className = '' }: Props) {
  return (
    <div className={`flex flex-col items-center justify-center gap-3 py-12 text-center ${className}`}>
      {Icon && (
        <div className="p-4 rounded-2xl bg-quantum-card/60 border border-quantum-border">
          <Icon className="w-8 h-8 text-quantum-fgMuted" />
        </div>
      )}
      <p className="font-semibold text-quantum-fgMuted">{title}</p>
      {description && (
        <p className="text-xs text-quantum-fgMuted max-w-xs">{description}</p>
      )}
      {action}
    </div>
  );
}
