import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CalculatorIcon, ChevronRightIcon } from "lucide-react";
import { cn } from "cn";
import { EmptyState } from "@/components/shared/empty-state";
import { FitText } from "@/components/shared/fit-text";
import { Money } from "@/components/shared/money";
import { PageHeader } from "@/components/shared/page-header";
import { ListSkeleton } from "@/components/shared/skeletons";
import { planTotals } from "@/features/planner/calc";
import { NewPlanButton } from "@/features/planner/components/plan-forms";
import { getPlans } from "@/features/planner/queries";
import { memberName, requireHousehold } from "@/lib/auth/context";
import { formatInstant } from "@/lib/dates";

export const metadata: Metadata = { title: "Planner" };

const DESCRIPTION = "Try out income and spending plans. Nothing here changes your real accounts.";

export default function PlannerPage() {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader title="Planner" description={DESCRIPTION} />
          <ListSkeleton rows={3} />
        </>
      }
    >
      <PlannerView />
    </Suspense>
  );
}

async function PlannerView() {
  const ctx = await requireHousehold();
  const plans = await getPlans(ctx);
  const defaultName = `Plan ${plans.length + 1}`;
  return (
    <div>
      <PageHeader
        title="Planner"
        description={DESCRIPTION}
        actions={ctx.canWrite && plans.length ? <NewPlanButton defaultName={defaultName} /> : null}
      />
      {plans.length ? (
        <ul className="space-y-3">
          {plans.map((plan) => {
            const t = planTotals(plan.lines, "monthly");
            const short = t.leftOver < 0;
            const editor = memberName(ctx.members, plan.updated_by);
            return (
              <li key={plan.id}>
                <Link
                  href={`/finances/planner/${plan.id}`}
                  className="block rounded-2xl bg-card p-4 shadow-card ring-1 ring-border/80 transition-colors hover:bg-muted/50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate font-semibold">{plan.name}</h2>
                      <p className="text-xs text-muted-foreground">
                        {plan.lines.length} {plan.lines.length === 1 ? "line" : "lines"} · updated{" "}
                        {formatInstant(plan.updated_at, ctx.household.timezone)}
                        {editor ? ` by ${editor}` : ""}
                      </p>
                    </div>
                    <ChevronRightIcon className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden />
                  </div>
                  <dl className="mt-3 grid grid-cols-3 gap-3 border-t pt-3">
                    <PlanFigure label="Income / mo" value={t.income} />
                    <PlanFigure label="Expenses / mo" value={t.expenses} />
                    <PlanFigure
                      label={short ? "Short by" : "Left over"}
                      value={Math.abs(t.leftOver)}
                      className={short ? "text-destructive" : "text-primary"}
                    />
                  </dl>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState
          icon={CalculatorIcon}
          title="Your money playground"
          description="List what comes in and what goes out, switch between weekly, monthly and yearly, and see what's left. Make copies to compare what-ifs."
          action={ctx.canWrite ? <NewPlanButton defaultName={defaultName} label="Create your first plan" /> : undefined}
        />
      )}
    </div>
  );
}

function PlanFigure({ label, value, className }: { label: string; value: number; className?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("font-semibold tabular", className)}>
        <FitText>
          <Money minor={value} trimZeroCents />
        </FitText>
      </dd>
    </div>
  );
}
