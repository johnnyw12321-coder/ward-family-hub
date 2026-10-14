import {
  addDays,
  addMonths,
  addYears,
  diffDays,
  formatDate,
  isCalendarDate,
  monthEnd,
  monthLabel,
  monthStart,
  yearEnd,
  yearStart,
  type CalendarDate,
} from "@/lib/dates";

export const PERIOD_PRESETS = [
  { value: "this-month", label: "This month" },
  { value: "last-month", label: "Last month" },
  { value: "this-year", label: "This year" },
  { value: "last-year", label: "Last year" },
  { value: "last-12", label: "Last 12 months" },
  { value: "year", label: "A specific year" },
  { value: "custom", label: "Custom range" },
] as const;
export type PeriodPreset = (typeof PERIOD_PRESETS)[number]["value"];

export type Period = {
  preset: PeriodPreset;
  from: CalendarDate;
  to: CalendarDate;
  label: string;
  /** Equivalent earlier period for comparison. */
  prevFrom: CalendarDate;
  prevTo: CalendarDate;
  compareLabel: string;
  /** Range used for month-by-month trend charts (at least 6 months). */
  trendFrom: CalendarDate;
  trendTo: CalendarDate;
};

function trendRange(from: CalendarDate, to: CalendarDate): { trendFrom: CalendarDate; trendTo: CalendarDate } {
  const minStart = addMonths(monthStart(to), -5);
  return { trendFrom: from < minStart ? monthStart(from) : minStart, trendTo: monthEnd(to) };
}

/**
 * Resolve report period parameters. Comparisons use the same span: a month
 * compares with the previous month, a year with the previous year, and a
 * custom range with the same number of days immediately before it. Periods
 * that include today are cut off at today, and so is their comparison, so a
 * part-month is never compared with a full one.
 */
export function resolvePeriod(params: { preset?: string; from?: string; to?: string; year?: string }, today: CalendarDate): Period {
  const preset = (PERIOD_PRESETS.some((p) => p.value === params.preset) ? params.preset : "this-month") as PeriodPreset;
  const thisMonth = monthStart(today);

  const make = (p: PeriodPreset, from: CalendarDate, to: CalendarDate, label: string, prevFrom: CalendarDate, prevTo: CalendarDate, compareLabel: string): Period => ({
    preset: p,
    from,
    to,
    label,
    prevFrom,
    prevTo,
    compareLabel,
    ...trendRange(from, to),
  });

  switch (preset) {
    case "last-month": {
      const m = addMonths(thisMonth, -1);
      const pm = addMonths(m, -1);
      return make(preset, m, monthEnd(m), monthLabel(m), pm, monthEnd(pm), monthLabel(pm));
    }
    case "this-year": {
      const y = yearStart(today);
      const py = addYears(y, -1);
      return make(preset, y, today, `${today.slice(0, 4)} to date`, py, addYears(today, -1), `${py.slice(0, 4)} to the same date`);
    }
    case "last-year":
    case "year": {
      const yearParam = Number(params.year);
      const yearNum = preset === "year" && Number.isInteger(yearParam) && yearParam >= 1990 && yearParam <= 2100 ? yearParam : Number(today.slice(0, 4)) - 1;
      const y = `${yearNum}-01-01`;
      const end = yearEnd(y) > today ? today : yearEnd(y);
      const py = addYears(y, -1);
      return make(
        preset === "year" ? "year" : "last-year",
        y,
        end,
        String(yearNum),
        py,
        addYears(end, -1),
        String(yearNum - 1),
      );
    }
    case "last-12": {
      const from = addMonths(thisMonth, -11);
      const pf = addMonths(from, -12);
      return make(preset, from, today, "Last 12 months", pf, addYears(today, -1), "the 12 months before");
    }
    case "custom": {
      let from = params.from && isCalendarDate(params.from) ? params.from : thisMonth;
      let to = params.to && isCalendarDate(params.to) ? params.to : today;
      if (from > to) [from, to] = [to, from];
      const span = diffDays(to, from);
      const prevTo = addDays(from, -1);
      return make(preset, from, to, `${formatDate(from)} – ${formatDate(to)}`, addDays(prevTo, -span), prevTo, "the previous period");
    }
    default: {
      const pm = addMonths(thisMonth, -1);
      const sameDay = addMonths(today, -1);
      return make("this-month", thisMonth, today, `${monthLabel(thisMonth)} to date`, pm, sameDay > monthEnd(pm) ? monthEnd(pm) : sameDay, `${monthLabel(pm)} to the same day`);
    }
  }
}
