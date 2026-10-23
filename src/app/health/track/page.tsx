import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChevronRightIcon, ScaleIcon } from "lucide-react";
import { SectionHeading } from "@/components/shared/page-header";
import { PageSkeleton } from "@/components/shared/skeletons";
import { sumNutrition } from "@/features/health/calc/macros";
import { formatWeight } from "@/features/health/calc/units";
import { DayNav } from "@/features/health/components/day-nav";
import { FoodDay, IntakeRings } from "@/features/health/components/food-day";
import { WaterTracker } from "@/features/health/components/water-tracker";
import { WeighInForm } from "@/features/health/components/weigh-in-form";
import { requireHealthProfile } from "@/features/health/context";
import { targetsFor, weightOn } from "@/features/health/queries";
import { addDays, isCalendarDate } from "@/lib/dates";

export const metadata: Metadata = { title: "Track" };

const card = "rounded-2xl bg-card p-4 shadow-card ring-1 ring-border/80 sm:p-5";

export default function TrackPage({ searchParams }: PageProps<"/health/track">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <TrackView searchParams={searchParams} />
    </Suspense>
  );
}

async function TrackView({ searchParams }: { searchParams: PageProps<"/health/track">["searchParams"] }) {
  const sp = await searchParams;
  const { ctx, repo, profile } = await requireHealthProfile();
  const today = ctx.today;
  const requested = typeof sp.date === "string" && isCalendarDate(sp.date) ? sp.date : today;
  const date = requested > today ? today : requested;

  const [logs, water, weighIns, customFoods, savedMeals, recent] = await Promise.all([
    repo.listFoodLogs({ from: date, to: date }),
    repo.listWater({ from: date, to: date }),
    repo.listWeighIns({ from: addDays(date, -60), to: date }),
    repo.listCustomFoods(),
    repo.listSavedMeals(),
    repo.recentFoods(25),
  ]);
  const { macros } = targetsFor(profile, weightOn(weighIns, profile, date), date);
  const weighIn = weighIns.find((w) => w.onDate === date);
  const lastKg = weighIns.at(-1)?.weightKg ?? profile.startWeightKg;

  return (
    <div className="space-y-5">
      <h1 className="sr-only">Food and water</h1>
      <DayNav date={date} today={today} basePath="/health/track" />

      <section className={card} aria-label="Calories and macros">
        <IntakeRings eaten={sumNutrition(logs)} targets={macros} />
      </section>

      <section className={card}>
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
            <ScaleIcon className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold">Weigh-in</h2>
            {weighIn ? (
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground tabular">{formatWeight(weighIn.weightKg, profile.units)}</span> logged
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">Same time each morning gives the clearest trend.</p>
            )}
          </div>
          <Link href="/health/track/weight" className="flex items-center gap-0.5 text-sm font-medium text-primary">
            Trend <ChevronRightIcon className="size-4" aria-hidden />
          </Link>
        </div>
        {!weighIn ? (
          <div className="mt-3">
            <WeighInForm key={date} date={date} today={today} units={profile.units} lastKg={lastKg} compact />
          </div>
        ) : null}
      </section>

      <section>
        <SectionHeading title="Meals" />
        <FoodDay date={date} logs={logs} customFoods={customFoods} savedMeals={savedMeals} recent={recent} />
      </section>

      <section>
        <SectionHeading title="Water" />
        <div className={card}>
          <WaterTracker date={date} totalMl={water[0]?.totalMl ?? 0} goalMl={profile.waterGoalMl} units={profile.units} />
        </div>
      </section>
    </div>
  );
}
