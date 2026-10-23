import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import {
  BellRingIcon,
  ChevronRightIcon,
  DropletIcon,
  DumbbellIcon,
  FlameIcon,
  MoonIcon,
  PlayCircleIcon,
  ScaleIcon,
  SparklesIcon,
  ThumbsUpIcon,
  TrendingDownIcon,
  TrendingUpIcon,
  UtensilsIcon,
} from "lucide-react";
import { cn } from "cn";
import { PageHeader, SectionHeading } from "@/components/shared/page-header";
import { PageSkeleton } from "@/components/shared/skeletons";
import { BADGE_BY_KEY } from "@/features/health/calc/achievements";
import { weekSummary } from "@/features/health/calc/insights";
import { sumNutrition } from "@/features/health/calc/macros";
import { weeklyTrendChange } from "@/features/health/calc/trend";
import { formatWeight } from "@/features/health/calc/units";
import { exercise } from "@/features/health/catalog/exercises";
import { program } from "@/features/health/catalog/programs";
import { Celebration } from "@/features/health/components/celebration";
import { MACRO_COLORS } from "@/features/health/components/macros";
import { MedicalNote } from "@/features/health/components/plan-summary";
import { ProgressRing } from "@/features/health/components/rings";
import { WaterTracker } from "@/features/health/components/water-tracker";
import { StartWorkoutButton } from "@/features/health/components/workout-buttons";
import { requireHealthProfile } from "@/features/health/context";
import { loadOverview, nextProgramDay, targetsFor, weightOn } from "@/features/health/queries";
import { addDays, dayHeading, instantToLocalTime, weekStart } from "@/lib/dates";

// The layout's "%s · Ward Health" template only reaches child segments, so this page names itself.
export const metadata: Metadata = { title: { absolute: "Ward Health" } };

const card = "rounded-2xl bg-card p-4 shadow-card ring-1 ring-border/80";

export default function HealthDashboardPage() {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader title="Today" />
          <PageSkeleton />
        </>
      }
    >
      <DashboardView />
    </Suspense>
  );
}

