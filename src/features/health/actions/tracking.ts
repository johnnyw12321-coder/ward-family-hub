"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { fail, ok, zodFieldErrors, type ActionResult } from "@/lib/actions";
import { isCalendarDate } from "@/lib/dates";
import type { Badge } from "../calc/achievements";
import { scaleNutrition } from "../calc/macros";
import { getHealthActionContext, storeErrorMessage, type HealthContext } from "../context";
import { HealthStoreError } from "../errors";
import { syncAchievements } from "../queries";
import { customFoodSchema, grams, lengthToCm, logFoodSchema, measurementSchema, quickAddSchema, weighInSchema, weightToKg } from "../schemas";
import { MEALS } from "../types";

type WithBadges = ActionResult<{ badges: Badge[] }>;
const uuid = z.uuid();

/** Runs a write, then checks for newly earned badges (a failed check never fails the write). */
async function write(run: (h: HealthContext) => Promise<void>, message: string, checkBadges = true): Promise<WithBadges> {
  const auth = await getHealthActionContext();
  if (!auth.ok) return fail(auth.error);
  try {
    await run(auth);
  } catch (e) {
    return fail(storeErrorMessage(e));
  }
  let badges: Badge[] = [];
  if (checkBadges) {
    try {
      const profile = await auth.repo.getProfile();
      if (profile) badges = await syncAchievements(auth.repo, profile, auth.ctx.today);
    } catch {
      // Badges catch up on the next write.
    }
  }
  refresh();
  return ok({ badges }, message);
}

// Weight -------------------------------------------------------------------------

export async function logWeight(raw: unknown): Promise<WithBadges> {
  const parsed = weighInSchema.safeParse(raw);
  if (!parsed.success) return fail("Please check the highlighted fields.", zodFieldErrors(parsed.error));
  const kg = weightToKg(parsed.data.weight, parsed.data.units);
  if (kg === null || kg < 30 || kg > 350) return fail("That weight looks out of range.", { weight: "Check the number" });
  return write((h) => h.repo.saveWeighIn(parsed.data.onDate, kg, parsed.data.note || null), "Weight logged");
}

export async function deleteWeighIn(id: string): Promise<WithBadges> {
  if (!uuid.safeParse(id).success) return fail("That entry no longer exists.");
  return write((h) => h.repo.deleteWeighIn(id), "Weigh-in deleted", false);
}

// Food ---------------------------------------------------------------------------

export async function logFoods(raw: unknown): Promise<WithBadges> {
  const parsed = logFoodSchema.safeParse(raw);
  if (!parsed.success) return fail("Those foods couldn't be logged.");
  const { onDate, meal, items } = parsed.data;
  return write(
    (h) => h.repo.addFoodLogs(items.map((i) => ({ ...i, onDate, meal }))),
    items.length === 1 ? `${items[0].name} logged` : `${items.length} foods logged`,
  );
}

export async function quickAddCalories(raw: unknown): Promise<WithBadges> {
  const parsed = quickAddSchema.safeParse(raw);
  if (!parsed.success) return fail("Please check the highlighted fields.", zodFieldErrors(parsed.error));
  const v = parsed.data;
  for (const k of ["protein", "carbs", "fat"] as const) {
    if (v[k] && !/^\d{1,4}([.,]\d)?$/.test(v[k]!)) return fail("Enter grams as a number.", { [k]: "Enter a number" });
  }
  return write(
    (h) =>
      h.repo.addFoodLogs([
        {
          onDate: v.onDate,
          meal: v.meal,
          name: v.name || "Quick add",
          source: "quick",
          foodRef: null,
          servings: 1,
          calories: Number(v.calories),
          proteinG: grams(v.protein),
          carbsG: grams(v.carbs),
          fatG: grams(v.fat),
        },
      ]),
    `${v.calories} kcal added`,
  );
}

export async function deleteFoodLog(id: string): Promise<WithBadges> {
  if (!uuid.safeParse(id).success) return fail("That entry no longer exists.");
  return write((h) => h.repo.deleteFoodLog(id), "Removed", false);
}

const servingsSchema = z.object({ id: z.uuid(), servings: z.number().positive().max(50) });

/** Change how much of a logged food was eaten; nutrition scales from the per-serving values. */
export async function updateFoodServings(raw: unknown): Promise<WithBadges> {
  const parsed = servingsSchema.safeParse(raw);
  if (!parsed.success) return fail("Enter how much you had.");
  const { id, servings } = parsed.data;
  return write(async (h) => {
    const log = await h.repo.getFoodLog(id);
    if (!log) throw new HealthStoreError("That entry no longer exists.");
    const per = scaleNutrition(log, 1 / log.servings);
    await h.repo.updateFoodLog(id, { servings, ...scaleNutrition(per, servings) });
  }, "Updated", false);
}

const copyMealSchema = z.object({ from: z.string().refine(isCalendarDate), to: z.string().refine(isCalendarDate), meal: z.enum(MEALS) });

