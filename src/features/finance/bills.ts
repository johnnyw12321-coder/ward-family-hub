import { diffDays, type CalendarDate } from "@/lib/dates";

export type DueState = "overdue" | "due-today" | "due-soon" | "upcoming";

/**
 * Classify a recurring item's next due date. A bill is never considered paid
 * because time has passed — only an explicit settlement advances the date, so
 * a past date always means "overdue".
 */
export function dueState(nextDue: CalendarDate, today: CalendarDate, reminderDays: number): DueState {
  const days = diffDays(nextDue, today);
  if (days < 0) return "overdue";
  if (days === 0) return "due-today";
  if (days <= reminderDays) return "due-soon";
  return "upcoming";
}

export function dueLabel(nextDue: CalendarDate, today: CalendarDate): string {
  const days = diffDays(nextDue, today);
  if (days < -1) return `${-days} days overdue`;
  if (days === -1) return "1 day overdue";
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  return `Due in ${days} days`;
}
