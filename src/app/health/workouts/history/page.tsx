import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChevronRightIcon, DumbbellIcon, TrophyIcon } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { ListSkeleton } from "@/components/shared/skeletons";
import { formatWeight } from "@/features/health/calc/units";
import { requireHealthProfile } from "@/features/health/context";
import { replayRecords } from "@/features/health/queries";
import { dayHeading, monthLabel } from "@/lib/dates";

export const metadata: Metadata = { title: "Workout history" };

export default function HistoryPage() {
  return (
    <div>
      <PageHeader title="History" description="Every workout you've finished." />
      <Suspense fallback={<ListSkeleton rows={6} />}>
        <HistoryView />
      </Suspense>
    </div>
  );
}

async function HistoryView() {
  const { repo, profile } = await requireHealthProfile();
  const sessions = (await repo.listSessions()).filter((s) => s.finishedAt);
  if (!sessions.length) return <EmptyState icon={DumbbellIcon} title="No workouts yet" description="Finished workouts appear here with their sets, volume and records." />;
  const sets = await repo.listSets({ sessionIds: sessions.map((s) => s.id) });
  const { recordSetIds } = replayRecords(sessions, sets);
  const months = [...new Set(sessions.map((s) => s.onDate.slice(0, 7)))];

  return (
    <div className="space-y-5">
      {months.map((m) => (
        <section key={m}>
          <h2 className="mb-2 px-1 text-sm font-semibold tracking-wide text-muted-foreground uppercase">{monthLabel(`${m}-01`)}</h2>
          <ul className="divide-y overflow-hidden rounded-2xl bg-card shadow-card ring-1 ring-border/80">
            {sessions
              .filter((s) => s.onDate.startsWith(m))
              .map((s) => {
                const mine = sets.filter((x) => x.sessionId === s.id);
                const volume = mine.reduce((v, x) => v + (x.weightKg ?? 0) * (x.reps ?? 0), 0);
                const prs = new Set(mine.filter((x) => recordSetIds.has(x.id)).map((x) => x.exerciseKey)).size;
                const minutes = Math.round((new Date(s.finishedAt!).getTime() - new Date(s.startedAt).getTime()) / 60_000);
                return (
                  <li key={s.id}>
                    <Link href={`/health/workouts/session/${s.id}`} className="flex min-h-16 items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/50">
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{s.name}</span>
                        <span className="block text-xs text-muted-foreground tabular">
                          {dayHeading(s.onDate)} · {minutes} min · {mine.length} sets{volume ? ` · ${formatWeight(volume, profile.units)}` : ""}
                        </span>
                      </span>
                      {prs ? (
                        <span className="flex items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 text-xs font-semibold text-warning">
                          <TrophyIcon className="size-3" aria-hidden /> {prs}
                          <span className="sr-only">personal records</span>
                        </span>
                      ) : null}
                      <ChevronRightIcon className="size-4 text-muted-foreground" aria-hidden />
                    </Link>
                  </li>
                );
              })}
          </ul>
        </section>
      ))}
    </div>
  );
}
