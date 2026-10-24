import { diffDays, type CalendarDate } from "@/lib/dates";
import type { AccountType } from "@/lib/finance/calculations";

/** Bill types that pay down a debt: payments should be a transfer to the debt account, not spending. */
export const DEBT_BILL_TYPES = ["mortgage", "car_loan", "loan", "credit_card"] as const;

const DEBT_ACCOUNT_TYPES: Record<(typeof DEBT_BILL_TYPES)[number], AccountType[]> = {
  mortgage: ["mortgage"],
  car_loan: ["loan"],
  loan: ["loan", "line_of_credit", "other_liability"],
  credit_card: ["credit_card", "line_of_credit"],
};

export function isDebtBillType(billType: string): billType is (typeof DEBT_BILL_TYPES)[number] {
  return (DEBT_BILL_TYPES as readonly string[]).includes(billType);
}

/** The account a debt bill most likely pays down: the first of a matching type, if any. */
export function suggestedLiabilityAccount<T extends { id: string; type: AccountType }>(billType: string, accounts: T[]): T | undefined {
  if (!isDebtBillType(billType)) return undefined;
  const types = DEBT_ACCOUNT_TYPES[billType];
  return accounts.find((a) => types.includes(a.type));
}

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
