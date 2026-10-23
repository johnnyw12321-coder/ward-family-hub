"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { fail, ok, zodFieldErrors, type ActionResult } from "@/lib/actions";
import { getHealthActionContext, storeErrorMessage } from "../context";
import { heightToCm, profileChoices, profileSchema, weightToKg } from "../schemas";
import { UNIT_SYSTEMS, type ProfileFields } from "../types";

/** A starting water goal: about 35 ml per kg, rounded to a glass, within 1.5–4 L. */
const defaultWaterGoal = (kg: number) => Math.min(4000, Math.max(1500, Math.round((kg * 35) / 250) * 250));

export async function saveHealthProfile(raw: unknown): Promise<ActionResult<{ created: boolean }>> {
  const auth = await getHealthActionContext();
  if (!auth.ok) return fail(auth.error);
  const { ctx, repo } = auth;
  const today = ctx.today;
  try {
    const existing = await repo.getProfile();
    const parsed = profileSchema({ today, requireWeight: !existing }).safeParse(raw);
    if (!parsed.success) return fail("Please check the highlighted fields.", zodFieldErrors(parsed.error));
    const v = parsed.data;
    const { sex, activityLevel, goal } = profileChoices(v);
    const fields = {
      units: v.units,
      sex,
      ageYears: Number(v.age),
      heightCm: heightToCm(v)!,
      activityLevel,
      goal,
      targetWeightKg: v.goal === "maintain" ? null : weightToKg(v.targetWeight, v.units),
      targetDate: v.goal === "maintain" || !v.targetDate ? null : v.targetDate,
    };

    if (!existing) {
      const weightKg = weightToKg(v.weight, v.units)!;
      const profile: ProfileFields = {
        ...fields,
        ageSetOn: today,
        startWeightKg: weightKg,
        startDate: today,
        dietPlan: null,
        fastingProtocol: null,
        fastStartedAt: null,
        waterGoalMl: defaultWaterGoal(weightKg),
        activeProgram: null,
        programStartedOn: null,
        reminders: {},
      };
      await repo.saveProfile(profile);
      await repo.saveWeighIn(today, weightKg, null);
      refresh();
      return ok({ created: true }, "You're all set up");
    }

    // A new goal (or target) starts its goal line from today's weight.
    const goalChanged =
      existing.goal !== fields.goal || existing.targetWeightKg !== fields.targetWeightKg || existing.targetDate !== fields.targetDate;
    let restart: Partial<ProfileFields> = {};
    if (goalChanged) {
      const recent = await repo.listWeighIns({ to: today });
      restart = { startDate: today, startWeightKg: recent.at(-1)?.weightKg ?? existing.startWeightKg };
    }
    await repo.updateProfile({
      ...fields,
      ...(existing.ageYears !== fields.ageYears ? { ageSetOn: today } : {}),
      ...restart,
    });
    refresh();
    return ok({ created: false }, "Profile saved");
  } catch (e) {
    return fail(storeErrorMessage(e));
  }
}

export async function setHealthUnits(units: unknown): Promise<ActionResult> {
  const parsed = z.enum(UNIT_SYSTEMS).safeParse(units);
  if (!parsed.success) return fail("Choose metric or imperial.");
  const auth = await getHealthActionContext();
  if (!auth.ok) return fail(auth.error);
  try {
    await auth.repo.updateProfile({ units: parsed.data });
    refresh();
    return ok(null, parsed.data === "metric" ? "Showing kg and cm" : "Showing lb and inches");
  } catch (e) {
    return fail(storeErrorMessage(e));
  }
}
