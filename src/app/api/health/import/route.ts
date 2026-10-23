import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { logServerError } from "@/lib/actions";
import { getHealthActionContext, storeErrorMessage } from "@/features/health/context";
import { syncAchievements } from "@/features/health/queries";
import type { HealthExport } from "@/features/health/types";

const rows = z.array(z.record(z.string(), z.unknown())).max(100_000).optional().default([]);

/** Shape check only; the database validates every value as it imports. */
const exportFile = z.object({
  format: z.literal("ward-health-export"),
  version: z.literal(1),
  exported_at: z.string().optional().default(""),
  profile: z.record(z.string(), z.unknown()).nullable().optional().default(null),
  weigh_ins: rows,
  foods: rows,
  saved_meals: rows,
  food_logs: rows,
  water: rows,
  measurements: rows,
  custom_workouts: rows,
  workout_sessions: rows,
  workout_sets: rows,
  achievements: rows,
});

const MAX_BYTES = 4 * 1024 * 1024;

/**
 * Imports a Ward Health export for the signed-in person, replacing their
 * current Ward Health data in one transaction. A route handler rather than a
 * Server Action because a few years of logs can exceed the action body limit.
 */
export async function POST(request: NextRequest) {
  const auth = await getHealthActionContext();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });
  const { ctx, repo } = auth;

  const text = await request.text();
  if (text.length > MAX_BYTES) return NextResponse.json({ error: "That file is too large (4 MB at most)." }, { status: 413 });
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "That file isn't valid JSON." }, { status: 400 });
  }
  const parsed = exportFile.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "That file isn't a Ward Health export." }, { status: 400 });

  try {
    await repo.importAll(parsed.data as HealthExport);
    const profile = await repo.getProfile();
    if (profile) {
      await syncAchievements(repo, profile, ctx.today);
      await repo.markAchievementsSeen();
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    logServerError("health:import", e);
    return NextResponse.json({ error: storeErrorMessage(e) }, { status: 400 });
  }
}
