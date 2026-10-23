import { addDays, diffDays, type CalendarDate } from "@/lib/dates";
import type { ActivityLevel, Goal, HealthProfile, Sex } from "../types";

/**
 * Energy targets: BMR (Mifflin-St Jeor), TDEE and a goal-adjusted calorie
 * target, with the safety rails Ward Health promises:
 *   - never below a sensible minimum (1,500 kcal men, 1,200 women),
 *   - deficits capped at 25% of TDEE (and 1,000 kcal),
 *   - a warning when the planned pace is aggressive (losing > 1% of body
 *     weight a week, or gaining > 0.5%).
 * General guidance only, not medical advice.
 */

export const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

export const ACTIVITY_LABELS: Record<ActivityLevel, { label: string; hint: string }> = {
  sedentary: { label: "Sedentary", hint: "Desk job, little exercise" },
  light: { label: "Lightly active", hint: "Exercise 1–3 days a week" },
  moderate: { label: "Moderately active", hint: "Exercise 3–5 days a week" },
  active: { label: "Very active", hint: "Hard exercise 6–7 days a week" },
  very_active: { label: "Extra active", hint: "Physical job plus training" },
};

export const GOAL_LABELS: Record<Goal, { label: string; hint: string }> = {
  lose_fat: { label: "Lose fat", hint: "A steady calorie deficit, keeping muscle" },
  build_muscle: { label: "Build muscle", hint: "A small surplus with lots of protein" },
  gain_weight: { label: "Gain weight", hint: "A bigger surplus to put on size" },
  maintain: { label: "Maintain", hint: "Eat at your maintenance calories" },
};

/** Calories per kilogram of body-weight change (the usual approximation). */
export const KCAL_PER_KG = 7700;

export const CALORIE_FLOOR: Record<Sex, number> = { male: 1500, female: 1200, unspecified: 1350 };

const MAX_DEFICIT_KCAL = 1000;
const MAX_DEFICIT_SHARE = 0.25;
const MAX_SURPLUS_KCAL = 750;
const DEFAULT_LOSS_PCT = 0.005; // 0.5% of body weight a week
const AGGRESSIVE_LOSS_PCT = 0.01;
const AGGRESSIVE_GAIN_PCT = 0.005;
const MUSCLE_SURPLUS_KCAL = 250;
const GAIN_SURPLUS_KCAL = 500;

export type BodyStats = { sex: Sex; weightKg: number; heightCm: number; ageYears: number };

/** Mifflin-St Jeor resting energy. "Unspecified" uses the midpoint of the two constants. */
export function bmr({ sex, weightKg, heightCm, ageYears }: BodyStats): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * ageYears;
  const constant = sex === "male" ? 5 : sex === "female" ? -161 : -78;
  return base + constant;
}

export function tdee(stats: BodyStats, activity: ActivityLevel): number {
  return bmr(stats) * ACTIVITY_FACTORS[activity];
}

/** Age today, from the age entered and the day it was entered. */
export function currentAge(profile: Pick<HealthProfile, "ageYears" | "ageSetOn">, today: CalendarDate): number {
  return profile.ageYears + Math.max(0, Math.floor(diffDays(today, profile.ageSetOn) / 365.25));
}

export type Warning = { level: "info" | "caution"; message: string };

export type EnergyPlan = {
  bmr: number;
  tdee: number;
  /** Daily calories to eat (rounded to 10). */
  target: number;
  /** Target minus TDEE: negative is a deficit. */
  adjustment: number;
  /** Expected change per week at the target, in kg (negative = loss). */
  weeklyChangeKg: number;
  /** The same, as a share of current body weight. */
  weeklyChangePct: number;
  /** When the target weight would be reached at this pace, if there is one. */
  projectedDate: CalendarDate | null;
  floorApplied: boolean;
  warnings: Warning[];
};

export type PlanInput = {
  sex: Sex;
  ageYears: number;
  heightCm: number;
  activityLevel: ActivityLevel;
  goal: Goal;
  currentWeightKg: number;
  targetWeightKg: number | null;
  targetDate: CalendarDate | null;
  today: CalendarDate;
};

const round10 = (v: number) => Math.round(v / 10) * 10;

