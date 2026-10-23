import { addDays, type CalendarDate } from "@/lib/dates";
import type { Goal } from "../types";

/**
 * The dashboard's weekly summary: the last seven days (including today),
 * averaged over days that were actually logged so a forgotten day doesn't
 * drag the averages down.
 */
export type WeekInput = {
  today: CalendarDate;
  goal: Goal;
  foodLogs: { onDate: CalendarDate; calories: number; proteinG: number }[];
  water: { onDate: CalendarDate; totalMl: number }[];
  workoutDates: CalendarDate[];
  targets: { calories: number; proteinG: number; waterMl: number; workoutsPerWeek: number | null };
  /** Change in trend weight per week, kg (null without enough history). */
  trendPerWeekKg: number | null;
  formatKg: (kg: number) => string;
};

export type Insight = { tone: "good" | "neutral" | "nudge"; text: string };

export type WeekSummary = {
  daysLogged: number;
  avgCalories: number | null;
  avgProtein: number | null;
  waterDays: number;
  workouts: number;
  insights: Insight[];
};

export function weekSummary(w: WeekInput): WeekSummary {
  const from = addDays(w.today, -6);
  const inWeek = (d: CalendarDate) => d >= from && d <= w.today;
  const byDay = new Map<CalendarDate, { calories: number; protein: number }>();
  for (const l of w.foodLogs.filter((l) => inWeek(l.onDate))) {
    const d = byDay.get(l.onDate) ?? { calories: 0, protein: 0 };
    byDay.set(l.onDate, { calories: d.calories + l.calories, protein: d.protein + l.proteinG });
  }
  // Today is still in progress, so it only counts once it's past the target.
  const complete = [...byDay.entries()].filter(([d, v]) => d !== w.today || v.calories >= w.targets.calories * 0.8).map(([, v]) => v);
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
  const avgCalories = avg(complete.map((v) => v.calories));
  const avgProtein = avg(complete.map((v) => v.protein));
  const waterDays = w.water.filter((x) => inWeek(x.onDate) && x.totalMl >= w.targets.waterMl).length;
  const workouts = w.workoutDates.filter(inWeek).length;

  const insights: Insight[] = [];
  if (avgProtein !== null) {
    const ratio = avgProtein / w.targets.proteinG;
    insights.push({
      tone: ratio >= 0.9 ? "good" : "nudge",
      text:
        ratio >= 0.9
          ? `Average protein this week: ${avgProtein} g — on target (${w.targets.proteinG} g).`
          : `Average protein this week: ${avgProtein} g, short of your ${w.targets.proteinG} g target. Add a protein source to one more meal.`,
    });
  }
  if (avgCalories !== null) {
    const diff = avgCalories - w.targets.calories;
    const close = Math.abs(diff) <= w.targets.calories * 0.07;
    insights.push({
      tone: close ? "good" : "neutral",
      text: close
        ? `Calories averaged ${avgCalories.toLocaleString("en-GB")} a day, right around your target.`
        : `Calories averaged ${avgCalories.toLocaleString("en-GB")} a day, ${Math.abs(diff).toLocaleString("en-GB")} ${diff > 0 ? "over" : "under"} your target.`,
    });
  }
  if (byDay.size < 5) {
    insights.push({ tone: "nudge", text: `You logged food on ${byDay.size} of the last 7 days. More complete logs make the numbers more useful.` });
  } else {
    insights.push({ tone: "good", text: `You logged food on ${byDay.size} of the last 7 days. Great consistency.` });
  }
  if (w.targets.workoutsPerWeek) {
    insights.push({
      tone: workouts >= w.targets.workoutsPerWeek ? "good" : "neutral",
      text: `${workouts} of ${w.targets.workoutsPerWeek} planned workouts in the last 7 days.`,
    });
  } else if (workouts) {
    insights.push({ tone: "good", text: `${workouts} ${workouts === 1 ? "workout" : "workouts"} in the last 7 days.` });
  }
  if (w.trendPerWeekKg !== null) {
    const t = w.trendPerWeekKg;
    const wantDown = w.goal === "lose_fat";
    const wantUp = w.goal === "gain_weight" || w.goal === "build_muscle";
    const steady = Math.abs(t) < 0.1;
    const good = (wantDown && t < 0) || (wantUp && t > 0) || (w.goal === "maintain" && steady);
    insights.push({
      tone: good ? "good" : "neutral",
      text: steady
        ? "Your weight trend is holding steady."
        : `Your weight trend is ${t < 0 ? "down" : "up"} ${w.formatKg(Math.abs(t))} a week${good ? " — heading the right way." : "."}`,
    });
  }
  if (waterDays >= 5) insights.push({ tone: "good", text: `You hit your water goal on ${waterDays} days.` });

  return { daysLogged: byDay.size, avgCalories, avgProtein, waterDays, workouts, insights };
}
