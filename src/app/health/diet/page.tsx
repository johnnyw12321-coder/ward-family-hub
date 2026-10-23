import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChevronRightIcon, InfoIcon, TimerIcon } from "lucide-react";
import { cn } from "cn";
import { PageHeader, SectionHeading } from "@/components/shared/page-header";
import { CardSkeleton } from "@/components/shared/skeletons";
import { Badge } from "@/components/ui/badge";
import { DIET_PLANS, RECOMMENDED_PLAN } from "@/features/health/catalog/diet-plans";
import { GOAL_LABELS } from "@/features/health/calc/energy";
import { FastingTimer } from "@/features/health/components/fasting-timer";
import { MacroSplitBar } from "@/features/health/components/macros";
import { MedicalNote } from "@/features/health/components/plan-summary";
import { requireHealthProfile } from "@/features/health/context";
import { loadTargets } from "@/features/health/queries";

export const metadata: Metadata = { title: "Diet" };

const card = "rounded-2xl bg-card p-4 shadow-card ring-1 ring-border/80 sm:p-5";

export default function DietPage() {
  return (
    <div>
      <PageHeader title="Diet" description="Pick a plan that suits you. Your macros are worked out from your calorie target." />
      <Suspense fallback={<CardSkeleton lines={6} />}>
        <DietView />
      </Suspense>
    </div>
  );
}

async function DietView() {
  const { ctx, repo, profile } = await requireHealthProfile();
  const { plan, diet, macros } = await loadTargets(repo, profile, ctx.today);
  const chosen = profile.dietPlan !== null;
  const recommended = RECOMMENDED_PLAN[profile.goal];
  const mismatch = chosen && !diet.goals.includes(profile.goal);

  return (
    <div className="space-y-6">
      <section className={cn(card, "space-y-4")}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-medium text-muted-foreground">{chosen ? "Your plan" : "Suggested for you"}</div>
            <h2 className="text-xl font-semibold tracking-tight">{diet.name}</h2>
            <p className="text-sm text-muted-foreground">{diet.tagline}</p>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-2xl font-semibold tabular">{plan.target.toLocaleString("en-GB")}</div>
            <div className="text-xs text-muted-foreground">kcal a day</div>
          </div>
        </div>
        <MacroSplitBar split={diet.macros} targets={macros} />
        {!chosen ? (
          <p className="flex gap-2 rounded-xl bg-muted/60 px-3 py-2.5 text-sm text-muted-foreground">
            <InfoIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
            You haven&apos;t picked a plan yet, so your macros follow the plan we&apos;d suggest for {GOAL_LABELS[profile.goal].label.toLowerCase()}.
          </p>
        ) : null}
        {mismatch ? (
          <p className="flex gap-2 rounded-xl bg-warning-soft px-3 py-2.5 text-sm">
            <InfoIcon className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
            {diet.name} isn&apos;t usually used to {GOAL_LABELS[profile.goal].label.toLowerCase()}. It still works — your calories come from
            your goal — but you might prefer a plan built for it.
          </p>
        ) : null}
        <Link href={`/health/diet/${diet.key}`} className="inline-flex items-center gap-1 text-sm font-medium text-primary">
          Sample day, food list, pros and cons <ChevronRightIcon className="size-4" aria-hidden />
        </Link>
      </section>

      {diet.fasting && profile.fastingProtocol ? (
        <section>
          <SectionHeading title="Fasting timer" />
          <div className={card}>
            <FastingTimer protocol={profile.fastingProtocol} startedAt={profile.fastStartedAt} />
          </div>
        </section>
      ) : null}

      <section>
        <SectionHeading title="All plans" />
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {DIET_PLANS.map((p) => (
            <li key={p.key}>
              <Link
                href={`/health/diet/${p.key}`}
                className={cn(
                  "flex h-full flex-col gap-3 rounded-2xl bg-card p-4 shadow-card ring-1 transition-all hover:-translate-y-0.5 hover:bg-muted/40",
                  p.key === diet.key && chosen ? "ring-2 ring-primary" : "ring-border/80",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 font-medium">
                      {p.name}
                      {p.fasting ? <TimerIcon className="size-4 text-muted-foreground" aria-label="Includes a fasting timer" /> : null}
                    </div>
                    <p className="text-sm text-muted-foreground">{p.tagline}</p>
                  </div>
                  {p.key === diet.key && chosen ? (
                    <Badge>Current</Badge>
                  ) : p.key === recommended ? (
                    <Badge variant="secondary">Suggested</Badge>
                  ) : null}
                </div>
                <MacroSplitBar split={p.macros} className="mt-auto" />
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <MedicalNote />
    </div>
  );
}
