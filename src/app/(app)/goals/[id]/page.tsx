import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CheckCircle2Icon, PauseIcon, PlayIcon, RotateCcwIcon, Trash2Icon, XCircleIcon } from "lucide-react";
import { cn } from "cn";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { PageHeader, SectionHeading } from "@/components/shared/page-header";
import { CardSkeleton } from "@/components/shared/skeletons";
import { Badge } from "@/components/ui/badge";
import { getAccounts } from "@/features/finance/queries";
import { deleteGoal, setGoalStatus } from "@/features/goals/actions";
import { ProgressValue, ProjectionText } from "@/features/goals/components/goal-card";
import { Contributions, ManualProgress, Milestones } from "@/features/goals/components/goal-detail-parts";
import { EditGoalButton } from "@/features/goals/components/goal-form";
import { GOAL_CATEGORY_LABELS, GOAL_SOURCE_LABELS, GOAL_STATUS_LABELS, goalProgress, goalProjection } from "@/features/goals/progress";
import { buildInputs, getContributions, getGoal, getMilestones } from "@/features/goals/queries";
import { memberName, requireHousehold } from "@/lib/auth/context";
import { formatDate } from "@/lib/dates";
import { minorToInput } from "@/lib/money";

export const metadata: Metadata = { title: "Goal" };

export default function GoalPage({ params }: PageProps<"/goals/[id]">) {
  return (
    <Suspense fallback={<CardSkeleton lines={6} />}>
      <GoalDetail params={params} />
    </Suspense>
  );
}

