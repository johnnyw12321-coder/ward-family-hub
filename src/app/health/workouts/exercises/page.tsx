import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { EXERCISES } from "@/features/health/catalog/exercises";
import { ExerciseLibrary } from "@/features/health/components/exercise-library";

export const metadata: Metadata = { title: "Exercises" };

export default function ExercisesPage() {
  return (
    <div>
      <PageHeader title="Exercises" description={`${EXERCISES.length} exercises with the muscles they work and how to do them well.`} />
      <ExerciseLibrary />
    </div>
  );
}
