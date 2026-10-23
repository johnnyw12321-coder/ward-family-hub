"use server";

import { refresh } from "next/cache";
import { fail, ok, type ActionResult } from "@/lib/actions";
import { DIET_PLAN_BY_KEY } from "../catalog/diet-plans";
import { getHealthActionContext, storeErrorMessage } from "../context";
import { fastingSchema } from "../schemas";

export async function chooseDietPlan(key: string): Promise<ActionResult> {
  const plan = DIET_PLAN_BY_KEY.get(key);
  if (!plan) return fail("That plan doesn't exist.");
  const auth = await getHealthActionContext();
  if (!auth.ok) return fail(auth.error);
  try {
    const profile = await auth.repo.getProfile();
    await auth.repo.updateProfile({
      dietPlan: plan.key,
      // Fasting plans start on 16:8; leaving one stops any running fast.
      fastingProtocol: plan.fasting ? (profile?.fastingProtocol ?? "16:8") : null,
      ...(plan.fasting ? {} : { fastStartedAt: null }),
    });
    refresh();
    return ok(null, `You're on ${plan.name}`);
  } catch (e) {
    return fail(storeErrorMessage(e));
  }
}

export async function setFastingProtocol(raw: unknown): Promise<ActionResult> {
  const parsed = fastingSchema.safeParse(raw);
  if (!parsed.success) return fail("Choose 16:8 or 18:6.");
  const auth = await getHealthActionContext();
  if (!auth.ok) return fail(auth.error);
  try {
    await auth.repo.updateProfile({ fastingProtocol: parsed.data.protocol });
    refresh();
    return ok(null, `Fasting window set to ${parsed.data.protocol}`);
  } catch (e) {
    return fail(storeErrorMessage(e));
  }
}

/** Start a fast now, or stop the current one (ending the fast opens the eating window). */
export async function toggleFast(start: boolean): Promise<ActionResult<{ startedAt: string | null }>> {
  const auth = await getHealthActionContext();
  if (!auth.ok) return fail(auth.error);
  try {
    const startedAt = start ? new Date().toISOString() : null;
    await auth.repo.updateProfile({ fastStartedAt: startedAt });
    refresh();
    return ok({ startedAt }, start ? "Fast started" : "Fast ended — enjoy your meal");
  } catch (e) {
    return fail(storeErrorMessage(e));
  }
}
