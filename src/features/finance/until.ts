/**
 * "How much do we need until …?" — the money needed from today (or a later
 * day) through a chosen date, with the reasons. Pure so it can be tested without a database.
 *
 *  - Budget lines contribute day by day: a day rate every day, a weekday rate
 *    Monday–Friday, a week rate ÷ 7 a day, and a monthly amount spread evenly
 *    over that month's days. Each day uses that month's budget (or the most
 *    recent earlier one, if the month has none yet).
 *  - Bills count when an unpaid occurrence falls in the window (an overdue one
 *    always counts). A bill in a budgeted category counts inside that line, at
 *    whichever is larger — the same rule as Expected spending. Bills charged
 *    to a credit card are left out: no cash leaves until the card is paid.
 *  - Income due in the window, and the cash on hand, show what's left after.
 *    A window that starts later leaves out today's cash and bills already
 *    overdue: it's what those dates themselves need.
 *
 * The first and last days both count.
 */
import { addDays, compareDates, diffDays, monthEnd, monthStart, weekday, type CalendarDate } from "@/lib/dates";
import type { Minor } from "@/lib/money";
import { occurrencesBetween, type Frequency } from "@/lib/recurrence";

export const RATE_PERIODS = ["month", "week", "weekday", "day"] as const;
export type RatePeriod = (typeof RATE_PERIODS)[number];

export const RATE_PERIOD_LABELS: Record<RatePeriod, string> = {
  month: "a month",
  week: "a week",
  weekday: "a weekday (Mon–Fri)",
  day: "a day",
};

const isWeekday = (d: CalendarDate) => {
  const w = weekday(d);
  return w >= 1 && w <= 5;
};

export function daysInMonth(month: CalendarDate): number {
  return diffDays(monthEnd(month), monthStart(month)) + 1;
}

export function weekdaysBetween(from: CalendarDate, to: CalendarDate): number {
  let n = 0;
  for (let d = from; compareDates(d, to) <= 0; d = addDays(d, 1)) if (isWeekday(d)) n++;
  return n;
}

/**
 * A rate as one month's budget amount; matches public.budget_rate_amount.
 * With a start day in the month, only that day to the month's end counts.
 */
export function rateForMonth(rateMinor: Minor, period: RatePeriod, month: CalendarDate, startsOn?: CalendarDate | null): Minor {
  const last = monthEnd(month);
  const first = startsOn && compareDates(startsOn, monthStart(month)) > 0 ? startsOn : monthStart(month);
  const days = diffDays(last, first) + 1;
  switch (period) {
    case "day":
      return rateMinor * days;
    case "weekday":
      return rateMinor * weekdaysBetween(first, last);
    case "week":
      return Math.round((rateMinor * days) / 7);
    default:
      return rateMinor;
  }
}

export type UntilBudgetLine = {
  month: CalendarDate;
  categoryId: string;
  name: string;
  /** The month's amount (already derived from the rate for rate lines). */
  amountMinor: Minor;
  rateMinor: Minor | null;
  ratePeriod: Exclude<RatePeriod, "month"> | null;
  /** A rate line for only the rest of its month starts on this day. */
  startsOn?: CalendarDate | null;
};

export type UntilRecurring = {
  id: string;
  direction: "bill" | "income";
  name: string;
  amountMinor: Minor;
  anchorDate: CalendarDate;
  nextDueDate: CalendarDate;
  endDate: CalendarDate | null;
  frequency: Frequency;
  intervalCount: number;
  isActive: boolean;
  categoryId: string | null;
  paidByCard: boolean;
};

export type UntilInput = {
  today: CalendarDate;
  /** The first day counted; today unless a later day is chosen. */
  from?: CalendarDate;
  until: CalendarDate;
  budget: UntilBudgetLine[];
  recurring: UntilRecurring[];
  parentOf: Map<string, string | null>;
  availableCashMinor: Minor;
  /** What-ifs for this calculation only: category → rate (or monthly amount). */
  overrides?: Map<string, Minor>;
};

export type UntilBill = { id: string; name: string; date: CalendarDate; amountMinor: Minor; overdue: boolean };

