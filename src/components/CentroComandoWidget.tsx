import { useMemo } from 'react';
import {
  AlertTriangle, CreditCard, Repeat, CheckCircle2, Zap,
} from 'lucide-react';
import { useNavigation } from '../contexts/NavigationContext';
import { formatBRL } from '../shared/types/money';
import { formatCurrency } from '../utils/formatters';
import type { RecurringTask, CreditCard as CreditCardType } from '../shared/types/transaction';
import type { DashboardBudgetAlert } from '../utils/dashboardUtils';

interface Props {
  budgetAlerts: DashboardBudgetAlert[];
  recurringTasks: RecurringTask[];
  cards: CreditCardType[];
  loading?: boolean;
}

interface ActionItem {
  id: string;
  tipo: 'fatura' | 'recorrente' | 'orcamento';
  titulo: string;
  descricao: string;
  urgencia: 'critica' | 'alta' | 'media';
  navTarget?: string;
  /** Presentes apenas em itens de orçamento (tipo 'orcamento') para a barra de progresso. */
  percentUsed?: number;
  spentCents?: number;
  limitCents?: number;
}

function diasParaFechamento(closingDay: number): number {
  const hoje = new Date();
  const diaHoje = hoje.getDate();
  const diasNoMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
  const diffDias = closingDay >= diaHoje
    ? closingDay - diaHoje
    : diasNoMes - diaHoje + closingDay;
  return diffDias;
}

function diasParaRecorrente(task: RecurringTask): number | null {
  const hoje = new Date();
  const diaHoje = hoje.getDate();
  const dueDay = task.dueDay ?? 1;
  const diasNoMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
  const diff = dueDay >= diaHoje
    ? dueDay - diaHoje
    : diasNoMes - diaHoje + dueDay;
  if (task.frequency === 'anual') {
    const dueMonth = task.dueMonth ?? 1;
    const mesHoje = hoje.getMonth() + 1;
    if (dueMonth !== mesHoje) return null;
  }
  return diff;
}

