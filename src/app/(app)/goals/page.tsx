import type { Metadata } from "next";
import { TargetIcon } from "lucide-react";
import { PlannedModule } from "@/components/shared/planned-module";

export const metadata: Metadata = { title: "Goals" };

export default function Page() {
  return (
    <PlannedModule
      title="Goals"
      icon={TargetIcon}
      phase={3}
      fromMore={false}
      summary="Track financial and personal goals with milestones, progress, projected completion dates and a history of what you achieved."
      features={[
    "Savings, debt payoff and net worth goals",
    "Link goals to accounts or contributions",
    "Milestones with due dates",
    "Projected completion from your pace",
    "Priority, owner and status",
    "Archive of completed goals",
      ]}
    />
  );
}
