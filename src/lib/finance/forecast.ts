/**
 * "Safe to spend until payday": available cash minus the bills that fall due
 * before the next expected income. Bills charged to a credit card are left
 * out (they don't leave cash until the card is paid). Overdue, unsettled
 * bills are always included — they are still owed.
 */
import { compareDates, addDays, type CalendarDate } from "@/lib/dates";
import { assertMinor, type Minor } from "@/lib/money";
import { occurrencesBetween, type Frequency } from "@/lib/recurrence";

export type ForecastItem = {
  direction: "bill" | "income";
  name: string;
  amount_minor: Minor;
  anchor_date: CalendarDate;
  next_due_date: CalendarDate;
  end_date: CalendarDate | null;
  frequency: Frequency;
  interval_count: number;
  is_active: boolean;
  paidByCard: boolean;
};

export type SafeToSpend = {
  payday: CalendarDate;
  incomeName: string;
  safeMinor: Minor;
  billsMinor: Minor;
  bills: { name: string; date: CalendarDate; amount_minor: Minor }[];
};

export function safeToSpend(availableCashMinor: Minor, items: ForecastItem[], today: CalendarDate): SafeToSpend | null {
  assertMinor(availableCashMinor);
  const income = items
    .filter((i) => i.is_active && i.direction === "income" && compareDates(i.next_due_date, today) >= 0)
    .sort((a, b) => a.next_due_date.localeCompare(b.next_due_date))[0];
  if (!income) return null;
  const payday = income.next_due_date;

  const bills: SafeToSpend["bills"] = [];
  for (const b of items) {
    if (!b.is_active || b.direction !== "bill" || b.paidByCard) continue;
    if (compareDates(b.next_due_date, payday) >= 0) continue;
    // The outstanding occurrence (possibly overdue), then any later ones before payday.
    const dates = [b.next_due_date, ...occurrencesBetween(b.anchor_date, b.frequency, b.interval_count, addDays(b.next_due_date, 1), addDays(payday, -1), b.end_date)];
    for (const date of dates) bills.push({ name: b.name, date, amount_minor: b.amount_minor });
  }
  bills.sort((a, b) => a.date.localeCompare(b.date));
  const billsMinor = bills.reduce((s, b) => s + b.amount_minor, 0);
  return { payday, incomeName: income.name, safeMinor: availableCashMinor - billsMinor, billsMinor, bills };
}
