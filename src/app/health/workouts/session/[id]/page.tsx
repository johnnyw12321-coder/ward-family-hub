import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ClockIcon, Trash2Icon, TrophyIcon } from "lucide-react";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { PageHeader } from "@/components/shared/page-header";
import { CardSkeleton } from "@/components/shared/skeletons";
import { StatCard } from "@/components/shared/stat-card";
import { deleteWorkout } from "@/features/health/actions/workouts";
import { overloadSuggestion } from "@/features/health/calc/strength";
import { displayWeight, formatWeight } from "@/features/health/calc/units";
import { exercise } from "@/features/health/catalog/exercises";
import { repTarget } from "@/features/health/catalog/programs";
import { StartWorkoutButton } from "@/features/health/components/workout-buttons";
import { WorkoutLogger, type LoggerBlock } from "@/features/health/components/workout-logger";
import { requireHealthProfile } from "@/features/health/context";
import { exerciseHistory, replayRecords, sessionPlan } from "@/features/health/queries";
import type { Units, WorkoutSet } from "@/features/health/types";
import { formatDate } from "@/lib/dates";

export const metadata: Metadata = { title: "Workout" };

export default function SessionPage({ params }: PageProps<"/health/workouts/session/[id]">) {
  return (
    <Suspense fallback={<CardSkeleton lines={8} />}>
      <SessionView params={params} />
    </Suspense>
  );
}

const describe = (s: WorkoutSet, units: Units) =>
  s.durationS !== null ? `${s.durationS}s` : s.weightKg ? `${displayWeight(s.weightKg, units)} × ${s.reps}` : `${s.reps} reps`;

async function SessionView({ params }: { params: PageProps<"/health/workouts/session/[id]">["params"] }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { repo, profile } = await requireHealthProfile();
  const units = profile.units;
  const session = await repo.getSession(id);
  if (!session) notFound();
  const [sets, sessions, plan] = await Promise.all([repo.listSets({ sessionIds: [id] }), repo.listSessions(), sessionPlan(repo, session)]);
  const keys = [...plan.map((p) => p.key), ...sets.map((s) => s.exerciseKey)];
  const history = await exerciseHistory(repo, keys, sessions, id);
  const finishedOthers = sessions.filter((s) => s.finishedAt && s.id !== id);
  const { recordSetIds } = replayRecords([...finishedOthers, session], [...[...history.values()].flatMap((h) => h.all), ...sets]);

  if (!session.finishedAt) {
    const blocks: LoggerBlock[] = plan.map((pe, position) => {
      const ex = exercise(pe.key)!;
      const h = history.get(pe.key);
      return {
        position,
        key: pe.key,
        name: ex.name,
        kind: ex.kind,
        target: { sets: pe.sets, reps: pe.reps, restS: pe.restS },
        last: (h?.last ?? []).map((s) => ({ reps: s.reps, weightKg: s.weightKg, durationS: s.durationS })),
        suggestion: h?.last.length
          ? overloadSuggestion(h.last, repTarget(pe.reps), { kind: ex.kind, lower: ex.lower, dumbbell: ex.equipment === "dumbbell" }, (kg) => formatWeight(kg, units))
          : null,
      };
    });
    // Exercises added during the workout (beyond the plan), in the order they were added.
    const extras = [...new Map(sets.filter((s) => s.position >= plan.length).sort((a, b) => a.position - b.position).map((s) => [s.position, s.exerciseKey])).entries()];
    for (const [position, key] of extras) {
      const ex = exercise(key);
      if (!ex) continue;
      blocks.push({
        position,
        key,
        name: ex.name,
        kind: ex.kind,
        target: null,
        last: (history.get(key)?.last ?? []).map((s) => ({ reps: s.reps, weightKg: s.weightKg, durationS: s.durationS })),
        suggestion: null,
      });
    }
    return (
      <WorkoutLogger
        sessionId={session.id}
        name={session.name}
        startedAt={session.startedAt}
        notes={session.notes}
        units={units}
        blocks={blocks}
        logged={sets.map((s) => ({ ...s, record: recordSetIds.has(s.id) }))}
      />
    );
  }

  const minutes = Math.round((new Date(session.finishedAt).getTime() - new Date(session.startedAt).getTime()) / 60_000);
  const volume = sets.reduce((v, s) => v + (s.weightKg ?? 0) * (s.reps ?? 0), 0);
  // One line per exercise: its last record-setting set (sets are in order).
  const records = [...new Map(sets.filter((s) => recordSetIds.has(s.id)).map((s) => [s.exerciseKey, s])).values()];
  const groups = [...new Set(sets.sort((a, b) => a.position - b.position || a.setNumber - b.setNumber).map((s) => s.position))].map((position) => {
    const mine = sets.filter((s) => s.position === position);
    return { key: mine[0].exerciseKey, sets: mine };
  });

  return (
    <div className="space-y-5">
      <PageHeader title={session.name} description={formatDate(session.onDate)} back={{ href: "/health/workouts/history", label: "History" }} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Duration" value={`${minutes} min`} tone="primary" />
        <StatCard label="Sets" value={sets.length} />
        <StatCard label="Volume" value={volume ? formatWeight(volume, units) : "—"} hint="weight × reps" />
        <StatCard label="Personal records" value={records.length} />
      </div>
      {records.length ? (
        <div className="flex items-start gap-3 rounded-2xl bg-warning-soft p-4 animate-in fade-in zoom-in-95">
          <TrophyIcon className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
          <div className="text-sm">
            <div className="font-semibold">New personal records</div>
            {records.map((s) => (
              <div key={s.id}>
                {exercise(s.exerciseKey)?.name}: {describe(s, units)}
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <ul className="space-y-3">
        {groups.map((g) => (
          <li key={`${g.key}-${g.sets[0].position}`} className="rounded-2xl bg-card p-4 shadow-card ring-1 ring-border/80">
            <div className="mb-1.5 font-semibold">{exercise(g.key)?.name ?? g.key}</div>
            <ol className="flex flex-wrap gap-1.5">
              {g.sets.map((s) => (
                <li key={s.id} className="flex items-center gap-1 rounded-lg bg-muted px-2.5 py-1 text-sm tabular">
                  {describe(s, units)}
                  {recordSetIds.has(s.id) ? <TrophyIcon className="size-3.5 text-warning" aria-label="Personal record" /> : null}
                </li>
              ))}
            </ol>
          </li>
        ))}
      </ul>
      {session.notes ? (
        <div className="rounded-2xl bg-card p-4 text-sm shadow-card ring-1 ring-border/80">
          <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <ClockIcon className="size-3.5" aria-hidden /> Notes
          </div>
          <p className="whitespace-pre-wrap">{session.notes}</p>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {session.customWorkoutId ? (
          <StartWorkoutButton start={{ kind: "custom", customWorkoutId: session.customWorkoutId }} variant="secondary" size="default">
            Do it again
          </StartWorkoutButton>
        ) : null}
        <ConfirmAction
          action={() => deleteWorkout(session.id)}
          redirectTo="/health/workouts/history"
          variant="ghost"
          trigger={
            <>
              <Trash2Icon aria-hidden /> Delete workout
            </>
          }
          title="Delete this workout?"
          description="Its sets and any records it set will be removed. This can't be undone."
          confirmLabel="Delete"
        />
      </div>
    </div>
  );
}
