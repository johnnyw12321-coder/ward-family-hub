import type { Metadata } from "next";
import { Suspense } from "react";
import { RulerIcon } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader, SectionHeading } from "@/components/shared/page-header";
import { PageSkeleton } from "@/components/shared/skeletons";
import { displayLength, formatLength, lengthUnit } from "@/features/health/calc/units";
import { MeasurementList } from "@/features/health/components/history-lists";
import { MeasurementChart } from "@/features/health/components/measurement-chart";
import { MeasurementForm } from "@/features/health/components/measurement-form";
import { MEASUREMENT_FIELDS } from "@/features/health/measurements";
import { ProgressPhotos } from "@/features/health/components/progress-photos";
import { requireHealthProfile } from "@/features/health/context";

export const metadata: Metadata = { title: "Body" };

const card = "rounded-2xl bg-card p-4 shadow-card ring-1 ring-border/80 sm:p-5";

export default function BodyPage() {
  return (
    <div>
      <PageHeader title="Body" description="Measurements and photos often show progress before the scale does." />
      <Suspense fallback={<PageSkeleton />}>
        <BodyView />
      </Suspense>
    </div>
  );
}

async function BodyView() {
  const { ctx, repo, profile } = await requireHealthProfile();
  const units = profile.units;
  const rows = await repo.listMeasurements();
  const first = rows[0];
  const last = rows.at(-1) ?? null;
  const chartRows = rows.map((m) => ({
    date: m.onDate,
    ...Object.fromEntries(MEASUREMENT_FIELDS.map((f) => [f.key, m[f.key] === null ? null : displayLength(m[f.key]!, units)])),
  }));

  return (
    <div className="space-y-6">
      {last && first && rows.length > 1 ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {MEASUREMENT_FIELDS.filter((f) => last[f.key] !== null).map((f) => {
            const start = rows.find((r) => r[f.key] !== null)![f.key]!;
            const diff = last[f.key]! - start;
            return (
              <li key={f.key} className="rounded-2xl bg-card p-3 shadow-card ring-1 ring-border/80">
                <div className="text-xs font-medium text-muted-foreground">{f.label}</div>
                <div className="text-lg font-semibold tabular">{formatLength(last[f.key]!, units)}</div>
                <div className="text-xs text-muted-foreground tabular">{Math.abs(diff) < 0.05 ? "no change" : `${formatLength(diff, units, { signed: true })} overall`}</div>
              </li>
            );
          })}
        </ul>
      ) : null}

      <section className={card}>
        <h2 className="mb-3 text-sm font-semibold">Measurements over time</h2>
        {rows.length ? (
          <MeasurementChart rows={chartRows} unit={lengthUnit(units)} />
        ) : (
          <EmptyState icon={RulerIcon} title="No measurements yet" description="Measure every two weeks or so, at the same time of day." className="py-6" />
        )}
      </section>

      <section>
        <SectionHeading title="Record measurements" />
        <div className={card}>
          <MeasurementForm today={ctx.today} units={units} last={last} />
        </div>
      </section>

      {rows.length ? (
        <section>
          <SectionHeading title="History" />
          <MeasurementList rows={[...rows].reverse()} units={units} />
        </section>
      ) : null}

      <section>
        <SectionHeading title="Progress photos" />
        <div className={card}>
          <ProgressPhotos userId={ctx.userId} today={ctx.today} />
        </div>
      </section>
    </div>
  );
}
