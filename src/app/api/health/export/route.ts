import { NextResponse, type NextRequest } from "next/server";
import { logServerError } from "@/lib/actions";
import { toCsv } from "@/lib/csv";
import { exercise } from "@/features/health/catalog/exercises";
import { getHealthActionContext } from "@/features/health/context";
import { displayWeight, weightUnit } from "@/features/health/calc/units";

/**
 * Ward Health exports for the signed-in person only (RLS applies):
 *   ?format=json     everything, in the format Import accepts
 *   ?format=weight   weigh-ins as CSV
 *   ?format=workouts workout sets as CSV
 */
export async function GET(request: NextRequest) {
  const auth = await getHealthActionContext();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });
  const { ctx, repo } = auth;
  const format = request.nextUrl.searchParams.get("format") ?? "json";
  try {
    if (format === "json") {
      const data = await repo.exportAll();
      return download(JSON.stringify(data, null, 2), `ward-health-${ctx.today}.json`, "application/json");
    }
    const profile = await repo.getProfile();
    const units = profile?.units ?? "metric";
    const unit = weightUnit(units);
    if (format === "weight") {
      const rows = await repo.listWeighIns();
      // Imperial exports keep the stored kilograms alongside, for precision.
      const csv =
        units === "imperial"
          ? toCsv(
              ["Date", `Weight (${unit})`, "Weight (kg)", "Note"],
              rows.map((w) => [w.onDate, String(displayWeight(w.weightKg, units)), String(w.weightKg), w.note ?? ""]),
            )
          : toCsv(["Date", "Weight (kg)", "Note"], rows.map((w) => [w.onDate, String(w.weightKg), w.note ?? ""]));
      return download(csv, `ward-health-weight-${ctx.today}.csv`, "text/csv");
    }
    if (format === "workouts") {
      const sessions = await repo.listSessions();
      const sets = await repo.listSets({ sessionIds: sessions.map((s) => s.id) });
      const byId = new Map(sessions.map((s) => [s.id, s]));
      const sorted = [...sets].sort(
        (a, b) => byId.get(a.sessionId)!.startedAt.localeCompare(byId.get(b.sessionId)!.startedAt) || a.position - b.position || a.setNumber - b.setNumber,
      );
      const csv = toCsv(
        ["Date", "Workout", "Exercise", "Set", "Reps", `Weight (${unit})`, "Time (s)", "Note"],
        sorted.map((s) => {
          const session = byId.get(s.sessionId)!;
          return [
            session.onDate,
            session.name,
            exercise(s.exerciseKey)?.name ?? s.exerciseKey,
            String(s.setNumber),
            s.reps === null ? "" : String(s.reps),
            s.weightKg === null ? "" : String(displayWeight(s.weightKg, units)),
            s.durationS === null ? "" : String(s.durationS),
            s.note ?? "",
          ];
        }),
      );
      return download(csv, `ward-health-workouts-${ctx.today}.csv`, "text/csv");
    }
    return NextResponse.json({ error: "Unknown export format" }, { status: 400 });
  } catch (e) {
    logServerError("health:export", e);
    return NextResponse.json({ error: "The export could not be completed. Please try again." }, { status: 500 });
  }
}

function download(body: string, filename: string, type: string) {
  return new NextResponse(body, {
    headers: {
      "Content-Type": `${type}; charset=utf-8`,
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
