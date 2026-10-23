import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChevronRightIcon, SearchXIcon } from "lucide-react";
import { cn } from "cn";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { ListSkeleton } from "@/components/shared/skeletons";
import { Badge } from "@/components/ui/badge";
import { DAYS_OPTIONS, LEVELS, PLACES, PROGRAM_GOAL_FOR, PROGRAM_GOALS, PROGRAMS } from "@/features/health/catalog/programs";
import { requireHealthProfile } from "@/features/health/context";

export const metadata: Metadata = { title: "Programs" };

type Filters = { goal?: string; place?: string; level?: string; days?: string };

export default function ProgramsPage({ searchParams }: PageProps<"/health/workouts/programs">) {
  return (
    <div>
      <PageHeader title="Programs" description="72 programs for every goal, at home or in the gym." />
      <Suspense fallback={<ListSkeleton rows={6} />}>
        <ProgramsView searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function ProgramsView({ searchParams }: { searchParams: PageProps<"/health/workouts/programs">["searchParams"] }) {
  const sp = await searchParams;
  const { profile } = await requireHealthProfile();
  const pick = (k: keyof Filters) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  // First visit: start from the goal in your profile.
  const f: Filters = Object.keys(sp).length ? { goal: pick("goal"), place: pick("place"), level: pick("level"), days: pick("days") } : { goal: PROGRAM_GOAL_FOR[profile.goal] };

  const list = PROGRAMS.filter(
    (p) => (!f.goal || p.goal === f.goal) && (!f.place || p.place === f.place) && (!f.level || p.level === f.level) && (!f.days || String(p.daysPerWeek) === f.days),
  );

  const href = (patch: Filters) => {
    const next = { ...f, ...patch };
    const q = new URLSearchParams(Object.entries(next).filter(([, v]) => v) as [string, string][]);
    q.set("f", "1");
    return `/health/workouts/programs?${q}`;
  };

  const groups: { key: keyof Filters; label: string; options: { value: string; label: string }[] }[] = [
    { key: "goal", label: "Goal", options: Object.entries(PROGRAM_GOALS).map(([value, label]) => ({ value, label })) },
    { key: "place", label: "Where", options: Object.entries(PLACES).map(([value, label]) => ({ value, label })) },
    { key: "level", label: "Level", options: Object.entries(LEVELS).map(([value, label]) => ({ value, label })) },
    { key: "days", label: "Days a week", options: DAYS_OPTIONS.map((d) => ({ value: String(d), label: `${d} days` })) },
  ];

  return (
    <div className="space-y-5">
      <div className="space-y-3 rounded-2xl bg-card p-4 shadow-card ring-1 ring-border/80">
        {groups.map((g) => (
          <div key={g.key} className="flex flex-col gap-1.5 sm:flex-row sm:items-center">
            <div className="w-28 shrink-0 text-xs font-medium text-muted-foreground">{g.label}</div>
            <nav aria-label={g.label} className="-mx-1 flex gap-1.5 overflow-x-auto px-1 [scrollbar-width:none]">
              {[{ value: "", label: "Any" }, ...g.options].map((o) => {
                const active = (f[g.key] ?? "") === o.value;
                return (
                  <Link
                    key={o.value || "any"}
                    href={href({ [g.key]: o.value || undefined })}
                    aria-current={active ? "true" : undefined}
                    scroll={false}
                    className={cn(
                      "flex h-9 shrink-0 items-center rounded-full px-3.5 text-sm font-medium transition-colors",
                      active ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {o.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        ))}
      </div>

      <p className="px-1 text-sm text-muted-foreground" aria-live="polite">
        {list.length} {list.length === 1 ? "program" : "programs"}
      </p>

      {list.length ? (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {list.map((p) => (
            <li key={p.key}>
              <Link
                href={`/health/workouts/programs/${p.key}`}
                className={cn(
                  "flex h-full items-center gap-3 rounded-2xl bg-card p-4 shadow-card ring-1 transition-all hover:-translate-y-0.5 hover:bg-muted/40",
                  p.key === profile.activeProgram ? "ring-2 ring-primary" : "ring-border/80",
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{p.name}</div>
                  <div className="text-sm text-muted-foreground">{p.split}</div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Badge variant="secondary">{LEVELS[p.level]}</Badge>
                    <Badge variant="secondary">{p.daysPerWeek} days</Badge>
                    {p.key === profile.activeProgram ? <Badge>Current</Badge> : null}
                  </div>
                </div>
                <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={SearchXIcon} title="No programs match" description="Try 'Any' on one of the filters." />
      )}
    </div>
  );
}
