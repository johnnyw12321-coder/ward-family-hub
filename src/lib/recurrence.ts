/**
 * Recurrence schedules. Occurrence k is anchor + k * step, computed from the
 * anchor every time (not chained), so a bill due on the 31st falls on the last
 * day of short months and returns to the 31st afterwards.
 *
 * Mirrors public.next_occurrence_after() in the finance migration; both are
 * tested against the same cases.
 */
import { addDays, addMonths, addYears, compareDates, diffDays, type CalendarDate } from "@/lib/dates";

export type Frequency = "weekly" | "monthly" | "yearly";

export function occurrence(anchor: CalendarDate, frequency: Frequency, interval: number, k: number): CalendarDate {
  switch (frequency) {
    case "weekly":
      return addDays(anchor, 7 * interval * k);
    case "monthly":
      return addMonths(anchor, interval * k);
    case "yearly":
      return addYears(anchor, interval * k);
  }
}

function estimateIndex(anchor: CalendarDate, frequency: Frequency, interval: number, target: CalendarDate): number {
  if (frequency === "weekly") return Math.floor(diffDays(target, anchor) / (7 * interval));
  const [ay, am] = [Number(anchor.slice(0, 4)), Number(anchor.slice(5, 7))];
  const [ty, tm] = [Number(target.slice(0, 4)), Number(target.slice(5, 7))];
  if (frequency === "monthly") return Math.floor(((ty - ay) * 12 + (tm - am)) / interval);
  return Math.floor((ty - ay) / interval);
}

/** First occurrence strictly after `after` (or the anchor if it is later). */
export function nextOccurrenceAfter(
  anchor: CalendarDate,
  frequency: Frequency,
  interval: number,
  after: CalendarDate,
): CalendarDate {
  if (compareDates(anchor, after) > 0) return anchor;
  let k = Math.max(0, estimateIndex(anchor, frequency, interval, after) - 1);
  for (;;) {
    const candidate = occurrence(anchor, frequency, interval, k);
    if (compareDates(candidate, after) > 0) return candidate;
    k += 1;
  }
}

/** All occurrences within [from, to], optionally stopping at `until`. */
export function occurrencesBetween(
  anchor: CalendarDate,
  frequency: Frequency,
  interval: number,
  from: CalendarDate,
  to: CalendarDate,
  until?: CalendarDate | null,
  limit = 500,
): CalendarDate[] {
  const out: CalendarDate[] = [];
  let k = Math.max(0, estimateIndex(anchor, frequency, interval, from) - 1);
  for (let guard = 0; guard < limit + 50; guard++) {
    const d = occurrence(anchor, frequency, interval, k);
    k += 1;
    if (compareDates(d, from) < 0) continue;
    if (compareDates(d, to) > 0) break;
    if (until && compareDates(d, until) > 0) break;
    out.push(d);
    if (out.length >= limit) break;
  }
  return out;
}

export function describeRecurrence(frequency: Frequency, interval: number): string {
  const unit = { weekly: "week", monthly: "month", yearly: "year" }[frequency];
  if (interval === 1) return { weekly: "Weekly", monthly: "Monthly", yearly: "Yearly" }[frequency];
  if (frequency === "weekly" && interval === 2) return "Every 2 weeks";
  if (frequency === "monthly" && interval === 3) return "Quarterly";
  if (frequency === "monthly" && interval === 6) return "Twice a year";
  return `Every ${interval} ${unit}s`;
}

/** Presets offered in forms. */
export const RECURRENCE_PRESETS: { value: string; label: string; frequency: Frequency; interval: number }[] = [
  { value: "weekly-1", label: "Weekly", frequency: "weekly", interval: 1 },
  { value: "weekly-2", label: "Every 2 weeks", frequency: "weekly", interval: 2 },
  { value: "monthly-1", label: "Monthly", frequency: "monthly", interval: 1 },
  { value: "monthly-2", label: "Every 2 months", frequency: "monthly", interval: 2 },
  { value: "monthly-3", label: "Quarterly", frequency: "monthly", interval: 3 },
  { value: "monthly-6", label: "Twice a year", frequency: "monthly", interval: 6 },
  { value: "yearly-1", label: "Yearly", frequency: "yearly", interval: 1 },
];

export function presetValue(frequency: Frequency, interval: number): string {
  return `${frequency}-${interval}`;
}

export function parsePreset(value: string): { frequency: Frequency; interval: number } | null {
  const preset = RECURRENCE_PRESETS.find((p) => p.value === value);
  return preset ? { frequency: preset.frequency, interval: preset.interval } : null;
}
