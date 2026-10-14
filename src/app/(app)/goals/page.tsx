import type { Metadata } from "next";
import { Suspense } from "react";
import { TargetIcon, TrophyIcon } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader, SectionHeading } from "@/components/shared/page-header";
import { ListSkeleton } from "@/components/shared/skeletons";
import { getAccounts } from "@/features/finance/queries";
import { GoalCard } from "@/features/goals/components/goal-card";
import { NewGoalButton } from "@/features/goals/components/goal-form";
import { goalProgress, goalProjection } from "@/features/goals/progress";
import { buildInputs, getContributions, getGoals, getMilestones } from "@/features/goals/queries";
import { memberName, requireHousehold } from "@/lib/auth/context";

export const metadata: Metadata = { title: "Goals" };

export default function GoalsPage() {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader title="Goals" />
          <ListSkeleton rows={3} />
        </>
      }
    >
      <GoalsView />
    </Suspense>
  );
}

async function GoalsView() {
  const ctx = await requireHousehold();
  const [goals, accounts] = await Promise.all([getGoals(ctx), getAccounts(ctx, { includeArchived: true })]);
  const ids = goals.map((g) => g.id);
  const [milestones, contributions] = await Promise.all([getMilestones(ctx, ids), getContributions(ctx, ids)]);
  const inputs = buildInputs(goals, new Map(accounts.map((a) => [a.id, a.balance_minor])), milestones, contributions);

  const enriched = goals.map((g) => {
    const progress = goalProgress(g, inputs.get(g.id) ?? {});
    const next = milestones.filter((m) => m.goal_id === g.id && !m.completed_at)[0];
    return {
      goal: g,
      progress,
      projection: goalProjection(g, progress, ctx.today),
      owner: memberName(ctx.members, g.assigned_user_id),
      next: next ? { title: next.title, due_date: next.due_date, overdue: Boolean(next.due_date && next.due_date < ctx.today) } : null,
    };
  });
  const active = enriched.filter((e) => e.goal.status !== "completed" && e.goal.status !== "cancelled");
  const completed = enriched
    .filter((e) => e.goal.status === "completed")
    .sort((a, b) => (b.goal.completed_at ?? "").localeCompare(a.goal.completed_at ?? ""));
  const cancelled = enriched.filter((e) => e.goal.status === "cancelled");

  return (
    <div className="space-y-5">
      <PageHeader
        title="Goals"
        description="Financial and personal goals, with milestones and projected finish dates."
        actions={
          ctx.canWrite ? (
            <NewGoalButton
              accounts={accounts.filter((a) => !a.is_archived).map((a) => ({ id: a.id, name: a.name, type: a.type }))}
              members={ctx.members.map((m) => ({ user_id: m.user_id, display_name: m.display_name }))}
              currency={ctx.household.base_currency}
              today={ctx.today}
            />
          ) : null
        }
      />
      {active.length ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {active.map((e) => (
            <GoalCard key={e.goal.id} goal={e.goal} progress={e.progress} projection={e.projection} owner={e.owner} nextMilestone={e.next} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={TargetIcon}
          title="No active goals"
          description="Try an emergency fund linked to your savings account, paying off the car loan, or a family holiday."
        />
      )}
      {completed.length ? (
        <section>
          <SectionHeading title={`Achieved (${completed.length})`} />
          <div className="grid gap-3 lg:grid-cols-2">
            {completed.map((e) => (
              <GoalCard key={e.goal.id} goal={e.goal} progress={e.progress} projection={null} owner={e.owner} />
            ))}
          </div>
        </section>
      ) : active.length ? (
        <p className="flex items-center gap-2 px-1 text-sm text-muted-foreground">
          <TrophyIcon className="size-4" aria-hidden /> Completed goals are kept here as a record of what you&apos;ve achieved.
        </p>
      ) : null}
      {cancelled.length ? (
        <section>
          <SectionHeading title="Cancelled" />
          <div className="grid gap-3 lg:grid-cols-2">
            {cancelled.map((e) => (
              <GoalCard key={e.goal.id} goal={e.goal} progress={e.progress} projection={null} owner={e.owner} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
