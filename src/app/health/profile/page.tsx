import type { Metadata } from "next";
import { Suspense } from "react";
import { ShieldCheckIcon } from "lucide-react";
import { PageHeader, SectionHeading } from "@/components/shared/page-header";
import { CardSkeleton } from "@/components/shared/skeletons";
import { DemoDataButton, ExportButtons, ImportButton, ResetButton } from "@/features/health/components/data-controls";
import { SwitchToHubButton } from "@/features/health/components/mode-switch";
import { ProfileForm } from "@/features/health/components/profile-form";
import { RemindersForm, WaterGoalForm } from "@/features/health/components/settings-forms";
import { requireHealthProfile } from "@/features/health/context";
import { weightOn } from "@/features/health/queries";
import { addDays } from "@/lib/dates";

export const metadata: Metadata = { title: "Profile" };

const card = "rounded-2xl bg-card p-4 shadow-card ring-1 ring-border/80 sm:p-5";

export default function HealthProfilePage() {
  return (
    <div>
      <PageHeader title="Profile & settings" description="Your body stats, goal and Ward Health settings." />
      <Suspense fallback={<CardSkeleton lines={8} />}>
        <ProfileView />
      </Suspense>
    </div>
  );
}

async function ProfileView() {
  const { ctx, repo, profile } = await requireHealthProfile();
  const recent = await repo.listWeighIns({ from: addDays(ctx.today, -90), to: ctx.today });
  return (
    <div className="space-y-6">
      <section>
        <SectionHeading title="Your profile" />
        <div className={card}>
          <ProfileForm profile={profile} currentWeightKg={weightOn(recent, profile, ctx.today)} today={ctx.today} />
        </div>
      </section>

      <section>
        <SectionHeading title="Water" />
        <div className={card}>
          <WaterGoalForm goalMl={profile.waterGoalMl} units={profile.units} />
        </div>
      </section>

      <section>
        <SectionHeading title="Reminders" />
        <div className={card}>
          <RemindersForm initial={profile.reminders} />
        </div>
      </section>

      <section>
        <SectionHeading title="Your data" />
        <div className={`${card} space-y-5`}>
          <div>
            <h3 className="text-sm font-medium">Export</h3>
            <p className="mb-3 text-sm text-muted-foreground">Download a full backup you can import later, or spreadsheets of your weight and workouts.</p>
            <ExportButtons />
          </div>
          <div className="border-t pt-4">
            <h3 className="text-sm font-medium">Import or preview</h3>
            <p className="mb-3 text-sm text-muted-foreground">Restore a Ward Health backup, or load sample data to see what the charts look like.</p>
            <div className="flex flex-wrap gap-2">
              <ImportButton />
              <DemoDataButton hasData />
            </div>
          </div>
          <div className="border-t pt-4">
            <h3 className="text-sm font-medium">Start over</h3>
            <p className="mb-3 text-sm text-muted-foreground">Deletes only your Ward Health data. The rest of Ward Hub isn&apos;t touched.</p>
            <ResetButton />
          </div>
          <p className="flex gap-2 border-t pt-4 text-xs text-muted-foreground">
            <ShieldCheckIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            Ward Health data is private to you: not shared with the household, not in the household audit log or household
            backup. Use Export above to keep your own copy.
          </p>
        </div>
      </section>

      <SwitchToHubButton />
    </div>
  );
}
