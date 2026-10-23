import { addDays, diffDays, type CalendarDate } from "@/lib/dates";

type Point = { onDate: CalendarDate; weightKg: number };

/**
 * Seven-day moving average: for each weigh-in, the mean of every weigh-in in
 * the seven calendar days ending that day. Missing days don't count as zero,
 * so irregular weighing still gives a sensible line.
 */
export function movingAverage(points: Point[], windowDays = 7): { onDate: CalendarDate; avgKg: number }[] {
  const sorted = [...points].sort((a, b) => a.onDate.localeCompare(b.onDate));
  const out: { onDate: CalendarDate; avgKg: number }[] = [];
  let start = 0;
  let sum = 0;
  for (let i = 0; i < sorted.length; i++) {
    sum += sorted[i].weightKg;
    while (diffDays(sorted[i].onDate, sorted[start].onDate) >= windowDays) {
      sum -= sorted[start].weightKg;
      start++;
    }
    out.push({ onDate: sorted[i].onDate, avgKg: Math.round((sum / (i - start + 1)) * 100) / 100 });
  }
  return out;
}

/** Straight line from the start of the goal to the target, evaluated on a date. */
export function goalLineAt(
  goal: { startDate: CalendarDate; startKg: number; targetDate: CalendarDate; targetKg: number },
  date: CalendarDate,
): number {
  const total = diffDays(goal.targetDate, goal.startDate);
  if (total <= 0) return goal.targetKg;
  const t = Math.min(1, Math.max(0, diffDays(date, goal.startDate) / total));
  return Math.round((goal.startKg + (goal.targetKg - goal.startKg) * t) * 100) / 100;
}

/**
 * Change in the trend over the last week (kg, negative = down): the latest
 * average minus the average as it stood seven days earlier. Null without
 * enough history.
 */
export function weeklyTrendChange(trend: { onDate: CalendarDate; avgKg: number }[]): number | null {
  if (trend.length < 2) return null;
  const latest = trend[trend.length - 1];
  const cutoff = addDays(latest.onDate, -7);
  const earlier = [...trend].reverse().find((p) => p.onDate <= cutoff);
  if (!earlier) return null;
  const days = diffDays(latest.onDate, earlier.onDate);
  return Math.round(((latest.avgKg - earlier.avgKg) / days) * 7 * 100) / 100;
}

/** How far along the goal is (0–1), from start weight to target. */
export function goalProgress(startKg: number, currentKg: number, targetKg: number): number {
  const total = targetKg - startKg;
  if (total === 0) return 1;
  return Math.min(1, Math.max(0, (currentKg - startKg) / total));
}
