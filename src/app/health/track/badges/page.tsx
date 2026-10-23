import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader, SectionHeading } from "@/components/shared/page-header";
import { PageSkeleton } from "@/components/shared/skeletons";
import { StatCard } from "@/components/shared/stat-card";
import { BADGES } from "@/features/health/calc/achievements";
import { BadgeTile } from "@/features/health/components/badges";
import { requireHealthProfile } from "@/features/health/context";
import { loadOverview } from "@/features/health/queries";

export const metadata: Metadata = { title: "Badges" };

export default function BadgesPage() {
  return (
    <div>
      <PageHeader title="Streaks & badges" description="Small wins add up. Any weigh-in, meal or workout keeps your streak going." />
      <Suspense fallback={<PageSkeleton />}>
        <BadgesView />
      </Suspense>
    </div>
  );
}

async function BadgesView() {
  const { ctx, repo, profile } = await requireHealthProfile();
  const [overview, earned] = await Promise.all([loadOverview(repo, profile, ctx.today), repo.listAchievements()]);
  const earnedOn = new Map(earned.map((a) => [a.badgeKey, a.earnedOn]));
  const sorted = [...BADGES].sort((a, b) => Number(earnedOn.has(b.key)) - Number(earnedOn.has(a.key)));
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Current streak" value={`${overview.streak} ${overview.streak === 1 ? "day" : "days"}`} tone="primary" />
        <StatCard label="Longest streak" value={`${overview.stats.longestStreak} days`} />
        <StatCard label="Workouts" value={overview.stats.workouts} />
        <StatCard label="Personal records" value={overview.stats.records} />
      </div>
      <section>
        <SectionHeading title={`Badges (${earnedOn.size} of ${BADGES.length})`} />
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {sorted.map((b) => (
            <BadgeTile key={b.key} badge={b} earnedOn={earnedOn.get(b.key) ?? null} />
          ))}
        </ul>
      </section>
    </div>
  );
}
