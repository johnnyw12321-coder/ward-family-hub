"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { fail, ok, zodFieldErrors, type ActionResult } from "@/lib/actions";
import type { Badge } from "../calc/achievements";
import { bests, detectRecords, type PersonalRecord } from "../calc/strength";
import { exercise } from "../catalog/exercises";
import { PROGRAM_BY_KEY } from "../catalog/programs";
import { getHealthActionContext, storeErrorMessage } from "../context";
import { HealthStoreError } from "../errors";
import { syncAchievements } from "../queries";
import { customWorkoutSchema, setSchema } from "../schemas";

const uuid = z.uuid();

export async function startProgram(key: string): Promise<ActionResult> {
  const p = PROGRAM_BY_KEY.get(key);
  if (!p) return fail("That program doesn't exist.");
  const auth = await getHealthActionContext();
  if (!auth.ok) return fail(auth.error);
  try {
    await auth.repo.updateProfile({ activeProgram: key, programStartedOn: auth.ctx.today });
    refresh();
    return ok(null, `Started ${p.name}`);
  } catch (e) {
    return fail(storeErrorMessage(e));
  }
}

export async function stopProgram(): Promise<ActionResult> {
  const auth = await getHealthActionContext();
  if (!auth.ok) return fail(auth.error);
  try {
    await auth.repo.updateProfile({ activeProgram: null, programStartedOn: null });
    refresh();
    return ok(null, "Program stopped. Your workout history is kept.");
  } catch (e) {
    return fail(storeErrorMessage(e));
  }
}

const startSchema = z.union([
  z.object({ kind: z.literal("program"), programKey: z.string(), day: z.number().int().min(0).max(13) }),
  z.object({ kind: z.literal("custom"), customWorkoutId: z.uuid() }),
  z.object({ kind: z.literal("empty") }),
]);

/** Starts a workout (or returns the one already in progress). */
export async function startWorkout(raw: unknown): Promise<ActionResult<{ id: string; resumed: boolean }>> {
  const parsed = startSchema.safeParse(raw);
  if (!parsed.success) return fail("Couldn't start that workout.");
  const auth = await getHealthActionContext();
  if (!auth.ok) return fail(auth.error);
  const { repo, ctx } = auth;
  try {
    const open = await repo.getOpenSession();
    if (open) return ok({ id: open.id, resumed: true }, "You have a workout in progress");
    const v = parsed.data;
    let base = { name: "Workout", programKey: null as string | null, programDay: null as number | null, customWorkoutId: null as string | null };
    if (v.kind === "program") {
      const p = PROGRAM_BY_KEY.get(v.programKey);
      const day = p?.days[v.day];
      if (!p || !day) return fail("That program day doesn't exist.");
      base = { name: day.name, programKey: p.key, programDay: v.day, customWorkoutId: null };
    } else if (v.kind === "custom") {
      const w = await repo.getCustomWorkout(v.customWorkoutId);
      if (!w) return fail("That workout no longer exists.");
      base = { name: w.name, programKey: null, programDay: null, customWorkoutId: w.id };
    }
    const id = await repo.createSession({ ...base, onDate: ctx.today, notes: null });
    return ok({ id, resumed: false }, "Workout started");
  } catch (e) {
    return fail(storeErrorMessage(e));
  }
}

/** Logs a set and reports any personal records it sets. */
export async function logSet(raw: unknown): Promise<ActionResult<{ id: string; records: PersonalRecord[] }>> {
  const parsed = setSchema.safeParse(raw);
  if (!parsed.success) return fail("Please check the set.", zodFieldErrors(parsed.error));
  const s = parsed.data;
  const ex = exercise(s.exerciseKey);
  if (!ex) return fail("Unknown exercise.");
  if (ex.kind === "time" ? !s.durationS : !s.reps) return fail(ex.kind === "time" ? "Enter how long you held it." : "Enter your reps.");
  const auth = await getHealthActionContext();
  if (!auth.ok) return fail(auth.error);
  const { repo } = auth;
  try {
    const session = await repo.getSession(s.sessionId);
    if (!session) return fail("That workout no longer exists.");
    const history = await repo.listSets({ exerciseKey: s.exerciseKey });
    const fromOtherSessions = history.filter((h) => h.sessionId !== s.sessionId);
    const records = detectRecords(s, bests(history), ex.kind, fromOtherSessions.length > 0);
    const id = await repo.addSet({ ...s, weightKg: ex.kind === "weight" ? s.weightKg : null });
    return ok({ id, records });
  } catch (e) {
    return fail(storeErrorMessage(e));
  }
}

