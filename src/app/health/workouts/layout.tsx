import type { ReactNode } from "react";
import { SubTabs } from "@/features/health/components/sub-tabs";

const TABS = [
  { href: "/health/workouts", label: "Overview" },
  { href: "/health/workouts/programs", label: "Programs" },
  { href: "/health/workouts/exercises", label: "Exercises" },
  { href: "/health/workouts/history", label: "History" },
];

export default function WorkoutsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SubTabs label="Workouts" tabs={TABS} />
      {children}
    </>
  );
}
