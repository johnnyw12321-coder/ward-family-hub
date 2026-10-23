import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { CardSkeleton } from "@/components/shared/skeletons";
import { HealthMark } from "@/features/health/components/health-mark";
import { ProfileForm } from "@/features/health/components/profile-form";
import { DemoDataButton } from "@/features/health/components/data-controls";
import { requireHealthContext } from "@/features/health/context";

export const metadata: Metadata = { title: "Welcome" };

export default function WelcomePage() {
  return (
    <div className="mx-auto max-w-xl pt-2">
      <div className="mb-5 flex items-center gap-3">
        <HealthMark className="size-12" />
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Welcome to Ward Health</h1>
          <p className="text-sm text-muted-foreground">A few questions to set your calorie and macro targets.</p>
        </div>
      </div>
      <Suspense fallback={<CardSkeleton lines={6} />}>
        <Onboarding />
      </Suspense>
    </div>
  );
}

async function Onboarding() {
  const { ctx, profile } = await requireHealthContext();
  if (profile) redirect("/health");
  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-card p-4 shadow-card ring-1 ring-border/80 sm:p-6">
        <ProfileForm profile={null} currentWeightKg={null} today={ctx.today} />
      </div>
      <div className="flex flex-col items-start gap-2 rounded-2xl border border-dashed p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-medium">Just looking around?</div>
          <p className="text-sm text-muted-foreground">Fill Ward Health with two months of sample data to preview the charts.</p>
        </div>
        <DemoDataButton hasData={false} />
      </div>
      <p className="px-1 text-xs text-muted-foreground">
        Your Ward Health data is private to you — other people in the household can&apos;t see it.
      </p>
    </div>
  );
}
