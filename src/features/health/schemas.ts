import { z } from "zod";
import { isCalendarDate, type CalendarDate } from "@/lib/dates";
import { feetInchesToCm, toCm, toKg, weightUnit } from "./calc/units";
import { ACTIVITY_LEVELS, FASTING_PROTOCOLS, GOALS, MEALS, SEXES, UNIT_SYSTEMS, type ActivityLevel, type Goal, type Sex, type Units } from "./types";

/**
 * Zod schemas shared by Ward Health forms and Server Actions. Forms keep what
 * was typed (strings, in the person's units); converting to metric happens
 * once, in the helpers below, on both sides.
 */

const decimal = /^\d{1,4}([.,]\d{1,2})?$/;
const parse = (v: string | undefined) => (v ? Number(v.replace(",", ".")) : NaN);
const optionalDate = z.union([z.string().refine(isCalendarDate, "Enter a valid date"), z.literal("")]).optional();

export const profileSchema = (opts: { today: CalendarDate; requireWeight: boolean }) =>
  z
    .object({
      units: z.enum(UNIT_SYSTEMS),
      // Choices are checked in superRefine with everything else, so every
      // missing field is flagged at once (a failed enum would stop it running).
      sex: z.string(),
      age: z.string().trim(),
      heightCm: z.string().trim().optional(),
      heightFt: z.string().trim().optional(),
      heightIn: z.string().trim().optional(),
      weight: z.string().trim().optional(),
      activityLevel: z.string(),
      goal: z.string(),
      targetWeight: z.string().trim().optional(),
      targetDate: optionalDate,
    })
    .superRefine((v, ctx) => {
      const issue = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
      if (!(SEXES as readonly string[]).includes(v.sex)) issue("sex", "Choose one");
      if (!(ACTIVITY_LEVELS as readonly string[]).includes(v.activityLevel)) issue("activityLevel", "Choose the closest match");
      if (!(GOALS as readonly string[]).includes(v.goal)) issue("goal", "Choose a goal");
      const age = parse(v.age);
      if (!/^\d{1,3}$/.test(v.age) || age < 13 || age > 100) issue("age", "Enter an age between 13 and 100");

      const height = heightToCm(v);
      if (height === null) issue(v.units === "metric" ? "heightCm" : "heightFt", "Enter your height");
      else if (height < 100 || height > 250) issue(v.units === "metric" ? "heightCm" : "heightFt", "That height looks out of range");

      const unit = weightUnit(v.units);
      if (v.weight || opts.requireWeight) {
        const w = weightToKg(v.weight, v.units);
        if (w === null) issue("weight", `Enter your weight in ${unit}`);
        else if (w < 30 || w > 350) issue("weight", "That weight looks out of range");
      }
      if (v.targetWeight) {
        const t = weightToKg(v.targetWeight, v.units);
        if (t === null) issue("targetWeight", `Enter a weight in ${unit}`);
        else if (t < 30 || t > 350) issue("targetWeight", "That weight looks out of range");
      }
      if (v.targetDate && v.targetDate <= opts.today) issue("targetDate", "Choose a date in the future");
      if (v.targetDate && !v.targetWeight && v.goal !== "maintain" && v.goal !== "build_muscle") {
        issue("targetWeight", "Add a target weight to go with the date");
      }
    });

export type ProfileInput = z.infer<ReturnType<typeof profileSchema>>;

/** The choice fields of a profile that passed profileSchema. */
export function profileChoices(v: ProfileInput): { sex: Sex; activityLevel: ActivityLevel; goal: Goal } {
  return { sex: v.sex as Sex, activityLevel: v.activityLevel as ActivityLevel, goal: v.goal as Goal };
}

export function weightToKg(value: string | undefined, units: Units): number | null {
  if (!value || !decimal.test(value)) return null;
  return toKg(parse(value), units);
}

export function lengthToCm(value: string | undefined, units: Units): number | null {
  if (!value || !decimal.test(value)) return null;
  return toCm(parse(value), units);
}

export function heightToCm(v: Pick<ProfileInput, "units" | "heightCm" | "heightFt" | "heightIn">): number | null {
  if (v.units === "metric") return lengthToCm(v.heightCm, "metric");
  if (!v.heightFt || !/^\d$/.test(v.heightFt)) return null;
  const inches = v.heightIn ? Number(v.heightIn) : 0;
  if (!/^\d{0,2}([.,]\d)?$/.test(v.heightIn ?? "") || inches >= 12) return null;
  return Math.round(feetInchesToCm(Number(v.heightFt), inches) * 10) / 10;
}