export type UntilLine = {
  categoryId: string;
  name: string;
  /** Needed for this line over the window (at least its bills). */
  amountMinor: Minor;
  /** How the budget works out, before bills: rate (or monthly amount) and its period. */
  rateMinor: Minor;
  period: RatePeriod;
  /** Days the line applies (weekdays for a weekday rate). */
  units: number;
  /** For a monthly amount within one month: that month's days. */
  monthDays: number | null;
  /** When the window spans months whose budgets differ: each month's rate (or monthly amount). */
  monthRates: { month: CalendarDate; rateMinor: Minor }[] | null;
  fromBudgetMinor: Minor;
  bills: UntilBill[];
  overridden: boolean;
};

export type UntilResult = {
  from: CalendarDate;
  until: CalendarDate;
  days: number;
  weekdays: number;
  lines: UntilLine[];
  bills: UntilBill[];
  income: UntilBill[];
  budgetMinor: Minor;
  billsMinor: Minor;
  totalMinor: Minor;
  incomeMinor: Minor;
  cashMinor: Minor;
  /** cash + income − total (income − total when the window starts later); negative means short. */
  leftOverMinor: Minor;
  /** The window starts after today, so today's cash isn't part of the comparison. */
  startsLater: boolean;
  cardBillsLeftOut: number;
};

function linesForMonth(byMonth: Map<CalendarDate, UntilBudgetLine[]>, months: CalendarDate[], month: CalendarDate): UntilBudgetLine[] {
  if (byMonth.has(month)) return byMonth.get(month)!;
  const earlier = months.filter((m) => compareDates(m, month) < 0);
  return earlier.length ? byMonth.get(earlier[earlier.length - 1])! : [];
}

/**
 * Unpaid occurrences of a recurring item within the window. An overdue bill
 * counts when the window starts today; a window that starts later only has
 * what falls due inside it.
 */
function occurrencesInWindow(r: UntilRecurring, today: CalendarDate, from: CalendarDate, until: CalendarDate): UntilBill[] {
  if (!r.isActive || compareDates(r.nextDueDate, until) > 0) return [];
  const out: UntilBill[] = [];
  const overdue = compareDates(r.nextDueDate, today) < 0;
  // The outstanding occurrence itself (an overdue bill is still owed; overdue income isn't counted on).
  if (overdue ? r.direction === "bill" && from === today : compareDates(r.nextDueDate, from) >= 0) {
    out.push({ id: r.id, name: r.name, date: r.nextDueDate, amountMinor: r.amountMinor, overdue });
  }
  // Then any later ones in the window, as the forecast does.
  const afterDue = addDays(r.nextDueDate, 1);
  const start = compareDates(afterDue, from) > 0 ? afterDue : from;
  for (const d of occurrencesBetween(r.anchorDate, r.frequency, r.intervalCount, start, until, r.endDate)) {
    if (compareDates(d, r.nextDueDate) <= 0) continue;
    out.push({ id: r.id, name: r.name, date: d, amountMinor: r.amountMinor, overdue: false });
  }
  return out;
}

