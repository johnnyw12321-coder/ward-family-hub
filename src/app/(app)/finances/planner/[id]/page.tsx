import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { CardSkeleton } from "@/components/shared/skeletons";
import { PlanEditor } from "@/features/planner/components/plan-editor";
import { PlanActions } from "@/features/planner/components/plan-forms";
import { getPlan } from "@/features/planner/queries";
import { requireHousehold } from "@/lib/auth/context";

export const metadata: Metadata = { title: "Plan" };

export default function PlanPage({ params }: PageProps<"/finances/planner/[id]">) {
  return (
    <Suspense fallback={<CardSkeleton lines={8} />}>
      <PlanDetail params={params} />
    </Suspense>
  );
}

async function PlanDetail({ params }: { params: PageProps<"/finances/planner/[id]">["params"] }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ctx = await requireHousehold();
  const plan = await getPlan(ctx, id);
  if (!plan) notFound();
  return (
    <div>
      <PageHeader
        title={plan.name}
        back={{ href: "/finances/planner", label: "Planner" }}
        description={
          plan.notes ? (
            <span className="whitespace-pre-line">{plan.notes}</span>
          ) : (
            "A playground: changes save automatically and never touch your real accounts."
          )
        }
      />
      {ctx.canWrite ? (
        <div className="-mt-2 mb-4">
          <PlanActions id={plan.id} name={plan.name} notes={plan.notes} />
        </div>
      ) : null}
      {/* The editor owns the lines once loaded; keyed so a different plan starts fresh. */}
      <PlanEditor key={plan.id} planId={plan.id} lines={plan.lines} currency={ctx.household.base_currency} canWrite={ctx.canWrite} />
    </div>
  );
}