const updateSetSchema = z.object({
  id: z.uuid(),
  reps: z.number().int().min(0).max(1000).nullable(),
  weightKg: z.number().min(0).max(1000).nullable(),
  durationS: z.number().int().min(0).max(86400).nullable(),
});

export async function updateSet(raw: unknown): Promise<ActionResult> {
  const parsed = updateSetSchema.safeParse(raw);
  if (!parsed.success) return fail("Please check the set.");
  const { id, ...patch } = parsed.data;
  const auth = await getHealthActionContext();
  if (!auth.ok) return fail(auth.error);
  try {
    await auth.repo.updateSet(id, patch);
    return ok(null);
  } catch (e) {
    return fail(storeErrorMessage(e));
  }
}

export async function deleteSet(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail("That set no longer exists.");
  const auth = await getHealthActionContext();
  if (!auth.ok) return fail(auth.error);
  try {
    await auth.repo.deleteSet(id);
    return ok(null);
  } catch (e) {
    return fail(storeErrorMessage(e));
  }
}

const finishSchema = z.object({ id: z.uuid(), notes: z.string().trim().max(2000).optional() });

export async function finishWorkout(raw: unknown): Promise<ActionResult<{ badges: Badge[] }>> {
  const parsed = finishSchema.safeParse(raw);
  if (!parsed.success) return fail("Couldn't finish that workout.");
  const auth = await getHealthActionContext();
  if (!auth.ok) return fail(auth.error);
  const { repo, ctx } = auth;
  try {
    const session = await repo.getSession(parsed.data.id);
    if (!session) throw new HealthStoreError("That workout no longer exists.");
    const sets = await repo.listSets({ sessionIds: [session.id] });
    if (!sets.length) throw new HealthStoreError("Log at least one set first, or discard the workout.");
    await repo.updateSession(session.id, { finishedAt: new Date().toISOString(), notes: parsed.data.notes || null });
    const profile = await repo.getProfile();
    const badges = profile ? await syncAchievements(repo, profile, ctx.today).catch(() => []) : [];
    refresh();
    return ok({ badges }, "Workout saved — nice work!");
  } catch (e) {
    return fail(storeErrorMessage(e));
  }
}

export async function saveWorkoutNotes(raw: unknown): Promise<ActionResult> {
  const parsed = finishSchema.safeParse(raw);
  if (!parsed.success) return fail("Couldn't save the notes.");
  const auth = await getHealthActionContext();
  if (!auth.ok) return fail(auth.error);
  try {
    await auth.repo.updateSession(parsed.data.id, { notes: parsed.data.notes || null });
    return ok(null);
  } catch (e) {
    return fail(storeErrorMessage(e));
  }
}

export async function deleteWorkout(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail("That workout no longer exists.");
  const auth = await getHealthActionContext();
  if (!auth.ok) return fail(auth.error);
  try {
    await auth.repo.deleteSession(id);
    refresh();
    return ok(null, "Workout deleted");
  } catch (e) {
    return fail(storeErrorMessage(e));
  }
}

export async function saveCustomWorkout(raw: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = customWorkoutSchema.safeParse(raw);
  if (!parsed.success) return fail("Please check the workout.", zodFieldErrors(parsed.error));
  const v = parsed.data;
  if (v.exercises.some((e) => !exercise(e.key))) return fail("One of those exercises isn't in the library.");
  const auth = await getHealthActionContext();
  if (!auth.ok) return fail(auth.error);
  try {
    const id = await auth.repo.saveCustomWorkout({ id: v.id, name: v.name, notes: v.notes || null, exercises: v.exercises });
    refresh();
    return ok({ id }, `${v.name} saved`);
  } catch (e) {
    return fail(storeErrorMessage(e));
  }
}

export async function deleteCustomWorkout(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return fail("That workout no longer exists.");
  const auth = await getHealthActionContext();
  if (!auth.ok) return fail(auth.error);
  try {
    await auth.repo.deleteCustomWorkout(id);
    refresh();
    return ok(null, "Workout deleted");
  } catch (e) {
    return fail(storeErrorMessage(e));
  }
}
