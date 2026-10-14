import type { Metadata } from "next";
import { WarehouseIcon } from "lucide-react";
import { PlannedModule } from "@/components/shared/planned-module";

export const metadata: Metadata = { title: "Home & property" };

export default function Page() {
  return (
    <PlannedModule
      title="Home & property"
      icon={WarehouseIcon}
      phase={5}
      summary="Records for your home: value, mortgage, renovations, maintenance, appliances, warranties and contractors."
      features={[
    "Purchase price and current value",
    "Maintenance and renovation history",
    "Appliances and warranty dates",
    "Contractor contacts",
    "Total cost of ownership from linked expenses",
      ]}
    />
  );
}
