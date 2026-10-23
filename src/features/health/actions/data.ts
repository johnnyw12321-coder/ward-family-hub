"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { fail, ok, type ActionResult } from "@/lib/actions";
import { getHealthActionContext, storeErrorMessage } from "../context";
import { buildDemoExport } from "../demo";
import { syncAchievements } from "../queries";
import { waterGoalSchema } from "../schemas";
import { toMl } from "../calc/units";

/** Replaces this person's Ward Health data with two months of sample data. */
export async function loadDemoData(): Promise<ActionResult> {
  const auth = await getHealthActionContext();
  if (!auth.ok) return fail(auth.error);
  const { ctx, repo } = auth;
  try {
    const existing = await repo.getProfile();
    await repo.importAll(buildDemoExport(ctx.today, existing));
    // Badges the sample data earns are recorded as already seen: no confetti for fake progress.
    const profile = await repo.getProfile();
    if (profile) {
      await syncAchievements(repo, profile, ctx.today);
      await repo.markAchievementsSeen();
    }
    refresh();
    return ok(null, "Sample data loaded");
  } catch (e) {
    return fail(storeErrorMessage(e));
  }
}

/** Deletes every Ward Health record for this person. Nothing else in Ward Hub is touched. */
export async function resetHealthData(): Promise<ActionResult> {
  const auth = await getHealthActionContext();
  if (!auth.ok) return fail(auth.error);
  try {
    await auth.repo.resetAll();
    refresh();
    return ok(null, "Ward Health data deleted");
  } catch (e) {
    return fail(storeErrorMessage(e));
  }
}

export async function markBadgesSeen(): Promise<ActionResult> {
  const auth = await getHealthActionContext();
  if (!auth.ok) return fail(auth.error);
  try {
    await auth.repo.markAchievementsSeen();
    refresh();
    return ok(null);
  } catch (e) {
    return fail(storeErrorMessage(e));
  }
}

export async function saveWaterGoal(raw: unknown): Promise<ActionResult> {
  const parsed = waterGoalSchema.safeParse(raw);
  if (!parsed.success || !/^\d{1,5}$/.test(parsed.data.goal)) return fail("Enter a water goal", { goal: "Enter a number" });
  const ml = toMl(Number(parsed.data.goal), parsed.data.units);
  if (ml < 500 || ml > 8000) return fail("Choose a goal between 0.5 and 8 litres", { goal: "Out of range" });
  const auth = await getHealthActionContext();
  if (!auth.ok) return fail(auth.error);
  try {
    await auth.repo.updateProfile({ waterGoalMl: ml });
    refresh();
    return ok(null, "Water goal saved");
  } catch (e) {
    return fail(storeErrorMessage(e));
  }
}

const remindersSchema = z.object({
  weighIn: z.boolean(),
  logMeals: z.boolean(),
  workouts: z.boolean(),
  water: z.boolean(),
});

export async function saveReminders(raw: unknown): Promise<ActionResult> {
  const parsed = remindersSchema.safeParse(raw);
  if (!parsed.success) return fail("Those reminder settings aren't valid.");
  const auth = await getHealthActionContext();
  if (!auth.ok) return fail(auth.error);
  try {
    await auth.repo.updateProfile({ reminders: parsed.data });
    refresh();
    return ok(null, "Reminders updated");
  } catch (e) {
    return fail(storeErrorMessage(e));
  }
}
