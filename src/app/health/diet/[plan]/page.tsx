import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CheckIcon, MinusIcon, ThumbsDownIcon, ThumbsUpIcon, UsersIcon } from "lucide-react";
import { PageHeader, SectionHeading } from "@/components/shared/page-header";
import { CardSkeleton } from "@/components/shared/skeletons";
import { macroTargets } from "@/features/health/calc/macros";
import { DIET_PLAN_BY_KEY } from "@/features/health/catalog/diet-plans";
import { ChoosePlanButton } from "@/features/health/components/choose-plan-button";
import { MacroSplitBar } from "@/features/health/components/macros";
import { MedicalNote } from "@/features/health/components/plan-summary";
import { requireHealthProfile } from "@/features/health/context";
import { loadTargets } from "@/features/health/queries";

export const metadata: Metadata = { title: "Diet plan" };

const MEAL_LABELS = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", snack: "Snack" } as const;
const card = "rounded-2xl bg-card p-4 shadow-card ring-1 ring-border/80 sm:p-5";

export default function DietPlanPage({ params }: PageProps<"/health/diet/[plan]">) {
  return (
    <Suspense fallback={<CardSkeleton lines={8} />}>
      <PlanDetail params={params} />
    </Suspense>
  );
}

async function PlanDetail({ params }: { params: PageProps<"/health/diet/[plan]">["params"] }) {
  const { plan: key } = await params;
  const diet = DIET_PLAN_BY_KEY.get(key);
  if (!diet) notFound();
  const { ctx, repo, profile } = await requireHealthProfile();
  const { plan, weightKg } = await loadTargets(repo, profile, ctx.today);
  const macros = macroTargets(plan.target, diet.macros, weightKg);

  return (
    <div className="space-y-6">
      <PageHeader
        title={diet.name}
        description={diet.tagline}
        back={{ href: "/health/diet", label: "Diet" }}
        actions={<ChoosePlanButton planKey={diet.key} current={profile.dietPlan === diet.key} className="max-sm:hidden" />}
      />
      <section className={`${card} space-y-4`}>
        <p className="text-sm leading-relaxed">{diet.description}</p>
        <div>
          <div className="mb-2 text-xs font-medium text-muted-foreground">At your target of {plan.target.toLocaleString("en-GB")} kcal a day</div>
          <MacroSplitBar split={diet.macros} targets={macros} />
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <ListCard title="Suits" icon={<UsersIcon className="size-4" aria-hidden />} items={diet.suits} />
        <ListCard title="Pros" icon={<ThumbsUpIcon className="size-4 text-success" aria-hidden />} items={diet.pros} />
        <ListCard title="Cons" icon={<ThumbsDownIcon className="size-4 text-warning" aria-hidden />} items={diet.cons} />
      </section>

      <section>
        <SectionHeading title="A sample day" />
        <ol className="divide-y overflow-hidden rounded-2xl bg-card shadow-card ring-1 ring-border/80">
          {diet.sampleDay.map((m) => (
            <li key={m.name} className="flex items-start gap-3 p-4">
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium text-muted-foreground">{MEAL_LABELS[m.meal]}</div>
                <div className="font-medium">{m.name}</div>
                <p className="text-sm text-muted-foreground">{m.detail}</p>
              </div>
              <div className="shrink-0 text-right text-sm font-medium tabular">
                ~{(Math.round((plan.target * m.share) / 10) * 10).toLocaleString("en-GB")}
                <span className="block text-xs font-normal text-muted-foreground">kcal</span>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-2 px-1 text-xs text-muted-foreground">Portions scale to your calorie target; log what you actually eat in Track.</p>
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <ListCard title="Build meals around" icon={<CheckIcon className="size-4 text-success" aria-hidden />} items={diet.foods.eat} />
        <ListCard title="Go easy on" icon={<MinusIcon className="size-4 text-warning" aria-hidden />} items={diet.foods.limit} />
      </section>

      <ChoosePlanButton planKey={diet.key} current={profile.dietPlan === diet.key} className="w-full sm:hidden" />
      <MedicalNote />
    </div>
  );
}

function ListCard({ title, icon, items }: { title: string; icon: React.ReactNode; items: string[] }) {
  return (
    <div className={card}>
      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
        {icon}
        {title}
      </h3>
      <ul className="space-y-1.5 text-sm">
        {items.map((i) => (
          <li key={i} className="flex gap-2">
            <span className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground" aria-hidden />
            {i}
          </li>
        ))}
      </ul>
    </div>
  );
}
