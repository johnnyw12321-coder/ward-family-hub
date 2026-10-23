import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CheckCircle2Icon, LineChartIcon } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader, SectionHeading } from "@/components/shared/page-header";
import { CardSkeleton } from "@/components/shared/skeletons";
import { StatCard } from "@/components/shared/stat-card";
import { Badge } from "@/components/ui/badge";
import { bests, estimatedOneRepMax } from "@/features/health/calc/strength";
import { displayWeight, formatWeight, weightUnit } from "@/features/health/calc/units";
import { EQUIPMENT, MUSCLE_GROUPS, exercise } from "@/features/health/catalog/exercises";
import { LineSeriesChart, type SeriesRow } from "@/features/health/components/charts";
import { requireHealthProfile } from "@/features/health/context";
import { formatDate } from "@/lib/dates";

export const metadata: Metadata = { title: "Exercise" };

export default function ExercisePage({ params }: PageProps<"/health/workouts/exercises/[key]">) {
  return (
    <Suspense fallback={<CardSkeleton lines={8} />}>
      <ExerciseDetail params={params} />
    </Suspense>
  );
}

async function ExerciseDetail({ params }: { params: PageProps<"/health/workouts/exercises/[key]">["params"] }) {
  const { key } = await params;
  const ex = exercise(key);
  if (!ex) notFound();
  const { repo, profile } = await requireHealthProfile();
  const units = profile.units;
  const [sessions, sets] = await Promise.all([repo.listSessions(), repo.listSets({ exerciseKey: key })]);
  const byId = new Map(sessions.filter((s) => s.finishedAt).map((s) => [s.id, s]));
  const done = sets.filter((s) => byId.has(s.sessionId));
  const best = bests(done);

  // One point per workout: the best set by the measure that suits the exercise.
  const perSession = [...new Set(done.map((s) => s.sessionId))]
    .map((id) => {
      const session = byId.get(id)!;
      const mine = done.filter((s) => s.sessionId === id);
      const b = bests(mine);
      return { session, b, mine };
    })
    .sort((a, b) => a.session.startedAt.localeCompare(b.session.startedAt));
  const chart = perSession.map(({ session, b }): SeriesRow =>
    ex.kind === "weight"
      ? { date: session.onDate, e1rm: displayWeight(b.bestE1rm, units), top: displayWeight(b.heaviestKg, units) }
      : ex.kind === "reps"
        ? { date: session.onDate, reps: b.mostReps }
        : { date: session.onDate, seconds: b.longestS },
  );
  const unit = weightUnit(units);

  return (
    <div className="space-y-5">
      <PageHeader title={ex.name} back={{ href: "/health/workouts/exercises", label: "Exercises" }} />
      <section className="space-y-4 rounded-2xl bg-card p-4 shadow-card ring-1 ring-border/80 sm:p-5">
        <div className="flex flex-wrap gap-1.5">
          <Badge>{MUSCLE_GROUPS[ex.primary]}</Badge>
          {ex.secondary.map((m) => (
            <Badge key={m} variant="secondary">
              {MUSCLE_GROUPS[m]}
            </Badge>
          ))}
          <Badge variant="outline">{EQUIPMENT[ex.equipment]}</Badge>
        </div>
        <div>
          <h2 className="mb-2 text-sm font-semibold">Form tips</h2>
          <ol className="space-y-2">
            {ex.tips.map((t) => (
              <li key={t} className="flex gap-2 text-sm">
                <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                {t}
              </li>
            ))}
          </ol>
        </div>
      </section>

      {perSession.length ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {ex.kind === "weight" ? (
              <>
                <StatCard label="Heaviest" value={formatWeight(best.heaviestKg, units)} tone="primary" />
                <StatCard label="Best est. 1-rep max" value={formatWeight(best.bestE1rm, units)} />
              </>
            ) : ex.kind === "reps" ? (
              <StatCard label="Most reps" value={best.mostReps} tone="primary" />
            ) : (
              <StatCard label="Longest" value={`${best.longestS} s`} tone="primary" />
            )}
            <StatCard label="Workouts" value={perSession.length} />
            <StatCard label="Sets logged" value={done.length} />
          </div>
          <section className="rounded-2xl bg-card p-4 shadow-card ring-1 ring-border/80 sm:p-5">
            <h2 className="mb-3 text-sm font-semibold">Strength over time</h2>
            {chart.length >= 2 ? (
              <LineSeriesChart
                data={chart}
                unit={ex.kind === "weight" ? unit : ex.kind === "reps" ? "reps" : "s"}
                series={
                  ex.kind === "weight"
                    ? [
                        { key: "e1rm", label: "Estimated 1-rep max", color: "var(--primary)" },
                        { key: "top", label: "Heaviest set", color: "var(--clay)", dashed: true },
                      ]
                    : ex.kind === "reps"
                      ? [{ key: "reps", label: "Most reps", color: "var(--primary)" }]
                      : [{ key: "seconds", label: "Longest hold", color: "var(--primary)" }]
                }
              />
            ) : (
              <p className="text-sm text-muted-foreground">Log this exercise in one more workout to see your progress chart.</p>
            )}
          </section>
          <section>
            <SectionHeading title="Recent workouts" />
            <ul className="divide-y overflow-hidden rounded-2xl bg-card shadow-card ring-1 ring-border/80">
              {[...perSession].reverse().slice(0, 10).map(({ session, mine }) => (
                <li key={session.id} className="px-4 py-2.5">
                  <div className="text-sm font-medium">{formatDate(session.onDate)}</div>
                  <div className="text-xs text-muted-foreground tabular">
                    {mine
                      .map((s) =>
                        s.durationS !== null
                          ? `${s.durationS}s`
                          : s.weightKg
                            ? `${displayWeight(s.weightKg, units)}×${s.reps} (e1RM ${displayWeight(estimatedOneRepMax(s.weightKg, s.reps ?? 0), units)})`
                            : `${s.reps} reps`,
                      )
                      .join(" · ")}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : (
        <EmptyState icon={LineChartIcon} title="No history yet" description="Log this exercise in a workout and your records and strength chart will appear here." />
      )}
    </div>
  );
}
