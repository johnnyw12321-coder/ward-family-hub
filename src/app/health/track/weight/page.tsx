import type { Metadata } from "next";
import { Suspense } from "react";
import { ScaleIcon } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader, SectionHeading } from "@/components/shared/page-header";
import { PageSkeleton } from "@/components/shared/skeletons";
import { StatCard } from "@/components/shared/stat-card";
import { bmi } from "@/features/health/calc/energy";
import { goalLineAt, goalProgress, movingAverage, weeklyTrendChange } from "@/features/health/calc/trend";
import { displayWeight, formatWeight, weightUnit } from "@/features/health/calc/units";
import { WeightChart, type WeightPoint } from "@/features/health/components/charts";
import { WeighInList } from "@/features/health/components/history-lists";
import { WeighInForm } from "@/features/health/components/weigh-in-form";
import { requireHealthProfile } from "@/features/health/context";
import { formatDate } from "@/lib/dates";

export const metadata: Metadata = { title: "Weight" };

const card = "rounded-2xl bg-card p-4 shadow-card ring-1 ring-border/80 sm:p-5";

export default function WeightPage() {
  return (
    <div>
      <PageHeader title="Weight" description="Daily weigh-ins bounce around; the 7-day average shows the real trend." />
      <Suspense fallback={<PageSkeleton />}>
        <WeightView />
      </Suspense>
    </div>
  );
}

async function WeightView() {
  const { ctx, repo, profile } = await requireHealthProfile();
  const units = profile.units;
  const weighIns = await repo.listWeighIns();
  const trend = movingAverage(weighIns);
  const avgByDate = new Map(trend.map((t) => [t.onDate, t.avgKg]));
  const goal =
    profile.targetWeightKg !== null && profile.targetDate
      ? { startDate: profile.startDate, startKg: profile.startWeightKg, targetDate: profile.targetDate, targetKg: profile.targetWeightKg }
      : null;
  const points: WeightPoint[] = weighIns.map((w) => ({
    date: w.onDate,
    weight: displayWeight(w.weightKg, units),
    avg: displayWeight(avgByDate.get(w.onDate)!, units),
    goal: goal && w.onDate >= goal.startDate ? displayWeight(goalLineAt(goal, w.onDate), units) : null,
  }));

  const current = trend.at(-1)?.avgKg ?? profile.startWeightKg;
  const weekly = weeklyTrendChange(trend);
  const change = current - profile.startWeightKg;
  const toGo = profile.targetWeightKg !== null ? profile.targetWeightKg - current : null;
  const lastKg = weighIns.at(-1)?.weightKg ?? profile.startWeightKg;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Trend weight" value={formatWeight(current, units)} hint={`BMI ${bmi(current, profile.heightCm).toFixed(1)}`} tone="primary" />
        <StatCard label="Since you started" value={formatWeight(change, units, { signed: true })} hint={`from ${formatDate(profile.startDate)}`} />
        <StatCard label="This week" value={weekly === null ? "—" : formatWeight(weekly, units, { signed: true })} hint="trend change per week" />
        <StatCard
          label="To go"
          value={toGo === null ? "—" : Math.abs(toGo) < 0.1 ? "There!" : formatWeight(Math.abs(toGo), units)}
          hint={
            toGo === null
              ? "Set a target in Profile"
              : `${Math.round(goalProgress(profile.startWeightKg, current, profile.targetWeightKg!) * 100)}% of the way`
          }
        />
      </div>

      <section className={card}>
        <h2 className="mb-3 text-sm font-semibold">Trend</h2>
        {points.length >= 2 ? (
          <WeightChart points={points} unit={weightUnit(units)} today={ctx.today} />
        ) : (
          <EmptyState icon={ScaleIcon} title="Your trend line starts here" description="Log a couple more weigh-ins and your chart will appear." className="py-6" />
        )}
      </section>

      <section>
        <SectionHeading title="Log weight" />
        <div className={card}>
          <WeighInForm date={ctx.today} today={ctx.today} units={units} lastKg={lastKg} />
        </div>
      </section>

      {weighIns.length ? (
        <section>
          <SectionHeading title="History" />
          <WeighInList weighIns={[...weighIns].reverse().slice(0, 60)} units={units} />
          {weighIns.length > 60 ? <p className="mt-2 px-1 text-xs text-muted-foreground">Showing the latest 60. Export from Profile for the full history.</p> : null}
        </section>
      ) : null}
    </div>
  );
}
