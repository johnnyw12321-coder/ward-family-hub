import { addDays, type CalendarDate } from "@/lib/dates";

/**
 * Days in a row with activity, ending today — or yesterday, so a streak isn't
 * shown as broken before the person has had a chance to log today.
 */
export function currentStreak(days: Iterable<CalendarDate>, today: CalendarDate): number {
  const set = new Set(days);
  let day = set.has(today) ? today : addDays(today, -1);
  let count = 0;
  while (set.has(day)) {
    count++;
    day = addDays(day, -1);
  }
  return count;
}

export function longestStreak(days: Iterable<CalendarDate>): number {
  const sorted = [...new Set(days)].sort();
  let best = 0;
  let run = 0;
  let prev: CalendarDate | null = null;
  for (const d of sorted) {
    run = prev && addDays(prev, 1) === d ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}
