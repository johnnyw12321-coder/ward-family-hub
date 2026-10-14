import Link from "next/link";
import { CheckCircle2Icon, FlagIcon } from "lucide-react";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { Money } from "@/components/shared/money";
import { formatDate, monthLabel, type CalendarDate } from "@/lib/dates";
import type { GoalProjection } from "@/lib/finance/calculations";
import { GOAL_CATEGORY_LABELS, GOAL_STATUS_LABELS, type GoalProgress, type GoalRow } from "../progress";

export function ProgressValue({ progress }: { progress: GoalProgress }) {
  if (progress.kind === "money")
    return (
      <>
        <Money minor={progress.current} trimZeroCents className="font-semibold text-foreground" /> of <Money minor={progress.target} trimZeroCents />
      </>
    );
  return (
    <>
      <span className="font-semibold text-foreground">{progress.current}</span> of {progress.target} {progress.unit ?? ""}
    </>
  );
}

export function ProjectionText({ projection, targetDate }: { projection: GoalProjection | null; targetDate: CalendarDate | null }) {
  if (!projection) return null;
  if (projection.status === "complete") return <span className="text-success">Target reached</span>;
  if (projection.status === "no-progress") return <span className="text-muted-foreground">No progress yet to project from</span>;
  return (
    <span className={projection.onTrack === false ? "text-warning" : "text-muted-foreground"}>
      On pace for {monthLabel(projection.date)}
      {targetDate ? (projection.onTrack ? " · on track" : ` · behind the ${formatDate(targetDate)} target`) : ""}
    </span>
  );
}

export function GoalCard({
  goal,
  progress,
  projection,
  owner,
  nextMilestone,
}: {
  goal: GoalRow;
  progress: GoalProgress;
  projection: GoalProjection | null;
  owner: string | null;
  nextMilestone?: { title: string; due_date: CalendarDate | null; overdue: boolean } | null;
}) {
  const done = goal.status === "completed";
  return (
    <Link
      href={`/goals/${goal.id}`}
      className="block rounded-2xl bg-card p-4 shadow-card ring-1 ring-border/80 transition-colors hover:bg-muted/40"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {done ? <CheckCircle2Icon className="size-4 shrink-0 text-success" aria-label="Completed" /> : null}
            <h3 className="truncate font-semibold">{goal.name}</h3>
          </div>
          <div className="text-xs text-muted-foreground">
            {GOAL_CATEGORY_LABELS[goal.category] ?? goal.category}
            {owner ? ` · ${owner}` : ""}
            {goal.target_date ? ` · by ${formatDate(goal.target_date)}` : ""}
          </div>
        </div>
        <div className="flex shrink-0 gap-1">
          {goal.priority === "high" && !done ? <Badge variant="secondary">High priority</Badge> : null}
          {goal.status === "on_hold" || goal.status === "not_started" ? <Badge variant="outline">{GOAL_STATUS_LABELS[goal.status]}</Badge> : null}
        </div>
      </div>
      <div className="mt-3">
        <div className="mb-1.5 flex items-baseline justify-between text-xs text-muted-foreground">
          <span>
            <ProgressValue progress={progress} />
          </span>
          <span className="font-medium text-foreground">{progress.percent}%</span>
        </div>
        <div
          className="h-2.5 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-label={`${goal.name} progress`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress.percent)}
        >
          <div className={cn("h-full rounded-full", done ? "bg-success" : "bg-primary")} style={{ width: `${progress.percent}%` }} />
        </div>
      </div>
      <div className="mt-2 space-y-0.5 text-xs">
        {done && goal.completed_at ? (
          <div className="text-muted-foreground">Completed {formatDate(goal.completed_at.slice(0, 10))}</div>
        ) : (
          <ProjectionText projection={projection} targetDate={goal.target_date} />
        )}
        {nextMilestone ? (
          <div className={cn("flex items-center gap-1", nextMilestone.overdue ? "text-destructive" : "text-muted-foreground")}>
            <FlagIcon className="size-3" aria-hidden /> Next: {nextMilestone.title}
            {nextMilestone.due_date ? ` · ${formatDate(nextMilestone.due_date)}` : ""}
            {nextMilestone.overdue ? " (overdue)" : ""}
          </div>
        ) : null}
      </div>
    </Link>
  );
}