function greeting(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

async function DashboardView() {
  const { ctx, repo, profile } = await requireHealthProfile();
  const today = ctx.today;
  const units = profile.units;
  const [overview, weekLogs, weekWater, achievements] = await Promise.all([
    loadOverview(repo, profile, today),
    repo.listFoodLogs({ from: addDays(today, -6), to: today }),
    repo.listWater({ from: addDays(today, -6), to: today }),
    repo.listAchievements(),
  ]);
  const hour = Number(instantToLocalTime(new Date(), ctx.household.timezone).slice(0, 2));

  const weightNow = weightOn(overview.weighIns, profile, today);
  const { plan, macros, diet } = targetsFor(profile, weightNow, today);
  const eaten = sumNutrition(weekLogs.filter((l) => l.onDate === today));
  const waterToday = weekWater.find((w) => w.onDate === today)?.totalMl ?? 0;
  const trendKg = overview.trend.at(-1)?.avgKg ?? null;
  const perWeek = weeklyTrendChange(overview.trend);
  const weighedToday = overview.weighIns.some((w) => w.onDate === today);

  const prog = program(profile.activeProgram);
  const open = overview.sessions.find((s) => !s.finishedAt);
  const finished = overview.sessions.filter((s) => s.finishedAt);
  const trainedToday = finished.some((s) => s.onDate === today);
  const thisWeek = finished.filter((s) => s.onDate >= weekStart(today)).length;
  const nextDay = prog ? nextProgramDay(prog, overview.sessions) : 0;
  const workoutDue = prog !== undefined && !trainedToday && thisWeek < prog.daysPerWeek;

  const unseen = achievements.filter((a) => !a.seenAt).map((a) => BADGE_BY_KEY.get(a.badgeKey)).filter((b) => b !== undefined);

  const week = weekSummary({
    today,
    goal: profile.goal,
    foodLogs: weekLogs,
    water: weekWater,
    workoutDates: finished.map((s) => s.onDate),
    targets: { calories: plan.target, proteinG: macros.proteinG, waterMl: profile.waterGoalMl, workoutsPerWeek: prog?.daysPerWeek ?? null },
    trendPerWeekKg: perWeek,
    formatKg: (kg) => formatWeight(kg, units),
  });

  // Reminders the person turned on, shown only while they're still due today.
  const r = profile.reminders;
  const reminders = [
    r.weighIn && !weighedToday ? { icon: ScaleIcon, text: "You haven't weighed in today.", href: "/health/track/weight", cta: "Log weight" } : null,
    r.logMeals && hour >= 18 && eaten.calories === 0 ? { icon: UtensilsIcon, text: "Nothing logged today yet.", href: "/health/track", cta: "Log food" } : null,
    r.workouts && workoutDue && hour >= 7 ? { icon: DumbbellIcon, text: `${prog!.days[nextDay].name} is next in your program.`, href: "/health/workouts", cta: "Go" } : null,
    r.water && hour >= 12 && waterToday < profile.waterGoalMl * Math.min(1, (hour - 7) / 14)
      ? { icon: DropletIcon, text: "You're behind on water today.", href: "/health/track", cta: "Add water" }
      : null,
  ].filter((x) => x !== null);

  const left = plan.target - eaten.calories;

  return (
    <div className="space-y-5">
      <PageHeader
        title={`${greeting(hour)}, ${ctx.me.display_name}`}
        description={dayHeading(today)}
        actions={
          overview.streak > 0 ? (
            <Link href="/health/track/badges" className="flex items-center gap-1.5 rounded-full bg-warning-soft px-3 py-1.5 text-sm font-semibold">
              <FlameIcon className="size-4 text-warning" aria-hidden />
              <span className="tabular">{overview.streak}</span>
              <span className="sr-only">-day streak</span>
              <span aria-hidden className="text-xs font-medium text-muted-foreground">
                day{overview.streak === 1 ? "" : "s"}
              </span>
            </Link>
          ) : null
        }
      />

      {unseen.length ? <Celebration badges={unseen} /> : null}

      {reminders.length ? (
        <section aria-label="Reminders" className="space-y-2">
          {reminders.map((rem) => (
            <Link key={rem.text} href={rem.href} className="flex items-center gap-3 rounded-2xl bg-accent/70 px-4 py-3 text-accent-foreground transition-colors hover:bg-accent animate-in fade-in slide-in-from-top-1">
              <BellRingIcon className="size-4 shrink-0" aria-hidden />
              <rem.icon className="size-4 shrink-0" aria-hidden />
              <span className="min-w-0 flex-1 text-sm">{rem.text}</span>
              <span className="text-sm font-semibold">{rem.cta}</span>
            </Link>
          ))}
        </section>
      ) : null}

      {open ? (
        <Link href={`/health/workouts/session/${open.id}`} className="flex items-center gap-3 rounded-2xl bg-primary p-4 text-primary-foreground shadow-card">
          <PlayCircleIcon className="size-8 shrink-0" aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="text-xs text-primary-foreground/80">Workout in progress</div>
            <div className="truncate font-semibold">{open.name}</div>
          </div>
          <span className="text-sm font-medium">Resume</span>
        </Link>
      ) : null}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {/* Calories and macros remaining */}
        <Link href="/health/track" className={cn(card, "flex items-center gap-4 transition-colors hover:bg-muted/40")}>
          <ProgressRing value={eaten.calories} max={plan.target} size={128} stroke={12} label={`${eaten.calories} of ${plan.target} calories eaten`}>
            <span className="text-2xl font-semibold tabular">{Math.abs(left).toLocaleString("en-GB")}</span>
            <span className="text-[11px] text-muted-foreground">{left >= 0 ? "kcal left" : "kcal over"}</span>
          </ProgressRing>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="text-xs font-medium text-muted-foreground">Remaining today · {diet.name}</div>
            {(
              [
                ["protein", "Protein", macros.proteinG - eaten.proteinG],
                ["carbs", "Carbs", macros.carbsG - eaten.carbsG],
                ["fat", "Fat", macros.fatG - eaten.fatG],
              ] as const
            ).map(([k, label, g]) => (
              <div key={k} className="flex items-center gap-2 text-sm">
                <span className="size-2 rounded-full" style={{ background: MACRO_COLORS[k] }} aria-hidden />
                <span className="flex-1 text-muted-foreground">{label}</span>
                <span className="font-medium tabular">{g >= 0 ? `${Math.round(g)} g` : `${Math.round(-g)} g over`}</span>
              </div>
            ))}
          </div>
        </Link>

        {/* Today's workout */}
        <section className={cn(card, "flex flex-col gap-3")} aria-labelledby="today-workout">
          <div className="flex items-center gap-2">
            <DumbbellIcon className="size-4 text-primary" aria-hidden />
            <h2 id="today-workout" className="text-sm font-semibold">
              Today&apos;s workout
            </h2>
            {prog ? (
              <span className="ml-auto text-xs text-muted-foreground tabular">
                {thisWeek}/{prog.daysPerWeek} this week
              </span>
            ) : null}
          </div>
          {trainedToday ? (
            <p className="flex items-center gap-2 text-sm">
              <ThumbsUpIcon className="size-4 text-success" aria-hidden /> Done for today — recovery is part of the plan.
            </p>
          ) : prog && workoutDue ? (
            <>
              <div>
                <div className="font-semibold">{prog.days[nextDay].name}</div>
                <div className="truncate text-sm text-muted-foreground">
                  {prog.days[nextDay].exercises.map((e) => exercise(e.key)?.name).slice(0, 4).join(" · ")}
                  {prog.days[nextDay].exercises.length > 4 ? " …" : ""}
                </div>
              </div>
              <StartWorkoutButton start={{ kind: "program", programKey: prog.key, day: nextDay }} className="mt-auto">
                Start workout
              </StartWorkoutButton>
            </>
          ) : prog ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <MoonIcon className="size-4" aria-hidden /> Rest day — you&apos;ve done this week&apos;s sessions.
            </p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">No program yet. Pick one that matches your goal and equipment.</p>
              <Link href="/health/workouts/programs" className="mt-auto inline-flex items-center gap-1 text-sm font-medium text-primary">
                Browse programs <ChevronRightIcon className="size-4" aria-hidden />
              </Link>
            </>
          )}
        </section>

        {/* Water */}
        <section className={card} aria-labelledby="today-water">
          <h2 id="today-water" className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <DropletIcon className="size-4 text-chart-3" aria-hidden /> Water
          </h2>
          <WaterTracker date={today} totalMl={waterToday} goalMl={profile.waterGoalMl} units={units} compact />
        </section>

        {/* Weight trend */}
        <Link href="/health/track/weight" className={cn(card, "flex flex-col gap-2 transition-colors hover:bg-muted/40")}>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <ScaleIcon className="size-4 text-primary" aria-hidden /> Weight trend
            <ChevronRightIcon className="ml-auto size-4 text-muted-foreground" aria-hidden />
          </div>
          {trendKg !== null ? (
            <>
              <div className="text-2xl font-semibold tabular">{formatWeight(trendKg, units)}</div>
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                {perWeek === null ? (
                  "Keep weighing in to see your weekly trend"
                ) : (
                  <>
                    {perWeek < 0 ? <TrendingDownIcon className="size-4" aria-hidden /> : <TrendingUpIcon className="size-4" aria-hidden />}
                    {formatWeight(perWeek, units, { signed: true })} a week
                    {profile.targetWeightKg !== null ? ` · ${formatWeight(Math.abs(profile.targetWeightKg - trendKg), units)} to go` : ""}
                  </>
                )}
              </div>
              {!weighedToday ? <div className="text-xs font-medium text-primary">Weigh in today</div> : null}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Log a weigh-in to start your trend.</p>
          )}
        </Link>
      </div>

      <section>
        <SectionHeading title="Last 7 days" />
        <div className={cn(card, "space-y-4")}>
          <dl className="grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
            {[
              { label: "Avg calories", value: week.avgCalories?.toLocaleString("en-GB") ?? "—", hint: `target ${plan.target.toLocaleString("en-GB")}` },
              { label: "Avg protein", value: week.avgProtein !== null ? `${week.avgProtein} g` : "—", hint: `target ${macros.proteinG} g` },
              { label: "Workouts", value: String(week.workouts), hint: prog ? `of ${prog.daysPerWeek} planned` : "finished" },
              { label: "Water goal", value: `${week.waterDays}/7`, hint: "days reached" },
            ].map((s) => (
              <div key={s.label} className="rounded-xl bg-muted/50 px-2 py-3">
                <dt className="text-xs text-muted-foreground">{s.label}</dt>
                <dd className="text-lg font-semibold tabular">{s.value}</dd>
                <dd className="text-[11px] text-muted-foreground">{s.hint}</dd>
              </div>
            ))}
          </dl>
          <ul className="space-y-2">
            {week.insights.map((i) => (
              <li key={i.text} className="flex gap-2 text-sm">
                <SparklesIcon className={cn("mt-0.5 size-4 shrink-0", i.tone === "good" ? "text-success" : i.tone === "nudge" ? "text-warning" : "text-muted-foreground")} aria-hidden />
                {i.text}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <MedicalNote />
    </div>
  );
}
