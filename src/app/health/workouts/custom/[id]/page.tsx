import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { CardSkeleton } from "@/components/shared/skeletons";
import { WorkoutBuilder } from "@/features/health/components/workout-builder";
import { requireHealthProfile } from "@/features/health/context";

export const metadata: Metadata = { title: "Edit workout" };

export default function EditCustomWorkoutPage({ params }: PageProps<"/health/workouts/custom/[id]">) {
  return (
    <div>
      <PageHeader title="Edit workout" back={{ href: "/health/workouts", label: "Workouts" }} />
      <Suspense fallback={<CardSkeleton lines={6} />}>
        <Editor params={params} />
      </Suspense>
    </div>
  );
}

async function Editor({ params }: { params: PageProps<"/health/workouts/custom/[id]">["params"] }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { repo } = await requireHealthProfile();
  const workout = await repo.getCustomWorkout(id);
  if (!workout) notFound();
  return <WorkoutBuilder initial={workout} />;
}
