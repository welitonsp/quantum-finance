// Helpers puros do briefing diário por push (FCM) — zero I/O, zero float.
// A scheduled function em index.ts consome estas funções; aqui só há lógica
// determinística testável.
//
// PRIVACIDADE: o corpo da notificação NUNCA inclui descrições de recorrentes,
// nomes de cartão ou qualquer texto do usuário — apenas contagens e total em
// BRL. Push atravessa infra de terceiros (FCM); payload é minimizado por
// política (mesmo princípio dos logs sanitizados).

export interface ReminderTaskLike {
  value_cents?: unknown;
  dueDay?: unknown;
  dueMonth?: unknown; // 1–12 → recorrente anual
}

export interface ReminderCardLike {
  closingDay?: unknown;
}

export interface ReminderSummary {
  dueTasksCount: number;
  dueTasksTotalCents: number;
  closingCardsCount: number;
}

/** Recorrente vence hoje? (anual exige mês; mensal só o dia). Sem skip por
 *  lastExecutedMonth: o briefing informa o vencimento de hoje mesmo que o
 *  executeScheduledRecurrents (04:00 UTC) já o tenha materializado. */
export function isTaskDueOn(task: ReminderTaskLike, dayOfMonth: number, month: number): boolean {
  if (!Number.isSafeInteger(task.value_cents) || (task.value_cents as number) <= 0) return false;
  if (!Number.isSafeInteger(task.dueDay)) return false;
  if ((task.dueDay as number) !== dayOfMonth) return false;
  if (task.dueMonth !== undefined && task.dueMonth !== null) {
    return Number.isSafeInteger(task.dueMonth) && (task.dueMonth as number) === month;
  }
  return true;
}

export function buildReminderSummary(
  tasks: readonly ReminderTaskLike[],
  cards: readonly ReminderCardLike[],
  dayOfMonth: number,
  month: number,
): ReminderSummary {
  let dueTasksCount = 0;
  let dueTasksTotalCents = 0;
  for (const task of tasks) {
    if (isTaskDueOn(task, dayOfMonth, month)) {
      dueTasksCount += 1;
      dueTasksTotalCents += task.value_cents as number;
    }
  }
  const closingCardsCount = cards.filter(
    (c) => Number.isSafeInteger(c.closingDay) && (c.closingDay as number) === dayOfMonth,
  ).length;

  return { dueTasksCount, dueTasksTotalCents, closingCardsCount };
}

/** Formata centavos inteiros como BRL sem float (aritmética inteira). */
export function formatCentsBRL(cents: number): string {
  const abs = Math.abs(Math.trunc(cents));
  const reais = Math.trunc(abs / 100);
  const centavos = String(abs % 100).padStart(2, '0');
  const reaisStr = String(reais).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${cents < 0 ? '-' : ''}R$ ${reaisStr},${centavos}`;
}

/** Corpo da notificação; null quando não há nada a informar (não enviar). */
export function buildReminderBody(summary: ReminderSummary): string | null {
  const parts: string[] = [];
  if (summary.dueTasksCount > 0) {
    const plural = summary.dueTasksCount !== 1;
    parts.push(
      `${summary.dueTasksCount} recorrente${plural ? 's' : ''} vence${plural ? 'm' : ''} hoje (${formatCentsBRL(summary.dueTasksTotalCents)})`,
    );
  }
  if (summary.closingCardsCount > 0) {
    const plural = summary.closingCardsCount !== 1;
    parts.push(
      `${summary.closingCardsCount} fatura${plural ? 's' : ''} de cartão fecha${plural ? 'm' : ''} hoje`,
    );
  }
  return parts.length > 0 ? `Hoje: ${parts.join(' · ')}.` : null;
}
