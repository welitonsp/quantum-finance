import { formatBRL } from '../../types/money';
import type { Centavos } from '../../types/money';

interface Props {
  /** Valor em centavos inteiros — nunca float */
  cents: Centavos | number;
  /** Quando true, exibe '••••' no lugar do valor */
  hidden?: boolean;
  /** Forçar cor positiva (verde) ou negativa (vermelho); padrão: automático pelo sinal */
  colorize?: boolean;
  className?: string;
  /** Tamanho de fonte extra (aplicado via className) */
  size?: 'xs' | 'sm' | 'base' | 'lg' | 'xl' | '2xl';
}

const SIZE_CLASS = {
  xs:   'text-xs',
  sm:   'text-sm',
  base: 'text-base',
  lg:   'text-lg',
  xl:   'text-xl',
  '2xl': 'text-2xl',
} as const;

export function MoneyDisplay({ cents, hidden = false, colorize = false, className = '', size = 'base' }: Props) {
  const colorClass = colorize
    ? cents >= 0 ? 'text-quantum-accent' : 'text-red-400'
    : '';

  const display = hidden ? '••••' : formatBRL(cents);

  return (
    <span className={`font-mono font-bold tabular-nums ${SIZE_CLASS[size]} ${colorClass} ${className}`}>
      {display}
    </span>
  );
}
