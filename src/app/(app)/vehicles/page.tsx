import type { Metadata } from "next";
import { CarIcon } from "lucide-react";
import { PlannedModule } from "@/components/shared/planned-module";

export const metadata: Metadata = { title: "Vehicles" };

export default function Page() {
  return (
    <PlannedModule
      title="Vehicles"
      icon={CarIcon}
      phase={5}
      summary="Everything about the family vehicles: servicing, insurance renewals, registration, mileage and running costs."
      features={[
    "Service and repair log with mileage",
    "Insurance and registration renewals",
    "Loan details",
    "Cost per year from linked expenses",
      ]}
    />
  );
}