export function energyPlan(input: PlanInput): EnergyPlan {
  const stats: BodyStats = { sex: input.sex, weightKg: input.currentWeightKg, heightCm: input.heightCm, ageYears: input.ageYears };
  const rest = bmr(stats);
  const maintenance = rest * ACTIVITY_FACTORS[input.activityLevel];
  const weight = input.currentWeightKg;
  const warnings: Warning[] = [];
  const weeksLeft = input.targetDate ? diffDays(input.targetDate, input.today) / 7 : null;
  const toGo = input.targetWeightKg !== null ? input.targetWeightKg - weight : null;
  if (weeksLeft !== null && weeksLeft <= 0) {
    warnings.push({ level: "info", message: "Your target date has passed. Pick a new date to update your plan." });
  }
  const timeline = weeksLeft !== null && weeksLeft > 0 ? weeksLeft : null;

  let adjustment = 0;
  switch (input.goal) {
    case "lose_fat": {
      let weeklyKg = weight * DEFAULT_LOSS_PCT;
      if (toGo !== null && toGo >= 0) {
        warnings.push({ level: "info", message: "Your target weight isn't below your current weight. Update it, or choose Maintain." });
      } else if (toGo !== null && timeline) {
        weeklyKg = -toGo / timeline;
        if (weeklyKg / weight > AGGRESSIVE_LOSS_PCT) {
          warnings.push({
            level: "caution",
            message: `Reaching your target by then means losing about ${((weeklyKg / weight) * 100).toFixed(1)}% of your body weight a week. More than 1% is aggressive and risks losing muscle, so your plan uses a safer pace. Consider a later date.`,
          });
          weeklyKg = weight * AGGRESSIVE_LOSS_PCT;
        }
      }
      const wanted = (weeklyKg * KCAL_PER_KG) / 7;
      const cap = Math.min(MAX_DEFICIT_KCAL, maintenance * MAX_DEFICIT_SHARE);
      if (wanted > cap) {
        warnings.push({ level: "caution", message: "Your deficit is capped at a quarter of your maintenance calories (and 1,000 kcal) so it stays sustainable." });
      }
      adjustment = -Math.min(wanted, cap);
      break;
    }
    case "gain_weight": {
      let surplus = GAIN_SURPLUS_KCAL;
      if (toGo !== null && toGo <= 0) {
        warnings.push({ level: "info", message: "Your target weight isn't above your current weight. Update it, or choose another goal." });
      } else if (toGo !== null && timeline) {
        const weeklyKg = toGo / timeline;
        if (weeklyKg / weight > AGGRESSIVE_GAIN_PCT) {
          warnings.push({
            level: "caution",
            message: "Gaining faster than about 0.5% of your body weight a week mostly adds fat. Your plan uses a steadier surplus; consider a later date.",
          });
        }
        surplus = Math.min(MAX_SURPLUS_KCAL, Math.max(250, (Math.min(weeklyKg, weight * AGGRESSIVE_GAIN_PCT) * KCAL_PER_KG) / 7));
      }
      adjustment = surplus;
      break;
    }
    case "build_muscle":
      adjustment = MUSCLE_SURPLUS_KCAL;
      break;
    case "maintain":
      adjustment = 0;
      break;
  }

  let target = round10(maintenance + adjustment);
  const floor = CALORIE_FLOOR[input.sex];
  const floorApplied = target < floor;
  if (floorApplied) {
    target = floor;
    warnings.push({
      level: "caution",
      message: `Your target is held at ${floor.toLocaleString("en-GB")} kcal, the minimum Ward Health will suggest. Eating less than this is best done only with a doctor's guidance.`,
    });
  }
  const actualAdjustment = target - maintenance;
  const weeklyChangeKg = (actualAdjustment * 7) / KCAL_PER_KG;

  let projectedDate: CalendarDate | null = null;
  if (toGo !== null && toGo !== 0 && Math.sign(toGo) === Math.sign(weeklyChangeKg) && Math.abs(weeklyChangeKg) > 0.01) {
    projectedDate = addDays(input.today, Math.ceil((toGo / weeklyChangeKg) * 7));
  }

  return {
    bmr: Math.round(rest),
    tdee: Math.round(maintenance),
    target,
    adjustment: Math.round(actualAdjustment),
    weeklyChangeKg,
    weeklyChangePct: weeklyChangeKg / weight,
    projectedDate,
    floorApplied,
    warnings,
  };
}

/** The plan for a saved profile at its latest weight. */
export function profilePlan(profile: HealthProfile, currentWeightKg: number, today: CalendarDate): EnergyPlan {
  return energyPlan({
    sex: profile.sex,
    ageYears: currentAge(profile, today),
    heightCm: profile.heightCm,
    activityLevel: profile.activityLevel,
    goal: profile.goal,
    currentWeightKg,
    targetWeightKg: profile.targetWeightKg,
    targetDate: profile.targetDate,
    today,
  });
}

/** Body mass index, for context only (it says nothing about muscle). */
export function bmi(weightKg: number, heightCm: number): number {
  const m = heightCm / 100;
  return weightKg / (m * m);
}