export default function CentroComandoWidget({ budgetAlerts, recurringTasks, cards, loading = false }: Props) {
  const { setCurrentPage } = useNavigation();

  const actionItems = useMemo<ActionItem[]>(() => {
    const items: ActionItem[] = [];

    // 1. Orçamentos — críticos (>100%, urgência crítica) e em atenção (≥80%, urgência média)
    for (const alert of budgetAlerts) {
      if (alert.status === 'critical') {
        items.push({
          id:          `budget-${alert.id}`,
          tipo:        'orcamento',
          titulo:      `Orçamento estourado: ${alert.category}`,
          descricao:   `${alert.percentUsed.toFixed(0)}% do limite atingido em ${alert.month}`,
          urgencia:    'critica',
          navTarget:   'reports',
          percentUsed: alert.percentUsed,
          spentCents:  alert.spentCents,
          limitCents:  alert.limitCents,
        });
      } else if (alert.status === 'attention') {
        items.push({
          id:          `budget-${alert.id}`,
          tipo:        'orcamento',
          titulo:      `Orçamento em atenção: ${alert.category}`,
          descricao:   `${alert.percentUsed.toFixed(0)}% do limite usado em ${alert.month}`,
          urgencia:    'media',
          navTarget:   'reports',
          percentUsed: alert.percentUsed,
          spentCents:  alert.spentCents,
          limitCents:  alert.limitCents,
        });
      }
    }

    // 2. Faturas de cartão fechando em ≤7 dias
    for (const card of cards) {
      if (!card.active) continue;
      const dias = diasParaFechamento(card.closingDay);
      if (dias <= 7) {
        items.push({
          id:        `card-${card.id}`,
          tipo:      'fatura',
          titulo:    `Fatura fecha em ${dias === 0 ? 'hoje' : `${dias}d`}: ${card.name}`,
          descricao: `Dia de fechamento: ${card.closingDay}`,
          urgencia:  dias <= 2 ? 'critica' : dias <= 4 ? 'alta' : 'media',
          navTarget: 'cards',
        });
      }
    }

    // 3. Despesas fixas vencendo em ≤5 dias
    const ativas = recurringTasks.filter(t => t.active);
    for (const task of ativas) {
      const dias = diasParaRecorrente(task);
      if (dias !== null && dias <= 5) {
        items.push({
          id:        `rec-${task.id}`,
          tipo:      'recorrente',
          titulo:    `Despesa fixa em ${dias === 0 ? 'hoje' : `${dias}d`}: ${task.description}`,
          descricao: task.value !== null && task.value !== undefined ? formatBRL(task.value as number) : task.description,
          urgencia:  dias === 0 ? 'critica' : dias <= 2 ? 'alta' : 'media',
          navTarget: 'recurring',
        });
      }
    }

    // Ordena: crítica > alta > media
    const order = { critica: 0, alta: 1, media: 2 };
    return items.sort((a, b) => order[a.urgencia] - order[b.urgencia]);
  }, [budgetAlerts, recurringTasks, cards]);

  if (loading) {
    return (
      <section
        className="rounded-2xl border border-quantum-border bg-quantum-card/40 backdrop-blur-sm overflow-hidden"
        aria-label="Alertas e ações urgentes"
        aria-busy="true"
      >
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {[0, 1, 2].map(item => (
            <div key={item} className="h-24 rounded-xl bg-quantum-bgSecondary animate-pulse" />
          ))}
        </div>
      </section>
    );
  }

  if (actionItems.length === 0) {
    return (
      <div className="flex items-center gap-3 px-5 py-4 bg-quantum-accent/5 border border-quantum-accent/20 rounded-2xl">
        <CheckCircle2 className="w-5 h-5 text-quantum-accent shrink-0" />
        <div>
          <p className="text-sm font-bold text-quantum-fg">Alertas — Tudo sob controle</p>
          <p className="text-xs text-quantum-fgMuted">Sem alertas críticos, faturas próximas ou despesas vencendo.</p>
        </div>
      </div>
    );
  }

  const criticas = actionItems.filter(i => i.urgencia === 'critica').length;

  const URGENCIA_CONFIG = {
    critica: { border: 'border-red-500/30',   bg: 'bg-red-500/8',    icon: 'text-red-400',   badge: 'bg-red-500/15 text-red-400 border-red-500/30' },
    alta:    { border: 'border-amber-500/30',  bg: 'bg-amber-500/8',  icon: 'text-amber-400', badge: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
    media:   { border: 'border-blue-500/20',   bg: 'bg-blue-500/5',   icon: 'text-blue-400',  badge: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  } as const;

  const TIPO_ICON = {
    fatura:     CreditCard,
    recorrente: Repeat,
    orcamento:  AlertTriangle,
  } as const;

  return (
    <section
      className="rounded-2xl border border-quantum-border bg-quantum-card/40 backdrop-blur-sm overflow-hidden"
      aria-label="Alertas e ações urgentes"
    >
      {/* Cabeçalho */}
      <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-quantum-border">
        <div className="flex items-center gap-2.5">
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${criticas > 0 ? 'bg-red-500/10 text-red-400 border border-red-500/25' : 'bg-amber-500/10 text-amber-400 border border-amber-500/25'}`}>
            <Zap className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-black text-quantum-fg">Alertas</h2>
            <p className="text-[10px] text-quantum-fgMuted">
              {criticas > 0
                ? `${criticas} ação${criticas > 1 ? 'ões' : ''} crítica${criticas > 1 ? 's' : ''} — atenção imediata`
                : `${actionItems.length} item${actionItems.length > 1 ? 's' : ''} para sua atenção`}
            </p>
          </div>
        </div>
        <span className="text-[10px] text-quantum-fgMuted font-mono">{actionItems.length} item{actionItems.length > 1 ? 's' : ''}</span>
      </div>

      {/* Lista de ações */}
      <div className="p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {actionItems.map((item) => {
          const cfg = URGENCIA_CONFIG[item.urgencia];
          const Icon = TIPO_ICON[item.tipo];
          const showBudgetBar =
            item.tipo === 'orcamento' &&
            item.percentUsed !== undefined &&
            item.spentCents !== undefined &&
            item.limitCents !== undefined;
          const barColor = item.urgencia === 'critica' ? 'bg-red-400' : 'bg-amber-400';
          return (
            <button
              key={item.id}
              onClick={() => item.navTarget && setCurrentPage(item.navTarget)}
              className={`text-left flex flex-col p-4 rounded-xl border ${cfg.border} ${cfg.bg} hover:brightness-110 transition-all group`}
              aria-label={item.titulo}
            >
              <div className="flex items-start gap-3 w-full">
                <div className={`p-1.5 rounded-lg bg-white/5 ${cfg.icon} shrink-0`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-quantum-fg truncate group-hover:text-white transition-colors">
                    {item.titulo}
                  </p>
                  <p className="text-xs text-quantum-fgMuted mt-0.5 truncate">{item.descricao}</p>
                </div>
                <span className={`ml-auto shrink-0 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${cfg.badge}`}>
                  {item.urgencia === 'critica' ? 'Urgente' : item.urgencia === 'alta' ? 'Hoje' : 'Esta semana'}
                </span>
              </div>

              {showBudgetBar && (
                <>
                  <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-quantum-border/50">
                    <div
                      className={`h-full rounded-full ${barColor}`}
                      style={{ width: `${Math.min(item.percentUsed as number, 100)}%` }}
                    />
                  </div>
                  <div className="mt-2 flex items-baseline justify-between gap-3 text-[11px] w-full">
                    <span className="font-mono font-bold text-quantum-fg">
                      {formatCurrency(item.spentCents, { cents: true })}
                    </span>
                    <span className="text-quantum-fgMuted">
                      de {formatCurrency(item.limitCents, { cents: true })}
                    </span>
                  </div>
                </>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