// Tracking ----------------------------------------------------------------------

export const weighInSchema = z.object({
  onDate: z.string().refine(isCalendarDate, "Enter a valid date"),
  weight: z.string().trim().refine((v) => decimal.test(v), "Enter your weight"),
  units: z.enum(UNIT_SYSTEMS),
  note: z.string().trim().max(200).optional(),
});
export type WeighInInput = z.infer<typeof weighInSchema>;

const macroGrams = z.number().min(0).max(1000);

export const foodItemSchema = z.object({
  name: z.string().trim().min(1).max(120),
  source: z.enum(["catalog", "custom", "quick"]),
  foodRef: z.string().max(80).nullable(),
  servings: z.number().positive("Enter how much").max(50),
  calories: z.number().int().min(0).max(10000),
  proteinG: macroGrams,
  carbsG: macroGrams,
  fatG: macroGrams,
});

export const logFoodSchema = z.object({
  onDate: z.string().refine(isCalendarDate),
  meal: z.enum(MEALS),
  items: z.array(foodItemSchema).min(1).max(30),
});

export const quickAddSchema = z.object({
  onDate: z.string().refine(isCalendarDate),
  meal: z.enum(MEALS),
  name: z.string().trim().max(120).optional(),
  calories: z.string().trim().refine((v) => /^\d{1,5}$/.test(v) && Number(v) > 0 && Number(v) <= 10000, "Enter calories"),
  protein: z.string().trim().optional(),
  carbs: z.string().trim().optional(),
  fat: z.string().trim().optional(),
});
export type QuickAddInput = z.infer<typeof quickAddSchema>;

const gramField = (label: string) =>
  z
    .string()
    .trim()
    .refine((v) => v === "" || (/^\d{1,4}([.,]\d)?$/.test(v) && parse(v) <= 1000), `Enter ${label} in grams`);

export const customFoodSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1, "Name the food").max(80),
  serving: z.string().trim().min(1, "Describe one serving, e.g. 1 cup").max(40),
  calories: z.string().trim().refine((v) => /^\d{1,4}$/.test(v) && Number(v) <= 5000, "Enter calories per serving"),
  protein: gramField("protein"),
  carbs: gramField("carbs"),
  fat: gramField("fat"),
});
export type CustomFoodInput = z.infer<typeof customFoodSchema>;

export const grams = (v: string | undefined) => (v ? Math.round(parse(v) * 10) / 10 : 0);

export const measurementSchema = z.object({
  onDate: z.string().refine(isCalendarDate, "Enter a valid date"),
  units: z.enum(UNIT_SYSTEMS),
  waist: z.string().trim().optional(),
  chest: z.string().trim().optional(),
  hips: z.string().trim().optional(),
  arm: z.string().trim().optional(),
  thigh: z.string().trim().optional(),
});
export type MeasurementInput = z.infer<typeof measurementSchema>;

export const waterGoalSchema = z.object({ goal: z.string().trim(), units: z.enum(UNIT_SYSTEMS) });

export const fastingSchema = z.object({ protocol: z.enum(FASTING_PROTOCOLS) });

// Workouts ------------------------------------------------------------------------

export const setSchema = z.object({
  sessionId: z.uuid(),
  exerciseKey: z.string().regex(/^[a-z0-9_]{2,60}$/),
  position: z.number().int().min(0).max(59),
  setNumber: z.number().int().min(1).max(30),
  reps: z.number().int().min(0).max(1000).nullable(),
  weightKg: z.number().min(0).max(1000).nullable(),
  durationS: z.number().int().min(0).max(86400).nullable(),
  note: z.string().trim().max(200).nullable(),
});

export const customWorkoutSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1, "Name the workout").max(80),
  notes: z.string().trim().max(1000).optional(),
  exercises: z
    .array(
      z.object({
        key: z.string().regex(/^[a-z0-9_]{2,60}$/),
        sets: z.number().int().min(1).max(10),
        reps: z.string().trim().min(1).max(12),
        restS: z.number().int().min(0).max(600),
      }),
    )
    .min(1, "Add at least one exercise")
    .max(30),
});
export type CustomWorkoutInput = z.infer<typeof customWorkoutSchema>;
