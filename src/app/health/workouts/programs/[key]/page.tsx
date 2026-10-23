import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CalendarDaysIcon } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { CardSkeleton } from "@/components/shared/skeletons";
import { Badge } from "@/components/ui/badge";
import { EQUIPMENT, exercise } from "@/features/health/catalog/exercises";
import { LEVELS, PLACES, PROGRAM_GOALS, program } from "@/features/health/catalog/programs";
import { StartProgramButton, StartWorkoutButton } from "@/features/health/components/workout-buttons";
import { requireHealthProfile } from "@/features/health/context";

export const metadata: Metadata = { title: "Program" };

export default function ProgramPage({ params }: PageProps<"/health/workouts/programs/[key]">) {
  return (
    <Suspense fallback={<CardSkeleton lines={8} />}>
      <ProgramDetail params={params} />
    </Suspense>
  );
}

async function ProgramDetail({ params }: { params: PageProps<"/health/workouts/programs/[key]">["params"] }) {
  const { key } = await params;
  const p = program(key);
  if (!p) notFound();
  const { profile } = await requireHealthProfile();
  const active = profile.activeProgram === p.key;
  const equipment = [...new Set(p.days.flatMap((d) => d.exercises.map((e) => exercise(e.key)!.equipment)))];

  return (
    <div className="space-y-5">
      <PageHeader
        title={p.name}
        description={p.split}
        back={{ href: "/health/workouts/programs", label: "Programs" }}
        actions={<StartProgramButton programKey={p.key} active={active} className="max-sm:hidden" />}
      />
      <section className="space-y-3 rounded-2xl bg-card p-4 shadow-card ring-1 ring-border/80 sm:p-5">
        <div className="flex flex-wrap gap-1.5">
          <Badge>{PROGRAM_GOALS[p.goal]}</Badge>
          <Badge variant="secondary">{LEVELS[p.level]}</Badge>
          <Badge variant="secondary">{PLACES[p.place]}</Badge>
          <Badge variant="secondary">{p.daysPerWeek} days a week</Badge>
        </div>
        <p className="text-sm leading-relaxed">{p.description}</p>
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <CalendarDaysIcon className="size-4" aria-hidden /> Suggested schedule: {p.schedule}, rest in between.
        </p>
        <p className="text-xs text-muted-foreground">Equipment: {equipment.map((e) => EQUIPMENT[e]).join(", ")}</p>
      </section>

      <ol className="space-y-3">
        {p.days.map((d, i) => (
          <li key={d.name} className="overflow-hidden rounded-2xl bg-card shadow-card ring-1 ring-border/80">
            <div className="flex items-center justify-between gap-2 px-4 pt-3.5 pb-2">
              <div>
                <div className="text-xs font-medium text-muted-foreground">Day {i + 1}</div>
                <h2 className="font-semibold">
                  {d.name} <span className="font-normal text-muted-foreground">· {d.focus}</span>
                </h2>
              </div>
              {active ? (
                <StartWorkoutButton start={{ kind: "program", programKey: p.key, day: i }} size="default" variant="secondary">
                  Start
                </StartWorkoutButton>
              ) : null}
            </div>
            <table className="w-full text-sm">
              <thead className="sr-only">
                <tr>
                  <th>Exercise</th>
                  <th>Sets × reps</th>
                  <th>Rest</th>
                </tr>
              </thead>
              <tbody>
                {d.exercises.map((e) => (
                  <tr key={e.key} className="border-t">
                    <td className="py-2.5 pl-4">
                      <Link href={`/health/workouts/exercises/${e.key}`} className="hover:underline">
                        {exercise(e.key)?.name}
                      </Link>
                    </td>
                    <td className="py-2.5 text-right tabular">
                      {e.sets} × {e.reps}
                    </td>
                    <td className="py-2.5 pr-4 text-right text-muted-foreground tabular">{e.restS ? `${e.restS}s` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </li>
        ))}
      </ol>
      <p className="px-1 text-xs text-muted-foreground">
        Reps like 8–12 are a range: when you hit the top of it on every set, Ward Health suggests adding weight next time.
      </p>
      <StartProgramButton programKey={p.key} active={active} className="w-full sm:hidden" />
    </div>
  );
}