export async function copyMeal(raw: unknown): Promise<WithBadges> {
  const parsed = copyMealSchema.safeParse(raw);
  if (!parsed.success) return fail("Couldn't copy that meal.");
  const { from, to, meal } = parsed.data;
  return write(async (h) => {
    const logs = (await h.repo.listFoodLogs({ from, to: from })).filter((l) => l.meal === meal);
    if (!logs.length) throw new HealthStoreError("There's nothing logged for that meal to copy.");
    await h.repo.addFoodLogs(
      logs.map((l) => ({ onDate: to, meal, name: l.name, source: l.source, foodRef: l.foodRef, servings: l.servings, calories: l.calories, proteinG: l.proteinG, carbsG: l.carbsG, fatG: l.fatG })),
    );
  }, "Meal copied");
}

// Custom foods and saved meals ------------------------------------------------------

export async function saveCustomFood(raw: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = customFoodSchema.safeParse(raw);
  if (!parsed.success) return fail("Please check the highlighted fields.", zodFieldErrors(parsed.error));
  const v = parsed.data;
  const auth = await getHealthActionContext();
  if (!auth.ok) return fail(auth.error);
  try {
    const id = await auth.repo.saveCustomFood({
      id: v.id,
      name: v.name,
      serving: v.serving,
      calories: Number(v.calories),
      proteinG: grams(v.protein),
      carbsG: grams(v.carbs),
      fatG: grams(v.fat),
    });
    refresh();
    return ok({ id }, `${v.name} saved to your foods`);
  } catch (e) {
    return fail(storeErrorMessage(e));
  }
}

export async function archiveCustomFood(id: string): Promise<WithBadges> {
  if (!uuid.safeParse(id).success) return fail("That food no longer exists.");
  return write((h) => h.repo.archiveCustomFood(id), "Removed from your foods", false);
}

const saveMealSchema = z.object({ name: z.string().trim().min(1, "Name the meal").max(80), onDate: z.string().refine(isCalendarDate), meal: z.enum(MEALS) });

/** Save what was logged for a meal so it can be added again in one tap. */
export async function saveMealFromLog(raw: unknown): Promise<WithBadges> {
  const parsed = saveMealSchema.safeParse(raw);
  if (!parsed.success) return fail("Please check the highlighted fields.", zodFieldErrors(parsed.error));
  const { name, onDate, meal } = parsed.data;
  return write(async (h) => {
    const logs = (await h.repo.listFoodLogs({ from: onDate, to: onDate })).filter((l) => l.meal === meal);
    if (!logs.length) throw new HealthStoreError("Log some food for this meal first.");
    await h.repo.saveSavedMeal(
      name,
      logs.slice(0, 30).map((l) => ({ name: l.name, source: l.source, foodRef: l.foodRef, servings: l.servings, calories: l.calories, proteinG: l.proteinG, carbsG: l.carbsG, fatG: l.fatG })),
    );
  }, `Saved "${name}"`, false);
}

export async function deleteSavedMeal(id: string): Promise<WithBadges> {
  if (!uuid.safeParse(id).success) return fail("That meal no longer exists.");
  return write((h) => h.repo.deleteSavedMeal(id), "Saved meal deleted", false);
}

// Water -----------------------------------------------------------------------------

const waterSchema = z.object({ onDate: z.string().refine(isCalendarDate), deltaMl: z.number().int().min(-5000).max(5000) });

export async function addWater(raw: unknown): Promise<WithBadges> {
  const parsed = waterSchema.safeParse(raw);
  if (!parsed.success) return fail("Couldn't update your water.");
  const { onDate, deltaMl } = parsed.data;
  return write(
    async (h) => {
      const [day] = await h.repo.listWater({ from: onDate, to: onDate });
      await h.repo.setWater(onDate, Math.min(20000, Math.max(0, (day?.totalMl ?? 0) + deltaMl)));
    },
    deltaMl >= 0 ? "Water added" : "Water removed",
    deltaMl > 0,
  );
}

// Measurements ------------------------------------------------------------------------

export async function saveMeasurements(raw: unknown): Promise<WithBadges> {
  const parsed = measurementSchema.safeParse(raw);
  if (!parsed.success) return fail("Please check the highlighted fields.", zodFieldErrors(parsed.error));
  const v = parsed.data;
  const fields = { waist: "waistCm", chest: "chestCm", hips: "hipsCm", arm: "armCm", thigh: "thighCm" } as const;
  const values: Record<string, number | null> = {};
  const errors: Record<string, string> = {};
  for (const [input, key] of Object.entries(fields)) {
    const raw = v[input as keyof typeof fields];
    if (!raw) {
      values[key] = null;
      continue;
    }
    const cm = lengthToCm(raw, v.units);
    if (cm === null || cm < 10 || cm > 300) errors[input] = "Check this number";
    values[key] = cm;
  }
  if (Object.keys(errors).length) return fail("Please check the highlighted fields.", errors);
  if (Object.values(values).every((x) => x === null)) return fail("Enter at least one measurement.", { waist: "Enter at least one" });
  return write(
    (h) =>
      h.repo.saveMeasurement({
        onDate: v.onDate,
        waistCm: values.waistCm,
        chestCm: values.chestCm,
        hipsCm: values.hipsCm,
        armCm: values.armCm,
        thighCm: values.thighCm,
      }),
    "Measurements saved",
  );
}

export async function deleteMeasurement(id: string): Promise<WithBadges> {
  if (!uuid.safeParse(id).success) return fail("That entry no longer exists.");
  return write((h) => h.repo.deleteMeasurement(id), "Measurements deleted", false);
}