export function needUntil(input: UntilInput): UntilResult {
  const from = input.from && compareDates(input.from, input.today) > 0 ? input.from : input.today;
  const until = compareDates(input.until, from) < 0 ? from : input.until;
  const startsLater = from !== input.today;
  const overrides = input.overrides ?? new Map<string, Minor>();
  const byMonth = new Map<CalendarDate, UntilBudgetLine[]>();
  for (const l of input.budget) {
    const m = monthStart(l.month);
    byMonth.set(m, [...(byMonth.get(m) ?? []), l]);
  }
  const months = [...byMonth.keys()].sort();

  // Budget lines, day by day.
  type Acc = { name: string; exact: number; rateMinor: Minor; period: RatePeriod; units: number; months: Map<CalendarDate, Minor>; overridden: boolean };
  const acc = new Map<string, Acc>();
  let days = 0;
  let weekdays = 0;
  for (let d = from; compareDates(d, until) <= 0; d = addDays(d, 1)) {
    days++;
    if (isWeekday(d)) weekdays++;
    const month = monthStart(d);
    for (const l of linesForMonth(byMonth, months, month)) {
      if (l.startsOn && compareDates(d, l.startsOn) < 0) continue;
      const period: RatePeriod = l.ratePeriod ?? "month";
      const override = overrides.get(l.categoryId);
      const rate = override ?? (l.ratePeriod ? (l.rateMinor ?? 0) : l.amountMinor);
      const perDay = period === "day" ? rate : period === "weekday" ? (isWeekday(d) ? rate : 0) : period === "week" ? rate / 7 : rate / daysInMonth(month);
      const a = acc.get(l.categoryId) ?? { name: l.name, exact: 0, rateMinor: rate, period, units: 0, months: new Map<CalendarDate, Minor>(), overridden: override !== undefined };
      a.exact += perDay;
      if (period !== "weekday" || isWeekday(d)) a.units++;
      a.months.set(month, rate);
      acc.set(l.categoryId, a);
    }
  }

  // Bills and income in the window.
  const lineFor = (categoryId: string | null) => {
    if (!categoryId) return null;
    if (acc.has(categoryId)) return categoryId;
    const parent = input.parentOf.get(categoryId);
    return parent && acc.has(parent) ? parent : null;
  };
  const billsIn = new Map<string, UntilBill[]>();
  const bills: UntilBill[] = [];
  const income: UntilBill[] = [];
  let cardBillsLeftOut = 0;
  for (const r of input.recurring) {
    const occ = occurrencesInWindow(r, input.today, from, until);
    if (!occ.length) continue;
    if (r.direction === "income") {
      income.push(...occ);
      continue;
    }
    if (r.paidByCard) {
      cardBillsLeftOut++;
      continue;
    }
    const line = lineFor(r.categoryId);
    if (line) billsIn.set(line, [...(billsIn.get(line) ?? []), ...occ]);
    else bills.push(...occ);
  }

  const lines: UntilLine[] = [...acc.entries()]
    .map(([categoryId, a]) => {
      const fromBudgetMinor = Math.round(a.exact);
      const inside = (billsIn.get(categoryId) ?? []).sort((x, y) => x.date.localeCompare(y.date));
      const billsTotal = inside.reduce((s, b) => s + b.amountMinor, 0);
      return {
        categoryId,
        name: a.name,
        amountMinor: Math.max(fromBudgetMinor, billsTotal),
        rateMinor: a.rateMinor,
        period: a.period,
        units: a.units,
        monthDays: a.period === "month" && a.months.size === 1 ? daysInMonth([...a.months.keys()][0]) : null,
        monthRates: new Set(a.months.values()).size > 1 ? [...a.months].map(([month, rateMinor]) => ({ month, rateMinor })) : null,
        fromBudgetMinor,
        bills: inside,
        overridden: a.overridden,
      };
    })
    .filter((l) => l.amountMinor > 0 || l.overridden)
    .sort((x, y) => y.amountMinor - x.amountMinor);

  bills.sort((x, y) => x.date.localeCompare(y.date));
  income.sort((x, y) => x.date.localeCompare(y.date));
  const budgetMinor = lines.reduce((s, l) => s + l.amountMinor, 0);
  const billsMinor = bills.reduce((s, b) => s + b.amountMinor, 0);
  const incomeMinor = income.reduce((s, b) => s + b.amountMinor, 0);
  const totalMinor = budgetMinor + billsMinor;
  return {
    from,
    until,
    days,
    weekdays,
    lines,
    bills,
    income,
    budgetMinor,
    billsMinor,
    totalMinor,
    incomeMinor,
    cashMinor: input.availableCashMinor,
    leftOverMinor: (startsLater ? 0 : input.availableCashMinor) + incomeMinor - totalMinor,
    startsLater,
    cardBillsLeftOut,
  };
}

/** Handy end dates: this Friday (or next, if today is Friday or later), and the end of the month. */
export function quickDates(today: CalendarDate): { friday: CalendarDate; monthEnd: CalendarDate } {
  const w = weekday(today);
  const toFriday = (5 - w + 7) % 7 || 7;
  return { friday: addDays(today, toFriday), monthEnd: monthEnd(today) };
}
