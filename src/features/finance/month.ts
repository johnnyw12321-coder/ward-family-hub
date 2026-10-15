/**
 * "This month" view of recurring bills and income: every occurrence due in the
 * month, with what has already been paid, skipped or is still outstanding.
 * Pure so it can be tested without a database.
 */
import { compareDates, monthEnd, type CalendarDate } from "@/lib/dates";
import type { Minor } from "@/lib/money";
import { occurrencesBetween } from "@/lib/recurrence";
import type { RecurringItem } from "./types";

export type MonthEntryStatus = "paid" | "skipped" | "overdue" | "due";

export type MonthEntry = {
  item: RecurringItem;
  dueDate: CalendarDate;
  status: MonthEntryStatus;
  /** What was actually paid for settled entries, otherwise the expected amount. */
  amount: Minor;
  /** The item's next unsettled occurrence: the only one that can be settled now. */
  isNext: boolean;
};

export type MonthPayment = {
  recurring_id: string;
  due_date: CalendarDate;
  status: "paid" | "skipped";
  amount_minor: Minor | null;
};

export type MonthGroup = {
  entries: MonthEntry[];
  /** Expected for the month: settled amounts plus everything still outstanding (skips excluded). */
  total: Minor;
  /** Paid (bills) or received (income) so far. */
  settled: Minor;
  outstanding: Minor;
  overdueCount: number;
};

const ORDER: Record<MonthEntryStatus, number> = { overdue: 0, due: 1, paid: 2, skipped: 3 };

export function monthEntries(
  items: RecurringItem[],
  payments: MonthPayment[],
  month: CalendarDate,
  today: CalendarDate,
): { bills: MonthGroup; income: MonthGroup } {
  const end = monthEnd(month);
  const byItem = new Map(items.map((i) => [i.id, i]));
  const entries: MonthEntry[] = [];

  // Already settled this month (including items paused since).
  for (const p of payments) {
    const item = byItem.get(p.recurring_id);
    if (!item || compareDates(p.due_date, month) < 0 || compareDates(p.due_date, end) > 0) continue;
    entries.push({
      item,
      dueDate: p.due_date,
      status: p.status,
      amount: p.status === "paid" ? (p.amount_minor ?? item.amount_minor) : 0,
      isNext: false,
    });
  }

  // Still outstanding: from the next due date to the end of the month. A next
  // due date before this month is a carried-over overdue item.
  for (const item of items) {
    if (!item.is_active || compareDates(item.next_due_date, end) > 0) continue;
    const from = compareDates(item.next_due_date, month) < 0 ? item.next_due_date : month;
    const dates = occurrencesBetween(item.anchor_date, item.frequency, item.interval_count, from, end, item.end_date).filter(
      (d) => compareDates(d, item.next_due_date) >= 0,
    );
    // From before this month, only the oldest unsettled occurrence, and only
    // once it is overdue; the rest stay on the bill page.
    dates.forEach((dueDate, i) => {
      const inMonth = compareDates(dueDate, month) >= 0;
      const overdue = compareDates(dueDate, today) < 0;
      if (!inMonth && !(i === 0 && overdue)) return;
      entries.push({ item, dueDate, status: overdue ? "overdue" : "due", amount: item.amount_minor, isNext: i === 0 });
    });
  }

  entries.sort((a, b) => ORDER[a.status] - ORDER[b.status] || compareDates(a.dueDate, b.dueDate) || a.item.name.localeCompare(b.item.name));
  const group = (direction: RecurringItem["direction"]): MonthGroup => {
    const list = entries.filter((e) => e.item.direction === direction);
    const settled = list.filter((e) => e.status === "paid").reduce((s, e) => s + e.amount, 0);
    const outstanding = list.filter((e) => e.status === "due" || e.status === "overdue").reduce((s, e) => s + e.amount, 0);
    return {
      entries: list,
      total: settled + outstanding,
      settled,
      outstanding,
      overdueCount: list.filter((e) => e.status === "overdue").length,
    };
  };
  return { bills: group("bill"), income: group("income") };
}
