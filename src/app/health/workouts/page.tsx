import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChevronRightIcon, DumbbellIcon, ListPlusIcon, PencilIcon, PlayCircleIcon } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader, SectionHeading } from "@/components/shared/page-header";
import { PageSkeleton } from "@/components/shared/skeletons";
import { Badge } from "@/components/ui/badge";
import { exercise } from "@/features/health/catalog/exercises";
import { LEVELS, PLACES, PROGRAM_GOAL_FOR, PROGRAMS, program } from "@/features/health/catalog/programs";
import { StartWorkoutButton, StopProgramButton } from "@/features/health/components/workout-buttons";
import { requireHealthProfile } from "@/features/health/context";
import { nextProgramDay } from "@/features/health/queries";
import { formatDate, relativeDay, weekStart } from "@/lib/dates";

export const metadata: Metadata = { title: "Workouts" };

const card = "rounded-2xl bg-card p-4 shadow-card ring-1 ring-border/80 sm:p-5";

export default function WorkoutsPage() {
  return (
    <div>
      <PageHeader title="Workouts" description="Follow a program, build your own, and watch your strength climb." />
      <Suspense fallback={<PageSkeleton />}>
        <WorkoutsView />
      </Suspense>
    </div>
  );
}

async function WorkoutsView() {
  const { ctx, repo, profile } = await requireHealthProfile();
  const [sessions, custom] = await Promise.all([repo.listSessions(), repo.listCustomWorkouts()]);
  const open = sessions.find((s) => !s.finishedAt);
  const finished = sessions.filter((s) => s.finishedAt);
  const prog = program(profile.activeProgram);
  const nextDay = prog ? nextProgramDay(prog, sessions) : 0;
  const thisWeek = finished.filter((s) => s.onDate >= weekStart(ctx.today)).length;
  const suggested = PROGRAMS.filter((p) => p.goal === PROGRAM_GOAL_FOR[profile.goal] && p.level === "beginner" && p.daysPerWeek === 3);

  return (
    <div className="space-y-6">
      {open ? (
        <Link href={`/health/workouts/session/${open.id}`} className="flex items-center gap-3 rounded-2xl bg-primary p-4 text-primary-foreground shadow-card transition-transform active:scale-[0.99]">
          <PlayCircleIcon className="size-8 shrink-0" aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium text-primary-foreground/80">Workout in progress</div>
            <div className="truncate font-semibold">{open.name}</div>
          </div>
          <span className="text-sm font-medium">Resume</span>
          <ChevronRightIcon className="size-4" aria-hidden />
        </Link>
      ) : null}

      {prog ? (
        <section className={`${card} space-y-4`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-medium text-muted-foreground">Your program</div>
              <Link href={`/health/workouts/programs/${prog.key}`} className="text-lg font-semibold hover:underline">
                {prog.name}
              </Link>
              <div className="mt-1 flex flex-wrap gap-1.5">
                <Badge variant="secondary">{LEVELS[prog.level]}</Badge>
                <Badge variant="secondary">{prog.daysPerWeek} days a week</Badge>
                <Badge variant="secondary">{PLACES[prog.place]}</Badge>
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-2xl font-semibold tabular">
                {thisWeek}/{prog.daysPerWeek}
              </div>
              <div className="text-xs text-muted-foreground">this week</div>
            </div>
          </div>
          <div className="rounded-xl bg-muted/50 p-3">
            <div className="text-xs font-medium text-muted-foreground">
              Next up · Day {nextDay + 1} of {prog.days.length}
            </div>
            <div className="font-semibold">
              {prog.days[nextDay].name} <span className="font-normal text-muted-foreground">· {prog.days[nextDay].focus}</span>
            </div>
            <ul className="mt-2 grid gap-x-4 gap-y-0.5 text-sm text-muted-foreground sm:grid-cols-2">
              {prog.days[nextDay].exercises.map((e) => (
                <li key={e.key} className="flex justify-between gap-2">
                  <span className="truncate">{exercise(e.key)?.name}</span>
                  <span className="shrink-0 tabular">
                    {e.sets} × {e.reps}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StartWorkoutButton start={{ kind: "program", programKey: prog.key, day: nextDay }} className="flex-1 sm:flex-none">
              Start {prog.days[nextDay].name}
            </StartWorkoutButton>
            <StopProgramButton />
          </div>
        </section>
      ) : (
        <section className={`${card} space-y-3`}>
          <div>
            <h2 className="font-semibold">Pick a program</h2>
            <p className="text-sm text-muted-foreground">A plan takes the guesswork out: what to do each day, how many sets and reps, and how long to rest.</p>
          </div>
          <ul className="grid gap-2 sm:grid-cols-2">
            {suggested.map((p) => (
              <li key={p.key}>
                <Link href={`/health/workouts/programs/${p.key}`} className="flex items-center gap-3 rounded-xl p-3 ring-1 ring-border/80 transition-colors hover:bg-muted/50">
                  <DumbbellIcon className="size-5 text-primary" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{p.name}</span>
                    <span className="block text-xs text-muted-foreground">Beginner · 3 days · {p.split}</span>
                  </span>
                  <ChevronRightIcon className="size-4 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
          <Link href="/health/workouts/programs" className="inline-flex items-center gap-1 text-sm font-medium text-primary">
            Browse all 72 programs <ChevronRightIcon className="size-4" aria-hidden />
          </Link>
        </section>
      )}

      <section>
        <SectionHeading
          title="Your workouts"
          action={
            <Link href="/health/workouts/custom/new" className="flex items-center gap-1 text-sm font-medium text-primary">
              <ListPlusIcon className="size-4" aria-hidden /> Build one
            </Link>
          }
        />
        {custom.length ? (
          <ul className="divide-y overflow-hidden rounded-2xl bg-card shadow-card ring-1 ring-border/80">
            {custom.map((w) => (
              <li key={w.id} className="flex items-center gap-2 py-2 pr-2 pl-4">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{w.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{w.exercises.map((e) => exercise(e.key)?.name).join(" · ")}</div>
                </div>
                <Link href={`/health/workouts/custom/${w.id}`} className="flex size-10 items-center justify-center rounded-full text-muted-foreground hover:bg-muted" aria-label={`Edit ${w.name}`}>
                  <PencilIcon className="size-4" aria-hidden />
                </Link>
                <StartWorkoutButton start={{ kind: "custom", customWorkoutId: w.id }} size="default" variant="secondary">
                  Start
                </StartWorkoutButton>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex flex-col items-start gap-3 rounded-2xl border border-dashed p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">Make your own routine from 100+ exercises, or just start and add exercises as you go.</p>
            <StartWorkoutButton start={{ kind: "empty" }} variant="outline" size="default">
              Empty workout
            </StartWorkoutButton>
          </div>
        )}
      </section>

      <section>
        <SectionHeading
          title="Recent"
          action={
            finished.length ? (
              <Link href="/health/workouts/history" className="text-sm font-medium text-primary">
                All history
              </Link>
            ) : null
          }
        />
        {finished.length ? (
          <ul className="divide-y overflow-hidden rounded-2xl bg-card shadow-card ring-1 ring-border/80">
            {finished.slice(0, 5).map((s) => (
              <li key={s.id}>
                <Link href={`/health/workouts/session/${s.id}`} className="flex min-h-14 items-center gap-3 px-4 py-2 transition-colors hover:bg-muted/50">
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{s.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {relativeDay(s.onDate, ctx.today)} · {formatDate(s.onDate)}
                    </span>
                  </span>
                  <ChevronRightIcon className="size-4 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={DumbbellIcon} title="No workouts yet" description="Your finished workouts, personal records and progress will show up here." />
        )}
      </section>
    </div>
  );
}
