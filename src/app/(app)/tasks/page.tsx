import type { Metadata } from "next";
import { ListChecksIcon } from "lucide-react";
import { PlannedModule } from "@/components/shared/planned-module";

export const metadata: Metadata = { title: "Tasks & shopping" };

export default function Page() {
  return (
    <PlannedModule
      title="Tasks & shopping"
      icon={ListChecksIcon}
      phase={3}
      summary="Shared to-dos and recurring household responsibilities, plus a shopping list either of you can update."
      features={[
    "Assign tasks to either of you",
    "Recurring chores with completion history",
    "Checklists and comments",
    "Shared shopping list with estimated prices",
    "Reusable lists for regular shops",
      ]}
    />
  );
}