async function GoalDetail({ params }: { params: PageProps<"/goals/[id]">["params"] }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ctx = await requireHousehold();
  const goal = await getGoal(ctx, id);
  if (!goal) notFound();
  const [accounts, milestones, contributions] = await Promise.all([
    getAccounts(ctx, { includeArchived: true }),
    getMilestones(ctx, [id]),
    getContributions(ctx, [id]),
  ]);
  const inputs = buildInputs([goal], new Map(accounts.map((a) => [a.id, a.balance_minor])), milestones, contributions).get(id) ?? {};
  const progress = goalProgress(goal, inputs);
  const projection = goalProjection(goal, progress, ctx.today);
  const linked = accounts.find((a) => a.id === goal.linked_account_id);
  const open = goal.status !== "completed" && goal.status !== "cancelled";
  const names = Object.fromEntries(ctx.members.map((m) => [m.user_id, m.display_name]));

  return (
    <div className="space-y-5">
      <PageHeader
        title={goal.name}
        back={{ href: "/goals", label: "Goals" }}
        actions={<Badge variant={goal.status === "completed" ? "default" : "secondary"}>{GOAL_STATUS_LABELS[goal.status]}</Badge>}
      />

      <section className="rounded-2xl bg-card p-5 shadow-card ring-1 ring-border/80">
        <div className="flex items-baseline justify-between gap-3">
          <div className="text-4xl font-semibold tracking-tight tabular">{progress.percent}%</div>
          <div className="text-right text-sm text-muted-foreground">
            <ProgressValue progress={progress} />
          </div>
        </div>
        <div className="mt-3 h-3 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Goal progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress.percent)}>
          <div className={cn("h-full rounded-full", goal.status === "completed" ? "bg-success" : "bg-primary")} style={{ width: `${progress.percent}%` }} />
        </div>
        <div className="mt-2 text-sm">
          <ProjectionText projection={projection} targetDate={goal.target_date} />
        </div>
        {open && progress.percent >= 100 && ctx.canWrite ? (
          <p className="mt-3 rounded-xl bg-success-soft px-3 py-2 text-sm text-success">You&apos;ve hit the target — mark the goal complete below.</p>
        ) : null}
        <dl className="mt-4 grid grid-cols-2 gap-3 border-t pt-4 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Category</dt>
            <dd className="font-medium">{GOAL_CATEGORY_LABELS[goal.category]}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Leading</dt>
            <dd className="font-medium">{memberName(ctx.members, goal.assigned_user_id) ?? "Both"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Started</dt>
            <dd className="font-medium">{formatDate(goal.start_date)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Target date</dt>
            <dd className="font-medium">{goal.target_date ? formatDate(goal.target_date) : "None"}</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-xs text-muted-foreground">Progress from</dt>
            <dd className="font-medium">
              {GOAL_SOURCE_LABELS[goal.progress_source]}
              {linked ? (
                <>
                  {" — "}
                  <Link href={`/finances/accounts/${linked.id}`} className="text-primary">
                    {linked.name}
                  </Link>
                </>
              ) : null}
            </dd>
          </div>
        </dl>
        {goal.description ? <p className="mt-4 text-sm whitespace-pre-wrap">{goal.description}</p> : null}
        {goal.notes ? <p className="mt-2 text-sm whitespace-pre-wrap text-muted-foreground">{goal.notes}</p> : null}
      </section>

      {goal.progress_source === "manual" && ctx.canWrite && open ? (
        <section>
          <SectionHeading title="Update progress" />
          <ManualProgress
            goalId={goal.id}
            kind={goal.target_minor !== null ? "money" : "number"}
            initial={goal.target_minor !== null ? minorToInput(goal.current_minor) : goal.current_value}
            unit={goal.unit}
            currency={ctx.household.base_currency}
          />
        </section>
      ) : null}

      {goal.progress_source === "contributions" ? (
        <section>
          <SectionHeading title="Contributions" />
          <Contributions
            goalId={goal.id}
            items={contributions}
            memberNames={names}
            today={ctx.today}
            currency={ctx.household.base_currency}
            canWrite={ctx.canWrite && open}
          />
        </section>
      ) : null}

      <section>
        <SectionHeading title="Milestones" />
        <Milestones goalId={goal.id} items={milestones} today={ctx.today} canWrite={ctx.canWrite} />
      </section>

      {ctx.canWrite ? (
        <div className="flex flex-wrap gap-2">
          <EditGoalButton
            accounts={accounts.filter((a) => !a.is_archived || a.id === goal.linked_account_id).map((a) => ({ id: a.id, name: a.name, type: a.type }))}
            members={ctx.members.map((m) => ({ user_id: m.user_id, display_name: m.display_name }))}
            currency={ctx.household.base_currency}
            today={ctx.today}
            initial={{
              id: goal.id,
              name: goal.name,
              description: goal.description ?? "",
              category: goal.category as "savings",
              progressSource: goal.progress_source,
              measure: goal.progress_source === "manual" && goal.target_minor === null ? "number" : "money",
              targetAmount: minorToInput(goal.target_minor),
              targetValue: goal.target_value ?? "",
              unit: goal.unit ?? "",
              linkedAccountId: goal.linked_account_id ?? "",
              startDate: goal.start_date,
              targetDate: goal.target_date ?? "",
              assignedUserId: goal.assigned_user_id ?? "",
              priority: goal.priority,
              notes: goal.notes ?? "",
            }}
          />
          {open ? (
            <>
              <ConfirmAction
                action={setGoalStatus.bind(null, goal.id, "completed")}
                trigger={
                  <>
                    <CheckCircle2Icon data-icon="inline-start" /> Mark complete
                  </>
                }
                title="Mark this goal complete?"
                description="It moves to your record of achieved goals. You can reopen it later."
                confirmLabel="Complete"
                destructive={false}
                variant="default"
              />
              <ConfirmAction
                action={setGoalStatus.bind(null, goal.id, goal.status === "on_hold" ? "in_progress" : "on_hold")}
                trigger={
                  goal.status === "on_hold" ? (
                    <>
                      <PlayIcon data-icon="inline-start" /> Resume
                    </>
                  ) : (
                    <>
                      <PauseIcon data-icon="inline-start" /> Pause
                    </>
                  )
                }
                title={goal.status === "on_hold" ? "Resume this goal?" : "Put this goal on hold?"}
                description="You can change this at any time."
                confirmLabel={goal.status === "on_hold" ? "Resume" : "Pause"}
                destructive={false}
              />
              <ConfirmAction
                action={setGoalStatus.bind(null, goal.id, "cancelled")}
                trigger={
                  <>
                    <XCircleIcon data-icon="inline-start" /> Cancel goal
                  </>
                }
                title="Cancel this goal?"
                description="It's kept in history as cancelled. Delete it instead if it was created by mistake."
                confirmLabel="Cancel goal"
              />
            </>
          ) : (
            <ConfirmAction
              action={setGoalStatus.bind(null, goal.id, "in_progress")}
              trigger={
                <>
                  <RotateCcwIcon data-icon="inline-start" /> Reopen
                </>
              }
              title="Reopen this goal?"
              description="It becomes active again."
              confirmLabel="Reopen"
              destructive={false}
            />
          )}
          <ConfirmAction
            action={deleteGoal.bind(null, goal.id)}
            trigger={
              <>
                <Trash2Icon data-icon="inline-start" /> Delete
              </>
            }
            title="Delete this goal?"
            description="Its milestones and contributions are deleted too. Linked accounts and transactions are not affected."
            confirmLabel="Delete"
            redirectTo="/goals"
            variant="destructive"
          />
        </div>
      ) : null}
    </div>
  );
}
