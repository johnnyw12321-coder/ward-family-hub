import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { WorkoutBuilder } from "@/features/health/components/workout-builder";

export const metadata: Metadata = { title: "Build a workout" };

export default function NewCustomWorkoutPage() {
  return (
    <div>
      <PageHeader title="Build a workout" back={{ href: "/health/workouts", label: "Workouts" }} />
      <WorkoutBuilder />
    </div>
  );
}
