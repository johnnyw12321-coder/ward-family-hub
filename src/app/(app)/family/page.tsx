import type { Metadata } from "next";
import { UsersIcon } from "lucide-react";
import { PlannedModule } from "@/components/shared/planned-module";

export const metadata: Metadata = { title: "Family" };

export default function Page() {
  return (
    <PlannedModule
      title="Family"
      icon={UsersIcon}
      phase={5}
      summary="Profiles for each family member with school and daycare details, emergency contacts, important dates and milestones."
      features={[
    "School and daycare information",
    "Emergency contacts",
    "Birthdays and milestones",
    "Child-related spending",
    "Extra protection for medical details",
      ]}
    />
  );
}
