import { useState, useMemo } from 'react';
import { Zap } from 'lucide-react';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { formatBRL, toCentavos } from '../shared/types/money';
import type { Centavos } from '../shared/types/money';
import type { RecurringTask } from '../shared/types/transaction';
import { db } from '../shared/api/firebase/index';
import { ActionConfirmationSheet, type ActionSummaryRow } from '../features/ai-agent/ActionConfirmationSheet';
import { useAgentAction } from '../hooks/useAgentAction';
import { buildProposal } from '../features/ai-agent/proposalBuilders';
import { buildActionQuestion } from '../features/ai-agent/intentRouter';
import type { ActionProposal } from '../shared/schemas/agentSchemas';

interface Props {
  uid: string;
  recurringTasks: RecurringTask[];
}

interface DueTask {
  task: RecurringTask;
  daysUntilDue: number;
}

function dueLabel(daysUntilDue: number): string {
  if (daysUntilDue < 0) return 'Atrasado';
  if (daysUntilDue === 0) return 'Hoje';
  if (daysUntilDue === 1) return 'Amanhã';
  return `Em ${daysUntilDue} dias`;
}

function badgeClass(daysUntilDue: number): string {
  if (daysUntilDue < 0) return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
  if (daysUntilDue <= 1) return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
  return 'bg-sky-500/10 text-sky-400 border-sky-500/20';
}

function daysInMonth(year: number, monthOneBased: number): number {
  return new Date(year, monthOneBased, 0).getDate();
}

export default function OneTouchActionsCard({ uid, recurringTasks }: Props) {
  const [activeTask, setActiveTask] = useState<RecurringTask | null>(null);
  const [activeProposal, setActiveProposal] = useState<ActionProposal | null>(null);
  const [activeQuestion, setActiveQuestion] = useState('');
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const { status, error, runAction, reset } = useAgentAction();

  const dueTasks = useMemo<DueTask[]>(() => {
    const today = new Date();
    const dayOfMonth = today.getDate();
    const currentYearMonth = today.toISOString().slice(0, 7);
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth() + 1;
    const lastDay = daysInMonth(currentYear, currentMonth);

    const effectiveDueDay = (task: RecurringTask) => Math.min(task.dueDay, lastDay);

    return recurringTasks
      .filter((task) => {
        if (!task.active) return false;
        if (task.frequency === 'anual' && task.dueMonth !== currentMonth) return false;
        if (task.lastExecutedMonth === currentYearMonth) return false;
        return effectiveDueDay(task) - dayOfMonth <= 7;
      })
      .map((task) => ({ task, daysUntilDue: effectiveDueDay(task) - dayOfMonth }))
      .sort((a, b) => a.daysUntilDue - b.daysUntilDue)
      .slice(0, 5);
  }, [recurringTasks]);

  const visibleTasks = useMemo(
    () => dueTasks.filter(({ task }) => !dismissed.has(task.id)),
    [dueTasks, dismissed],
  );

  if (visibleTasks.length === 0) return null;

  const handleRegister = (task: RecurringTask) => {
    const amountCents = task.value_cents ?? toCentavos(task.value);
    const kind = task.type === 'entrada' ? 'register_income' : 'register_purchase';
    const result = buildProposal(kind, {
      description: task.description,
      amountCents,
      date: new Date().toISOString().slice(0, 10),
      category: task.category,
    });
    if (!result.ok) return;
    setActiveTask(task);
    setActiveProposal(result.proposal);
    setActiveQuestion(buildActionQuestion(result.proposal));
  };

  const handleConfirm = async () => {
    if (!activeProposal || !activeTask) return;
    try {
      await runAction(activeProposal, {
        intent: activeProposal.kind === 'register_income' ? 'register_income_proposal' : 'cashflow_briefing',
        question: activeQuestion,
        toolsUsed: ['recurring_task_briefing'],
      });
      if (uid) {
        await updateDoc(doc(db, 'users', uid, 'recurringTasks', activeTask.id), {
          lastExecutedMonth: new Date().toISOString().slice(0, 7),
          updatedAt: serverTimestamp(),
        });
      }
      setDismissed((prev) => {
        const next = new Set(prev);
        next.add(activeTask.id);
        return next;
      });
      setActiveTask(null);
      setActiveProposal(null);
      reset();
    } catch {
      // Erro já refletido em `status`/`error` do hook; o sheet exibe a mensagem curada.
    }
  };

  const handleClose = () => {
    if (status === 'running') return;
    setActiveTask(null);
    setActiveProposal(null);
    reset();
  };

  const activeAmountCents: Centavos | null = activeTask
    ? activeTask.value_cents ?? toCentavos(activeTask.value)
    : null;

  const rows: ActionSummaryRow[] =
    activeTask && activeAmountCents !== null
      ? [
          { label: 'Descrição', value: activeTask.description },
          { label: 'Valor', value: formatBRL(activeAmountCents), emphasis: true },
          { label: 'Categoria', value: activeTask.category },
          { label: 'Data', value: new Date().toLocaleDateString('pt-BR') },
        ]
      : [];

  return (
    <section
      aria-label="Ações de 1 Toque"
      className="rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-950/25 to-quantum-card p-5 space-y-4"
    >
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
          <Zap size={17} className="text-amber-400" />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-black text-quantum-fg">Ação de 1 Toque</h2>
          <p className="text-[11px] text-quantum-muted">Recorrentes a vencer — confirme em 1 toque</p>
        </div>
      </div>

      <ul className="space-y-1.5">
        {visibleTasks.map(({ task, daysUntilDue }) => {
          const amountCents = task.value_cents ?? toCentavos(task.value);
          return (
            <li
              key={task.id}
              className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-quantum-bg transition-colors"
            >
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${badgeClass(daysUntilDue)}`}
              >
                {dueLabel(daysUntilDue)}
              </span>
              <span className="text-sm text-quantum-fg truncate flex-1 min-w-0">
                {task.description}
              </span>
              <span className="text-sm font-mono font-bold text-quantum-fg shrink-0">
                {formatBRL(amountCents)}
              </span>
              <button
                onClick={() => handleRegister(task)}
                className="text-xs font-bold px-3 py-1 rounded-lg border border-amber-500/30 text-amber-400 hover:bg-amber-500/10 transition-colors shrink-0"
              >
                Registrar
              </button>
            </li>
          );
        })}
      </ul>

      {activeTask !== null && (
        <ActionConfirmationSheet
          open
          onClose={handleClose}
          onConfirm={handleConfirm}
          title="Registrar recorrente"
          question={activeQuestion}
          rows={rows}
          status={status}
          error={error}
        />
      )}
    </section>
  );
}
