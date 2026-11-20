import { CheckCircle2, RotateCcw, XCircle, Clock as ClockIcon } from 'lucide-react';
import type { ComponentType } from 'react';

export const KIND_LABELS: Record<string, string> = {
  register_purchase:     'Compra registrada',
  register_income:       'Renda registrada',
  contribute_to_goal:    'Meta contribuída',
  register_debt_payment: 'Dívida quitada',
  create_budget:         'Orçamento criado',
  register_transfer:     'Transferência',
};

export interface OutcomeCfg {
  icon: ComponentType<{ className?: string }>;
  cls: string;
  label: string;
}

export const OUTCOME_CONFIG: Record<string, OutcomeCfg> = {
  applied:  { icon: CheckCircle2, cls: 'text-emerald-400',     label: 'Aplicada'  },
  reverted: { icon: RotateCcw,    cls: 'text-amber-400',       label: 'Revertida' },
  pending:  { icon: ClockIcon,    cls: 'text-blue-400',        label: 'Pendente'  },
  'n/a':    { icon: XCircle,      cls: 'text-quantum-fgMuted', label: 'N/A'       },
};

export function getOutcomeCfg(status: string): OutcomeCfg {
  return OUTCOME_CONFIG[status] ?? OUTCOME_CONFIG['n/a']!;
}

export function getKindLabel(kind: string, intent: string): string {
  return KIND_LABELS[kind] ?? (kind || intent);
}
